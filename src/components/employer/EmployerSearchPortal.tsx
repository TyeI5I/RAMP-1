import React, { useState, useMemo, useEffect } from 'react';
import { useRamp } from '../../context/RampContext';
import {
  CandidateProfile,
  JobCategory,
  JOB_CATEGORIES,
  DEGREE_TYPES,
  DegreeType,
  RemotePreference,
  SubscriptionTier,
  TIER_DIFFERENTIATORS,
} from '../../types/ramp';
import { EmployerVerificationGate } from './EmployerVerificationGate';
import { StripeSubscriptionModal } from './StripeSubscriptionModal';
import { SendInviteModal } from './SendInviteModal';
import {
  Search,
  Filter,
  ShieldCheck,
  Shuffle,
  Mail,
  Phone,
  Calendar,
  FileText,
  MapPin,
  Building,
  GraduationCap,
  Sparkles,
  Zap,
  ExternalLink,
  Lock,
  Eye,
  CheckCircle,
  Clock,
  Send,
  CreditCard,
  User,
  Bot,
  RotateCcw,
  X,
  HelpCircle,
  Heart,
  ChevronRight,
  ChevronLeft,
  Users,
  Check,
  ShieldAlert,
  BarChart2,
  SlidersHorizontal,
  Layers,
  Copy,
  CalendarDays,
  Columns,
} from 'lucide-react';

