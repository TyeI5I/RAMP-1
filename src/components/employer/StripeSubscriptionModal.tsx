import React, { useEffect, useState } from 'react';
import { useRamp } from '../../context/RampContext';
import {
  BillingCadence,
  JobCategory,
  JOB_CATEGORIES,
  SubscriptionTier,
} from '../../types/ramp';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AlertCircle, Check, ExternalLink, Lock, X } from 'lucide-react';

interface StripeSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTier?: SubscriptionTier;
}

function isJobCategory(value: unknown): value is JobCategory {
  return JOB_CATEGORIES.some((category) => category === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const StripeSubscriptionModal: React.FC<StripeSubscriptionModalProps> = ({
  isOpen,
  onClose,
  defaultTier,
}) => {
  const { currentEmployer, activateSubscription, deactivateSubscription } = useRamp();
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authEmail, setAuthEmail] = useState(currentEmployer?.email || '');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState(currentEmployer?.companyName || '');
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [tier, setTier] = useState<Exclude<SubscriptionTier, 'none'>>(
    defaultTier === 'tier1' ? 'tier1' : 'tier2'
  );
  const [cadence, setCadence] = useState<BillingCadence>('annual');
  const [email, setEmail] = useState(currentEmployer?.email || '');
  const [alertCategories, setAlertCategories] = useState<JobCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<'idle' | 'active' | 'cancelled'>('idle');

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setErrorMessage(error.message);
      setAuthSession(data.session);
      setIsAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      setIsAuthReady(true);
      if (session?.user.email) {
        setAuthEmail(session.user.email);
        setEmail(session.user.email);
      } else {
        setHasStripeCustomer(false);
        setBillingStatus('idle');
        deactivateSubscription();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [deactivateSubscription]);

  useEffect(() => {
    if (defaultTier === 'tier1' || defaultTier === 'tier2') setTier(defaultTier);
  }, [defaultTier]);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(currentEmployer?.email || '');
    setCompanyName(currentEmployer?.companyName || '');
    setErrorMessage(null);
    if (!new URLSearchParams(window.location.search).has('billing')) {
      setBillingStatus('idle');
    }
  }, [isOpen, currentEmployer?.id, currentEmployer?.email]);

  useEffect(() => {
    if (!isOpen || !isAuthReady || !authSession) return;
    let cancelled = false;
    const loadBillingAccount = async () => {
      try {
        const response = await fetch('/api/billing/account', {
          headers: { Authorization: `Bearer ${authSession.access_token}` },
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === 'string'
              ? payload.error
              : 'Unable to load billing details.'
          );
        }
        if (!isRecord(payload) || !isRecord(payload.account)) {
          setHasStripeCustomer(false);
          setBillingStatus('idle');
          deactivateSubscription();
          return;
        }
        const account = payload.account;
        setHasStripeCustomer(typeof account.stripe_customer_id === 'string');
        if (
          account.subscription_status !== 'active' &&
          account.subscription_status !== 'trialing'
        ) {
          deactivateSubscription();
          return;
        }
        if (
          (account.subscription_tier !== 'tier1' && account.subscription_tier !== 'tier2') ||
          (account.subscription_cadence !== 'monthly' &&
            account.subscription_cadence !== 'annual') ||
          typeof account.current_period_end !== 'string' ||
          typeof account.stripe_customer_id !== 'string' ||
          typeof account.stripe_subscription_id !== 'string'
        ) {
          deactivateSubscription();
          return;
        }
        const categories = Array.isArray(account.alert_categories)
          ? account.alert_categories.filter(isJobCategory)
          : [];
        if (!cancelled) {
          setTier(account.subscription_tier);
          setCadence(account.subscription_cadence);
          activateSubscription(
            account.subscription_tier,
            account.subscription_cadence,
            account.current_period_end,
            account.stripe_customer_id,
            account.stripe_subscription_id,
            categories
          );
          setBillingStatus('active');
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load billing details.');
        }
      }
    };
    void loadBillingAccount();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, authSession?.access_token, currentEmployer?.id, deactivateSubscription]);

  useEffect(() => {
    if (!isOpen || !isAuthReady) return;

    const url = new URL(window.location.href);
    const result = url.searchParams.get('billing');
    const sessionId = url.searchParams.get('session_id');
    if (result === 'cancelled') {
      setBillingStatus('cancelled');
      url.searchParams.delete('billing');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    if (result === 'manage') {
      url.searchParams.delete('billing');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    if (result !== 'success' || !sessionId) return;
    if (!authSession) {
      setErrorMessage('Sign in to the employer account that started checkout to verify payment.');
      return;
    }

    url.searchParams.delete('billing');
    url.searchParams.delete('session_id');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    let cancelled = false;
    const verifyCheckout = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch(
          `/api/billing/verify-session?session_id=${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${authSession.access_token}` } }
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === 'string'
              ? payload.error
              : 'Unable to verify your checkout.'
          );
        }
        if (
          !isRecord(payload) ||
          payload.userId !== authSession.user.id ||
          (payload.tier !== 'tier1' && payload.tier !== 'tier2') ||
          (payload.cadence !== 'monthly' && payload.cadence !== 'annual') ||
          typeof payload.subscriptionActiveUntil !== 'string' ||
          typeof payload.stripeCustomerId !== 'string' ||
          typeof payload.stripeSubscriptionId !== 'string'
        ) {
          throw new Error('Checkout could not be matched to the current employer.');
        }

        const categories = Array.isArray(payload.alertCategories)
          ? payload.alertCategories.filter(isJobCategory)
          : [];
        if (!cancelled) {
          setTier(payload.tier);
          setCadence(payload.cadence);
          activateSubscription(
            payload.tier,
            payload.cadence,
            payload.subscriptionActiveUntil,
            payload.stripeCustomerId,
            payload.stripeSubscriptionId,
            categories
          );
          setBillingStatus('active');
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to verify your checkout.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void verifyCheckout();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, authSession?.access_token, currentEmployer?.id]);

  if (!isOpen) return null;

  const prices: Record<Exclude<SubscriptionTier, 'none'>, Record<BillingCadence, number>> = {
    tier1: { monthly: 299, annual: 2990 },
    tier2: { monthly: 599, annual: 5990 },
  };
  const price = prices[tier][cadence];

  const startCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authSession) {
      setErrorMessage('Sign in to your employer account before starting checkout.');
      return;
    }
    if (!companyName.trim()) {
      setErrorMessage('Enter your company name before starting checkout.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          companyName,
          tier,
          cadence,
          alertCategories: tier === 'tier2' ? alertCategories : [],
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'Unable to start checkout.'
        );
      }
      if (!isRecord(payload) || typeof payload.url !== 'string') {
        throw new Error('Stripe did not return a checkout URL.');
      }
      window.location.assign(payload.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to start checkout.');
      setIsLoading(false);
    }
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage('Supabase authentication is not configured.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result =
        authMode === 'sign-up'
          ? await supabase.auth.signUp({
              email: authEmail,
              password,
              options: { data: { company_name: companyName.trim() } },
            })
          : await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setErrorMessage('Check your email to confirm your account, then sign in.');
      } else {
        setAuthSession(result.data.session);
        setEmail(result.data.session.user.email || authEmail);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to authenticate.');
    } finally {
      setIsLoading(false);
    }
  };

  const openBillingPortal = async () => {
    if (!authSession) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/billing/portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'Unable to open billing management.'
        );
      }
      if (!isRecord(payload) || typeof payload.url !== 'string') {
        throw new Error('Stripe did not return a billing portal URL.');
      }
      window.location.assign(payload.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to open billing management.');
      setIsLoading(false);
    }
  };

  const toggleAlertCategory = (category: JobCategory) => {
    setAlertCategories((selected) =>
      selected.includes(category)
        ? selected.filter((item) => item !== category)
        : [...selected, category]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/85 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-title"
        className="my-6 w-full max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Lock className="h-4 w-4 text-emerald-400" />
            Secure subscription checkout
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close subscription checkout"
            className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {!isAuthReady && (
          <p role="status" className="p-6 text-sm text-neutral-300">
            Checking employer sign-in…
          </p>
        )}

        {isAuthReady && !authSession && (
          <form onSubmit={submitAuth} className="space-y-4 p-6">
            <div>
              <h2 id="subscription-title" className="text-xl font-bold text-white">
                Sign in to manage employer billing
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Billing subscriptions are linked to your authenticated Supabase account.
              </p>
            </div>
            {!supabase && (
              <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300">
                Add the Supabase browser URL and anon key to enable employer authentication.
              </p>
            )}
            {authMode === 'sign-up' && (
              <div>
                <label htmlFor="signup-company" className="mb-1.5 block text-xs font-semibold text-neutral-300">
                  Company name
                </label>
                <input
                  id="signup-company"
                  required
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white"
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold text-neutral-300">
                Work email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-semibold text-neutral-300">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white"
              />
            </div>
            {errorMessage && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMessage}
              </p>
            )}
            <div className="flex flex-col-reverse justify-between gap-3 border-t border-neutral-800 pt-4 sm:flex-row">
              <button
                type="button"
                disabled={isLoading || !supabase}
                onClick={() => setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in')}
                className="text-xs text-neutral-400 hover:text-white disabled:opacity-50"
              >
                {authMode === 'sign-in' ? 'Create employer account' : 'Already registered? Sign in'}
              </button>
              <button
                type="submit"
                disabled={isLoading || !supabase}
                className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isLoading ? 'Please wait…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            </div>
          </form>
        )}

        {authSession && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-3 text-xs">
            <span className="text-neutral-300">
              Signed in as <strong className="text-white">{authSession.user.email}</strong>
            </span>
            <div className="flex gap-3">
              {hasStripeCustomer && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void openBillingPortal()}
                  className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                >
                  Manage Billing
                </button>
              )}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void supabase?.auth.signOut()}
                className="text-neutral-400 hover:text-white disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {authSession && <form onSubmit={startCheckout} className="space-y-6 p-6">
          <div>
            <h2 id="subscription-title" className="text-xl font-bold text-white">
              Choose an employer plan
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              Payment details are collected by Stripe Checkout, not by RAMPED.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(['tier1', 'tier2'] as const).map((plan) => (
              <button
                type="button"
                key={plan}
                onClick={() => setTier(plan)}
                aria-pressed={tier === plan}
                className={`rounded-xl border p-5 text-left transition-colors ${
                  tier === plan
                    ? 'border-emerald-500 bg-emerald-950/20'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  {plan === 'tier1' ? 'Tier 1 · Standard' : 'Tier 2 · Enterprise'}
                </span>
                <span className="mt-3 block text-2xl font-extrabold text-white">
                  ${prices[plan][cadence].toLocaleString()}
                  <span className="ml-1 text-xs font-normal text-neutral-400">
                    / {cadence === 'monthly' ? 'month' : 'year'}
                  </span>
                </span>
                <span className="mt-3 flex items-start gap-2 text-xs text-neutral-300">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                  {plan === 'tier1'
                    ? 'Verified search, basic filters, and 25 monthly invites.'
                    : 'Unlimited invites, natural-language search, and instant alerts.'}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            {(['monthly', 'annual'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={cadence === option}
                onClick={() => setCadence(option)}
                className={`flex-1 rounded-md py-2 text-xs font-semibold capitalize ${
                  cadence === option
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {option} billing
              </button>
            ))}
          </div>

          {tier === 'tier2' && (
            <fieldset className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <legend className="px-1 text-xs font-semibold text-white">
                Instant alert categories
              </legend>
              <div className="flex flex-wrap gap-2">
                {JOB_CATEGORIES.map((category) => (
                  <button
                    type="button"
                    key={category}
                    aria-pressed={alertCategories.includes(category)}
                    onClick={() => toggleAlertCategory(category)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                      alertCategories.includes(category)
                        ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
                        : 'border-neutral-800 text-neutral-400'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <label htmlFor="billing-company" className="mb-1.5 block text-xs font-semibold text-neutral-300">
              Company name
            </label>
            <input
              id="billing-company"
              required
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="billing-email" className="mb-1.5 block text-xs font-semibold text-neutral-300">
              Account billing email
            </label>
            <input
              id="billing-email"
              type="email"
              autoComplete="email"
              readOnly
              value={authSession.user.email || email}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Stripe will collect your payment and billing address securely.
            </p>
          </div>

          {billingStatus === 'cancelled' && (
            <p className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs text-neutral-300">
              Checkout was cancelled. No subscription was activated.
            </p>
          )}
          {billingStatus === 'active' && (
            <p role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              Stripe confirmed your subscription. The selected plan is now active.
            </p>
          )}
          {isLoading && (
            <p role="status" className="text-xs text-blue-300">
              {billingStatus === 'idle' ? 'Connecting to Stripe Checkout…' : 'Verifying your Stripe subscription…'}
            </p>
          )}
          {errorMessage && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMessage}
            </p>
          )}

          <footer className="flex flex-col-reverse items-center justify-between gap-3 border-t border-neutral-800 pt-4 sm:flex-row">
            <p className="text-[11px] text-neutral-500">
              Available payment methods and any configured taxes are shown in Stripe before you confirm.
            </p>
            <button
              type="submit"
              disabled={isLoading || billingStatus === 'active'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Lock className="h-3.5 w-3.5" />
              Continue to Stripe · ${price.toLocaleString()} / {cadence === 'monthly' ? 'month' : 'year'}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </footer>
        </form>}
      </section>
    </div>
  );
};
