import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import { ShieldAlert, Building2, Clock } from 'lucide-react';

export const EmployerVerificationGate: React.FC = () => {
  const {
    currentEmployer,
    registerEmployer,
    updateEmployerProfile,
    isDemoMode,
    authSession,
    refreshMarketplace,
    startPersonaVerification,
  } = useRamp();

  const [companyName, setCompanyName] = useState(currentEmployer?.companyName || '');
  const [corporateDomain, setCorporateDomain] = useState(currentEmployer?.corporateDomain || '');
  const [websiteUrl, setWebsiteUrl] = useState(currentEmployer?.websiteUrl || '');
  const [recruiterName, setRecruiterName] = useState(currentEmployer?.recruiterName || '');
  const [recruiterTitle, setRecruiterTitle] = useState(currentEmployer?.recruiterTitle || '');
  const [email, setEmail] = useState(currentEmployer?.email || authSession?.user.email || '');
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [hasBusinessConsent, setHasBusinessConsent] = useState(false);
  const isManualReview = currentEmployer?.businessVerificationStatus === 'needs_review';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentEmployer) {
      updateEmployerProfile({
        companyName,
        corporateDomain,
        websiteUrl,
        recruiterName,
        recruiterTitle,
        email,
        verificationStatus: 'pending',
      });
    } else {
      registerEmployer({
        companyName,
        corporateDomain,
        websiteUrl,
        recruiterName,
        recruiterTitle,
        email,
        verificationStatus: 'pending',
      });
    }
  };

  const handleStartVerification = async () => {
    setIsStartingVerification(true);
    setVerificationError(null);
    try {
      const verificationUrl = await startPersonaVerification('employer');
      window.location.assign(verificationUrl);
    } catch (error) {
      setVerificationError(
        error instanceof Error ? error.message : 'Unable to start business verification.'
      );
      setIsStartingVerification(false);
    }
  };

  const isPending = currentEmployer?.verificationStatus === 'pending';
  const isRejected = currentEmployer?.verificationStatus === 'rejected';

  return (
    <div className="max-w-2xl mx-auto my-8 p-8 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Employer Verification Gate</h2>
          <p className="text-xs text-neutral-400">
            RAMPED protects passive candidates. All hiring entities must pass corporate business verification before accessing candidate search.
          </p>
        </div>
      </div>

      {(isPending || isRejected) && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-400">
            <Clock className="w-4 h-4" />
            {isManualReview ? 'Manual Review In Progress' : isRejected ? 'Verification Needs Attention' : 'Verification Required'}
          </div>
          <p className="text-xs text-neutral-300">
            {isManualReview
              ? 'Persona could not make an automatic decision. Your application remains in the admin review queue; do not submit another inquiry.'
              : <>Complete Persona's secure business verification for <strong>{currentEmployer?.companyName}</strong>. Your business tax ID is collected in Persona's flow, not stored by RAMPED.</>}
          </p>
          {!isManualReview && (
            <label className="flex items-start gap-2 text-[11px] text-neutral-400 max-w-xl">
              <input
                type="checkbox"
                checked={hasBusinessConsent}
                onChange={(event) => setHasBusinessConsent(event.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                I consent to sharing the business and representative information requested in Persona's flow for employer verification. RAMPED stores the result and inquiry reference, not the EIN.
              </span>
            </label>
          )}
          {isManualReview ? (
            <button
              type="button"
              onClick={() => void refreshMarketplace().catch((error: unknown) =>
                setVerificationError(error instanceof Error ? error.message : 'Unable to refresh status.')
              )}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-bold text-xs"
            >
              Refresh review status
            </button>
          ) : !isDemoMode ? (
            <button
              type="button"
              onClick={() => void handleStartVerification()}
              disabled={isStartingVerification || !currentEmployer || !hasBusinessConsent}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold text-xs"
            >
              {isStartingVerification ? 'Opening secure verification...' : 'Start secure business verification'}
            </button>
          ) : (
            <p className="text-[11px] text-neutral-400">Live Persona verification is available in production only.</p>
          )}
          {!isDemoMode && !isManualReview && (
            <button
              type="button"
              onClick={() => void refreshMarketplace().catch((error: unknown) =>
                setVerificationError(error instanceof Error ? error.message : 'Unable to refresh status.')
              )}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-bold text-xs"
            >
              Refresh status
            </button>
          )}
          {verificationError && <p role="alert" className="text-xs text-red-300">{verificationError}</p>}
        </div>
      )}

      {isRejected && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-red-400">
            <ShieldAlert className="w-4 h-4" />
            Business Verification Rejected
          </div>
          <p className="text-xs text-neutral-300">
            {currentEmployer?.rejectionReason || 'Persona could not verify the business details. Review them and try again, or contact support.'}
          </p>
          <p className="text-[11px] text-neutral-400">Please review the details below and restart verification, or contact support if you believe this is incorrect.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
            Legal Business Name *
          </label>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Linear Dynamics Corp"
            className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Corporate Domain Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@apexinnovations.tech"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Official Website URL *
            </label>
            <input
              type="url"
              required
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://apexinnovations.tech"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Primary Recruiter / Hiring Lead *
            </label>
            <input
              type="text"
              required
              value={recruiterName}
              onChange={(e) => setRecruiterName(e.target.value)}
              placeholder="Recruiter name"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Recruiter Title *
            </label>
            <input
              type="text"
              required
              value={recruiterTitle}
              onChange={(e) => setRecruiterTitle(e.target.value)}
              placeholder="Director of Talent Acquisition"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/10"
          >
            <Building2 className="w-4 h-4" />
            Save Business Profile
          </button>
        </div>
      </form>
    </div>
  );
};
