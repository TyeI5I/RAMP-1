import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import { ShieldAlert, Building2, CheckCircle2, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

export const EmployerVerificationGate: React.FC = () => {
  const { currentEmployer, registerEmployer, updateEmployerProfile, setCurrentRole } = useRamp();

  const [companyName, setCompanyName] = useState(currentEmployer?.companyName || '');
  const [taxId, setTaxId] = useState(currentEmployer?.taxId || 'EIN: 84-3991204');
  const [corporateDomain, setCorporateDomain] = useState(currentEmployer?.corporateDomain || 'linearcorp.com');
  const [websiteUrl, setWebsiteUrl] = useState(currentEmployer?.websiteUrl || 'https://linearcorp.com');
  const [recruiterName, setRecruiterName] = useState(currentEmployer?.recruiterName || 'Marcus Vance');
  const [recruiterTitle, setRecruiterTitle] = useState(currentEmployer?.recruiterTitle || 'Head of Engineering Talent');
  const [email, setEmail] = useState(currentEmployer?.email || 'marcus@linearcorp.com');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentEmployer) {
      updateEmployerProfile({
        companyName,
        taxId,
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
        taxId,
        corporateDomain,
        websiteUrl,
        recruiterName,
        recruiterTitle,
        email,
        verificationStatus: 'pending',
      });
    }
    setSubmitted(true);
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
            RAMP protects passive candidates. All hiring entities must pass corporate business verification before accessing candidate search.
          </p>
        </div>
      </div>

      {isPending && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-400">
            <Clock className="w-4 h-4" />
            Verification In Progress
          </div>
          <p className="text-xs text-neutral-300">
            Your corporate application for <strong>{currentEmployer?.companyName}</strong> (Tax ID: {currentEmployer?.taxId}) has been submitted to the RAMP Admin Verification Queue.
          </p>
          <div className="text-[11px] text-neutral-400 pt-1">
            Tip: Switch to the <strong>Platform Admin</strong> view in the top bar to audit and approve this employer instantly.
          </div>
        </div>
      )}

      {isRejected && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-red-400">
            <ShieldAlert className="w-4 h-4" />
            Business Verification Rejected
          </div>
          <p className="text-xs text-neutral-300">
            {currentEmployer?.rejectionReason || 'Corporate tax ID or corporate domain email failed legal compliance check.'}
          </p>
          <p className="text-[11px] text-neutral-400">Please review your credentials below and re-submit for review.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Business Tax ID (EIN) *
            </label>
            <input
              type="text"
              required
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="EIN: 84-3991204"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
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
              placeholder="Sarah Jenkins"
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

        <div className="pt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCurrentRole('admin')}
            className="text-xs text-neutral-400 hover:text-white underline underline-offset-4"
          >
            Switch to Admin View to Approve Employers
          </button>

          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/10"
          >
            <Building2 className="w-4 h-4" />
            Submit Corporate Verification
          </button>
        </div>
      </form>
    </div>
  );
};
