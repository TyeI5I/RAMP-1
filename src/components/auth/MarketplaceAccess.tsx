import React, { useState } from 'react';
import { AlertCircle, Briefcase, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';
import { CandidateOnboardingModal } from '../candidate/CandidateOnboardingModal';
import { EmployerVerificationGate } from '../employer/EmployerVerificationGate';
import { supabase } from '../../lib/supabase';
import { useRamp } from '../../context/RampContext';
import { AccountDataControls } from './AccountDataControls';

export const MarketplaceAccess: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isDemoMode,
    authSession,
    authReady,
    marketplaceReady,
    hasMarketplaceProfile,
    currentRole,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    signOut,
    refreshMarketplace,
    marketplaceError,
    clearMarketplaceError,
  } = useRamp();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [role, setRole] = useState<'candidate' | 'employer'>('candidate');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidateSetupOpen, setCandidateSetupOpen] = useState(true);

  if (isDemoMode) return children;

  const page = (content: React.ReactNode) => (
    <>
      <main className="min-h-screen bg-neutral-950 px-4 py-12 text-neutral-100">
        <div className="mx-auto max-w-3xl">{content}</div>
      </main>
      {authSession && (
        <div className="fixed right-4 top-4 z-40">
          <AccountDataControls />
        </div>
      )}
    </>
  );
  const issue = error || marketplaceError;
  const errorBox = issue ? (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{issue}</span>
    </div>
  ) : null;

  if (!supabase && !authSession) {
    return page(
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="text-xl font-bold">RAMPED needs production configuration</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          Set the browser Supabase URL and anon key, and configure the server Supabase URL and service-role key.
          Demo accounts are intentionally disabled in production.
        </p>
        {errorBox}
      </section>
    );
  }

  if (!authReady || (authSession && !marketplaceReady)) {
    return page(
      <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-300">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Loading your secure RAMPED account…
      </div>
    );
  }

  if (!authSession) {
    const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      setNotice(null);
      clearMarketplaceError();
      try {
        if (mode === 'sign-up') {
          const accessResponse = await fetch('/api/marketplace/signup-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          });
          const accessPayload: unknown = await accessResponse.json();
          if (!accessResponse.ok) {
            throw new Error(
              typeof accessPayload === 'object' &&
                accessPayload !== null &&
                'error' in accessPayload &&
                typeof accessPayload.error === 'string'
                ? accessPayload.error
                : 'Private beta access could not be verified.'
            );
          }
          await signUp(email.trim(), password, role);
        } else {
          await signIn(email.trim(), password);
        }
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Unable to authenticate.');
      } finally {
        setBusy(false);
      }
    };

    return page(
      <section className="mx-auto max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-7 shadow-xl">
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">RAMPED private beta</div>
          <h1 className="mt-2 text-2xl font-bold text-white">
            {mode === 'sign-in' ? 'Sign in to RAMPED' : 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Candidate and employer accounts are separate. Employer access requires review and an active plan.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'sign-up' && (
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-neutral-300">Account type</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['candidate', 'employer'] as const).map((accountRole) => (
                  <button
                    key={accountRole}
                    type="button"
                    onClick={() => setRole(accountRole)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize ${
                      role === accountRole
                        ? 'border-emerald-500 bg-emerald-950/40 text-white'
                        : 'border-neutral-700 text-neutral-300'
                    }`}
                  >
                    {accountRole === 'candidate' ? <UserRound className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                    {accountRole}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block text-xs font-semibold text-neutral-300">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs font-semibold text-neutral-300">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white"
            />
          </label>
          {errorBox}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-neutral-950 disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-neutral-400 hover:text-white"
        >
          {mode === 'sign-in' ? 'New to RAMPED? Create an account' : 'Already registered? Sign in'}
        </button>
        {mode === 'sign-in' && (
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              setError(null);
              setNotice(null);
              void resetPassword(email)
                .then(() => setNotice('If that email is registered, a password reset link is on its way.'))
                .catch((resetError: unknown) =>
                  setError(resetError instanceof Error ? resetError.message : 'Unable to send reset email.')
                )
                .finally(() => setBusy(false));
            }}
            disabled={!email.trim() || busy}
            className="mt-3 w-full text-center text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
          >
            Forgot password?
          </button>
        )}
        {notice && <p role="status" className="mt-3 text-xs text-emerald-300">{notice}</p>}
      </section>
    );
  }

  const isPasswordRecovery =
    new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery' ||
    new URLSearchParams(window.location.search).get('type') === 'recovery';
  if (isPasswordRecovery) {
    return page(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void updatePassword(newPassword)
            .then(() => {
              setPassword('');
              setNewPassword('');
              setNotice('Your password has been updated.');
            })
            .catch((updateError: unknown) =>
              setError(updateError instanceof Error ? updateError.message : 'Unable to update password.')
            )
            .finally(() => setBusy(false));
        }}
        className="mx-auto max-w-md space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-7"
      >
        <h1 className="text-xl font-bold">Set a new password</h1>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white"
          placeholder="New password (at least 8 characters)"
        />
        {errorBox}
        {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-neutral-950 disabled:opacity-60">
          Update password
        </button>
      </form>
    );
  }

  if (!hasMarketplaceProfile && marketplaceError) {
    return page(
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="text-xl font-bold">Unable to load your RAMPED account</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Your account could not be authorized for the private beta. Check that your email is on the beta allowlist, or try again after the service is available.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              clearMarketplaceError();
              void refreshMarketplace()
                .catch((retryError: unknown) =>
                  setError(retryError instanceof Error ? retryError.message : 'Unable to load marketplace data.')
                )
                .finally(() => setBusy(false));
            }}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-neutral-950 disabled:opacity-60"
          >
            {busy ? 'Retrying…' : 'Retry'}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
          >
            Sign out
          </button>
        </div>
        <div className="mt-4">{errorBox}</div>
      </section>
    );
  }

  if (!hasMarketplaceProfile) {
    if (currentRole === 'candidate') {
      return (
        <>
          {page(
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
              <h1 className="text-xl font-bold">Finish candidate setup</h1>
              <p className="mt-2 text-sm text-neutral-300">
                Add your profile and submit credentials for manual review. Your profile will not appear in employer search until it is approved.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setCandidateSetupOpen(true)}
                  className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-neutral-950"
                >
                  Complete profile
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
                >
                  Sign out
                </button>
              </div>
              {errorBox}
            </section>
          )}
          <CandidateOnboardingModal
            isOpen={candidateSetupOpen}
            onClose={() => setCandidateSetupOpen(false)}
          />
        </>
      );
    }

    if (currentRole === 'employer') {
      return page(
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={() => void signOut()} className="text-xs text-neutral-400 hover:text-white">
              Sign out
            </button>
          </div>
          <EmployerVerificationGate />
        </>
      );
    }

    return page(
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="text-xl font-bold">Admin profile needs setup</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Confirm this account is listed in the server-only ADMIN_EMAILS setting, then sign out and back in.
        </p>
        {errorBox}
      </section>
    );
  }

  return children;
};