// Fisher-Yates Pure Shuffle algorithm (guarantees unbiased uniform distribution)
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const EmployerSearchPortal: React.FC = () => {
  const {
    currentEmployer,
    candidates,
    jobInvites,
    selectedCandidateForInvite,
    setSelectedCandidateForInvite,
    employers,
    setCurrentEmployerId,
  } = useRamp();

  // Search & Filter State - defaulted to 'All Categories' so active verified talent is visible immediately
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedDegree, setSelectedDegree] = useState<string>('All Degrees');
  const [selectedRemote, setSelectedRemote] = useState<string>('All');
  const [locationQuery, setLocationQuery] = useState<string>('');
  const [shuffleSalt, setShuffleSalt] = useState<number>(0);

  // Pagination state (list of ten per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 10;

  // Gemini Natural Language Employer Search State
  const [geminiQuery, setGeminiQuery] = useState<string>('');
  const [isGeminiSearching, setIsGeminiSearching] = useState<boolean>(false);
  const [geminiActive, setGeminiActive] = useState<boolean>(false);
  const [geminiMatchedIds, setGeminiMatchedIds] = useState<string[] | null>(null);
  const [geminiCriteria, setGeminiCriteria] = useState<any>(null);

  // Modals & Advanced Tier 2 Workflows
  const [isStripeModalOpen, setIsStripeModalOpen] = useState(false);
  const [defaultStripeTier, setDefaultStripeTier] = useState<SubscriptionTier | undefined>(undefined);
  const [previewResumeCandidate, setPreviewResumeCandidate] = useState<CandidateProfile | null>(null);
  const [previewDegreeCandidate, setPreviewDegreeCandidate] = useState<CandidateProfile | null>(null);
  const [previewAboutMeCandidate, setPreviewAboutMeCandidate] = useState<CandidateProfile | null>(null);
  const [viewMode, setViewMode] = useState<'candidates' | 'sent_invites' | 'billing'>('candidates');

  // Tier 2 Differentiators: Candidate Comparison Matrix, Instant Scheduling, and Capabilities Matrix
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [schedulingCandidate, setSchedulingCandidate] = useState<CandidateProfile | null>(null);
  const [isTierMatrixModalOpen, setIsTierMatrixModalOpen] = useState(false);
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);

  // Verification Gate Check: If employer is not approved, show Verification Gate
  if (!currentEmployer || currentEmployer.verificationStatus !== 'approved') {
    return <EmployerVerificationGate />;
  }

  const isTier2 = currentEmployer.subscriptionTier === 'tier2';
  const monthlyInvitesUsed = currentEmployer.monthlyInvitesSent || 4;
  const tier1Quota = 25;

  // Handle Gemini Natural Language Search (directly brings up results, no recruiter briefing card)
  const handleGeminiSearch = async (queryText?: string) => {
    const query = (queryText !== undefined ? queryText : geminiQuery).trim();
    if (!query) return;

    if (queryText !== undefined) {
      setGeminiQuery(queryText);
    }

    setIsGeminiSearching(true);
    setCurrentPage(1);

    try {
      const res = await fetch('/api/gemini/employer-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          candidates,
        }),
      });

      if (!res.ok) throw new Error('Gemini employer search request failed');
      const data = await res.json();
      setGeminiMatchedIds(data.matchedCandidateIds || []);
      setGeminiCriteria(data.extractedCriteria || {});
      setGeminiActive(true);
      setShuffleSalt((s) => s + 1);
    } catch (err) {
      console.error('Gemini employer search failed, using heuristic fairness shuffle:', err);
      const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const eligible = candidates.filter(
        (c) => c.verificationStatus === 'verified' && c.simulatedDaysInactive < 14
      );
      const matched = eligible.filter((c) => {
        const text = `${c.name} ${c.targetCategories.join(' ')} ${c.degreeTitle} ${
          c.institution
        } ${c.skills.join(' ')} ${c.aboutMe || ''} ${c.bio}`.toLowerCase();
        return keywords.some((k) => text.includes(k));
      });
      // Guarantee list of ten if there is ten in the pool
      let pool = [...matched];
      if (pool.length < 10 && eligible.length >= 10) {
        const remaining = eligible.filter((c) => !pool.some((p) => p.id === c.id));
        const needed = Math.min(10 - pool.length, remaining.length);
        pool.push(...shuffleArray(remaining).slice(0, needed));
      }
      const shuffledIds = shuffleArray(pool.slice(0, 10).map((c) => c.id));
      setGeminiMatchedIds(shuffledIds);
      setGeminiActive(true);
      setShuffleSalt((s) => s + 1);
    } finally {
      setIsGeminiSearching(false);
    }
  };

  const handleClearGeminiSearch = () => {
    setGeminiActive(false);
    setGeminiMatchedIds(null);
    setGeminiCriteria(null);
    setGeminiQuery('');
    setCurrentPage(1);
    setShuffleSalt((s) => s + 1);
  };

  // Filter and randomize candidates (Fairness First matching logic - returns a list of ten if there is ten)
  const filteredCandidates = useMemo(() => {
    // 1. Strict Eligibility: Verified credentials, active (under 14 days inactive), and not snoozed
    const eligible = candidates.filter((c) => {
      // Must not be snoozed
      if (c.isSnoozed) return false;

      // Must be verified
      if (c.verificationStatus !== 'verified') return false;

      // Strict 14-day inactivity rule: Profiles inactive 14+ days are archived
      if (c.simulatedDaysInactive >= 14 || c.lifecycleStatus === 'archived' || c.lifecycleStatus === 'deleted') {
        return false;
      }
      return true;
    });

    // 2. If Gemini Natural Language Search is active, filter by matched IDs
    if (geminiActive && geminiMatchedIds) {
      const matched = eligible.filter((c) => geminiMatchedIds.includes(c.id));
      if (matched.length < 10 && eligible.length >= 10) {
        const remaining = eligible.filter((c) => !geminiMatchedIds.includes(c.id));
        const needed = Math.min(10 - matched.length, remaining.length);
        return [...shuffleArray(matched), ...shuffleArray(remaining).slice(0, needed)];
      }
      return shuffleArray(matched);
    }

    // 3. Manual Discovery Filters
    const matches = eligible.filter((c) => {
      // Target position category matching
      if (selectedCategory && selectedCategory !== 'All Categories') {
        if (!c.targetCategories.includes(selectedCategory as JobCategory)) return false;
      }

      // Baseline Degree filter
      if (selectedDegree && selectedDegree !== 'All Degrees') {
        if (c.degreeType !== selectedDegree) return false;
      }

      // Remote filter
      if (selectedRemote && selectedRemote !== 'All') {
        if (c.remotePreference !== selectedRemote) return false;
      }

      // Location filter
      if (locationQuery.trim()) {
        const query = locationQuery.toLowerCase();
        if (
          !c.location.toLowerCase().includes(query) &&
          !c.institution.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      return true;
    });

    // If manual filter has matches but fewer than 10, and pool has 10 or more,
    // supplement with related talent from the active pool so that results are a list of ten if there is ten
    if (matches.length > 0 && matches.length < 10 && eligible.length >= 10) {
      const remaining = eligible.filter((c) => !matches.some((m) => m.id === c.id));
      const needed = Math.min(10 - matches.length, remaining.length);
      return [...shuffleArray(matches), ...shuffleArray(remaining).slice(0, needed)];
    }

    if (matches.length === 0) {
      // Fall back to general active pool up to 10
      return shuffleArray(eligible).slice(0, 10);
    }

    return shuffleArray(matches);
  }, [
    candidates,
    geminiActive,
    geminiMatchedIds,
    selectedCategory,
    selectedDegree,
    selectedRemote,
    locationQuery,
    shuffleSalt,
  ]);

  // Pagination math: results should be a list of ten, if there is ten
  const totalResults = filteredCandidates.length;
  const totalPages = Math.ceil(totalResults / PAGE_SIZE) || 1;
  const displayedCandidates = filteredCandidates.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const employerInvites = jobInvites.filter((inv) => inv.employerId === currentEmployer.id);

  return (
    <div className="space-y-6">
      {/* Top Banner: Verification & Detailed Subscription Status */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white">{currentEmployer.companyName}</h2>
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Corporate Employer
                </span>
              </div>
              <div className="text-xs text-neutral-400 font-mono mt-0.5">
                <span>{currentEmployer.recruiterName} ({currentEmployer.recruiterTitle})</span>
                <span aria-hidden="true" className="mx-1.5">·</span>
                <span>Domain: {currentEmployer.corporateDomain}</span>
              </div>
            </div>
          </div>

          {/* Subscription Tier Overview & Quota Tracker */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="text-right">
              <div className="text-[11px] text-neutral-400 font-medium">Subscription Tier</div>
              <div className="text-xs font-bold font-mono flex items-center gap-1.5 justify-end">
                {isTier2 ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 fill-emerald-400" /> Tier 2 Enterprise Suite
                  </span>
                ) : (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5" /> Tier 1 Standard (25 Invites/mo)
                  </span>
                )}
              </div>
              <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                {isTier2
                  ? 'Unlimited Invites · 5 Seats · Registrar Vault'
                  : `Monthly Quota: ${monthlyInvitesUsed} / ${tier1Quota} Invites Used`}
              </div>
            </div>

            <button
              onClick={() => {
                setDefaultStripeTier(isTier2 ? 'tier2' : 'tier2');
                setIsStripeModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>{isTier2 ? 'Manage Billing' : 'Upgrade to Tier 2'}</span>
            </button>
          </div>
        </div>

        {/* Tier Differentiator Callout Strip */}
        <div className="pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-neutral-300">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Seats: <strong className="text-white">{isTier2 ? '5 Team Recruiter Seats' : '1 Recruiter Seat'}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-300">
              <Send className="w-3.5 h-3.5 text-emerald-400" />
              <span>Direct Invites: <strong className="text-white">{isTier2 ? 'Unlimited + VIP Delivery Badge' : `${tier1Quota - monthlyInvitesUsed} remaining this cycle`}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-300">
              <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
              <span>Registrar Vault: <strong className="text-white">{isTier2 ? 'Full Cryptographic Audit Unlocked' : 'Summary Metadata'}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-300">
              <Phone className="w-3.5 h-3.5 text-amber-400" />
              <span>Direct Channels: <strong className="text-white">{isTier2 ? 'Email + Phone + Calendar' : 'Email Only'}</strong></span>
            </div>
          </div>

          {!isTier2 && (
            <button
              onClick={() => {
                setDefaultStripeTier('tier2');
                setIsStripeModalOpen(true);
              }}
              className="text-xs text-amber-300 hover:text-white font-mono flex items-center gap-1 underline underline-offset-4"
            >
              <span>Explore all 7 Tier 2 Enterprise Advantages →</span>
            </button>
          )}
        </div>
      </div>

      {/* View Switcher: Search Pool vs Sent Invites vs Billing */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('candidates')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              viewMode === 'candidates'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Discover Verified Talent ({filteredCandidates.length})
          </button>
          <button
            onClick={() => setViewMode('sent_invites')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              viewMode === 'sent_invites'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Sent Invites Tracker ({employerInvites.length})</span>
          </button>
          <button
            onClick={() => setViewMode('billing')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              viewMode === 'billing'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Plan & Invoices ({currentEmployer.invoices?.length || 0})</span>
          </button>
        </div>


      </div>

      {viewMode === 'sent_invites' ? (
        /* Sent Invites List */
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Direct Invitations Sent</h3>
            <span className="text-xs font-mono text-neutral-400">
              {isTier2 ? 'Unlimited Allowance' : `${monthlyInvitesUsed} / ${tier1Quota} Used`}
            </span>
          </div>
          {employerInvites.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500">
              No job invites sent yet. Search verified candidates to send direct invitations.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800 text-xs">
              {employerInvites.map((inv) => (
                <div key={inv.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>{inv.jobTitle}</span>
                      {isTier2 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 fill-emerald-400" /> Priority VIP Delivery
                        </span>
                      )}
                    </div>
                    <div className="text-neutral-400 font-mono mt-0.5">
                      Invited: <strong className="text-neutral-200">{inv.candidateName}</strong> ({inv.candidateEmail})
                      <span aria-hidden="true" className="mx-1.5">·</span>
                      {inv.compensationRange}
                    </div>
                    <p className="text-neutral-400 text-xs mt-1.5 line-clamp-2 italic">
                      "{inv.jobDescription}"
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize ${
                        inv.status === 'accepted'
                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50'
                          : inv.status === 'declined'
                          ? 'bg-neutral-800 text-neutral-400'
                          : 'bg-blue-950/40 text-blue-400 border border-blue-800/50'
                      }`}
                    >
                      {inv.status}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {new Date(inv.sentAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : viewMode === 'billing' ? (
        /* Billing & Invoices Management View */
        <div className="space-y-6">
          {/* Active Plan Overview */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 font-mono">
                  Current Active Subscription
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight mt-0.5 flex items-center gap-2">
                  <span>
                    {isTier2
                      ? 'Tier 2 Enterprise Suite · Real-Time Alerts & Unlimited Reach'
                      : 'Tier 1 Standard · Verified Candidate Search (25 Invites/mo)'}
                  </span>
                </h3>
                <div className="text-xs text-neutral-400 font-mono mt-1">
                  Billed {currentEmployer.subscriptionCadence} · Next renewal:{' '}
                  {currentEmployer.subscriptionActiveUntil
                    ? new Date(currentEmployer.subscriptionActiveUntil).toLocaleDateString()
                    : 'Annual'}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {!isTier2 && (
                  <button
                    onClick={() => {
                      setDefaultStripeTier('tier2');
                      setIsStripeModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
                  >
                    <Zap className="w-3.5 h-3.5 fill-neutral-950" />
                    Upgrade to Tier 2 Enterprise
                  </button>
                )}
                <button
                  onClick={() => {
                    setDefaultStripeTier(currentEmployer.subscriptionTier);
                    setIsStripeModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Stripe Checkout Flow
                </button>
              </div>
            </div>

            {/* Comprehensive Feature Comparison Matrix */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <div className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Full Plan Capability Breakdown (Tier 1 vs Tier 2)
              </div>
              <div className="divide-y divide-neutral-850 text-xs">
                {TIER_DIFFERENTIATORS.map((diff) => (
                  <div key={diff.id} className="py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="font-semibold text-neutral-200 flex items-center gap-1.5">
                      <span>{diff.feature}</span>
                    </div>
                    <div className="text-neutral-400 font-mono text-[11px]">
                      <span className="text-neutral-500">Tier 1: </span>
                      {diff.tier1}
                    </div>
                    <div className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                      <span className="text-emerald-500/70">Tier 2: </span>
                      <span>{diff.tier2}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stripe Invoices & Receipts History */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Stripe Invoices & Receipts</h4>
                <p className="text-xs text-neutral-400">
                  Itemized records of all transactions processed via Stripe gateway.
                </p>
              </div>
              <span className="text-xs font-mono text-neutral-500">
                {currentEmployer.invoices?.length || 0} Invoices on Record
              </span>
            </div>

            {!currentEmployer.invoices || currentEmployer.invoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500 border border-neutral-800 rounded-xl bg-neutral-950/40">
                No past invoices found. Use the Stripe Checkout Flow above to generate a new subscription invoice.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800 text-xs font-mono">
                {currentEmployer.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{inv.invoiceNumber}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900">
                          {inv.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-neutral-400 text-[11px] mt-0.5">
                        {inv.planName} · Paid via {inv.paymentMethod.brand} ···· {inv.paymentMethod.last4}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-white font-bold">${inv.totalAmount.toFixed(2)} USD</div>
                      <div className="text-neutral-500 text-[11px]">{new Date(inv.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Candidates Discovery Search View */
        <div className="space-y-5">
          {/* Gemini Natural Language Search Bar (Values & Personal Narrative Matcher) */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <span>Gemini AI Values & Narrative Search</span>
                    {isTier2 ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Tier 2 Unlocked
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                        Tier 2 Enterprise Feature
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Find candidates by searching their verified credentials, personal values, collaboration style, and 'About Me' stories.
                  </p>
                </div>
              </div>

              {geminiActive && (
                <button
                  onClick={handleClearGeminiSearch}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono transition-colors self-start sm:self-center"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear Search</span>
                </button>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGeminiSearch();
              }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={geminiQuery}
                  onChange={(e) => setGeminiQuery(e.target.value)}
                  placeholder="e.g. Distributed systems engineer from Stanford or MIT who values psychological safety and blameless retrospectives..."
                  className="w-full pl-4 pr-10 py-2.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {geminiQuery && (
                  <button
                    type="button"
                    onClick={() => setGeminiQuery('')}
                    className="absolute right-3 top-3 text-neutral-500 hover:text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={!geminiQuery.trim() || isGeminiSearching}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-500/10 shrink-0"
              >
                {isGeminiSearching ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Ask Gemini</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
              <span className="text-[11px] font-semibold text-neutral-400">Try prompts:</span>
              <button
                type="button"
                onClick={() =>
                  handleGeminiSearch(
                    'Senior Backend Engineer with Master\'s degree, distributed systems, high concurrency, and transparent values'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors hover:border-neutral-700"
              >
                ⚡ Backend Engineer with Master's & distributed systems
              </button>

              <button
                type="button"
                onClick={() =>
                  handleGeminiSearch(
                    'Product Designer from RISD or Stanford with empathy, accessibility WCAG AA, and design systems'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors hover:border-neutral-700"
              >
                🎨 Product Designer with WCAG accessibility & empathy
              </button>

              <button
                type="button"
                onClick={() =>
                  handleGeminiSearch(
                    'Machine Learning or AI Engineer from MIT or Harvard who values open debate, PyTorch, and teamwork'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors hover:border-neutral-700"
              >
                🤖 ML Engineer with foundation models & collaborative style
              </button>
            </div>
          </div>

          {/* Clean Active Filter Status Pill (NO recruiter briefing card - results brought up directly) */}
          {geminiActive && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-neutral-950 border border-emerald-900/60 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-white">
                  Natural Language Filter: <strong className="text-emerald-300">"{geminiQuery}"</strong>
                </span>
                <span className="text-[11px] text-neutral-400">
                  ({filteredCandidates.length} matched candidates)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearGeminiSearch}
                  className="text-[11px] text-neutral-400 hover:text-white px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 transition-colors"
                >
                  Reset Filter
                </button>
              </div>
            </div>
          )}

          {/* Manual Baseline Filters Panel */}
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-200 uppercase tracking-wider text-[11px] font-mono">
                Manual Discovery Filters
              </span>
              {geminiActive && (
                <span className="text-[11px] text-emerald-400 font-mono">
                  (Currently showing natural language search results)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Target Job Position Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setCurrentPage(1);
                    if (geminiActive) setGeminiActive(false);
                    setShuffleSalt((s) => s + 1);
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="All Categories">All Categories (Full Pool)</option>
                  {JOB_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Baseline Degree Filter */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Required Verified Degree
                </label>
                <select
                  value={selectedDegree}
                  onChange={(e) => {
                    setSelectedDegree(e.target.value);
                    setCurrentPage(1);
                    if (geminiActive) setGeminiActive(false);
                    setShuffleSalt((s) => s + 1);
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="All Degrees">All Degree Levels</option>
                  {DEGREE_TYPES.map((deg) => (
                    <option key={deg} value={deg}>
                      {deg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Remote Status */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Workplace Preference
                </label>
                <select
                  value={selectedRemote}
                  onChange={(e) => {
                    setSelectedRemote(e.target.value);
                    setCurrentPage(1);
                    if (geminiActive) setGeminiActive(false);
                    setShuffleSalt((s) => s + 1);
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="All">Any Preference</option>
                  <option value="remote_only">Remote Only</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">Onsite Only</option>
                </select>
              </div>

              {/* Location or Institution */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Location or Institution
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      setCurrentPage(1);
                      if (geminiActive) setGeminiActive(false);
                    }}
                    placeholder="e.g. San Francisco or Stanford"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                  />
                  {locationQuery && (
                    <button
                      onClick={() => {
                        setLocationQuery('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Fairness Engine Explainer Bar */}
            <div className="pt-2 border-t border-neutral-800/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-neutral-400 gap-2">
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
                <Shuffle className="w-3.5 h-3.5" />
                <span>Fairness First Engine: Candidate order is mathematically randomized per query.</span>
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                {totalResults} verified candidates in active talent pool (14/30 inactive rule strictly enforced)
              </div>
            </div>
          </div>

          {/* Results Bar: List of 10 Indicator & Compare Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
              <span className="font-bold text-white text-sm">
                {displayedCandidates.length === 10
                  ? 'List of 10 Verified Candidates'
                  : `Results: ${displayedCandidates.length} Verified Candidate${displayedCandidates.length === 1 ? '' : 's'}`}
              </span>
              {totalResults > 10 && (
                <span className="text-neutral-500">
                  (Showing page {currentPage} of {totalPages} · {totalResults} total in active pool)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Compare Finalists Button */}
              {selectedForComparison.length > 0 && (
                <button
                  onClick={() => setIsComparisonModalOpen(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-500/10"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Compare Finalists ({selectedForComparison.length}/3)</span>
                </button>
              )}
            </div>
          </div>

          {/* Candidate Result Cards (Displaying list of 10) */}
          {displayedCandidates.length === 0 ? (
            <div className="p-12 text-center bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
              <GraduationCap className="w-8 h-8 text-neutral-500 mx-auto" />
              <h3 className="text-sm font-semibold text-white">No Matching Verified Candidates Found</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                No active candidates meet these exact criteria. Try broadening your query or selecting "All Categories".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedCandidates.map((candidate, idx) => {
                const daysSince = candidate.simulatedDaysInactive;
                const checkInLabel = daysSince === 0 ? 'Active Today' : `Checked in ${daysSince}d ago`;
                const isSelected = selectedForComparison.includes(candidate.id);

                return (
                  <div
                    key={candidate.id}
                    className={`p-5 rounded-2xl bg-neutral-900 border transition-all flex flex-col justify-between space-y-4 group ${
                      isSelected
                        ? 'border-emerald-500/80 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-950/30'
                        : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Header: Candidate Name, Verified Badge, Compare Checkbox, Activity status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-neutral-500 font-bold">
                              #{(currentPage - 1) * PAGE_SIZE + idx + 1}
                            </span>
                            <h3 className="text-base font-bold text-white tracking-tight">
                              {candidate.name}
                            </h3>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-3 h-3" />
                              Verified Degree
                            </span>
                            {isTier2 && (
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-1.5 py-0.2 rounded">
                                VIP Fast-Track
                              </span>
                            )}
                          </div>

                          {/* Direct Channels (Tier 1 vs Tier 2 Differentiator) */}
                          <div className="text-xs text-neutral-400 font-mono space-y-1 pt-0.5">
                            {/* Mandatory visible email */}
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3 h-3 text-neutral-500" />
                              <a href={`mailto:${candidate.email}`} className="hover:text-blue-400 transition-colors">
                                {candidate.email}
                              </a>
                            </div>

                            {/* Direct Phone & Instant Calendar Scheduling (Tier 2 Advantage) */}
                            {isTier2 ? (
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                {candidate.phone && (
                                  <div className="flex items-center gap-1">
                                    <a
                                      href={`tel:${candidate.phone}`}
                                      className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/60 transition-colors"
                                      title="Call candidate direct desk line"
                                    >
                                      <Phone className="w-3 h-3 text-emerald-400" />
                                      <span>{candidate.phone}</span>
                                    </a>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard?.writeText(candidate.phone || '');
                                        setCopiedCandidateId(candidate.id);
                                        setTimeout(() => setCopiedCandidateId(null), 2000);
                                      }}
                                      className="p-1 text-neutral-400 hover:text-white bg-neutral-950 rounded border border-neutral-800 text-[10px] transition-colors"
                                      title="Copy direct phone number"
                                    >
                                      {copiedCandidateId === candidate.id ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                                <button
                                  onClick={() => setSchedulingCandidate(candidate)}
                                  className="text-[11px] text-emerald-300 hover:text-white font-mono bg-emerald-950/60 hover:bg-emerald-900/70 px-2 py-0.5 rounded border border-emerald-800/80 flex items-center gap-1 transition-colors"
                                  title="Skip queue: book 20-min direct intro chat"
                                >
                                  <CalendarDays className="w-3 h-3 text-emerald-400" />
                                  <span>Instant Intro Sync</span>
                                </button>
                              </div>
                            ) : (
                              <div className="text-[11px] text-neutral-500 flex items-center gap-1 pt-0.5">
                                <Lock className="w-3 h-3 text-neutral-600" />
                                <span>Direct line & instant calendar intro booking unlocked with Tier 2</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Top Right: Compare Checkbox & Activity Frequency Badge */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="text-[11px] font-mono text-emerald-400 font-medium bg-neutral-950 px-2.5 py-1 rounded-md border border-neutral-800 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-emerald-400" />
                            {checkInLabel}
                          </span>

                          {/* Compare Talent Checkbox */}
                          {isTier2 ? (
                            <label className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 hover:text-white cursor-pointer select-none bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    if (selectedForComparison.length >= 3) {
                                      alert('You can compare up to 3 candidates simultaneously.');
                                      return;
                                    }
                                    setSelectedForComparison([...selectedForComparison, candidate.id]);
                                  } else {
                                    setSelectedForComparison(selectedForComparison.filter((id) => id !== candidate.id));
                                  }
                                }}
                                className="w-3 h-3 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-0"
                              />
                              <span>Compare</span>
                            </label>
                          ) : (
                            <button
                              onClick={() => {
                                setDefaultStripeTier('tier2');
                                setIsStripeModalOpen(true);
                              }}
                              className="flex items-center gap-1 text-[10px] font-mono text-neutral-500 hover:text-amber-300 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-850"
                              title="Side-by-side comparison unlocked in Tier 2 Enterprise"
                            >
                              <Lock className="w-2.5 h-2.5 text-neutral-600" />
                              <span>Compare (Tier 2)</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Clean Unboxed Metadata with Separators (Frontend Design Constitution) */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 font-mono">
                        <span className="text-neutral-200 font-semibold">{candidate.degreeTitle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{candidate.institution}</span>
                        <span aria-hidden="true">·</span>
                        <span>Class of {candidate.graduationYear}</span>
                        {candidate.showLocation && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{candidate.location}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{candidate.remotePreference.replace('_', ' ')}</span>
                      </div>

                      {/* Bio */}
                      <p className="text-xs text-neutral-300 leading-relaxed line-clamp-2">
                        {candidate.bio}
                      </p>

                      {/* About Me Section (Who the Person Actually Is Beyond Accomplishments) */}
                      {candidate.aboutMe && (
                        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/30 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-amber-400 font-mono flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                              <User className="w-3 h-3 text-amber-400" />
                              About Me · Who I Actually Am
                            </span>
                            <button
                              onClick={() => setPreviewAboutMeCandidate(candidate)}
                              className="text-[10px] text-amber-300 hover:text-white underline underline-offset-2 flex items-center gap-0.5"
                            >
                              <span>Read Full Story</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-xs text-neutral-300 italic line-clamp-2 leading-relaxed">
                            "{candidate.aboutMe}"
                          </p>
                        </div>
                      )}

                      {/* Market Salary & Compensation Intelligence (Tier 1 vs Tier 2 Differentiator) */}
                      {isTier2 ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-900/40 text-[11px] font-mono text-emerald-300">
                          <div className="flex items-center gap-1.5">
                            <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-neutral-400">Market Comp (P75):</span>
                            <strong className="text-white">
                              {candidate.degreeType === "Master's Degree" ? '$185,000 - $225,000' : '$160,000 - $195,000'}
                            </strong>
                          </div>
                          <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                            Top 12% Talent Band
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-950/60 border border-neutral-850 text-[11px] font-mono text-neutral-500">
                          <div className="flex items-center gap-1.5">
                            <Lock className="w-3 h-3 text-neutral-600" />
                            <span>Market Salary Intelligence: Unlock with Tier 2 Enterprise</span>
                          </div>
                          <button
                            onClick={() => {
                              setDefaultStripeTier('tier2');
                              setIsStripeModalOpen(true);
                            }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-900/40"
                          >
                            Tier 2 Feature
                          </button>
                        </div>
                      )}

                      {/* Target Categories tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {candidate.targetCategories.map((cat) => (
                          <span
                            key={cat}
                            className="text-[11px] px-2 py-0.5 rounded bg-neutral-950 text-neutral-300 border border-neutral-800"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Footer Actions: Resume, Degree proof, Send Job Invite */}
                    <div className="pt-3 border-t border-neutral-850 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Resume preview modal trigger */}
                        <button
                          onClick={() => setPreviewResumeCandidate(candidate)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Resume</span>
                        </button>

                        {/* Degree diploma proof preview */}
                        <button
                          onClick={() => setPreviewDegreeCandidate(candidate)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 transition-colors flex items-center gap-1"
                          title={isTier2 ? 'Inspect Cryptographic Registrar Audit Vault' : 'Preview Degree Certificate'}
                        >
                          <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isTier2 ? 'Registrar Vault' : 'Degree Proof'}</span>
                        </button>
                      </div>

                      {/* Send Job Invite Button (VIP Priority for Tier 2) */}
                      <button
                        onClick={() => setSelectedCandidateForInvite(candidate)}
                        className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md ${
                          isTier2
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/10'
                        }`}
                      >
                        {isTier2 ? <Zap className="w-3.5 h-3.5 fill-current" /> : <Send className="w-3.5 h-3.5" />}
                        <span>{isTier2 ? 'Send VIP Invite' : 'Send Job Invite'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Clean Pagination Bar (List of 10 per page) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-xs font-mono">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-300 transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous 10</span>
              </button>

              <span className="text-neutral-400">
                Page <strong className="text-white">{currentPage}</strong> of {totalPages} (List of 10 per page)
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-300 transition-colors flex items-center gap-1"
              >
                <span>Next 10</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stripe Subscription Billing Modal */}
      <StripeSubscriptionModal
        isOpen={isStripeModalOpen}
        defaultTier={defaultStripeTier}
        onClose={() => {
          setIsStripeModalOpen(false);
          setDefaultStripeTier(undefined);
        }}
      />

      {/* Send Job Invite Modal */}
      <SendInviteModal
        candidate={selectedCandidateForInvite}
        onClose={() => setSelectedCandidateForInvite(null)}
      />

      {/* Resume Preview Modal */}
      {previewResumeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Resume Preview: {previewResumeCandidate.name}
                </h3>
                <div className="text-xs text-neutral-400 font-mono">
                  {previewResumeCandidate.resumeFileName || 'Resume.pdf'}
                </div>
              </div>
              <button
                onClick={() => setPreviewResumeCandidate(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 space-y-3 font-mono leading-relaxed">
              <div className="border-b border-neutral-850 pb-2">
                <div className="text-sm font-bold text-white">{previewResumeCandidate.name}</div>
                <div className="text-neutral-400">
                  {previewResumeCandidate.email} · {previewResumeCandidate.location}
                </div>
              </div>
              <div>
                <div className="font-bold text-white mb-1">PROFESSIONAL SUMMARY</div>
                <p>{previewResumeCandidate.resumeSummary || previewResumeCandidate.bio}</p>
              </div>
              <div>
                <div className="font-bold text-white mb-1">VERIFIED EDUCATION</div>
                <p>
                  {previewResumeCandidate.degreeTitle}, {previewResumeCandidate.institution} (Class of{' '}
                  {previewResumeCandidate.graduationYear})
                </p>
              </div>
              <div>
                <div className="font-bold text-white mb-1">TECHNICAL SKILLS</div>
                <p>{previewResumeCandidate.skills.join(', ')}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setSelectedCandidateForInvite(previewResumeCandidate);
                  setPreviewResumeCandidate(null);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Invite Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Degree Proof Visual Preview Modal (With Tier 2 Cryptographic Registrar Vault) */}
      {previewDegreeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {previewDegreeCandidate.institution}
                  </h3>
                  {isTier2 ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      Registrar Vault Audited
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      Standard Proof
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">
                  Degree: {previewDegreeCandidate.degreeTitle} · Class of {previewDegreeCandidate.graduationYear}
                </div>
              </div>
              <button
                onClick={() => setPreviewDegreeCandidate(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 aspect-video relative flex items-center justify-center">
              <img
                src={previewDegreeCandidate.credentialDocumentUrl}
                alt="Degree proof"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Cryptographic Audit Vault details (Tier 2 vs Tier 1) */}
            {isTier2 ? (
              <div className="p-4 bg-neutral-950 rounded-xl border border-emerald-900/60 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-neutral-850 pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Cryptographic Registrar Audit Log
                  </span>
                  <span>OCR Match: 99.4% Precision</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300 pt-1">
                  <div>
                    <span className="text-neutral-500 block">Registrar Ledger Hash:</span>
                    <span className="text-neutral-200">SHA256: 0x9f4a88b1...2c09e</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Credential ID:</span>
                    <span className="text-neutral-200">
                      {previewDegreeCandidate.credentialOcrData?.credentialId || 'REG-STAN-CS-2023-94821'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Conferred Record:</span>
                    <span className="text-neutral-200">Official Graduation Registry Validated</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Verification Authority:</span>
                    <span className="text-emerald-400">RAMP Cryptographic Audit Service</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-300 font-semibold">Standard Credential Check</span>
                  <span className="text-emerald-400">Verified Badge Active</span>
                </div>
                <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Unlock Cryptographic Registrar Vault</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Tier 2 Enterprise unlocks unredacted registrar seal hashes, raw OCR confidence scores, and institutional verification transcripts.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setPreviewDegreeCandidate(null);
                      setDefaultStripeTier('tier2');
                      setIsStripeModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold shrink-0 transition-colors"
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* About Me & Human Context Preview Modal */}
      {previewAboutMeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {previewAboutMeCandidate.name} · About Me
                  </h3>
                  <div className="text-xs text-amber-400 font-mono">
                    Context of who the person actually is beyond accomplishments
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPreviewAboutMeCandidate(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 leading-relaxed space-y-3 font-sans">
              <p className="whitespace-pre-line italic text-neutral-300">
                "{previewAboutMeCandidate.aboutMe}"
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono border-t border-neutral-800 pt-3">
              <span>{previewAboutMeCandidate.degreeTitle} ({previewAboutMeCandidate.institution})</span>
              <button
                onClick={() => {
                  setSelectedCandidateForInvite(previewAboutMeCandidate);
                  setPreviewAboutMeCandidate(null);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Invite to Apply</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
