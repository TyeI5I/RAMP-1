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
      ? [requireUser, requireTier2Employer]
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
  });
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
      if (own.role === 'candidate') {
        if (own.profile && Object.keys(own.profile).length) {
          candidates.push(profileRecordToCandidate(own, true));
        }
      } else if (own.role === 'employer') {
        const { data: billing, error: billingError } = await supabaseAdmin
          .from('billing_accounts')
          .select('stripe_customer_id,stripe_subscription_id,subscription_status,subscription_tier,subscription_cadence,current_period_end,alert_categories')
          .eq('user_id', user.id)
          .maybeSingle();
        if (billingError) throw billingError;
        employers.push(profileRecordToEmployer(own, billing));

        if (
          own.verification_status === 'approved' &&
          billing &&
          ['active', 'trialing'].includes(String(billing.subscription_status)) &&
          new Date(String(billing.current_period_end || 0)).getTime() > Date.now()
        ) {
          const { data: candidateRows, error: candidateError } = await supabaseAdmin
            .from('marketplace_profiles')
            .select('user_id,profile,verification_status,is_snoozed,last_check_in_at,created_at')
            .eq('role', 'candidate')
            .eq('verification_status', 'verified')
            .eq('is_snoozed', false)
            .gte('last_check_in_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
          if (candidateError) throw candidateError;
          candidates.push(...(candidateRows || []).map((record) => profileRecordToCandidate(record, false)));
        }
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

      const inviteQuery = own.role === 'candidate'
        ? supabaseAdmin.from('job_invites').select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at').eq('candidate_user_id', user.id)
        : supabaseAdmin.from('job_invites').select('id,profile,status,candidate_contacted_externally,candidate_archived,viewed_by_candidate,created_at').eq('employer_user_id', user.id);
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
      const { data: billing, error: billingError } = await supabaseAdmin
        .from('billing_accounts')
        .select('subscription_status,subscription_tier,current_period_end')
        .eq('user_id', user.id)
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
      const { count, error: quotaError } = await supabaseAdmin
        .from('job_invites')
        .select('id', { count: 'exact', head: true })
        .eq('employer_user_id', user.id)
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
      const employerProfile = employer.profile || {};
      const persistedInvite = {
        ...invite,
        id: undefined,
        employerId: user.id,
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
          employer_user_id: user.id,
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
        .select('user_id,role,profile')
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
Your mission is to empower passive talent who hold verified academic credentials.
You MUST recognize which document format the candidate is asking for and strictly enforce these format definitions. Never mix up or blend their formats!

CRITICAL FORMAT SPECIFICATIONS & RULES:

1. AUTHENTIC "ABOUT ME" SECTIONS (Personal Narrative):
   - FORMAT: 2 to 3 fluid, paragraph-based first-person prose blocks (around 150-250 words total). Written from the heart ("I am...", "Beyond technical systems...").
   - CONTENT: Core personal values, collaboration philosophy, curiosity, passions/hobbies outside of work, and ideal team culture.
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
   - FORMAT: High-impact technical experience bullet points or a single 2-sentence executive summary.
   - MUSTS:
     * MUST use the Google XYZ formula ("Accomplished [X], as measured by [Y], by doing [Z]") to quantify accomplishments with clear metric numbers.
     * MUST be structured, performance-focused, and technically concise.
     * MUST NOT contain conversational stories about hobbies or ideal cultures.

Candidate Context:
- Name: ${candidateContext?.name || 'Candidate'}
- Target Job Categories: ${candidateContext?.targetCategories?.join(', ') || 'Software Engineer'}
- Verified Degree: ${candidateContext?.degreeTitle || 'Bachelor of Science'} from ${candidateContext?.institution || 'University'} (Class of ${candidateContext?.graduationYear || '2024'})
- Years of Experience: ${candidateContext?.yearsOfExperience || 3} years
- Current Resume Summary: ${candidateContext?.resumeSummary || 'Not provided'}
- Current 'About Me' text: ${candidateContext?.aboutMe || 'Not provided yet'}
- Current Cover Letter: ${candidateContext?.coverLetterText || 'Not provided yet'}

Always provide structured, clear, and actionable feedback. When drafting or editing text, provide a clean, ready-to-copy code block or highlighted draft so the candidate can apply it directly to their RAMPED profile with 1 click.`;

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
          return res.json({ text: replyText, modelUsed: usedModel });
        } catch (apiError: any) {
          console.error('Career Studio: all Gemini models failed:', apiError?.message);
          return res.status(503).json({
            error: 'AI service temporarily unavailable. Please try again.',
            detail: apiError?.message || 'All Gemini models failed',
          });
        }
      }

      // Fallback ONLY when no Gemini API key is configured at all
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let fallbackText = '';

      if (lastMessage.includes('about me') || taskMode === 'about_me') {
        fallbackText = `Here is a compelling, human-centered **"About Me"** draft tailored to your background as a verified **${candidateContext?.degreeTitle || 'Engineer'}** from **${candidateContext?.institution || 'your university'}**:

### Suggested "About Me" Draft:
> "Beyond engineering systems and technical milestones, I'm someone who thrives at the intersection of curiosity, craft, and collaboration. I believe the best technical work happens when teams foster psychological safety, celebrate intellectual humility, and treat documentation as an act of kindness.
>
> When I step away from the keyboard, you'll usually find me exploring local hiking trails, experimenting with artisanal coffee brewing, and volunteering at community tech workshops.
> 
> What I value most in a team is transparent feedback, blameless problem-solving, and building software that respects both user privacy and accessibility."

💡 *Tip: Click the **"Apply to My Profile"** button below to save this directly to your RAMPED "About Me" section!*`;
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
      } else if (lastMessage.includes('resume') || taskMode === 'resume') {
        fallbackText = `### Resume Bullet Point Optimization (Google XYZ Formula)

Here is how you can level up your resume experience bullet points for maximum recruiter impact:

1. **Before:** "Worked on backend services and database optimizations."  
   **After (XYZ Formula):** *"Architected and deployed 4 distributed microservices handling 45k req/sec, reducing p99 latency by 38% through Redis caching and query indexing."*

2. **Before:** "Helped team improve CI/CD build speeds."  
   **After (XYZ Formula):** *"Redesigned continuous integration pipelines in Docker and GitHub Actions, cutting staging deployment cycle times from 24 mins to 6 mins."*

3. **Suggested Profile Summary:**  
   *"Impact-driven ${candidateContext?.targetCategories?.[0] || 'Software Engineer'} with verified academic credentials from ${candidateContext?.institution || 'University'}. Track record of scaling distributed architectures, optimizing database throughput, and fostering collaborative engineering practices."*

Would you like me to tailor these points further for a specific job title or company?`;
      } else {
        fallbackText = `Hello ${candidateContext?.name || 'there'}! I am **Gemini Career Studio** on RAMPED.

I can assist you with:
- 📝 **Tweaking your resume:** Rewriting bullets to highlight quantified impact and technical depth.
- ✉️ **Crafting personalized cover letters:** Direct, compelling letters tailored to your target job categories.
- 💡 **Writing your 'About Me' section:** Sharing your human values, working style, and passions beyond pure technical credentials.
- 🎯 **Evaluating direct recruiter invites:** Analyzing compensation ranges and formulating replies.

What would you like to work on first?`;
      }

      return res.json({
        text: fallbackText,
        modelUsed: model,
        fallbackMode: true,
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

      const candName = candidateContext.name || 'Candidate';
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
            const systemPrompt = `You are the Gemini Personal Narrative Writer on RAMPED (Recruiter & Applicant Matching Platform for Employment and Discovery).
Your goal is to write a warm, genuine, human 'About Me' narrative for a candidate that showcases who they are beyond their resume trophies.
The narrative must naturally touch upon the 5 essential checklist pillars:
1. Core values and work philosophy (e.g. intellectual humility, craft integrity).
2. Collaboration and communication style (e.g. team feedback, psychological safety).
3. Curiosity and problem-solving mindset (what kinds of challenges ignite them).
4. Life beyond work: authentic hobbies, passions, or creative outlets.
5. Ideal team culture where they thrive.

Guidelines:
- Tone: ${tone} (Warm, confident, authentic, zero corporate robotic cliches like 'synergy' or 'rockstar').
- Length: 2 to 3 engaging paragraphs (around 150-250 words).
- Return ONLY the clean narrative text without markdown headers, titles, or quotes.`;

            const userPrompt = `Candidate profile context:
- Name: ${candName}
- Primary Field: ${primaryCategory}
- Verified Academic Background: ${candMajor} from ${candSchool}
- Additional Guidance / Notes: ${customInstruction || 'Write an authentic, human story that balances technical curiosity with warm team collaboration and personal hobbies.'}`;

            const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.75,
              },
            });

            const narrative = response.text?.trim() || '';
            return res.json({ narrative, action, modelUsed: model });
          } else if (action === 'polish') {
            const systemPrompt = `You are the Gemini Personal Narrative Editor on RAMPED.
Take the candidate's existing 'About Me' draft and polish it:
- Elevate flow, rhythm, and storytelling.
- Retain their authentic human voice and personal details (do not erase their specific hobbies or personality).
- Remove hollow corporate buzzwords and robotic phrasing.
- Ensure it touches upon core values, collaboration style, and passions outside work.
- Return ONLY the polished narrative text without surrounding quotes or conversational remarks.`;

            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `Candidate: ${candName} (${primaryCategory})\nTone: ${tone}\nCurrent Draft:\n"${currentText}"\nOptional Request: ${customInstruction}`,
                    },
                  ],
                },
              ],
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.6,
              },
            });

            const polished = response.text?.trim() || currentText;
            return res.json({ narrative: polished, action, modelUsed: model });
          } else if (action === 'evaluate') {
            const systemPrompt = `You are the Gemini Career Evaluation Engine on RAMPED.
Analyze the provided 'About Me' personal narrative against these 5 checklist pillars:
1. values: Core Values & Work Philosophy
2. collaboration: Collaboration & Communication Style
3. curiosity: Curiosity & Problem-Solving Mindset
4. passions: Life Beyond Work (Passions & Hobbies)
5. culture_fit: Ideal Team Culture & Environment

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
  "summaryTip": "One concise tip to make the narrative even stronger."
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
              summaryTip: parsed.summaryTip || 'Strong start! Consider adding an outdoor hobby or creative outlet to round out the personal side.',
              modelUsed: model,
            });
          }
        } catch (apiErr: any) {
          console.warn('Gemini About-Me helper call failed, using intelligent fallback:', apiErr?.message);
        }
      }

      // Contextual High-Fidelity Fallback Logic
      if (action === 'draft') {
        let draftText = '';
        if (tone === 'collaborative') {
          draftText = `Beyond engineering architecture and code commits, I believe great software is fundamentally a team sport. Having studied ${candMajor} at ${candSchool}, I learned early on that the best technical breakthroughs emerge when teams foster psychological safety, active listening, and open intellectual debate.

In my day-to-day work, I prioritize blameless incident retrospectives, clear asynchronous documentation, and mentorship. I love partnering closely with product managers and designers to understand the "why" behind every feature before writing a single line of implementation.

When I step away from the keyboard, you'll usually find me experimenting with pour-over coffee recipes, playing board games with friends, and hiking local state trails. I do my best work with teams that value high empathy, continuous learning, and building software that genuinely respects user privacy.`;
        } else if (tone === 'curious') {
          draftText = `I'm an engineer driven by relentless curiosity and a passion for deep systems craft. Whether scaling high-throughput pipelines or optimizing distributed query performance, what excites me most is dissecting complex, ambiguous technical puzzles down to first principles.

My academic grounding in ${candMajor} from ${candSchool} instilled a lifelong habit of continuous learning. When faced with an unfamiliar toolchain or architectural paradigm, I dive in hands-on by building experimental prototypes and stress-testing edge cases.

Outside of technical work, I recharge by restoring analog synthesizers, exploring astronomy, and trail running. I thrive in engineering cultures that celebrate intellectual humility, autonomous ownership, and thoughtful code craft without unnecessary bureaucracy.`;
        } else {
          draftText = `Beyond my technical experience and verified credentials in ${candMajor} from ${candSchool}, I am someone who values craft integrity, empathy, and sustainable engineering velocity. I believe durable software is built when teams take pride in maintainability and treat thorough documentation as an act of kindness to future teammates.

I approach collaboration with an open mind, welcoming constructive critique and cross-functional debate. To me, being a great teammate means celebrating mutual wins, jumping in to debug outages without pointing fingers, and staying humble in the face of complex problems.

When offline, I enjoy trail running, exploring indie bookstores, and volunteering at community STEM hackathons. I am looking for a team culture grounded in transparent communication, high trust, and building products with lasting social utility.`;
        }

        return res.json({
          narrative: draftText,
          action,
          modelUsed: model,
          fallbackMode: true,
        });
      } else if (action === 'polish') {
        const text = currentText.trim();
        const polished = text.length > 20
          ? `${text}\n\nWhat matters most to me is being part of a team with high psychological safety, intellectual humility, and a shared pride in craft.`
          : `Beyond my technical degree in ${candMajor} from ${candSchool}, I am dedicated to building sustainable, user-respecting software with teams that champion empathy, open communication, and blameless retrospectives. When offline, I enjoy hiking, reading, and exploring local coffee shops.`;

        return res.json({
          narrative: polished,
          action,
          modelUsed: model,
          fallbackMode: true,
        });
      } else {
        // Heuristic evaluate checklist
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
            ? 'Outstanding narrative! All 5 personal pillars are covered with warmth and balance.'
            : 'Looking good! Add a sentence covering the remaining checklist items for maximum recruiter resonance.',
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

  // Gemini Employer Natural Language Search API Endpoint
  app.post('/api/gemini/employer-search', ...productionEmployerAccess, async (req, res) => {
    try {
      const { prompt, candidates: submittedCandidates = [] } = req.body;
      const model = 'gemini-3.8-flash';

      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) {
        return res.status(400).json({ error: 'A search prompt of 2,000 characters or fewer is required.' });
      }

      // Filter only active, verified candidates (RAMPED 14/30 rule)
      let candidates = submittedCandidates;
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
        candidates = (candidateRows || []).map((record) => profileRecordToCandidate(record, false));
      }

      const eligiblePool = candidates.filter(
        (c: any) =>
          c.verificationStatus === 'verified' &&
          (c.simulatedDaysInactive === undefined || c.simulatedDaysInactive < 14) &&
          c.lifecycleStatus !== 'archived' &&
          c.lifecycleStatus !== 'deleted'
      );

      const promptLower = prompt.toLowerCase();

      // If Gemini API is available, ask Gemini to parse and evaluate
      if (ai) {
        try {
          const candidateBriefs = eligiblePool.map((c: any) => ({
            id: c.id,
            name: c.name,
            categories: c.targetCategories,
            degree: `${c.degreeTitle} from ${c.institution}`,
            degreeType: c.degreeType,
            remote: c.remotePreference,
            location: c.location,
            skills: c.skills,
            aboutMe: c.aboutMe,
            bio: c.bio,
          }));

          const systemPrompt = `You are the Talent Matchmaker on RAMPED.
An employer is searching for candidates in plain natural language.
Your job:
1. Understand the employer's request: roles, degree levels, skills, remote preference, and personality/values reflected in their 'About Me'.
2. Select candidate IDs matching their criteria.
3. Bring up a list of ten candidates if there are ten available in the pool (select the closest matching candidates first, filling up to 10 with relevant active candidates from the pool).
4. Output strictly valid JSON with this schema:
{
  "matchedIds": ["cand-001", "cand-002", ...],
  "extractedCriteria": {
    "role": "e.g. Distributed Systems Engineer",
    "degree": "e.g. Bachelor's or Master's",
    "remote": "e.g. Remote Only",
    "skills": ["Rust", "TypeScript"]
  }
}`;

          // Try gemini-3.8-flash or fallback model
          let responseText = '';
          const candidateModels = [model, 'gemini-3.1-flash-lite', 'gemini-flash-latest'].filter(Boolean);
          for (const m of candidateModels) {
            try {
              const response = await ai.models.generateContent({
                model: m,
                contents: `Employer Search Prompt: "${prompt}"\n\nCandidate Pool:\n${JSON.stringify(
                  candidateBriefs
                )}`,
                config: {
                  systemInstruction: systemPrompt,
                  responseMimeType: 'application/json',
                  temperature: 0.3,
                },
              });
              responseText = response.text || '';
              if (responseText) break;
            } catch (err: any) {
              console.warn(`Model ${m} failed, trying next:`, err?.message);
            }
          }

          if (responseText) {
            const parsed = JSON.parse(responseText);
            let matchedIds = parsed.matchedIds || [];

            // Ensure only existing IDs
            const validMatchedIds = matchedIds.filter((id: string) =>
              eligiblePool.some((c: any) => c.id === id)
            );

            // If fewer than 10 matched but pool has more, fill with remaining pool candidates
            const remainingPool = eligiblePool
              .filter((c: any) => !validMatchedIds.includes(c.id))
              .map((c: any) => c.id);

            let finalIds = [...validMatchedIds];
            if (finalIds.length < 10 && remainingPool.length > 0) {
              const needed = Math.min(10 - finalIds.length, remainingPool.length);
              finalIds.push(...shuffleArray(remainingPool).slice(0, needed));
            }

            // RAMPED MANDATE: Randomize the matched list using Fisher-Yates pure shuffle for fairness
            const randomizedIds = shuffleArray(finalIds);

            return res.json({
              matchedCandidateIds: randomizedIds,
              extractedCriteria: parsed.extractedCriteria || {},
              modelUsed: model,
            });
          }
        } catch (apiErr: any) {
          console.warn('Gemini employer search API failed, falling back to heuristic matcher:', apiErr?.message);
        }
      }

      // Contextual Heuristic Matcher Fallback: Bring up a list of ten if there is ten
      const scoredCandidates = eligiblePool.map((c: any) => {
        const fullText = `${c.name} ${c.targetCategories?.join(' ')} ${c.degreeTitle} ${
          c.institution
        } ${c.skills?.join(' ')} ${c.aboutMe || ''} ${c.bio || ''} ${c.location} ${c.remotePreference}`.toLowerCase();

        const keywords = promptLower.split(/\s+/).filter((w) => w.length > 2);
        let score = 0;
        for (const kw of keywords) {
          if (fullText.includes(kw)) score += 1;
        }
        return { id: c.id, score };
      });

      scoredCandidates.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const topMatches = scoredCandidates.filter((item: { score: number }) => item.score > 0).map((item: { id: string }) => item.id);

      // Target list of ten: if there are ten or more in the pool, make sure we return 10
      let poolOfTen = [...topMatches];
      if (poolOfTen.length < 10) {
        const remaining = eligiblePool
          .filter((c: any) => !poolOfTen.includes(c.id))
          .map((c: any) => c.id);
        const needed = Math.min(10 - poolOfTen.length, remaining.length);
        poolOfTen.push(...shuffleArray(remaining).slice(0, needed));
      }

      const randomizedIds = shuffleArray(poolOfTen.slice(0, 10));

      return res.json({
        matchedCandidateIds: randomizedIds,
        extractedCriteria: {
          query: prompt,
        },
        modelUsed: model,
        fallbackMode: true,
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
