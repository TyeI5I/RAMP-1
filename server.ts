import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import Stripe from 'stripe';
import { createClient, type User } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { escapeHtml, sendTransactionalEmail } from './server/transactionalEmail';
import { isValidPersonaSignature } from './server/personaVerification';
import {
  isExactCredentialCriteria,
  matchesExactCredentialCriteria,
  type ExactCredentialCriteria,
} from './src/utils/exactCredentialSearch';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

  const requireCronSecret: RequestHandler = (req, res, next) => {
    const expected = process.env.CRON_SECRET;
    const supplied = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!expected) {
      return res.status(503).json({ error: 'Scheduled jobs are not configured.' });
    }
    if (!supplied) {
      return res.status(401).json({ error: 'A valid job authorization token is required.' });
    }
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (
      expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)
    ) {
      return res.status(401).json({ error: 'A valid job authorization token is required.' });
    }
    return next();
  };

  const enqueueEmail = async (email: {
    userId: string;
    eventKey: string;
    recipient: string;
    subject: string;
    html: string;
    text: string;
  }) => {
    if (!supabaseAdmin) throw new Error('Transactional email storage is not configured.');
    const { data, error } = await supabaseAdmin
      .from('transactional_email_outbox')
      .upsert(
        {
          user_id: email.userId,
          event_key: email.eventKey,
          recipient: email.recipient,
          subject: email.subject,
          html_body: email.html,
          text_body: email.text,
        },
        { onConflict: 'event_key', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id as string;
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('transactional_email_outbox')
      .select('id')
      .eq('event_key', email.eventKey)
      .single();
    if (existingError) throw existingError;
    return existing.id as string;
  };

  const deliverEmail = async (emailId: string): Promise<'sent' | 'queued' | 'failed'> => {
    if (!supabaseAdmin) throw new Error('Transactional email storage is not configured.');
    const { data: queued, error: lookupError } = await supabaseAdmin
      .from('transactional_email_outbox')
      .select('id,event_key,recipient,subject,html_body,text_body,status,attempts,next_attempt_at')
      .eq('id', emailId)
      .single();
    if (lookupError) throw lookupError;
    if (queued.status === 'sent') return 'sent';
    if (!['pending', 'failed'].includes(queued.status) || queued.attempts >= 5) {
      return queued.status === 'failed' ? 'failed' : 'queued';
    }

    const now = new Date();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('transactional_email_outbox')
      .update({
        status: 'sending',
        attempts: queued.attempts + 1,
        locked_at: now.toISOString(),
        last_error: null,
      })
      .eq('id', emailId)
      .eq('status', queued.status)
      .lte('next_attempt_at', now.toISOString())
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return 'queued';

    try {
      const providerMessageId = await sendTransactionalEmail(
        {
          to: queued.recipient,
          subject: queued.subject,
          html: queued.html_body,
          text: queued.text_body,
        },
        `ramped-outbox-${queued.id}`
      );
      const { error: sentError } = await supabaseAdmin
        .from('transactional_email_outbox')
        .update({
          status: 'sent',
          provider_message_id: providerMessageId,
          sent_at: new Date().toISOString(),
          locked_at: null,
          last_error: null,
        })
        .eq('id', emailId);
      if (sentError) throw sentError;
      return 'sent';
    } catch (error) {
      const attempts = queued.attempts + 1;
      const retryMinutes = Math.min(5 * 2 ** (attempts - 1), 360);
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      const { error: failedError } = await supabaseAdmin
        .from('transactional_email_outbox')
        .update({
          status: 'failed',
          locked_at: null,
          last_error: message.slice(0, 500),
          next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        })
        .eq('id', emailId);
      if (failedError) {
        console.error('Failed to record transactional email failure:', failedError);
        throw failedError;
      }
      console.error(`Transactional email ${emailId} failed:`, message);
      return 'failed';
    }
  };

  const queueAndDeliverEmail = async (email: {
    userId: string;
    eventKey: string;
    recipient: string;
    subject: string;
    html: string;
    text: string;
  }) => deliverEmail(await enqueueEmail(email));

  const processEmailOutbox = async () => {
    if (!supabaseAdmin) throw new Error('Transactional email storage is not configured.');
    const now = new Date();
    const { error: staleError } = await supabaseAdmin
      .from('transactional_email_outbox')
      .update({
        status: 'failed',
        locked_at: null,
        next_attempt_at: now.toISOString(),
        last_error: 'Previous email delivery attempt timed out.',
      })
      .eq('status', 'sending')
      .lt('locked_at', new Date(now.getTime() - 10 * 60_000).toISOString());
    if (staleError) throw staleError;

    const { data: pending, error } = await supabaseAdmin
      .from('transactional_email_outbox')
      .select('id')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 5)
      .lte('next_attempt_at', now.toISOString())
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    const { count: deadLetterCount, error: deadLetterError } = await supabaseAdmin
      .from('transactional_email_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('attempts', 5);
    if (deadLetterError) throw deadLetterError;
    const result = { sent: 0, failed: 0, queued: 0, deadLetter: deadLetterCount || 0 };
    for (const email of pending || []) {
      const status = await deliverEmail(email.id);
      result[status] += 1;
    }
    return result;
  };

  const requireUser: RequestHandler = async (req, res, next) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Employer authentication is not configured.' });
    }
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      return res.status(401).json({ error: 'Sign in is required.' });
    }
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
      }
      res.locals.authUser = data.user;
      return next();
    } catch (error) {
      console.error('Supabase authentication check failed:', error);
      return res.status(503).json({ error: 'Unable to verify your sign-in.' });
    }
  };

  const persistSubscription = async (
    userId: string,
    subscription: Stripe.Subscription,
    customerId: string | null
  ) => {
    if (!supabaseAdmin) throw new Error('Supabase billing storage is not configured.');

    const { data: account, error: accountError } = await supabaseAdmin
      .from('billing_accounts')
      .select('company_name,billing_email')
      .eq('user_id', userId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account && subscription.status === 'canceled') return;
    if (!account) throw new Error('Billing account was not found for the authenticated user.');

    const configuredPlan = [
      {
        tier: 'tier1',
        cadence: 'monthly',
        priceId: process.env.STRIPE_PRICE_TIER1_MONTHLY,
      },
      {
        tier: 'tier1',
        cadence: 'annual',
        priceId: process.env.STRIPE_PRICE_TIER1_ANNUAL,
      },
      {
        tier: 'tier2',
        cadence: 'monthly',
        priceId: process.env.STRIPE_PRICE_TIER2_MONTHLY,
      },
      {
        tier: 'tier2',
        cadence: 'annual',
        priceId: process.env.STRIPE_PRICE_TIER2_ANNUAL,
      },
    ].find((plan) =>
      plan.priceId && subscription.items.data.some((item) => item.price.id === plan.priceId)
    );
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    const tier = isActive && configuredPlan ? configuredPlan.tier : 'none';
    const cadence = isActive && configuredPlan ? configuredPlan.cadence : null;
    const currentPeriodEnd = Math.max(
      ...subscription.items.data.map((item) => item.current_period_end || 0)
    );
    const alertCategories = (subscription.metadata.alertCategories || '')
      .split(',')
      .map((category) => category.trim())
      .filter(Boolean)
      .slice(0, 20);
    const { error } = await supabaseAdmin.from('billing_accounts').upsert(
      {
        user_id: userId,
        company_name: account.company_name,
        billing_email: account.billing_email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        subscription_tier: isActive ? tier : 'none',
        subscription_cadence: cadence,
        current_period_end: currentPeriodEnd > 0
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        alert_categories: isActive ? alertCategories : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
  };

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !supabaseAdmin || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).send('Billing webhooks are not configured.');
    }

    let event: Stripe.Event;
    try {
      const signature = req.get('stripe-signature');
      if (!signature) return res.status(400).send('Missing Stripe signature.');
      event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      console.warn('Rejected invalid Stripe webhook signature:', error);
      return res.status(400).send('Invalid Stripe signature.');
    }

    try {
      const { data: existingEvent, error: lookupError } = await supabaseAdmin
        .from('stripe_webhook_events')
        .select('event_id')
        .eq('event_id', event.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existingEvent) return res.sendStatus(200);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (session.mode === 'subscription' && userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId =
            typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
          await persistSubscription(userId, subscription, customerId);
        }
      } else if (
        event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const eventSubscription = event.data.object as Stripe.Subscription;
        const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
        const userId = subscription.metadata.userId;
        if (userId) {
          const customerId =
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id || null;
          await persistSubscription(userId, subscription, customerId);
        }
      }

      const { error: insertError } = await supabaseAdmin
        .from('stripe_webhook_events')
        .insert({ event_id: event.id, event_type: event.type });
      if (insertError && insertError.code !== '23505') throw insertError;
      return res.sendStatus(200);
    } catch (error) {
      console.error(`Stripe webhook ${event.id} processing failed:`, error);
      return res.status(500).send('Webhook processing failed.');
    }
  });

  app.post(
    '/api/persona/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const webhookSecret = process.env.PERSONA_WEBHOOK_SECRET;
      if (!supabaseAdmin || !webhookSecret) {
        return res.status(503).send('Identity verification webhooks are not configured.');
      }
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).send('A raw JSON request body is required.');
      }
      if (!isValidPersonaSignature(req.get('persona-signature'), req.body, webhookSecret)) {
        return res.status(400).send('Invalid Persona signature.');
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(req.body.toString('utf8')) as Record<string, unknown>;
      } catch {
        return res.status(400).send('Invalid JSON payload.');
      }

      const eventData = isRecord(payload.data) ? payload.data : null;
      const eventAttributes =
        eventData && isRecord(eventData.attributes) ? eventData.attributes : null;
      const eventId = eventData?.id;
      const eventType = eventAttributes?.name;
      const createdAt = eventAttributes?.['created-at'];
      const eventPayload = isRecord(eventAttributes?.payload) ? eventAttributes.payload : null;
      const inquiryData =
        eventPayload && isRecord(eventPayload.data) ? eventPayload.data : null;
      const inquiryId = inquiryData?.id;
      const statusByEvent: Record<string, string> = {
        'inquiry.approved': 'verified',
        'inquiry.declined': 'rejected',
        'inquiry.marked-for-review': 'needs_review',
        'inquiry.failed': 'needs_review',
        'inquiry.expired': 'expired',
      };
      const verificationStatus =
        typeof eventType === 'string' ? statusByEvent[eventType] : undefined;

      if (
        typeof eventId !== 'string' ||
        typeof eventType !== 'string' ||
        typeof inquiryId !== 'string' ||
        typeof createdAt !== 'string' ||
        !Number.isFinite(Date.parse(createdAt))
      ) {
        return res.status(400).send('Invalid Persona inquiry event.');
      }
      if (!verificationStatus) return res.sendStatus(200);

      try {
        const { error } = await supabaseAdmin.rpc('apply_persona_verification_event', {
          p_event_id: eventId,
          p_event_type: eventType,
          p_event_created_at: createdAt,
          p_inquiry_id: inquiryId,
          p_verification_status: verificationStatus,
        });
        if (error) throw error;
        return res.sendStatus(200);
      } catch (error) {
        console.error(`Persona webhook ${eventId} processing failed:`, error);
        return res.status(500).send('Webhook processing failed.');
      }
    }
  );

  app.use(express.json({ limit: '10mb' }));

  app.post('/api/persona/verification/:type/start', requireUser, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    if (req.body?.consentAccepted !== true) {
      return res.status(400).json({ error: 'Consent is required before starting verification.' });
    }

    const verificationType = req.params.type;
    if (verificationType !== 'identity' && verificationType !== 'employer') {
      return res.status(400).json({ error: 'Choose a supported verification type.' });
    }

    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      if (!requireConfirmedEmail(user, res)) return;

      const profile = await getMarketplaceProfile(user);
      const expectedRole = verificationType === 'identity' ? 'candidate' : 'employer';
      if (!profile || profile.role !== expectedRole) {
        return res.status(403).json({ error: 'This verification is not available for your account.' });
      }
      const requiredTemplate =
        verificationType === 'identity'
          ? process.env.PERSONA_CANDIDATE_IDENTITY_TEMPLATE_ID
          : process.env.PERSONA_EMPLOYER_BUSINESS_TEMPLATE_ID;
      const personaApiKey = process.env.PERSONA_API_KEY;
      if (!requiredTemplate || !personaApiKey) {
        return res.status(503).json({ error: 'Persona verification is not configured on this server.' });
      }
      const currentVerificationStatus =
        verificationType === 'identity'
          ? profile.profile.identityVerificationStatus
          : profile.profile.businessVerificationStatus;
      if (currentVerificationStatus === 'needs_review') {
        return res.status(409).json({
          error: 'This verification is under review. Contact support if you need help.',
        });
      }
      if (
        verificationType === 'employer' &&
        ['companyName', 'websiteUrl', 'recruiterName', 'recruiterTitle']
          .some((field) => typeof profile.profile?.[field] !== 'string' || !profile.profile[field].trim())
      ) {
        return res.status(409).json({ error: 'Complete your employer profile before starting verification.' });
      }

      const response = await fetch('https://api.withpersona.com/api/v1/inquiries', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${personaApiKey}`,
          'Content-Type': 'application/json',
          'Persona-Version': '2026-09-29',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          data: {
            attributes: {
              'inquiry-template-id': requiredTemplate,
              'reference-id': user.id,
            },
          },
          meta: {
            'auto-create-one-time-link': true,
            'one-time-link-expiration-seconds': 3600,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        console.error(`Persona inquiry creation failed with HTTP ${response.status}.`);
        return res.status(502).json({ error: 'Persona could not start verification. Please try again later.' });
      }

      const personaResponse: unknown = await response.json();
      const inquiryResponse = isRecord(personaResponse) && isRecord(personaResponse.data)
        ? personaResponse.data
        : null;
      const responseMeta =
        isRecord(personaResponse) && isRecord(personaResponse.meta) ? personaResponse.meta : null;
      const inquiryId = inquiryResponse?.id;
      const oneTimeLink = responseMeta?.['one-time-link'];
      if (typeof inquiryId !== 'string' || typeof oneTimeLink !== 'string') {
        console.error('Persona inquiry creation returned an incomplete response.');
        return res.status(502).json({ error: 'Persona returned an invalid verification response.' });
      }

      const verificationUrl = new URL(oneTimeLink);
      if (
        verificationUrl.protocol !== 'https:' ||
        !verificationUrl.hostname.endsWith('.withpersona.com')
      ) {
        console.error('Persona inquiry creation returned an unexpected link host.');
        return res.status(502).json({ error: 'Persona returned an invalid verification link.' });
      }
      const returnUrl = new URL(appUrl);
      returnUrl.searchParams.set('verification', 'complete');
      verificationUrl.searchParams.set('redirect-uri', returnUrl.toString());

      const { error: supersedeError } = await supabaseAdmin
        .from('persona_verification_attempts')
        .update({ status: 'superseded', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('verification_type', verificationType)
        .eq('status', 'pending');
      if (supersedeError) throw supersedeError;

      const { error: attemptError } = await supabaseAdmin
        .from('persona_verification_attempts')
        .insert({
          user_id: user.id,
          verification_type: verificationType,
          inquiry_id: inquiryId,
          template_id: requiredTemplate,
        });
      if (attemptError?.code === '23505') {
        return res.status(409).json({
          error: 'Another verification was just started. Return to the app and refresh its status.',
        });
      }
      if (attemptError) throw attemptError;

      const profileKey =
        verificationType === 'identity'
          ? 'identityVerificationStatus'
          : 'businessVerificationStatus';
      const updatedProfile = { ...profile.profile, [profileKey]: 'pending' };
      const { error: profileError } = await supabaseAdmin
        .from('marketplace_profiles')
        .update({
          profile: updatedProfile,
          ...(verificationType === 'employer' ? { verification_status: 'pending' } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (profileError) throw profileError;

      return res.json({
        verificationUrl: verificationUrl.toString(),
        status: 'pending',
      });
    } catch (error) {
      console.error('Persona verification start failed:', error);
      return res.status(500).json({ error: 'Unable to start Persona verification.' });
    }
  });

  app.post('/api/billing/checkout-session', requireUser, async (req, res) => {
    try {
      if (!stripe || !supabaseAdmin) {
        return res.status(503).json({ error: 'Billing is not configured on this server.' });
      }

      const user = res.locals.authUser as User;
      const { companyName, tier, cadence, alertCategories = [] } = req.body;
      if (
        typeof companyName !== 'string' ||
        !companyName.trim() ||
        (tier !== 'tier1' && tier !== 'tier2') ||
        (cadence !== 'monthly' && cadence !== 'annual') ||
        !Array.isArray(alertCategories) ||
        alertCategories.length > 20 ||
        alertCategories.some(
          (category: unknown) => typeof category !== 'string' || category.length > 80
        )
      ) {
        return res.status(400).json({ error: 'Company name, valid subscription plan, and billing cadence are required.' });
      }
      if (!user.email) {
        return res.status(400).json({ error: 'Your authenticated account must have an email address.' });
      }

      const { data: currentAccount, error: accountLookupError } = await supabaseAdmin
        .from('billing_accounts')
        .select('stripe_customer_id,subscription_status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (accountLookupError) throw accountLookupError;
      if (
        currentAccount &&
        ['active', 'trialing', 'past_due'].includes(currentAccount.subscription_status)
      ) {
        return res.status(409).json({
          error: 'You already have a subscription. Use Manage Billing to change or cancel it.',
        });
      }

      const { error: accountSaveError } = await supabaseAdmin.from('billing_accounts').upsert(
        {
          user_id: user.id,
          company_name: companyName.trim().slice(0, 100),
          billing_email: user.email,
          stripe_customer_id: currentAccount?.stripe_customer_id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (accountSaveError) throw accountSaveError;

      const priceEnvName = `STRIPE_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
      const priceId = process.env[priceEnvName];
      if (!priceId) {
        return res.status(503).json({ error: `Payment price is not configured (${priceEnvName}).` });
      }
      const expectedAmount =
        tier === 'tier1'
          ? cadence === 'monthly' ? 29900 : 299000
          : cadence === 'monthly' ? 59900 : 599000;
      const price = await stripe.prices.retrieve(priceId);
      if (
        !price.active ||
        price.currency !== 'usd' ||
        price.unit_amount !== expectedAmount ||
        price.recurring?.interval !== (cadence === 'monthly' ? 'month' : 'year')
      ) {
        console.error(`Stripe price ${priceId} does not match the configured ${tier} ${cadence} plan.`);
        return res.status(503).json({ error: 'The selected subscription plan is not configured correctly.' });
      }

      const metadata = {
        userId: user.id,
        companyName: companyName.slice(0, 100),
        tier,
        cadence,
        alertCategories: alertCategories.join(','),
      };
      if (metadata.alertCategories.length > 500) {
        return res.status(400).json({ error: 'Too many alert categories were selected.' });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        allowed_payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        ...(currentAccount?.stripe_customer_id
          ? { customer: currentAccount.stripe_customer_id }
          : { customer_email: user.email }),
        client_reference_id: user.id,
        metadata,
        subscription_data: { metadata },
        success_url: `${appUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/?billing=cancelled`,
      });

      if (!session.url) {
        return res.status(502).json({ error: 'Stripe did not return a checkout URL.' });
      }
      return res.json({ url: session.url });
    } catch (error) {
      console.error('Stripe checkout session creation failed:', error);
      return res.status(502).json({ error: 'Unable to start checkout. Please try again.' });
    }
  });

  app.get('/api/billing/verify-session', requireUser, async (req, res) => {
    try {
      if (!stripe || !supabaseAdmin) {
        return res.status(503).json({ error: 'Billing is not configured on this server.' });
      }
      const user = res.locals.authUser as User;

      const sessionId = req.query.session_id;
      if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
        return res.status(400).json({ error: 'A valid Stripe checkout session ID is required.' });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (
        session.client_reference_id !== user.id ||
        session.metadata?.userId !== user.id ||
        session.mode !== 'subscription' ||
        session.status !== 'complete' ||
        !session.subscription ||
        (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required')
      ) {
        return res.status(409).json({ error: 'The subscription payment has not completed.' });
      }

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        return res.status(409).json({ error: 'The subscription is not active.' });
      }
      const subscriptionActiveUntil = Math.max(
        ...subscription.items.data.map((item) => item.current_period_end || 0)
      );
      if (!Number.isFinite(subscriptionActiveUntil) || subscriptionActiveUntil <= 0) {
        return res.status(502).json({ error: 'Stripe did not return the subscription billing period.' });
      }

      const { tier, cadence } = session.metadata || {};
      if (
        (tier !== 'tier1' && tier !== 'tier2') ||
        (cadence !== 'monthly' && cadence !== 'annual')
      ) {
        return res.status(400).json({ error: 'Checkout session metadata is invalid.' });
      }
      const expectedPriceId = process.env[`STRIPE_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`];
      if (!expectedPriceId || !subscription.items.data.some((item) => item.price.id === expectedPriceId)) {
        return res.status(409).json({ error: 'The active Stripe subscription does not match the selected plan.' });
      }
      const customerId =
        typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
      await persistSubscription(user.id, subscription, customerId);

      return res.json({
        userId: user.id,
        tier,
        cadence,
        alertCategories: (subscription.metadata.alertCategories || '')
          .split(',')
          .map((category) => category.trim())
          .filter(Boolean),
        stripeCustomerId: customerId || '',
        stripeSubscriptionId: subscription.id,
        subscriptionActiveUntil: new Date(subscriptionActiveUntil * 1000).toISOString(),
      });
    } catch (error) {
      console.error('Stripe checkout verification failed:', error);
      return res.status(502).json({ error: 'Unable to verify checkout. Please contact support if you were charged.' });
    }
  });

  app.get('/api/billing/account', requireUser, async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Billing storage is not configured on this server.' });
    }
    try {
      const user = res.locals.authUser as User;
      const { data: account, error } = await supabaseAdmin
        .from('billing_accounts')
        .select('company_name,billing_email,stripe_customer_id,stripe_subscription_id,subscription_status,subscription_tier,subscription_cadence,current_period_end,alert_categories')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;

      if (account?.stripe_subscription_id) {
        if (!stripe) {
          return res.status(503).json({ error: 'Stripe billing is not configured on this server.' });
        }
        const subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
        await persistSubscription(user.id, subscription, account.stripe_customer_id);
        const { data: refreshedAccount, error: refreshError } = await supabaseAdmin
          .from('billing_accounts')
          .select('company_name,billing_email,stripe_customer_id,stripe_subscription_id,subscription_status,subscription_tier,subscription_cadence,current_period_end,alert_categories')
          .eq('user_id', user.id)
          .maybeSingle();
        if (refreshError) throw refreshError;
        return res.json({ account: refreshedAccount });
      }

      return res.json({ account });
    } catch (error) {
      console.error('Billing account lookup failed:', error);
      return res.status(500).json({ error: 'Unable to load billing account.' });
    }
  });

  app.post('/api/billing/portal-session', requireUser, async (_req, res) => {
    if (!stripe || !supabaseAdmin) {
      return res.status(503).json({ error: 'Billing is not configured on this server.' });
    }
    try {
      const user = res.locals.authUser as User;
      const { data: account, error } = await supabaseAdmin
        .from('billing_accounts')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!account?.stripe_customer_id) {
        return res.status(404).json({ error: 'No Stripe customer is linked to this account yet.' });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: account.stripe_customer_id,
        return_url: `${appUrl}/?billing=manage`,
      });
      return res.json({ url: session.url });
    } catch (error) {
      console.error('Stripe customer portal session creation failed:', error);
      return res.status(502).json({
        error: 'Unable to open billing management. Confirm that the Stripe customer portal is enabled.',
      });
    }
  });

  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
  const betaAllowedEmails = new Set(
    (process.env.BETA_ALLOWED_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
  const isBetaAllowed = (user: User) =>
    process.env.NODE_ENV !== 'production' ||
    Boolean(user.email && betaAllowedEmails.has(user.email.toLowerCase()));
  const getMarketplaceProfile = async (user: User) => {
    if (!supabaseAdmin) throw new Error('Marketplace storage is not configured.');
    const { data: existing, error } = await supabaseAdmin
      .from('marketplace_profiles')
      .select('user_id,role,profile,verification_status,is_snoozed,last_check_in_at,created_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (existing) return existing;

    const requestedRole = user.user_metadata?.account_role;
    const role = user.email && adminEmails.has(user.email.toLowerCase())
      ? 'admin'
      : requestedRole === 'candidate' || requestedRole === 'employer'
        ? requestedRole
        : null;
    if (role !== 'candidate' && role !== 'employer' && role !== 'admin') return null;

    const { data: created, error: createError } = await supabaseAdmin
      .from('marketplace_profiles')
      .insert({
        user_id: user.id,
        role,
        profile: {},
        verification_status: 'pending',
      })
      .select('user_id,role,profile,verification_status,is_snoozed,last_check_in_at,created_at')
      .single();
    if (createError) throw createError;
    return created;
  };
  const getEmployerManagerId = async (userId: string) => {
    if (!supabaseAdmin) throw new Error('Marketplace storage is not configured.');
    const { data: seat, error } = await supabaseAdmin
      .from('employer_team_seats')
      .select('manager_user_id')
      .eq('member_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return seat?.manager_user_id || userId;
  };
  const requireActiveEmployer: RequestHandler = async (_req, res, next) => {
    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      const profile = await getMarketplaceProfile(user);
      if (!profile || profile.role !== 'employer' || profile.verification_status !== 'approved') {
        return res.status(403).json({ error: 'An approved employer account is required.' });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({ error: 'Billing storage is not configured.' });
      }
      const managerUserId = await getEmployerManagerId(user.id);
      const { data: billing, error } = await supabaseAdmin
        .from('billing_accounts')
        .select('subscription_status,subscription_tier,current_period_end')
        .eq('user_id', managerUserId)
        .maybeSingle();
      if (error) throw error;
      if (
        !billing ||
        !['active', 'trialing'].includes(billing.subscription_status) ||
        new Date(billing.current_period_end || 0).getTime() <= Date.now()
      ) {
        return res.status(403).json({ error: 'An active employer subscription is required.' });
      }
      if (managerUserId !== user.id && billing.subscription_tier !== 'tier2') {
        return res.status(403).json({ error: 'Team member access requires an active Tier 2 plan.' });
      }
      res.locals.marketplaceProfile = profile;
      res.locals.employerManagerUserId = managerUserId;
      res.locals.billingAccount = billing;
      return next();
    } catch (error) {
      console.error('Active employer check failed:', error);
      return res.status(503).json({ error: 'Unable to verify the employer subscription.' });
    }
  };
  const productionActiveEmployerAccess: RequestHandler[] =
    process.env.NODE_ENV === 'production' ? [requireUser, requireActiveEmployer] : [];
  const requireMarketplaceRole = (role: 'candidate' | 'employer' | 'admin'): RequestHandler =>
    async (_req, res, next) => {
      try {
        const user = res.locals.authUser as User;
        if (!isBetaAllowed(user)) {
          return res.status(403).json({ error: 'This account is not on the private beta access list.' });
        }
        const profile = await getMarketplaceProfile(user);
        if (!profile) {
          return res.status(409).json({ error: 'Complete account setup before using the marketplace.' });
        }
        if (profile.role !== role) {
          return res.status(403).json({ error: 'This action is not available for your account role.' });
        }
        res.locals.marketplaceProfile = profile;
        return next();
      } catch (error) {
        console.error('Marketplace role check failed:', error);
        return res.status(503).json({ error: 'Unable to verify your marketplace account.' });
      }
    };
  const requireTier2Employer: RequestHandler = async (_req, res, next) => {
    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      const profile = await getMarketplaceProfile(user);
      if (!profile || profile.role !== 'employer' || profile.verification_status !== 'approved') {
        return res.status(403).json({ error: 'An approved employer account is required.' });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({ error: 'Billing storage is not configured.' });
      }
      const { data: billing, error } = await supabaseAdmin
        .from('billing_accounts')
        .select('subscription_status,subscription_tier,current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (
        !billing ||
        billing.subscription_tier !== 'tier2' ||
        !['active', 'trialing'].includes(billing.subscription_status) ||
        new Date(billing.current_period_end || 0).getTime() <= Date.now()
      ) {
        return res.status(403).json({ error: 'An active Tier 2 subscription is required.' });
      }
      res.locals.marketplaceProfile = profile;
      return next();
    } catch (error) {
      console.error('Tier 2 employer check failed:', error);
      return res.status(503).json({ error: 'Unable to verify employer subscription.' });
    }
  };
  const productionCandidateAccess: RequestHandler[] =
    process.env.NODE_ENV === 'production'
      ? [requireUser, requireMarketplaceRole('candidate')]
      : [];
  const productionEmployerAccess: RequestHandler[] =
    process.env.NODE_ENV === 'production'
      ? [requireUser, requireActiveEmployer]
      : [];
  const productionEmployerChatAccess: RequestHandler[] =
    process.env.NODE_ENV === 'production'
      ? [
          requireUser,
          requireMarketplaceRole('employer'),
          (_req, res, next) => {
            if (res.locals.marketplaceProfile?.verification_status !== 'approved') {
              return res.status(403).json({ error: 'An approved employer account is required.' });
            }
            return next();
          },
        ]
      : [];
  const profileRecordToCandidate = (record: {
    user_id: string;
    profile: Record<string, unknown>;
    verification_status: string;
    is_snoozed: boolean;
    last_check_in_at: string;
    created_at?: string;
  }, includeContact: boolean) => {
    const profile = record.profile || {};
    const lastCheckInDate = record.last_check_in_at;
    const daysInactive = Math.max(
      0,
      Math.floor((Date.now() - new Date(lastCheckInDate).getTime()) / (24 * 60 * 60 * 1000))
    );
    const safeProfile = {
      ...profile,
      id: record.user_id,
      email: includeContact ? profile.email || '' : '',
      phone: includeContact || profile.showPhone === true ? profile.phone : '',
      address: profile.showAddress === true ? profile.address || '' : '',
      currentEmployer: profile.showCurrentEmployer === false ? '' : profile.currentEmployer,
      location: profile.showLocation === false ? 'Not disclosed' : profile.location,
      credentialDocumentUrl: includeContact ? profile.credentialDocumentUrl || '' : '',
      credentialOcrData: includeContact ? profile.credentialOcrData : undefined,
      verificationStatus: record.verification_status,
      verifiedBadge: record.verification_status === 'verified',
      lastCheckInDate,
      simulatedDaysInactive: daysInactive,
      lifecycleStatus: daysInactive >= 14 ? 'archived' : 'active',
      isSnoozed: record.is_snoozed,
      createdAt: record.created_at || profile.createdAt,
    };
    return safeProfile;
  };
  const profileRecordToEmployer = (
    record: { user_id: string; profile: Record<string, unknown>; verification_status: string },
    billing: Record<string, unknown> | null
  ) => ({
    ...record.profile,
    id: record.user_id,
    email: record.profile.email || '',
    verificationStatus: record.verification_status,
    subscriptionTier: billing?.subscription_tier || 'none',
    subscriptionCadence: billing?.subscription_cadence || null,
    subscriptionActiveUntil: billing?.current_period_end || undefined,
    stripeCustomerId: billing?.stripe_customer_id || undefined,
    stripeSubscriptionId: billing?.stripe_subscription_id || undefined,
    instantAlertCategories: billing?.alert_categories || [],
    instantAlertsEnabled:
      (billing?.subscription_status === 'active' || billing?.subscription_status === 'trialing') &&
      new Date(String(billing.current_period_end || 0)).getTime() > Date.now(),
    managerUserId: record.user_id,
    savedSearchCriteria: record.profile.savedSearchCriteria,
    monthlyMatchAlertsUsed: 0,
    teamSeats: billing?.subscription_tier === 'tier2' ? 6 : 1,
  });
  const notifyEmployersOfCandidateMatch = async (candidateRecord: {
    user_id: string;
    profile: Record<string, unknown>;
    verification_status: string;
    is_snoozed: boolean;
    last_check_in_at: string;
  }) => {
    if (!supabaseAdmin || candidateRecord.verification_status !== 'verified' || candidateRecord.is_snoozed) return;
    if (Date.now() - new Date(candidateRecord.last_check_in_at).getTime() >= 14 * 24 * 60 * 60 * 1000) return;

    const { data: employerRows, error: employerError } = await supabaseAdmin
      .from('marketplace_profiles')
      .select('user_id,profile')
      .eq('role', 'employer')
      .eq('verification_status', 'approved');
    if (employerError) throw employerError;
    if (!employerRows?.length) return;
    const { data: billingRows, error: billingError } = await supabaseAdmin
      .from('billing_accounts')
      .select('user_id,subscription_status,subscription_tier,current_period_end')
      .in('user_id', (employerRows || []).map((row) => row.user_id));
    if (billingError) throw billingError;

    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);

    for (const employer of employerRows || []) {
      const billing = (billingRows || []).find((row) => row.user_id === employer.user_id);
      if (
        !billing ||
        !['active', 'trialing'].includes(billing.subscription_status) ||
        new Date(billing.current_period_end || 0).getTime() <= Date.now() ||
        (billing.subscription_tier !== 'tier1' && billing.subscription_tier !== 'tier2')
      ) continue;

      const criteria = employer.profile.savedSearchCriteria as ExactCredentialCriteria | undefined;
      if (!isExactCredentialCriteria(criteria)) continue;
      if (!matchesExactCredentialCriteria(profileRecordToCandidate(candidateRecord, false), criteria)) continue;

      const alertLimit = billing.subscription_tier === 'tier1' ? 10 : 20;
      const { count, error: countError } = await supabaseAdmin
        .from('marketplace_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', employer.user_id)
        .contains('payload', { type: 'candidate_match_alert' })
        .gte('created_at', currentMonthStart.toISOString());
      if (countError) throw countError;
      if ((count || 0) >= alertLimit) continue;

      const eventKey = `candidate-match:${employer.user_id}:${candidateRecord.user_id}:${candidateRecord.last_check_in_at}`;
      const { data: alert, error: alertError } = await supabaseAdmin
        .from('marketplace_notifications')
        .upsert(
          {
            user_id: employer.user_id,
            dedupe_key: eventKey,
            payload: {
              title: 'A candidate matches your saved criteria',
              message: 'A newly verified or newly available candidate meets your role, skills, location, and experience requirements.',
              type: 'candidate_match_alert',
              metadata: { candidateId: candidateRecord.user_id },
            },
          },
          { onConflict: 'dedupe_key', ignoreDuplicates: true }
        )
        .select('id')
        .maybeSingle();
      if (alertError) throw alertError;
      if (!alert) continue;

      const profile = employer.profile || {};
      const recipient = typeof profile.email === 'string' ? profile.email : '';
      if (!recipient) {
        console.error(`Candidate match alert email skipped: employer ${employer.user_id} has no email address.`);
        continue;
      }
      const company = typeof profile.companyName === 'string' ? profile.companyName : 'your team';
      try {
        await queueAndDeliverEmail({
          userId: employer.user_id,
          eventKey,
          recipient,
          subject: 'A verified candidate matches your RAMPED search',
          html: `<p>Hello ${escapeHtml(typeof profile.recruiterName === 'string' ? profile.recruiterName : 'there')},</p><p>A newly verified or newly available candidate matches the saved search criteria for ${escapeHtml(company)}.</p><p>Sign in to RAMPED to run your criteria-based search and view the randomized matching results.</p>`,
          text: `A newly verified or newly available candidate matches the saved search criteria for ${company}. Sign in to RAMPED to run your criteria-based search and view the randomized matching results.`,
        });
      } catch (emailError) {
        console.error(`Candidate match alert email failed for employer ${employer.user_id}:`, emailError);
      }
    }
  };
  const requireConfirmedEmail = (user: User, res: express.Response) => {
    if (!user.email_confirmed_at) {
      res.status(403).json({ error: 'Verify your email address before creating a marketplace profile.' });
      return false;
    }
    return true;
  };

  app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health/ready', async (_req, res) => {
    const missing: string[] = [];
    if (!supabaseAdmin) missing.push('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    if (process.env.NODE_ENV === 'production') {
      for (const key of [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY',
        'GEMINI_API_KEY',
        'RESEND_API_KEY',
        'EMAIL_FROM',
        'CRON_SECRET',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PRICE_TIER1_MONTHLY',
        'STRIPE_PRICE_TIER1_ANNUAL',
        'STRIPE_PRICE_TIER2_MONTHLY',
        'STRIPE_PRICE_TIER2_ANNUAL',
        'PERSONA_API_KEY',
        'PERSONA_WEBHOOK_SECRET',
        'PERSONA_CANDIDATE_IDENTITY_TEMPLATE_ID',
        'PERSONA_EMPLOYER_BUSINESS_TEMPLATE_ID',
      ]) {
        if (!process.env[key]) missing.push(key);
      }
      if (betaAllowedEmails.size === 0) missing.push('BETA_ALLOWED_EMAILS');
      if (adminEmails.size === 0) missing.push('ADMIN_EMAILS');
      if ((process.env.CRON_SECRET || '').length < 32) {
        missing.push('CRON_SECRET must contain at least 32 characters');
      }
      if (![...adminEmails].every((email) => betaAllowedEmails.has(email))) {
        missing.push('ADMIN_EMAILS must also be listed in BETA_ALLOWED_EMAILS');
      }
      try {
        const appOrigin = new URL(appUrl);
        if (appOrigin.protocol !== 'https:' || appOrigin.hostname === 'localhost') {
          missing.push('APP_URL must be a public HTTPS origin');
        }
      } catch {
        missing.push('APP_URL must be a public HTTPS origin');
      }
    }
    if (missing.length === 0 && supabaseAdmin) {
      try {
        const [profiles, invites, billing, webhookEvents, emailOutbox, personaAttempts, personaEvents] = await Promise.all([
          supabaseAdmin.from('marketplace_profiles').select('user_id').limit(1),
          supabaseAdmin.from('job_invites').select('id').limit(1),
          supabaseAdmin.from('billing_accounts').select('user_id').limit(1),
          supabaseAdmin.from('stripe_webhook_events').select('event_id').limit(1),
          supabaseAdmin.from('transactional_email_outbox').select('id').limit(1),
          supabaseAdmin.from('persona_verification_attempts').select('id').limit(1),
          supabaseAdmin.from('persona_webhook_events').select('event_id').limit(1),
        ]);
        if (
          profiles.error ||
          invites.error ||
          billing.error ||
          webhookEvents.error ||
          emailOutbox.error ||
          personaAttempts.error ||
          personaEvents.error
        ) {
          missing.push('Apply all Supabase database migrations');
        }
      } catch (error) {
        console.error('Readiness database check failed:', error);
        missing.push('Apply all Supabase database migrations');
      }
    }
    if (missing.length) {
      return res.status(503).json({ status: 'not_ready', missing });
    }
    return res.json({ status: 'ready' });
  });

  app.post('/api/marketplace/signup-access', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (betaAllowedEmails.size === 0 || !betaAllowedEmails.has(email)) {
      return res.status(403).json({ error: 'This email is not enabled for the private beta.' });
    }
    return res.json({ allowed: true });
  });

  app.get('/api/employer/team', ...productionActiveEmployerAccess, async (_req, res) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ error: 'Marketplace storage is not configured.' });
      const user = res.locals.authUser as User;
      const managerUserId = process.env.NODE_ENV === 'production'
        ? res.locals.employerManagerUserId as string
        : user.id;
      const billing = res.locals.billingAccount as { subscription_tier?: string } | undefined;
      if (billing?.subscription_tier !== 'tier2') {
        return res.status(403).json({ error: 'Team seats are available on Tier 2.' });
      }

      const { data: manager, error: managerError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('profile')
        .eq('user_id', managerUserId)
        .single();
      if (managerError) throw managerError;
      const managerEmail = typeof manager.profile.email === 'string' ? manager.profile.email : user.email || '';
      const { error: seatError } = await supabaseAdmin
        .from('employer_team_seats')
        .upsert(
          {
            manager_user_id: managerUserId,
            member_user_id: managerUserId,
            member_email: managerEmail.toLowerCase(),
            seat_role: 'manager',
            status: 'active',
          },
          { onConflict: 'manager_user_id,member_email' }
        );
      if (seatError) throw seatError;
      const { data: seats, error } = await supabaseAdmin
        .from('employer_team_seats')
        .select('member_email,seat_role,status')
        .eq('manager_user_id', managerUserId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.json({ seats: seats || [], totalLimit: 6 });
    } catch (error) {
      console.error('Employer team lookup failed:', error);
      return res.status(500).json({ error: 'Unable to load team seats.' });
    }
  });

  app.post('/api/employer/team', ...productionActiveEmployerAccess, async (req, res) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ error: 'Marketplace storage is not configured.' });
      const user = res.locals.authUser as User;
      const managerUserId = process.env.NODE_ENV === 'production'
        ? res.locals.employerManagerUserId as string
        : user.id;
      const billing = res.locals.billingAccount as { subscription_tier?: string } | undefined;
      if (billing?.subscription_tier !== 'tier2' || managerUserId !== user.id) {
        return res.status(403).json({ error: 'Only the Tier 2 manager can invite team members.' });
      }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid team member email address.' });
      }

      const { data: manager, error: managerError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('profile')
        .eq('user_id', managerUserId)
        .single();
      if (managerError) throw managerError;
      const managerEmail = typeof manager.profile.email === 'string' ? manager.profile.email.toLowerCase() : '';
      if (email === managerEmail) return res.status(400).json({ error: 'The manager already occupies one of the six seats.' });

      const { error: managerSeatError } = await supabaseAdmin
        .from('employer_team_seats')
        .upsert(
          {
            manager_user_id: managerUserId,
            member_user_id: managerUserId,
            member_email: managerEmail,
            seat_role: 'manager',
            status: 'active',
          },
          { onConflict: 'manager_user_id,member_email' }
        );
      if (managerSeatError) throw managerSeatError;
      const { count, error: countError } = await supabaseAdmin
        .from('employer_team_seats')
        .select('id', { count: 'exact', head: true })
        .eq('manager_user_id', managerUserId);
      if (countError) throw countError;
      if ((count || 0) >= 6) return res.status(409).json({ error: 'Tier 2 includes six total seats, including the manager.' });

      const inviteResult = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { account_role: 'employer' },
      });
      if (inviteResult.error) {
        return res.status(409).json({
          error: 'Could not invite this email. It may already have a RAMPED account or an outstanding invite.',
        });
      }
      const memberId = inviteResult.data.user.id;
      const memberName = email.split('@')[0].replace(/[._-]+/g, ' ');
      const memberProfile = {
        ...manager.profile,
        id: memberId,
        email,
        recruiterName: memberName,
        recruiterTitle: 'Team Member',
        savedSearchCriteria: manager.profile.savedSearchCriteria || null,
      };
      const { error: profileError } = await supabaseAdmin
        .from('marketplace_profiles')
        .insert({
          user_id: memberId,
          role: 'employer',
          profile: memberProfile,
          verification_status: 'approved',
        });
      if (profileError) throw profileError;
      const { error: seatError } = await supabaseAdmin
        .from('employer_team_seats')
        .insert({
          manager_user_id: managerUserId,
          member_user_id: memberId,
          member_email: email,
          seat_role: 'member',
          status: 'active',
        });
      if (seatError) throw seatError;
      return res.status(201).json({ email, role: 'member', status: 'active' });
    } catch (error) {
      console.error('Employer team invitation failed:', error);
      return res.status(500).json({ error: 'Unable to invite this team member.' });
    }
  });

  app.put('/api/employer/search-criteria', ...productionActiveEmployerAccess, async (req, res) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ error: 'Marketplace storage is not configured.' });
      if (req.body?.criteria !== null && !isExactCredentialCriteria(req.body?.criteria)) {
        return res.status(400).json({ error: 'Saved candidate search criteria are invalid.' });
      }
      const user = res.locals.authUser as User;
      const managerUserId = process.env.NODE_ENV === 'production'
        ? res.locals.employerManagerUserId as string
        : user.id;
      const { data: manager, error: managerError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('profile')
        .eq('user_id', managerUserId)
        .single();
      if (managerError) throw managerError;
      const profile = { ...manager.profile, savedSearchCriteria: req.body.criteria };
      const { error } = await supabaseAdmin
        .from('marketplace_profiles')
        .update({ profile, updated_at: new Date().toISOString() })
        .eq('user_id', managerUserId);
      if (error) throw error;
      return res.json({ ok: true });
    } catch (error) {
      console.error('Employer search criteria save failed:', error);
      return res.status(500).json({ error: 'Unable to save candidate search criteria.' });
    }
  });

  app.get('/api/account/export', requireUser, async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Account storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      const [profile, sentInvites, receivedInvites, notifications, billing, emails] = await Promise.all([
        supabaseAdmin
          .from('marketplace_profiles')
          .select('role,profile,verification_status,is_snoozed,last_check_in_at,created_at,updated_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabaseAdmin
          .from('job_invites')
          .select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at')
          .eq('employer_user_id', user.id),
        supabaseAdmin
          .from('job_invites')
          .select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at')
          .eq('candidate_user_id', user.id),
        supabaseAdmin
          .from('marketplace_notifications')
          .select('id,payload,created_at,read_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('billing_accounts')
          .select('company_name,billing_email,subscription_status,subscription_tier,subscription_cadence,current_period_end,alert_categories,created_at,updated_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabaseAdmin
          .from('transactional_email_outbox')
          .select('event_key,recipient,subject,html_body,text_body,status,attempts,created_at,sent_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);
      const queryError = [profile, sentInvites, receivedInvites, notifications, billing, emails]
        .find((result) => result.error)?.error;
      if (queryError) throw queryError;

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ramped-account-export-${new Date().toISOString().slice(0, 10)}.json"`
      );
      return res.json({
        exportedAt: new Date().toISOString(),
        account: { id: user.id, email: user.email, createdAt: user.created_at },
        profile: profile.data,
        invites: {
          sent: sentInvites.data || [],
          received: receivedInvites.data || [],
        },
        notifications: notifications.data || [],
        transactionalEmails: emails.data || [],
        billing: billing.data
          ? {
              ...billing.data,
              note: 'Payment card details are held by Stripe and are not stored by RAMPED.',
            }
          : null,
      });
    } catch (error) {
      console.error('Account data export failed:', error);
      return res.status(500).json({ error: 'Unable to export account data.' });
    }
  });

  app.post('/api/account/delete', requireUser, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Account storage is not configured.' });
    }
    if (req.body?.confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm permanent account removal.' });
    }

    const user = res.locals.authUser as User;
    try {
      const { data: billing, error: billingError } = await supabaseAdmin
        .from('billing_accounts')
        .select('stripe_subscription_id,subscription_status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (billingError) throw billingError;

      const cancellableStatuses = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];
      if (billing?.stripe_subscription_id && cancellableStatuses.includes(billing.subscription_status)) {
        if (!stripe) {
          return res.status(503).json({
            error: 'Stripe is unavailable. Your account was not deleted; contact support to cancel your subscription.',
          });
        }
        const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
        if (cancellableStatuses.includes(subscription.status)) {
          await stripe.subscriptions.cancel(subscription.id);
        }
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;

      let emailConfirmation: 'sent' | 'failed' | 'not_available' = 'not_available';
      if (user.email) {
        try {
          await sendTransactionalEmail(
            {
              to: user.email,
              subject: 'Your RAMPED account was deleted',
              html: '<p>Your RAMPED account and associated marketplace data have been deleted. Any Stripe financial records are retained by Stripe according to its policies.</p>',
              text: 'Your RAMPED account and associated marketplace data have been deleted. Any Stripe financial records are retained by Stripe according to its policies.',
            },
            `ramped-account-deleted-${user.id}`
          );
          emailConfirmation = 'sent';
        } catch (emailError) {
          console.error('Account deletion confirmation email failed:', emailError);
          emailConfirmation = 'failed';
        }
      }
      return res.json({ ok: true, emailConfirmation });
    } catch (error) {
      console.error('Account deletion failed:', error);
      return res.status(500).json({
        error: 'Account deletion failed. If subscription cancellation succeeded, it will remain canceled; contact support before retrying.',
      });
    }
  });

  app.post('/api/jobs/lifecycle', requireCronSecret, async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const { data: candidates, error: candidateError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('user_id,profile,last_check_in_at')
        .eq('role', 'candidate');
      if (candidateError) throw candidateError;

      const summary = {
        notifications: 0,
        notificationFailed: 0,
        deleted: 0,
        deletionFailed: 0,
        emailSent: 0,
        emailFailed: 0,
        emailSkipped: 0,
      };
      for (const candidate of candidates || []) {
        const lastCheckIn = new Date(candidate.last_check_in_at);
        const daysInactive = Math.floor((Date.now() - lastCheckIn.getTime()) / 86_400_000);
        if (!Number.isFinite(daysInactive) || daysInactive < 0) continue;

        if (daysInactive >= 30) {
          const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(candidate.user_id);
          if (deleteError) {
            console.error(`Inactive candidate deletion failed for ${candidate.user_id}:`, deleteError);
            summary.deletionFailed += 1;
          } else {
            summary.deleted += 1;
          }
          continue;
        }

        const lifecycleEvent = daysInactive >= 27
          ? {
              key: 'deletion_warning',
              title: 'Your RAMPED account will be deleted in 3 days',
              message: 'Check in now to keep your account and credentials. Accounts inactive for 30 days are permanently deleted.',
              subject: 'Action required: Your RAMPED account is scheduled for deletion',
              body: 'Your RAMPED account and associated profile data will be permanently deleted after 30 days of inactivity. Sign in and check in before then to keep your account.',
            }
          : daysInactive >= 14
            ? {
                key: 'archived',
                title: 'Your RAMPED profile is archived',
                message: 'Your profile is hidden from employer search. Sign in and check in before Day 30 to restore it.',
                subject: 'Your RAMPED profile has been archived',
                body: 'Your profile is hidden from employer search after 14 days of inactivity. Sign in and check in before Day 30 to restore your profile and prevent account deletion.',
              }
            : daysInactive >= 13
              ? {
                  key: 'warning_1day',
                  title: 'Your profile will be archived tomorrow',
                  message: 'Check in to remain visible in employer search.',
                  subject: '24 hours left to keep your RAMPED profile active',
                  body: 'Your profile will be archived from employer search after 14 days of inactivity. Check in now to remain visible.',
                }
              : daysInactive >= 11
                ? {
                    key: 'warning_3day',
                    title: 'Check in to keep your profile active',
                    message: 'Your profile will be archived from employer search after 14 days of inactivity.',
                    subject: 'Check in to keep your RAMPED profile active',
                    body: 'Your profile will be archived from employer search after 14 days of inactivity. Check in now to remain visible.',
                  }
                : null;
        if (!lifecycleEvent) continue;

        const eventKey = `lifecycle:${candidate.user_id}:${candidate.last_check_in_at}:${lifecycleEvent.key}`;
        const { data: notification, error: notificationError } = await supabaseAdmin
          .from('marketplace_notifications')
          .upsert(
            {
              user_id: candidate.user_id,
              dedupe_key: eventKey,
              payload: {
                title: lifecycleEvent.title,
                message: lifecycleEvent.message,
                type: lifecycleEvent.key === 'archived' ? 'archived' : 'inactivity_warning',
              },
            },
            { onConflict: 'dedupe_key', ignoreDuplicates: true }
          )
          .select('id')
          .maybeSingle();
        if (notificationError) {
          console.error(`Lifecycle notification failed for ${candidate.user_id}:`, notificationError);
          summary.notificationFailed += 1;
          continue;
        }
        if (notification) summary.notifications += 1;

        const profile = candidate.profile || {};
        const name = typeof profile.name === 'string' ? profile.name : 'there';
        const recipient = typeof profile.email === 'string' ? profile.email : '';
        if (!recipient) {
          console.error(`Lifecycle email skipped: candidate ${candidate.user_id} has no email address.`);
          summary.emailSkipped += 1;
          continue;
        }
        const safeName = escapeHtml(name);
        const link = escapeHtml(appUrl);
        const html = `<p>Hello ${safeName},</p><p>${escapeHtml(lifecycleEvent.body)}</p><p><a href="${link}">Sign in to RAMPED</a></p>`;
        try {
          const delivery = await queueAndDeliverEmail({
            userId: candidate.user_id,
            eventKey,
            recipient,
            subject: lifecycleEvent.subject,
            html,
            text: `Hello ${name},\n\n${lifecycleEvent.body}\n\nSign in: ${appUrl}`,
          });
          if (delivery === 'sent') summary.emailSent += 1;
          if (delivery === 'failed') summary.emailFailed += 1;
        } catch (emailError) {
          console.error(`Lifecycle email enqueue failed for ${candidate.user_id}:`, emailError);
          summary.emailFailed += 1;
        }
      }

      const outbox = await processEmailOutbox();
      return res.json({ ok: true, ...summary, outbox });
    } catch (error) {
      console.error('Lifecycle job failed:', error);
      return res.status(500).json({ error: 'Lifecycle job failed.' });
    }
  });

  app.post('/api/marketplace/profile', requireUser, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      if (!requireConfirmedEmail(user, res)) return;
      const requestedRole = req.body?.role;
      const submittedProfile = req.body?.profile;
      if (
        (requestedRole !== 'candidate' && requestedRole !== 'employer') ||
        typeof submittedProfile !== 'object' ||
        submittedProfile === null ||
        Array.isArray(submittedProfile)
      ) {
        return res.status(400).json({ error: 'Choose a candidate or employer account and submit a valid profile.' });
      }
      if (Buffer.byteLength(JSON.stringify(submittedProfile), 'utf8') > 8_000_000) {
        return res.status(413).json({ error: 'Profile and credential upload exceed the 8 MB limit.' });
      }
      if (
        requestedRole === 'candidate' &&
        (
          typeof submittedProfile.name !== 'string' ||
          !submittedProfile.name.trim() ||
          typeof submittedProfile.degreeTitle !== 'string' ||
          !submittedProfile.degreeTitle.trim() ||
          typeof submittedProfile.institution !== 'string' ||
          !submittedProfile.institution.trim() ||
          !Array.isArray(submittedProfile.targetCategories) ||
          typeof submittedProfile.credentialDocumentUrl !== 'string' ||
          !/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,/i.test(submittedProfile.credentialDocumentUrl)
        )
      ) {
        return res.status(400).json({ error: 'Complete your candidate details and upload a supported credential document.' });
      }
      if (
        requestedRole === 'employer' &&
        ['companyName', 'corporateDomain', 'websiteUrl', 'recruiterName', 'recruiterTitle']
          .some((field) => typeof submittedProfile[field] !== 'string' || !submittedProfile[field].trim())
      ) {
        return res.status(400).json({ error: 'Complete all required business verification fields.' });
      }

      const existing = await getMarketplaceProfile(user);
      const isAdmin = Boolean(user.email && adminEmails.has(user.email.toLowerCase()));
      const role = isAdmin ? 'admin' : existing?.role || requestedRole;
      if (existing && existing.role !== role) {
        return res.status(409).json({ error: 'Account role cannot be changed after setup.' });
      }
      const profile = {
        ...submittedProfile,
        id: user.id,
        email: user.email || '',
      };
      delete profile.identityVerificationStatus;
      delete profile.businessVerificationStatus;
      if (requestedRole === 'employer') delete profile.taxId;
      const verificationStatus = existing?.verification_status || 'pending';
      const { data, error } = await supabaseAdmin
        .from('marketplace_profiles')
        .upsert(
          {
            user_id: user.id,
            role,
            profile,
            verification_status: verificationStatus,
            is_snoozed: role === 'candidate' && profile.isSnoozed === true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select('user_id,role,profile,verification_status,is_snoozed,last_check_in_at')
        .single();
      if (error) throw error;
      return res.status(existing ? 200 : 201).json({ profile: data });
    } catch (error) {
      console.error('Marketplace profile save failed:', error);
      return res.status(500).json({ error: 'Unable to save marketplace profile.' });
    }
  });

  app.get('/api/marketplace/state', requireUser, async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      const own = await getMarketplaceProfile(user);
      if (!own || (own.role !== 'admin' && !Object.keys(own.profile || {}).length)) {
        return res.status(409).json({ error: 'Complete account setup before using the marketplace.' });
      }

      const candidates: ReturnType<typeof profileRecordToCandidate>[] = [];
      const employers: ReturnType<typeof profileRecordToEmployer>[] = [];
      let employerManagerUserId = user.id;
      if (own.role === 'candidate') {
        if (own.profile && Object.keys(own.profile).length) {
          candidates.push(profileRecordToCandidate(own, true));
        }
      } else if (own.role === 'employer') {
        const managerUserId = await getEmployerManagerId(user.id);
        employerManagerUserId = managerUserId;
        const { data: managerProfile, error: managerProfileError } = await supabaseAdmin
          .from('marketplace_profiles')
          .select('user_id,profile,verification_status')
          .eq('user_id', managerUserId)
          .maybeSingle();
        if (managerProfileError) throw managerProfileError;
        const { data: billing, error: billingError } = await supabaseAdmin
          .from('billing_accounts')
          .select('stripe_customer_id,stripe_subscription_id,subscription_status,subscription_tier,subscription_cadence,current_period_end,alert_categories')
          .eq('user_id', managerUserId)
          .maybeSingle();
        if (billingError) throw billingError;
        const employerProfile = managerProfile || own;
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const { count: monthlyMatchAlertsUsed, error: alertsCountError } = await supabaseAdmin
          .from('marketplace_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', managerUserId)
          .contains('payload', { type: 'candidate_match_alert' })
          .gte('created_at', monthStart.toISOString());
        if (alertsCountError) throw alertsCountError;
        employers.push({
          ...profileRecordToEmployer(employerProfile, billing),
          id: user.id,
          managerUserId,
          monthlyMatchAlertsUsed: monthlyMatchAlertsUsed || 0,
        });
      } else if (own.role === 'admin') {
        const { data: rows, error: profileError } = await supabaseAdmin
          .from('marketplace_profiles')
          .select('user_id,role,profile,verification_status,is_snoozed,last_check_in_at,created_at');
        if (profileError) throw profileError;
        for (const record of rows || []) {
          if (record.role === 'candidate') candidates.push(profileRecordToCandidate(record, true));
          if (record.role === 'employer') {
            const { data: billing, error: billingError } = await supabaseAdmin
              .from('billing_accounts')
              .select('stripe_customer_id,stripe_subscription_id,subscription_status,subscription_tier,subscription_cadence,current_period_end,alert_categories')
              .eq('user_id', record.user_id)
              .maybeSingle();
            if (billingError) throw billingError;
            employers.push(profileRecordToEmployer(record, billing));
          }
        }
      }

      const { data: teamMembers, error: teamError } = own.role === 'employer'
        ? await supabaseAdmin
            .from('employer_team_seats')
            .select('member_user_id')
            .eq('manager_user_id', employerManagerUserId)
            .eq('status', 'active')
        : { data: [], error: null };
      if (teamError) throw teamError;
      const inviteQuery = own.role === 'candidate'
        ? supabaseAdmin.from('job_invites').select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at').eq('candidate_user_id', user.id)
        : supabaseAdmin.from('job_invites').select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at').in(
            'employer_user_id',
            [...new Set([employerManagerUserId, ...(teamMembers || []).map((seat) => seat.member_user_id).filter((id): id is string => Boolean(id))])]
          );
      const { data: inviteRows, error: inviteError } = await inviteQuery.order('created_at', { ascending: false });
      if (inviteError) throw inviteError;
      const jobInvites = (inviteRows || []).map((record) => ({
        ...record.profile,
        id: record.id,
        status: record.status,
        candidateContactedExternally: record.candidate_contacted_externally,
        candidateArchived: record.candidate_archived,
        viewedByCandidate: record.viewed_by_candidate,
        sentAt: record.created_at,
        ...(own.role === 'employer' ? { candidateEmail: '' } : {}),
      }));

      const { data: notificationRows, error: notificationError } = await supabaseAdmin
        .from('marketplace_notifications')
        .select('id,payload,created_at,read_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (notificationError) throw notificationError;
      const notifications = (notificationRows || []).map((record) => ({
        ...record.payload,
        id: record.id,
        userId: user.id,
        timestamp: record.created_at,
        read: Boolean(record.read_at),
      }));

      return res.json({
        role: own.role,
        userId: user.id,
        candidates,
        employers,
        jobInvites,
        notifications,
        emailLogs: [],
        currentProfile: own.role === 'candidate'
          ? candidates.find((candidate) => candidate.id === user.id) || null
          : employers.find((employer) => employer.id === user.id) || null,
      });
    } catch (error) {
      console.error('Marketplace state lookup failed:', error);
      return res.status(500).json({ error: 'Unable to load marketplace data.' });
    }
  });

  app.put('/api/marketplace/profile', requireUser, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      const existing = await getMarketplaceProfile(user);
      const submittedProfile = req.body?.profile;
      if (
        !existing ||
        (existing.role !== 'candidate' && existing.role !== 'employer') ||
        typeof submittedProfile !== 'object' ||
        submittedProfile === null ||
        Array.isArray(submittedProfile)
      ) {
        return res.status(400).json({ error: 'A valid marketplace profile is required.' });
      }
      if (Buffer.byteLength(JSON.stringify(submittedProfile), 'utf8') > 8_000_000) {
        return res.status(413).json({ error: 'Profile and credential upload exceed the 8 MB limit.' });
      }
      if (
        existing.role === 'candidate' &&
        typeof submittedProfile.credentialDocumentUrl === 'string' &&
        submittedProfile.credentialDocumentUrl.length > 0 &&
        !/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,/i.test(submittedProfile.credentialDocumentUrl)
      ) {
        return res.status(400).json({ error: 'Credential upload must be a supported image or PDF.' });
      }
      const verificationFields = existing.role === 'candidate'
        ? ['name', 'degreeType', 'degreeTitle', 'institution', 'graduationYear', 'credentialDocumentUrl']
        : ['companyName', 'corporateDomain', 'websiteUrl', 'recruiterName', 'recruiterTitle'];
      const requiresReverification = verificationFields.some(
        (field) => submittedProfile[field] !== existing.profile[field]
      );
      const verificationStatus = requiresReverification
        ? 'pending'
        : existing.verification_status;
      const protectedFields = existing.role === 'candidate'
        ? {
            verificationStatus,
            verifiedBadge: verificationStatus === 'verified',
            identityVerificationStatus: existing.profile.identityVerificationStatus,
          }
        : {
            verificationStatus,
            businessVerificationStatus: requiresReverification
              ? 'pending'
              : existing.profile.businessVerificationStatus,
            subscriptionTier: undefined,
            subscriptionCadence: undefined,
            stripeCustomerId: undefined,
            stripeSubscriptionId: undefined,
          };
      const profile = {
        ...existing.profile,
        ...submittedProfile,
        ...protectedFields,
        id: user.id,
        email: user.email || '',
      };
      if (
        existing.role === 'employer' &&
        submittedProfile.savedSearchCriteria !== undefined &&
        submittedProfile.savedSearchCriteria !== null &&
        !isExactCredentialCriteria(submittedProfile.savedSearchCriteria)
      ) {
        return res.status(400).json({ error: 'Saved candidate search criteria are invalid.' });
      }
      if (existing.role === 'employer') delete profile.taxId;
      if (requiresReverification && existing.role === 'employer') {
        const { error: supersedeError } = await supabaseAdmin
          .from('persona_verification_attempts')
          .update({ status: 'superseded', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('verification_type', 'employer')
          .eq('status', 'pending');
        if (supersedeError) throw supersedeError;
      }
      const { error } = await supabaseAdmin
        .from('marketplace_profiles')
        .update({
          profile,
          verification_status: verificationStatus,
          is_snoozed: existing.role === 'candidate' && profile.isSnoozed === true,
          last_check_in_at:
            existing.role === 'candidate' && req.body.checkIn === true
              ? new Date().toISOString()
              : existing.last_check_in_at,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (error) throw error;
      if (existing.role === 'candidate' && verificationStatus === 'verified') {
        const { data: candidate, error: candidateError } = await supabaseAdmin
          .from('marketplace_profiles')
          .select('user_id,profile,verification_status,is_snoozed,last_check_in_at')
          .eq('user_id', user.id)
          .single();
        if (candidateError) throw candidateError;
        await notifyEmployersOfCandidateMatch(candidate);
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('Marketplace profile update failed:', error);
      return res.status(500).json({ error: 'Unable to update marketplace profile.' });
    }
  });

  app.post('/api/marketplace/invites', requireUser, requireMarketplaceRole('employer'), async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      const employer = res.locals.marketplaceProfile;
      const invite = req.body?.invite;
      if (
        employer.verification_status !== 'approved' ||
        typeof invite !== 'object' ||
        invite === null ||
        typeof invite.candidateId !== 'string' ||
        typeof invite.jobTitle !== 'string' ||
        invite.jobTitle.trim().length === 0 ||
        invite.jobTitle.length > 160
      ) {
        return res.status(403).json({ error: 'Employer verification and a valid job invite are required.' });
      }
      const managerUserId = await getEmployerManagerId(user.id);
      const { data: billing, error: billingError } = await supabaseAdmin
        .from('billing_accounts')
        .select('subscription_status,subscription_tier,current_period_end')
        .eq('user_id', managerUserId)
        .maybeSingle();
      if (billingError) throw billingError;
      if (
        !billing ||
        !['active', 'trialing'].includes(billing.subscription_status) ||
        new Date(billing.current_period_end || 0).getTime() <= Date.now()
      ) {
        return res.status(402).json({ error: 'An active subscription is required to send invites.' });
      }
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data: teamSeats, error: seatsError } = await supabaseAdmin
        .from('employer_team_seats')
        .select('member_user_id')
        .eq('manager_user_id', managerUserId)
        .eq('status', 'active');
      if (seatsError) throw seatsError;
      const teamUserIds = [...new Set([managerUserId, ...(teamSeats || []).map((seat) => seat.member_user_id).filter(Boolean)])];
      const { count, error: quotaError } = await supabaseAdmin
        .from('job_invites')
        .select('id', { count: 'exact', head: true })
        .in('employer_user_id', teamUserIds)
        .gte('created_at', monthStart.toISOString());
      if (quotaError) throw quotaError;
      if (billing.subscription_tier === 'tier1' && (count || 0) >= 25) {
        return res.status(429).json({ error: 'Your plan includes 25 invites per month.' });
      }

      const { data: candidate, error: candidateError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('user_id,profile,verification_status,is_snoozed,last_check_in_at')
        .eq('user_id', invite.candidateId)
        .eq('role', 'candidate')
        .maybeSingle();
      if (candidateError) throw candidateError;
      if (
        !candidate ||
        candidate.verification_status !== 'verified' ||
        candidate.is_snoozed ||
        new Date(candidate.last_check_in_at).getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000
      ) {
        return res.status(404).json({ error: 'That candidate is no longer available for discovery.' });
      }
      const candidateProfile = candidate.profile || {};
      const { data: managerProfile, error: managerProfileError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('profile')
        .eq('user_id', managerUserId)
        .single();
      if (managerProfileError) throw managerProfileError;
      const employerProfile = managerProfile.profile || employer.profile || {};
      const persistedInvite = {
        ...invite,
        id: undefined,
        employerId: managerUserId,
        employerCompanyName: employerProfile.companyName || '',
        candidateId: candidate.user_id,
        candidateName: candidateProfile.name || '',
        candidateEmail: candidateProfile.email || '',
        contactName: String(invite.contactName || '').slice(0, 120),
        contactTitle: String(invite.contactTitle || '').slice(0, 120),
        contactEmail: String(invite.contactEmail || '').slice(0, 254),
        contactPhone: String(invite.contactPhone || '').slice(0, 40),
        jobTitle: invite.jobTitle.trim(),
        sentAt: new Date().toISOString(),
        status: 'pending',
        candidateContactedExternally: false,
        candidateArchived: false,
        viewedByCandidate: false,
      };
      const { data: newInvite, error: inviteError } = await supabaseAdmin
        .from('job_invites')
        .insert({
          employer_user_id: managerUserId,
          candidate_user_id: candidate.user_id,
          profile: persistedInvite,
        })
        .select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at')
        .single();
      if (inviteError) throw inviteError;
      const { error: notificationError } = await supabaseAdmin
        .from('marketplace_notifications')
        .insert({
          user_id: candidate.user_id,
          payload: {
            title: `Direct Invite: ${persistedInvite.employerCompanyName}`,
            message: `${persistedInvite.employerCompanyName} sent you an invitation for "${persistedInvite.jobTitle}".`,
            type: 'invite',
            metadata: { inviteId: newInvite.id },
          },
        });
      if (notificationError) throw notificationError;
      let emailStatus: 'sent' | 'queued' | 'failed' = 'failed';
      try {
        const candidateName = String(candidateProfile.name || 'there');
        const companyName = String(persistedInvite.employerCompanyName);
        const jobTitle = String(persistedInvite.jobTitle);
        const safeCandidateName = escapeHtml(candidateName);
        const safeCompanyName = escapeHtml(companyName);
        const safeJobTitle = escapeHtml(jobTitle);
        const contactInstructions = String(persistedInvite.contactInstructions || '');
        emailStatus = await queueAndDeliverEmail({
          userId: candidate.user_id,
          eventKey: `job-invite:${newInvite.id}`,
          recipient: String(candidateProfile.email || ''),
          subject: `Direct job invite: ${jobTitle} at ${companyName}`,
          html: `<p>Hello ${safeCandidateName},</p><p>${safeCompanyName} invited you to explore <strong>${safeJobTitle}</strong>.</p><p>${escapeHtml(contactInstructions).replace(/\n/g, '<br>')}</p><p>RAMPED does not provide in-app replies. Use the contact details in the invitation to respond directly.</p>`,
          text: `Hello ${candidateName},\n\n${companyName} invited you to explore ${jobTitle}.\n\n${contactInstructions}\n\nRAMPED does not provide in-app replies. Use the contact details in the invitation to respond directly.`,
        });
      } catch (emailError) {
        console.error(`Invite email enqueue failed for ${newInvite.id}:`, emailError);
      }
      return res.status(201).json({
        invite: { ...newInvite.profile, id: newInvite.id },
        emailStatus,
      });
    } catch (error) {
      console.error('Marketplace invite creation failed:', error);
      return res.status(500).json({ error: 'Unable to send the job invite.' });
    }
  });

  app.patch('/api/marketplace/invites/:inviteId', requireUser, requireMarketplaceRole('candidate'), async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      const { inviteId } = req.params;
      const updates = req.body || {};
      const allowedKeys = ['candidateContactedExternally', 'candidateArchived', 'viewedByCandidate'];
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteId) ||
        Object.keys(updates).some((key) => !allowedKeys.includes(key)) ||
        Object.values(updates).some((value) => typeof value !== 'boolean')
      ) {
        return res.status(400).json({ error: 'Invalid invite update.' });
      }
      const dbUpdates: Record<string, boolean> = {};
      if (typeof updates.candidateContactedExternally === 'boolean') {
        dbUpdates.candidate_contacted_externally = updates.candidateContactedExternally;
      }
      if (typeof updates.candidateArchived === 'boolean') {
        dbUpdates.candidate_archived = updates.candidateArchived;
      }
      dbUpdates.viewed_by_candidate = true;
      const { data, error } = await supabaseAdmin
        .from('job_invites')
        .update(dbUpdates)
        .eq('id', inviteId)
        .eq('candidate_user_id', user.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Invite not found.' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Marketplace invite update failed:', error);
      return res.status(500).json({ error: 'Unable to update the invite.' });
    }
  });

  app.post('/api/marketplace/check-in', requireUser, requireMarketplaceRole('candidate'), async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      const { error } = await supabaseAdmin
        .from('marketplace_profiles')
        .update({ last_check_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      const { data: candidate, error: candidateError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('user_id,profile,verification_status,is_snoozed,last_check_in_at')
        .eq('user_id', user.id)
        .single();
      if (candidateError) throw candidateError;
      await notifyEmployersOfCandidateMatch(candidate);
      const { error: notificationError } = await supabaseAdmin
        .from('marketplace_notifications')
        .insert({
          user_id: user.id,
          payload: {
            title: 'Profile check-in recorded',
            message: 'Your profile is active and remains eligible for employer discovery.',
            type: 'invite',
          },
        });
      if (notificationError) throw notificationError;
      return res.json({ ok: true });
    } catch (error) {
      console.error('Candidate check-in failed:', error);
      return res.status(500).json({ error: 'Unable to record your check-in.' });
    }
  });

  app.patch('/api/marketplace/notifications/:notificationId/read', requireUser, async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const user = res.locals.authUser as User;
      if (!isBetaAllowed(user)) {
        return res.status(403).json({ error: 'This account is not on the private beta access list.' });
      }
      const notificationId = req.params.notificationId;
      const { data, error } = await supabaseAdmin
        .from('marketplace_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Notification not found.' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Notification update failed:', error);
      return res.status(500).json({ error: 'Unable to update notification.' });
    }
  });

  app.post('/api/admin/verification', requireUser, requireMarketplaceRole('admin'), async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    try {
      const { userId, approved, notes } = req.body || {};
      if (typeof userId !== 'string' || typeof approved !== 'boolean' || (notes !== undefined && typeof notes !== 'string')) {
        return res.status(400).json({ error: 'A user ID, verification result, and optional notes are required.' });
      }
      const { data: target, error: targetError } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('user_id,role,profile,verification_status,is_snoozed,last_check_in_at')
        .eq('user_id', userId)
        .in('role', ['candidate', 'employer'])
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return res.status(404).json({ error: 'Marketplace account not found.' });
      const status = approved
        ? target.role === 'candidate' ? 'verified' : 'approved'
        : 'rejected';
      const profile = {
        ...target.profile,
        ...(target.role === 'employer'
          ? { businessVerificationStatus: status === 'approved' ? 'verified' : 'rejected' }
          : {}),
        verificationNotes: typeof notes === 'string' ? notes.slice(0, 1000) : '',
        rejectionReason: approved ? undefined : String(notes || 'Additional verification is required.').slice(0, 1000),
      };
      const { error: updateError } = await supabaseAdmin
        .from('marketplace_profiles')
        .update({ verification_status: status, profile, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) throw updateError;
      const { error: notificationError } = await supabaseAdmin
        .from('marketplace_notifications')
        .insert({
          user_id: userId,
          payload: {
            title: approved ? 'RAMPED verification approved' : 'RAMPED verification update',
            message: approved
              ? 'Your account verification has been approved.'
              : String(notes || 'Please review your profile and submit additional information.').slice(0, 1000),
            type: 'verification',
          },
        });
      if (notificationError) throw notificationError;
      if (target.role === 'candidate' && approved) {
        await notifyEmployersOfCandidateMatch({
          user_id: target.user_id,
          profile,
          verification_status: status,
          is_snoozed: target.is_snoozed,
          last_check_in_at: target.last_check_in_at,
        });
      }
      let emailStatus: 'sent' | 'queued' | 'failed' | 'not_available' = 'not_available';
      const recipient = typeof target.profile.email === 'string' ? target.profile.email : '';
      if (recipient) {
        const eventKey = `verification:${userId}:${status}:${randomUUID()}`;
        const personName = typeof target.profile.name === 'string'
          ? target.profile.name
          : typeof target.profile.recruiterName === 'string'
            ? target.profile.recruiterName
            : 'there';
        const organization = typeof target.profile.companyName === 'string'
          ? target.profile.companyName
          : 'your account';
        const result = approved
          ? `Your ${target.role === 'candidate' ? 'academic credentials' : `business account for ${organization}`} have been approved.`
          : `Your verification needs attention. ${String(notes || 'Please review your profile and submit additional information.').slice(0, 1000)}`;
        try {
          emailStatus = await queueAndDeliverEmail({
            userId,
            eventKey,
            recipient,
            subject: approved ? 'Your RAMPED verification is approved' : 'Update about your RAMPED verification',
            html: `<p>Hello ${escapeHtml(personName)},</p><p>${escapeHtml(result)}</p><p>Sign in to RAMPED to review your account.</p>`,
            text: `Hello ${personName},\n\n${result}\n\nSign in to RAMPED to review your account.`,
          });
        } catch (emailError) {
          console.error(`Verification email enqueue failed for ${userId}:`, emailError);
          emailStatus = 'failed';
        }
      }
      return res.json({ ok: true, verificationStatus: status, emailStatus });
    } catch (error) {
      console.error('Admin verification failed:', error);
      return res.status(500).json({ error: 'Unable to update verification status.' });
    }
  });

  app.post('/api/admin/email', requireUser, requireMarketplaceRole('admin'), async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Marketplace storage is not configured.' });
    }
    const { userId, subject, bodyText } = req.body || {};
    if (
      typeof userId !== 'string' ||
      typeof subject !== 'string' ||
      !subject.trim() ||
      subject.length > 200 ||
      typeof bodyText !== 'string' ||
      !bodyText.trim() ||
      bodyText.length > 10_000
    ) {
      return res.status(400).json({ error: 'A recipient, subject, and message body are required.' });
    }
    try {
      const { data: target, error } = await supabaseAdmin
        .from('marketplace_profiles')
        .select('profile')
        .eq('user_id', userId)
        .eq('role', 'candidate')
        .maybeSingle();
      if (error) throw error;
      if (!target) return res.status(404).json({ error: 'Candidate account not found.' });
      const recipient = typeof target.profile.email === 'string' ? target.profile.email : '';
      if (!recipient) return res.status(409).json({ error: 'Candidate account has no email address.' });
      const safeBody = escapeHtml(bodyText).replace(/\n/g, '<br>');
      const emailStatus = await queueAndDeliverEmail({
        userId,
        eventKey: `admin-email:${userId}:${randomUUID()}`,
        recipient,
        subject: subject.trim(),
        html: `<p>${safeBody}</p>`,
        text: bodyText,
      });
      return res.json({ ok: true, emailStatus });
    } catch (error) {
      console.error('Administrator email delivery failed:', error);
      return res.status(500).json({ error: 'Unable to send administrator email.' });
    }
  });

  // Shared server-side Gemini client utility
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Gemini Career Assistant API Endpoint
  app.post('/api/gemini/chat', ...productionCandidateAccess, async (req, res) => {
    try {
      const {
        messages,
        candidateContext: requestedCandidateContext,
        taskMode = 'general',
      } = req.body;

      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.length > 20 ||
        messages.some(
          (message: unknown) =>
            typeof message !== 'object' ||
            message === null ||
            !('content' in message) ||
            typeof message.content !== 'string' ||
            message.content.length > 4000
        )
      ) {
        return res.status(400).json({ error: 'Provide 1 to 20 messages, each 4,000 characters or fewer.' });
      }
      const model = 'gemini-3.8-flash';
      const candidateContext = process.env.NODE_ENV === 'production'
        ? (res.locals.marketplaceProfile?.profile || {})
        : requestedCandidateContext;

      const systemInstruction = `You are Gemini Career Studio for RAMPED (Recruiter & Applicant Matching Platform for Employment and Discovery).
Your mission is to empower passive talent who hold verified academic credentials. Be a creative, perceptive partner who helps candidates express themselves clearly and fully.
RESUME SAFETY RULE: Never invent, add, remove, or change a candidate's facts, qualifications, employers, dates, achievements, or metrics. When asked to work on a resume, make only spelling, grammar, punctuation, capitalization, and formatting corrections. Do not rewrite or paraphrase. If the candidate has not provided resume text, ask them to paste it; do not generate a sample resume or bullets. Return only the corrected supplied text, without an introduction or extra suggestions.
You MUST recognize which document format the candidate is asking for and strictly enforce these format definitions. Never mix up or blend their formats!

CRITICAL FORMAT SPECIFICATIONS & RULES:

1. AUTHENTIC "ABOUT ME" SECTIONS (Personal Narrative):
   - Your role is to be a creative, perceptive writing partner who helps the candidate express their full, distinctive self—not merely proofread or compress what they wrote. Actively help them discover what they want to say; do not make them do all the writing alone.
   - FORMAT: When there is enough material, shape it into a complete, engaging first-person narrative, usually 2 to 3 fluid paragraphs (about 150-250 words, or longer when the candidate asks). Develop the candidate's meaning fully; do not make the result feel like a short template or checklist.
   - CONTENT: Draw out the candidate's actual perspective, motivations, values, collaboration style, curiosity, defining moments, interests, and hopes. Bring forward meaningful specifics and connect them into a natural story. Use vivid, original phrasing and a confident human voice; avoid cliches, generic filler, and résumé-like lists.
   - Be an active interviewer and creative coach: ask one thoughtful, open-ended follow-up at a time when more detail would make the story more personal or complete. Offer optional prompts, perspectives, or angles to help the candidate find words and explore their story, but never present those suggestions as facts about them. Once you have enough, do the creative writing work and give them a complete draft to react to.
   - Use only details the candidate actually shared. Do not infer or invent their values, personality, hobbies, preferences, motivations, or life experiences from their degree, school, job category, or name. Do not turn a possibility or writing suggestion into a claim.
   - ABSOLUTE PROHIBITIONS:
     * NEVER start with a letter salutation or greeting (e.g., "Dear Hiring Team", "Dear Recruiter", "Dear Hiring Manager").
     * NEVER include a formal letter closing or sign-off (e.g., "Warm regards,", "Sincerely,", "Respectfully,", followed by candidate name).
     * NEVER format as a formal letter structure or an email.
     * NEVER use lists of bulleted job duties or technical achievements (keep those in the Resume).
     * Why: This section is stored directly in the candidate's profile "About Me" box. It is displayed as a public personal story, NOT as a letter to an employer!

2. COVERS LETTERS:
   - FORMAT: A structured, formal business letter.
   - CONTENT: Tailored technical cover letter.
   - MUSTS:
     * MUST start with a formal greeting (e.g., "Dear Engineering Team," or "Dear Hiring Manager,").
     * MUST have 3-4 professional paragraphs highlighting their verified degree and fit for target job categories.
     * MUST end with a formal closing and candidate signature block (e.g., "Sincerely,\n[Name]\n[Email]").

3. RESUME SUMMARY & EXPERIENCE BULLETS:
   - Only proofread and format the candidate's supplied text, following the RESUME SAFETY RULE above.

Candidate Context:
- Name: ${candidateContext?.name || 'Candidate'}
- Target Job Categories: ${candidateContext?.targetCategories?.join(', ') || 'Software Engineer'}
- Verified Degree: ${candidateContext?.degreeTitle || 'Bachelor of Science'} from ${candidateContext?.institution || 'University'} (Class of ${candidateContext?.graduationYear || '2024'})
- Years of Experience: ${candidateContext?.yearsOfExperience || 3} years
- Current Resume Summary: ${candidateContext?.resumeSummary || 'Not provided'}
- Current 'About Me' text: ${candidateContext?.aboutMe || 'Not provided yet'}
- Current Cover Letter: ${candidateContext?.coverLetterText || 'Not provided yet'}

Always provide structured, clear, and actionable feedback. Resume corrections must preserve the candidate's meaning and claims.`;

      // If Gemini API is available on server, call it via official @google/genai SDK
      if (ai) {
        try {
          // Format conversation history for multi-turn chat
          const formattedContents = messages.map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
          }));

          let replyText = '';
          let usedModel = model || 'gemini-3.8-flash';
          const careerModels = [
            model || 'gemini-3.8-flash',
            'gemini-3.6-flash',
            'gemini-3.5-flash-lite',
          ];
          let lastErr: any = null;
          for (const m of careerModels) {
            try {
              const response = await ai.models.generateContent({
                model: m,
                contents: formattedContents,
                config: { systemInstruction, temperature: 0.7 },
              });
              replyText = response.text || '';
              if (replyText) { usedModel = m; break; }
            } catch (err: any) {
              console.warn(`Career Studio model ${m} failed:`, err?.message);
              lastErr = err;
            }
          }
          if (!replyText) {
            throw lastErr || new Error('All Gemini models failed for Career Studio');
          }
          return res.json({
            text: replyText,
            modelUsed: usedModel,
            needsInput: taskMode === 'about_me' && replyText.trim().endsWith('?'),
          });
        } catch (apiError: any) {
          console.error('Career Studio: all Gemini models failed:', apiError?.message);
          return res.status(503).json({
            error: 'AI service temporarily unavailable. Please try again.',
            detail: apiError?.message || 'All Gemini models failed',
          });
        }
      }

      // Do not fabricate resume content when the AI service is not configured.
      if (taskMode === 'resume') {
        return res.status(503).json({ error: 'Resume proofreading is temporarily unavailable. Please try again later.' });
      }

      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let fallbackText = '';
      let needsInput = false;
      if (lastMessage.includes('about me') || taskMode === 'about_me') {
        fallbackText = `I'd love to help you tell the fullest version of your story in your own voice. What matters most to you in how you work, connect with people, or spend your time—and is there a small example that shows it? Share it however it comes to mind; I'll help you find the words.`;
        needsInput = true;
      } else if (lastMessage.includes('cover letter') || taskMode === 'cover_letter') {
        fallbackText = `Here is a tailored, executive cover letter highlighting your verified academic degree and engineering experience:

### Professional Cover Letter Draft:
**Dear Hiring Team,**

I am writing to express my interest in joining your team as a **${candidateContext?.targetCategories?.[0] || 'Software Engineer'}**. Having recently verified my credentials on RAMPED with a **${candidateContext?.degreeTitle || 'Bachelor of Science'}** from **${candidateContext?.institution || 'Stanford University'}**, I am excited by opportunities to work on mission-critical platform architectures.

Over the past **${candidateContext?.yearsOfExperience || 3}+ years**, I have specialized in building reliable, fault-tolerant distributed systems handling heavy throughput. My focus is on writing clean, maintainable code, eliminating architectural bottlenecks, and collaborating with cross-functional partners to ship durable user value.

What attracts me to your engineering organization is your commitment to technical rigor and transparent culture. I welcome the opportunity to discuss how my verified background and hands-on experience can help accelerate your roadmap.

Warm regards,  
**${candidateContext?.name || 'Your Name'}**  
${candidateContext?.email || 'email@example.com'}`;
      } else {
        fallbackText = `Hello ${candidateContext?.name || 'there'}! I am **Gemini Career Studio** on RAMPED.

I can assist you with:
- 📝 **Tweaking your resume:** Rewriting bullets to highlight quantified impact and technical depth.
- ✉️ **Crafting personalized cover letters:** Direct, compelling letters tailored to your target job categories.
- 💡 **Writing your 'About Me' section:** Exploring what makes you distinctive and shaping it into a vivid, authentic personal story.
- 🎯 **Evaluating direct recruiter invites:** Analyzing compensation ranges and formulating replies.

What would you like to work on first?`;
      }

      return res.json({
        text: fallbackText,
        modelUsed: model,
        fallbackMode: true,
        needsInput,
      });
    } catch (err: any) {
      console.error('Gemini chat route error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  // Dedicated Gemini 'About Me' Personal Narrative Assistant Endpoint
  app.post('/api/gemini/about-me-helper', ...productionCandidateAccess, async (req, res) => {
    try {
      const {
        action = 'draft', // 'draft' | 'polish' | 'evaluate'
        tone = 'grounded', // 'grounded' | 'collaborative' | 'curious' | 'passionate'
        currentText = '',
        candidateContext: requestedCandidateContext = {},
        customInstruction = '',
      } = req.body;
      const model = 'gemini-3.8-flash';
      const candidateContext = process.env.NODE_ENV === 'production'
        ? (res.locals.marketplaceProfile?.profile || {})
        : requestedCandidateContext;
      if (
        typeof currentText !== 'string' ||
        currentText.length > 8000 ||
        typeof customInstruction !== 'string' ||
        customInstruction.length > 1000
      ) {
        return res.status(400).json({ error: 'Narrative text or custom instructions exceed allowed limits.' });
      }

      const candMajor = candidateContext.degreeTitle || 'Computer Science';
      const candSchool = candidateContext.institution || 'University';
      const candCategories = candidateContext.targetCategories || ['Full-Stack Software Engineer'];
      const primaryCategory = candCategories[0] || 'Software Engineer';

      const checklistCriteria = [
        {
          id: 'values',
          title: 'Core Values & Work Philosophy',
          desc: 'Principles guiding decisions, ethics, intellectual humility, and craft integrity',
        },
        {
          id: 'collaboration',
          title: 'Collaboration & Communication Style',
          desc: 'How you collaborate, give/receive feedback, and cultivate psychological safety',
        },
        {
          id: 'curiosity',
          title: 'Curiosity & Problem-Solving Mindset',
          desc: 'What puzzles or technical domains excite you and how you explore unfamiliar problems',
        },
        {
          id: 'passions',
          title: 'Life Beyond Work (Passions & Hobbies)',
          desc: 'Human pursuits, creative arts, outdoor sports, maker hobbies that recharge you',
        },
        {
          id: 'culture_fit',
          title: 'Ideal Team Culture & Environment',
          desc: 'The environment where you do your best work (blameless culture, high agency, thoughtful documentation)',
        },
      ];

      // If Gemini API is available, invoke Gemini 3.8 Flash
      if (ai) {
        try {
          if (action === 'draft') {
            const suppliedDetails = `${currentText} ${customInstruction}`.trim();
            if (!suppliedDetails) {
              return res.json({
                action,
                needsInput: true,
                followUpQuestion: 'What matters most to you in how you work, connect with people, or spend your time—and is there a small example that shows it? Share it however it comes to mind; I will help you find the words.',
              });
            }
            const systemPrompt = `You are the Gemini Personal Narrative Writer on RAMPED (Recruiter & Applicant Matching Platform for Employment and Discovery).
Be an imaginative, thoughtful writing partner: help the candidate express the fullest, most distinctive version of who they are, beyond résumé facts. Use warm, fresh, vivid language that brings out their meaning and voice; avoid clichés, generic filler, and checklist-like writing. Develop the story into a complete, well-shaped About Me narrative (usually 2-3 paragraphs and about 150-250 words, or longer if requested), connecting the details they shared rather than merely restating them.
Actively help them discover what to say. If more detail would make the story more genuine or complete, ask one thoughtful, open-ended follow-up question at a time. Offer optional prompts or examples as inspiration, clearly not as claims about them.
Use only personal details the candidate actually supplied. Never infer or invent their values, personality, hobbies, preferences, motivations, or life experiences from their degree, school, job category, or name. Profile credentials are context, not evidence about their personal character. Do not present suggested possibilities as facts. Tone: ${tone}. Return only the question or finished narrative.`;

            const userPrompt = `Candidate profile context:
- Primary Field: ${primaryCategory}
- Verified Academic Background: ${candMajor} from ${candSchool}
- Candidate-provided About Me details or draft: ${suppliedDetails}`;

            const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.75,
              },
            });

            const narrative = response.text?.trim();
            if (!narrative) {
              return res.status(503).json({ error: 'The About Me assistant returned no text. Please try again.' });
            }
            if (narrative.endsWith('?')) {
              return res.json({ action, needsInput: true, followUpQuestion: narrative, modelUsed: model });
            }
            return res.json({ narrative, action, modelUsed: model });
          } else if (action === 'polish') {
            const systemPrompt = `You are a creative, perceptive About Me editor on RAMPED. Help the candidate express their full meaning and individuality, not just correct sentences. Reshape the supplied details into a complete, engaging first-person narrative with vivid, natural phrasing, strong flow, and the candidate's voice. Preserve every fact and the candidate's intended meaning; do not invent personal claims or generic filler. You may draw out implications already plainly present, but do not add details. Keep meaningful nuance and specific examples; do not force a checklist. Return only the polished narrative.`;
            if (!currentText.trim()) {
              return res.status(400).json({ error: 'Provide an About Me draft to polish.' });
            }

            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `Candidate field: ${primaryCategory}\nTone: ${tone}\nCurrent Draft:\n"${currentText}"\nOptional Request: ${customInstruction}`,
                    },
                  ],
                },
              ],
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.6,
              },
            });

            const polished = response.text?.trim();
            if (!polished) {
              return res.status(503).json({ error: 'The About Me assistant returned no text. Please try again.' });
            }
            return res.json({ narrative: polished, action, modelUsed: model });
          } else if (action === 'evaluate') {
            const systemPrompt = `You are the Gemini About Me Story Coach on RAMPED.
Review the narrative for optional areas that might help the candidate express more of their distinctive self. These are reflection prompts, not requirements; a strong About Me does not need to cover all five:
1. values: Core Values & Work Philosophy
2. collaboration: Collaboration & Communication Style
3. curiosity: Curiosity & Problem-Solving Mindset
4. passions: Life Beyond Work (Passions & Hobbies)
5. culture_fit: Ideal Team Culture & Environment

Only mark an area covered when the candidate's own words support it. Feedback should be warm and specific, treat uncovered areas as optional openings for more expression, and never tell the candidate to invent details.

Output strictly valid JSON with this format:
{
  "checklist": [
    { "id": "values", "covered": true|false, "feedback": "Short 1-sentence observation or suggestion" },
    { "id": "collaboration", "covered": true|false, "feedback": "..." },
    { "id": "curiosity", "covered": true|false, "feedback": "..." },
    { "id": "passions", "covered": true|false, "feedback": "..." },
    { "id": "culture_fit", "covered": true|false, "feedback": "..." }
  ],
  "overallScore": 85,
  "summaryTip": "One concise, encouraging suggestion for an optional way to add more of the candidate's own perspective."
}`;

            const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: `Narrative to evaluate:\n"${currentText}"` }] }],
              config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
                temperature: 0.3,
              },
            });

            const parsed = JSON.parse(response.text || '{}');
            return res.json({
              checklist: parsed.checklist || [],
              overallScore: parsed.overallScore || 75,
              summaryTip: parsed.summaryTip || 'Consider sharing one specific example or preference in your own words.',
              modelUsed: model,
            });
          }
        } catch (apiErr: any) {
          console.warn('Gemini About-Me helper call failed:', apiErr?.message);
          if (action === 'draft' || action === 'polish') {
            return res.status(503).json({ error: 'The About Me assistant is temporarily unavailable.' });
          }
        }
      }

      if (action === 'draft' && !`${currentText} ${customInstruction}`.trim()) {
        return res.json({
          action,
          needsInput: true,
          followUpQuestion: 'What matters most to you in how you work, connect with people, or spend your time—and is there a small example that shows it? Share it however it comes to mind; I will help you find the words.',
        });
      }
      if (action === 'draft' || action === 'polish') {
        return res.status(503).json({ error: 'The About Me assistant is temporarily unavailable.' });
      }

      // Heuristic checklist evaluation is informational only and never creates profile text.
      {
        const lower = currentText.toLowerCase();
        const evalList = checklistCriteria.map((item) => {
          let covered = false;
          if (item.id === 'values' && (lower.includes('value') || lower.includes('principle') || lower.includes('humil') || lower.includes('craft') || lower.includes('integri') || lower.includes('belie'))) {
            covered = true;
          } else if (item.id === 'collaboration' && (lower.includes('team') || lower.includes('collaborat') || lower.includes('feedback') || lower.includes('listen') || lower.includes('safet'))) {
            covered = true;
          } else if (item.id === 'curiosity' && (lower.includes('curio') || lower.includes('learn') || lower.includes('puzzle') || lower.includes('problem') || lower.includes('solv') || lower.includes('explor'))) {
            covered = true;
          } else if (item.id === 'passions' && (lower.includes('outside') || lower.includes('hike') || lower.includes('run') || lower.includes('music') || lower.includes('coffee') || lower.includes('book') || lower.includes('offline') || lower.includes('keyboard') || lower.includes('recharg'))) {
            covered = true;
          } else if (item.id === 'culture_fit' && (lower.includes('cultur') || lower.includes('environ') || lower.includes('thrive') || lower.includes('blameless') || lower.includes('autonom') || lower.includes('trust'))) {
            covered = true;
          }
          return {
            id: item.id,
            covered,
            feedback: covered
              ? `Great coverage! Addresses ${item.title.toLowerCase()} authentically.`
              : `Consider expanding on your ${item.title.toLowerCase()} to give recruiters a complete picture.`,
          };
        });

        const coveredCount = evalList.filter((x) => x.covered).length;
        return res.json({
          checklist: evalList,
          overallScore: Math.round((coveredCount / evalList.length) * 100),
          summaryTip: coveredCount === 5
            ? 'Your narrative touches on all five areas.'
            : 'Consider sharing another specific detail in your own words.',
          modelUsed: model,
          fallbackMode: true,
        });
      }
    } catch (err: any) {
      console.error('About Me helper route error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  // Fisher-Yates shuffle helper for server
  function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  app.post('/api/gemini/employer-chat', ...productionEmployerChatAccess, async (req, res) => {
    try {
      const { messages } = req.body;
      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.length > 20 ||
        messages.some(
          (message: unknown) =>
            !isRecord(message) ||
            (message.role !== 'user' && message.role !== 'model') ||
            typeof message.content !== 'string' ||
            message.content.length > 4000
        )
      ) {
        return res.status(400).json({ error: 'Provide 1 to 20 messages, each 4,000 characters or fewer.' });
      }
      if (!ai) {
        return res.status(503).json({ error: 'The employer assistant is temporarily unavailable.' });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: messages.map((message: { role: string; content: string }) => ({
          role: message.role === 'user' ? 'user' : 'model',
          parts: [{ text: message.content }],
        })),
        config: {
          systemInstruction: `You are the RAMPED assistant for approved employers. Be helpful, conversational, and creative when explaining how to use the platform or refine a candidate search. You may answer general questions about RAMPED and help employers express explicit role, degree, institution, and skill requirements clearly. Do not select, rank, invent, or describe candidates; the separate credential search returns only exact profile matches. Never imply that a candidate has a credential or skill unless it is verified in their profile. Do not invent RAMPED policies, prices, or plan entitlements; say when you cannot verify a detail. About Me narratives belong to candidates: do not write personal claims on a candidate's behalf.`,
          temperature: 0.6,
        },
      });
      if (!response.text?.trim()) {
        return res.status(503).json({ error: 'The employer assistant returned no response. Please try again.' });
      }
      return res.json({ text: response.text.trim() });
    } catch (err: any) {
      console.error('Employer assistant error:', err);
      return res.status(500).json({ error: 'The employer assistant could not complete this request.' });
    }
  });

  // Candidate selection is exact and deterministic; Gemini cannot broaden the requested criteria.
  app.post('/api/gemini/employer-search', ...productionEmployerAccess, async (req, res) => {
    try {
      const { criteria, candidates: submittedCandidates = [] } = req.body;

      if (!isRecord(criteria)) {
        return res.status(400).json({ error: 'Provide structured candidate search criteria.' });
      }
      if (!isExactCredentialCriteria(criteria)) {
        return res.status(400).json({ error: 'Search criteria contain invalid values.' });
      }
      const normalizedCriteria: ExactCredentialCriteria = criteria;
      if (
        !normalizedCriteria.roles.length &&
        !normalizedCriteria.degrees.length &&
        !normalizedCriteria.institutions.length &&
        !normalizedCriteria.skills.length &&
        !normalizedCriteria.location &&
        normalizedCriteria.minimumYearsExperience === null
      ) {
        return res.status(400).json({ error: 'Enter at least one role, credential, skill, location, or experience requirement.' });
      }

      // Filter only active, verified candidates (RAMPED 14/30 rule)
      let candidates: any[] = submittedCandidates;
      if (process.env.NODE_ENV === 'production') {
        if (!supabaseAdmin) {
          return res.status(503).json({ error: 'Marketplace storage is not configured.' });
        }
        const { data: candidateRows, error: candidateError } = await supabaseAdmin
          .from('marketplace_profiles')
          .select('user_id,profile,verification_status,is_snoozed,last_check_in_at,created_at')
          .eq('role', 'candidate')
          .eq('verification_status', 'verified')
          .eq('is_snoozed', false)
          .gte('last_check_in_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
        if (candidateError) throw candidateError;
        candidates = candidateRows || [];
      }

      const eligiblePool = candidates
        .map((record: any) => ({
          record,
          candidate: process.env.NODE_ENV === 'production'
            ? profileRecordToCandidate(record, false)
            : record,
        }))
        .filter(({ record, candidate }: any) =>
          process.env.NODE_ENV === 'production'
            ? record.verification_status === 'verified' &&
              !record.is_snoozed &&
              new Date(record.last_check_in_at).getTime() >= Date.now() - 14 * 24 * 60 * 60 * 1000
            : candidate.verificationStatus === 'verified' &&
              !candidate.isSnoozed &&
              (candidate.simulatedDaysInactive === undefined || candidate.simulatedDaysInactive < 14) &&
              candidate.lifecycleStatus !== 'archived' &&
              candidate.lifecycleStatus !== 'deleted'
        );

      const exactMatches = shuffleArray(
        eligiblePool.filter(({ candidate }: any) =>
          matchesExactCredentialCriteria(candidate, normalizedCriteria)
        )
      );
      const tier = res.locals.billingAccount?.subscription_tier;
      const matches = exactMatches.map(({ record, candidate }: any) => {
        if (process.env.NODE_ENV !== 'production') return candidate;
        const safeCandidate = profileRecordToCandidate(record, true);
        if (tier !== 'tier2') {
          safeCandidate.phone = '';
          safeCandidate.credentialDocumentUrl = '';
          safeCandidate.credentialOcrData = undefined;
        }
        return safeCandidate;
      });

      return res.json({
        matchedCandidateIds: matches.map((candidate: any) => candidate.id),
        matchedCandidates: matches,
        criteria: normalizedCriteria,
      });
    } catch (err: any) {
      console.error('Employer search route error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  // Setup Vite in development or serve static assets in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RAMPED Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
