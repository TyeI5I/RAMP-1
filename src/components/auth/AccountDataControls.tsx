import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Trash2, X } from 'lucide-react';
import { useRamp } from '../../context/RampContext';
import { supabase } from '../../lib/supabase';

export const AccountDataControls: React.FC = () => {
  const { authSession } = useRamp();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authSession) return null;

  const exportAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/export', {
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const message =
          typeof payload === 'object' && payload !== null && 'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : 'Unable to export account data.';
        throw new Error(message);
      }
      const downloadUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `ramped-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export account data.');
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (confirmation !== 'DELETE') return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmation }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload !== null && 'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : 'Unable to delete your account.';
        throw new Error(message);
      }
      const emailConfirmation =
        typeof payload === 'object' && payload !== null && 'emailConfirmation' in payload
          ? payload.emailConfirmation
          : 'not_available';
      if (supabase) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) console.error('Unable to clear the deleted account session:', signOutError);
      }
      window.alert(
        emailConfirmation === 'sent'
          ? 'Your account has been deleted.'
          : 'Your account has been deleted, but the confirmation email could not be sent.'
      );
      window.location.replace('/');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setError(null);
        }}
        className="rounded-md border border-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-900"
      >
        Account data
      </button>
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-data-title"
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="account-data-title" className="text-lg font-bold text-white">
                  Your account data
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Export a copy of your RAMPED data or permanently delete your account.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close account data"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void exportAccount()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download account export (JSON)
            </button>

            <div className="mt-6 border-t border-neutral-800 pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-300">
                <Trash2 className="h-4 w-4" />
                Permanently delete account
              </h3>
              <p className="mt-2 text-xs leading-5 text-neutral-400">
                This removes your RAMPED profile, invites, notifications, and stored account data.
                Any active Stripe subscription will be canceled first. Stripe may retain its own
                financial records. This action cannot be undone; download your export before continuing.
              </p>
              <label className="mt-4 block text-xs font-medium text-neutral-300">
                Type DELETE to confirm
                <input
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                disabled={busy || confirmation !== 'DELETE'}
                onClick={() => void deleteAccount()}
                className="mt-3 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Please wait…' : 'Delete my account'}
              </button>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          </section>
        </div>,
        document.body
      )}
    </>
  );
};
