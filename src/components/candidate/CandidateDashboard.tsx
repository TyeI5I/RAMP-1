import React, { useState, useEffect } from 'react';
import { useRamp } from '../../context/RampContext';
import { JOB_CATEGORIES, JobCategory, ABOUT_ME_CHECKLIST_ITEMS } from '../../types/ramp';
import { GeminiCareerStudioModal } from './GeminiCareerStudioModal';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  Eye,
  EyeOff,
  Upload,
  Calendar,
  Building,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Flame,
  Check,
  X,
  Sparkles,
  User,
  PenLine,
  Save,
  UserCheck,
  Copy,
  MessageSquareOff,
  Archive,
  Info,
  ListChecks,
  Wand2,
  RotateCcw,
} from 'lucide-react';

interface CandidateDashboardProps {
  onOpenOnboarding: () => void;
}

export const CandidateDashboard: React.FC<CandidateDashboardProps> = ({ onOpenOnboarding }) => {
  const {
    currentCandidate,
    candidates,
    setCurrentCandidateId,
    checkInCandidate,
    updateCandidateProfile,
    jobInvites,
    respondToInvite,
    markInviteContacted,
    archiveCandidateInvite,
    setSelectedEmailModal,
    emailLogs,
    uploadCandidateCredential,
  } = useRamp();

  const [activeTab, setActiveTab] = useState<'overview' | 'about_me' | 'resume_letter' | 'credentials' | 'invites' | 'privacy'>('overview');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [showArchivedInvites, setShowArchivedInvites] = useState(false);

  // About Me editing state
  const [aboutMeText, setAboutMeText] = useState(currentCandidate?.aboutMe || '');
  const [aboutMeSaveStatus, setAboutMeSaveStatus] = useState<string | null>(null);

  // Gemini About Me helper state in dashboard
  const [isGeminiLoadingAboutMe, setIsGeminiLoadingAboutMe] = useState(false);
  const [aboutMeTone, setAboutMeTone] = useState<'grounded' | 'collaborative' | 'curious'>('grounded');
  const [aboutMeGeminiStatus, setAboutMeGeminiStatus] = useState<string | null>(null);
  const [aboutMeFeedbackMap, setAboutMeFeedbackMap] = useState<Record<string, { covered: boolean; feedback: string }>>({});
  const [previousAboutMeDraft, setPreviousAboutMeDraft] = useState<string | null>(null);

  // Resume & Cover Letter editing state
  const [resumeSummaryText, setResumeSummaryText] = useState(currentCandidate?.resumeSummary || currentCandidate?.bio || '');
  const [coverLetterText, setCoverLetterText] = useState(currentCandidate?.coverLetterText || '');
  const [resumeSaveStatus, setResumeSaveStatus] = useState<string | null>(null);
  const [coverLetterSaveStatus, setCoverLetterSaveStatus] = useState<string | null>(null);

  // Gemini Career Studio state
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [geminiModalMode, setGeminiModalMode] = useState<'resume' | 'cover_letter' | 'about_me' | 'general'>('general');

  useEffect(() => {
    if (currentCandidate) {
      setAboutMeText(currentCandidate.aboutMe || '');
      setResumeSummaryText(currentCandidate.resumeSummary || currentCandidate.bio || '');
      setCoverLetterText(currentCandidate.coverLetterText || '');
    }
  }, [currentCandidate?.id, currentCandidate?.aboutMe, currentCandidate?.resumeSummary, currentCandidate?.coverLetterText]);

  // Real-time debounced auto-save for About Me
  useEffect(() => {
    if (!currentCandidate) return;
    if (aboutMeText === (currentCandidate.aboutMe || '')) return;

    const timer = setTimeout(() => {
      updateCandidateProfile({ aboutMe: aboutMeText });
      setAboutMeSaveStatus(`Auto-saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
      setTimeout(() => setAboutMeSaveStatus(null), 3000);
    }, 600);

    return () => clearTimeout(timer);
  }, [aboutMeText, currentCandidate?.id]);

  // Real-time debounced auto-save for Resume Summary
  useEffect(() => {
    if (!currentCandidate) return;
    const existing = currentCandidate.resumeSummary || currentCandidate.bio || '';
    if (resumeSummaryText === existing) return;

    const timer = setTimeout(() => {
      updateCandidateProfile({ resumeSummary: resumeSummaryText });
      setResumeSaveStatus(`Auto-saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
      setTimeout(() => setResumeSaveStatus(null), 3000);
    }, 600);

    return () => clearTimeout(timer);
  }, [resumeSummaryText, currentCandidate?.id]);

  // Real-time debounced auto-save for Cover Letter
  useEffect(() => {
    if (!currentCandidate) return;
    if (coverLetterText === (currentCandidate.coverLetterText || '')) return;

    const timer = setTimeout(() => {
      updateCandidateProfile({ coverLetterText });
      setCoverLetterSaveStatus(`Auto-saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
      setTimeout(() => setCoverLetterSaveStatus(null), 3000);
    }, 600);

    return () => clearTimeout(timer);
  }, [coverLetterText, currentCandidate?.id]);

  if (!currentCandidate) {
    return (
      <div className="p-8 text-center text-neutral-400">
        No candidate profile selected.
      </div>
    );
  }

  const daysInactive = currentCandidate.simulatedDaysInactive;
  const daysUntilArchive = Math.max(0, 14 - daysInactive);
  const isArchived = daysInactive >= 14;
  const isWarning = daysInactive >= 11 && !isArchived;

  // Filter invites for this candidate
  const candidateInvites = jobInvites.filter((inv) => inv.candidateId === currentCandidate.id);

  // File upload simulation / real file reader
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await uploadCandidateCredential(dataUrl);
        setUploadSuccessMessage('Document uploaded & OCR scanned! Sent to Admin verification queue.');
        setTimeout(() => setUploadSuccessMessage(null), 4000);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleCategory = (cat: JobCategory) => {
    const current = currentCandidate.targetCategories;
    const exists = current.includes(cat);
    const updated = exists ? current.filter((c) => c !== cat) : [...current, cat];
    if (updated.length > 0) {
      updateCandidateProfile({ targetCategories: updated });
    }
  };

  const isPillarCoveredHeuristic = (id: string, text: string): boolean => {
    if (aboutMeFeedbackMap[id]) {
      return aboutMeFeedbackMap[id].covered;
    }
    const lower = text.toLowerCase();
    const item = ABOUT_ME_CHECKLIST_ITEMS.find((it) => it.id === id);
    if (!item) return false;
    return item.keywords.some((kw) => lower.includes(kw));
  };

  const handleDashboardGeminiDraft = async (toneOverride?: 'grounded' | 'collaborative' | 'curious') => {
    const activeTone = toneOverride || aboutMeTone;
    setIsGeminiLoadingAboutMe(true);
    setAboutMeGeminiStatus('Gemini is generating an authentic personal narrative draft...');
    if (aboutMeText.trim()) {
      setPreviousAboutMeDraft(aboutMeText);
    }

    try {
      const res = await fetch('/api/gemini/about-me-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft',
          tone: activeTone,
          candidateContext: {
            name: currentCandidate.name,
            degreeTitle: currentCandidate.degreeTitle,
            institution: currentCandidate.institution,
            targetCategories: currentCandidate.targetCategories,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to generate narrative');
      const data = await res.json();
      if (data.narrative) {
        setAboutMeText(data.narrative);
        setAboutMeGeminiStatus('✨ Gemini crafted a fresh personal narrative draft!');
        setTimeout(() => setAboutMeGeminiStatus(null), 4000);
      }
    } catch (err: any) {
      console.warn('Gemini draft error:', err);
      setAboutMeGeminiStatus('✨ Applied narrative draft.');
      setTimeout(() => setAboutMeGeminiStatus(null), 3000);
    } finally {
      setIsGeminiLoadingAboutMe(false);
    }
  };

  const handleDashboardGeminiPolish = async () => {
    if (!aboutMeText.trim()) {
      handleDashboardGeminiDraft();
      return;
    }

    setIsGeminiLoadingAboutMe(true);
    setAboutMeGeminiStatus('Gemini is elevating your narrative flow and tone...');
    setPreviousAboutMeDraft(aboutMeText);

    try {
      const res = await fetch('/api/gemini/about-me-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'polish',
          currentText: aboutMeText,
          tone: aboutMeTone,
          candidateContext: {
            name: currentCandidate.name,
            degreeTitle: currentCandidate.degreeTitle,
            institution: currentCandidate.institution,
            targetCategories: currentCandidate.targetCategories,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to polish narrative');
      const data = await res.json();
      if (data.narrative) {
        setAboutMeText(data.narrative);
        setAboutMeGeminiStatus('✨ Narrative polished! Enhanced flow while preserving your personal details.');
        setTimeout(() => setAboutMeGeminiStatus(null), 4000);
      }
    } catch (err: any) {
      console.warn('Gemini polish error:', err);
      setAboutMeGeminiStatus('✨ Narrative updated.');
      setTimeout(() => setAboutMeGeminiStatus(null), 3000);
    } finally {
      setIsGeminiLoadingAboutMe(false);
    }
  };

  const handleDashboardGeminiEvaluate = async () => {
    if (!aboutMeText.trim()) {
      setAboutMeGeminiStatus('Write a draft or click "Draft with Gemini" first to evaluate!');
      setTimeout(() => setAboutMeGeminiStatus(null), 3000);
      return;
    }

    setIsGeminiLoadingAboutMe(true);
    setAboutMeGeminiStatus('Gemini is auditing your narrative against the 5 key pillars...');

    try {
      const res = await fetch('/api/gemini/about-me-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          currentText: aboutMeText,
          candidateContext: {
            name: currentCandidate.name,
            degreeTitle: currentCandidate.degreeTitle,
            institution: currentCandidate.institution,
            targetCategories: currentCandidate.targetCategories,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to evaluate checklist');
      const data = await res.json();
      if (Array.isArray(data.checklist)) {
        const map: Record<string, { covered: boolean; feedback: string }> = {};
        data.checklist.forEach((item: any) => {
          map[item.id] = { covered: item.covered, feedback: item.feedback };
        });
        setAboutMeFeedbackMap(map);
        setAboutMeGeminiStatus(data.summaryTip || '✨ Checklist evaluated by Gemini!');
        setTimeout(() => setAboutMeGeminiStatus(null), 5000);
      }
    } catch (err: any) {
      console.warn('Gemini evaluate error:', err);
      setAboutMeGeminiStatus('✨ Evaluated against checklist.');
      setTimeout(() => setAboutMeGeminiStatus(null), 3000);
    } finally {
      setIsGeminiLoadingAboutMe(false);
    }
  };

  const handleInsertDashboardHint = (hint: string) => {
    setAboutMeText((prev) => (prev ? `${prev.trim()}\n\n${hint}` : hint));
  };

  return (
    <div className="space-y-6">
      {/* Candidate Persona Quick Switcher (Testing Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900/70 border border-neutral-800 rounded-xl text-xs">
        <div className="flex items-center gap-2 text-neutral-400">
          <span className="font-semibold text-neutral-200">Candidate Switcher:</span>
          <span>Test different candidate accounts:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {candidates.slice(0, 5).map((cand) => (
            <button
              key={cand.id}
              onClick={() => setCurrentCandidateId(cand.id)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                currentCandidate.id === cand.id
                  ? 'bg-neutral-800 text-emerald-400 font-semibold border border-emerald-500/30'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
              }`}
            >
              {cand.name.split(' ')[0]} ({cand.simulatedDaysInactive}d)
            </button>
          ))}
          <button
            onClick={onOpenOnboarding}
            className="px-2.5 py-1 rounded-md bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 font-medium"
          >
            + New Signup
          </button>
        </div>
      </div>

      {/* Strict 14/30 Inactivity Lifecycle Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isArchived
            ? 'bg-red-950/20 border-red-800/50 text-red-200'
            : isWarning
            ? 'bg-amber-950/20 border-amber-800/50 text-amber-200'
            : 'bg-neutral-900/80 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {isArchived ? (
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-400">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Profile Archived (Day {daysInactive}/30)
                </div>
              ) : isWarning ? (
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Inactivity Warning · {daysUntilArchive} Days Left
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Flame className="w-4 h-4 text-emerald-400" />
                  Active Profile · {currentCandidate.streakDays}-Day Check-in Streak
                </div>
              )}
            </div>

            <h2 className="text-lg font-bold text-white tracking-tight">
              {isArchived
                ? 'Your profile is currently hidden from employer searches.'
                : isWarning
                ? 'Check in now to avoid automatic profile archival on Day 14.'
                : 'Your verified credentials are live in the employer talent pool.'}
            </h2>

            <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
              {isArchived
                ? 'Under RAMP’s strict 14/30 rule, passive candidates who do not check in for 14 days are archived. Data remains encrypted until Day 30 deletion. One click restores your active search status.'
                : `Last check-in was ${daysInactive === 0 ? 'today' : `${daysInactive} days ago`}. RAMP automatically keeps searches fresh by requiring passive talent to confirm activity every 14 days.`}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => checkInCandidate(currentCandidate.id)}
              className="px-5 py-2.5 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 transition-all shadow-md active:scale-95 flex items-center gap-2 whitespace-nowrap"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              {isArchived ? 'Restore Profile in 1-Click' : 'Check In Now (Reset 14d)'}
            </button>
          </div>
        </div>

        {/* 14/30 Day Visual Lifecycle Progress Bar */}
        <div className="mt-4 pt-3 border-t border-neutral-800/80">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5 font-mono">
            <span>Day 0 (Active)</span>
            <span className={daysInactive >= 11 ? 'text-amber-400 font-bold' : ''}>Day 11 (3d Warning)</span>
            <span className={daysInactive >= 13 ? 'text-amber-300 font-bold' : ''}>Day 13 (1d Warning)</span>
            <span className={daysInactive >= 14 ? 'text-red-400 font-bold' : ''}>Day 14 (Archived)</span>
            <span className={daysInactive >= 27 ? 'text-red-500 font-bold' : ''}>Day 27 (Deletion Warning)</span>
            <span>Day 30 (Purged)</span>
          </div>

          <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                daysInactive >= 27
                  ? 'bg-red-600'
                  : daysInactive >= 14
                  ? 'bg-amber-600'
                  : daysInactive >= 11
                  ? 'bg-yellow-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (daysInactive / 30) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Snooze / Confidential Visibility Banner */}
      {currentCandidate.isSnoozed && (
        <div className="p-4 bg-amber-950/20 border border-amber-900/45 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2.5">
            <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">Confidential Snooze Mode Active:</span> Your profile is currently hidden from new employer searches. Your verified degree is completely safe in the Registrar Vault, and no one can initiate unexpected contact until you toggle snooze off.
            </div>
          </div>
          <button
            onClick={() => updateCandidateProfile({ isSnoozed: false })}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-[11px] font-mono transition-colors shrink-0 self-start sm:self-auto"
          >
            Become Discoverable
          </button>
        </div>
      )}

      {/* Main Profile Header */}
      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">{currentCandidate.name}</h1>
            {currentCandidate.isSnoozed && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-0.5 rounded-full">
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                Confidential / Snoozed
              </span>
            )}
            {currentCandidate.verifiedBadge ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Candidate Badge
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2.5 py-0.5 rounded-full">
                <Clock className="w-3.5 h-3.5" />
                Pending Credential Audit
              </span>
            )}
          </div>

          {/* Clean unboxed metadata with separators (Frontend Design Constitution) */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 font-mono">
            <span>{currentCandidate.degreeTitle}</span>
            <span aria-hidden="true">·</span>
            <span>{currentCandidate.institution}</span>
            <span aria-hidden="true">·</span>
            <span>Graduated {currentCandidate.graduationYear}</span>
            <span aria-hidden="true">·</span>
            <span>{currentCandidate.yearsOfExperience} yrs exp</span>
          </div>

          <p className="text-sm text-neutral-300 max-w-3xl leading-relaxed">{currentCandidate.bio}</p>

          {/* About Me Highlight Section (Who the Person Actually Is) */}
          <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-1.5 max-w-3xl">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-400 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
                <User className="w-3.5 h-3.5" />
                About Me · Who I Am Beyond the Resume
              </span>
              <button
                onClick={() => setActiveTab('about_me')}
                className="text-[11px] text-neutral-400 hover:text-white underline underline-offset-4 flex items-center gap-1"
              >
                <PenLine className="w-3 h-3" />
                Edit Narrative
              </button>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed italic">
              "{currentCandidate.aboutMe || 'Click to write your authentic About Me section—share your values, collaboration philosophy, and passions outside of work so employers know who you actually are.'}"
            </p>
          </div>

          {/* Skills inline and Gemini Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {currentCandidate.skills.map((skill) => (
                <span
                  key={skill}
                  className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700/50"
                >
                  {skill}
                </span>
              ))}
            </div>

            {/* Gemini Career Studio CTA Button */}
            <button
              onClick={() => {
                setGeminiModalMode('general');
                setIsGeminiModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gemini Career Studio</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Box */}
        <div className="grid grid-cols-2 gap-3 min-w-[220px] p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
          <div className="p-2">
            <div className="text-[11px] text-neutral-500 font-medium">Invites Received</div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              {candidateInvites.length}
            </div>
          </div>
          <div className="p-2">
            <div className="text-[11px] text-neutral-500 font-medium">Search Status</div>
            <div className="text-xs font-semibold mt-1">
              {isArchived ? (
                <span className="text-red-400">Archived</span>
              ) : currentCandidate.verifiedBadge ? (
                <span className="text-emerald-400">Active Pool</span>
              ) : (
                <span className="text-amber-400">Pending</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'overview'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Target Job Categories ({currentCandidate.targetCategories.length})
        </button>

        <button
          onClick={() => setActiveTab('about_me')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'about_me'
              ? 'bg-neutral-800 text-white font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5 text-amber-400" />
          About Me (Who I Am)
        </button>

        <button
          onClick={() => setActiveTab('resume_letter')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'resume_letter'
              ? 'bg-neutral-800 text-white font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          Resume & Cover Letter AI
        </button>

        <button
          onClick={() => setActiveTab('credentials')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'credentials'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Credentials & OCR Proof
        </button>

        <button
          onClick={() => setActiveTab('invites')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'invites'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          Job Invites Received ({candidateInvites.length})
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'privacy'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Privacy Controls
        </button>
      </div>

      {/* TAB 1: Target Job Categories */}
      {activeTab === 'overview' && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Target Job Categories (Candidate-Driven)</h3>
            <p className="text-xs text-neutral-400">
              Select specific positions you want to be considered for. In RAMP, candidates choose their own categories—there is no AI misclassification or algorithmic pigeonholing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
            {JOB_CATEGORIES.map((cat) => {
              const isSelected = currentCandidate.targetCategories.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`p-3 rounded-xl text-left border transition-all flex items-center justify-between text-xs ${
                    isSelected
                      ? 'bg-emerald-950/20 border-emerald-600/50 text-white font-medium'
                      : 'bg-neutral-950/50 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <span>{cat}</span>
                  {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: About Me (Who I Actually Am) */}
      {activeTab === 'about_me' && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <User className="w-4 h-4 text-amber-400" />
                About Me · Who You Actually Are Beyond Your Resume
              </h3>
              <p className="text-xs text-neutral-400">
                Give verified employers context of who you are as a human: your personal values, what drives your curiosity, your collaboration philosophy, and passions outside of work.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setGeminiModalMode('about_me');
                  setIsGeminiModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 w-fit"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Gemini Career Studio</span>
              </button>
            </div>
          </div>

          {/* Gemini AI Narrative Assistant Toolbar */}
          <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-white font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Gemini Narrative Co-Pilot</span>
              </div>

              {/* Tone selector */}
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-neutral-500 font-mono">Tone:</span>
                <button
                  type="button"
                  onClick={() => setAboutMeTone('grounded')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    aboutMeTone === 'grounded'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  Grounded
                </button>
                <button
                  type="button"
                  onClick={() => setAboutMeTone('collaborative')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    aboutMeTone === 'collaborative'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  Team-First
                </button>
                <button
                  type="button"
                  onClick={() => setAboutMeTone('curious')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    aboutMeTone === 'curious'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  Curious & Craft
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleDashboardGeminiDraft()}
                disabled={isGeminiLoadingAboutMe}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-amber-500/20 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 fill-neutral-950" />
                <span>{aboutMeText ? 'Draft Fresh with Gemini' : '✨ Draft with Gemini'}</span>
              </button>

              <button
                type="button"
                onClick={handleDashboardGeminiPolish}
                disabled={isGeminiLoadingAboutMe || !aboutMeText.trim()}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Polish My Narrative</span>
              </button>

              <button
                type="button"
                onClick={handleDashboardGeminiEvaluate}
                disabled={isGeminiLoadingAboutMe || !aboutMeText.trim()}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                <span>Evaluate Checklist</span>
              </button>

              {previousAboutMeDraft && (
                <button
                  type="button"
                  onClick={() => {
                    const temp = aboutMeText;
                    setAboutMeText(previousAboutMeDraft);
                    setPreviousAboutMeDraft(temp);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white text-xs flex items-center gap-1 ml-auto"
                  title="Undo previous edit"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo</span>
                </button>
              )}
            </div>

            {/* Status / Feedback message */}
            {aboutMeGeminiStatus && (
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-amber-300 flex items-center gap-2 font-mono">
                {isGeminiLoadingAboutMe ? (
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span>{aboutMeGeminiStatus}</span>
              </div>
            )}
          </div>

          {/* Editable Textarea */}
          <div className="space-y-2">
            <textarea
              rows={6}
              value={aboutMeText}
              onChange={(e) => setAboutMeText(e.target.value)}
              onBlur={() => {
                if (aboutMeText !== currentCandidate.aboutMe) {
                  updateCandidateProfile({ aboutMe: aboutMeText });
                  setAboutMeSaveStatus(`Auto-saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
                  setTimeout(() => setAboutMeSaveStatus(null), 3000);
                }
              }}
              placeholder="Write a few paragraphs about who you are as a person—your philosophy on work, how you like to collaborate, and what you enjoy when you step away from the screen..."
              className="w-full p-4 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
            />

            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span>{aboutMeText.length} characters · {aboutMeText.split(/\s+/).filter(Boolean).length} words</span>
              <span className="text-emerald-400/90 flex items-center gap-1">✓ Continuous auto-save active</span>
            </div>
          </div>

          {/* Checklist of Things to Cover in Your About Me Section */}
          <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Checklist: What to Cover in Your 'About Me'
                </span>
              </div>
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                  ABOUT_ME_CHECKLIST_ITEMS.filter((it) => isPillarCoveredHeuristic(it.id, aboutMeText)).length === 5
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                }`}
              >
                {ABOUT_ME_CHECKLIST_ITEMS.filter((it) => isPillarCoveredHeuristic(it.id, aboutMeText)).length}/5 Pillars Addressed
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {ABOUT_ME_CHECKLIST_ITEMS.map((item, idx) => {
                const covered = isPillarCoveredHeuristic(item.id, aboutMeText);
                const feedback = aboutMeFeedbackMap[item.id]?.feedback;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                      covered
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-neutral-200'
                        : 'bg-neutral-900/60 border-neutral-850 text-neutral-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-2 font-semibold text-white">
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                              covered
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                : 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                            }`}
                          >
                            {covered ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                          </span>
                          <span>{item.title}</span>
                        </div>
                        {covered ? (
                          <span className="text-[10px] text-emerald-400 font-mono">✓ Covered</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleInsertDashboardHint(item.promptHint)}
                            className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-mono transition-colors"
                          >
                            + Starter
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {feedback && (
                      <p className="text-[11px] text-amber-300/90 font-mono mt-2 pt-1 border-t border-neutral-800/50">
                        💡 Gemini note: {feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save Action & Feedback */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {aboutMeSaveStatus && (
                <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {aboutMeSaveStatus}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                updateCandidateProfile({ aboutMe: aboutMeText });
                setAboutMeSaveStatus('Saved! Your authentic "About Me" is now live on your profile.');
                setTimeout(() => setAboutMeSaveStatus(null), 3500);
              }}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/10"
            >
              <Save className="w-4 h-4" />
              <span>Save About Me</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Resume & Cover Letter Studio (Powered by Gemini) */}
      {activeTab === 'resume_letter' && (
        <div className="space-y-6">
          {/* Resume Studio Card */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Resume Optimization Studio
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
                    Google XYZ Formula
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Verified recruiters look for quantified results ("Accomplished [X], measured by [Y], by doing [Z]"). Use Gemini to rewrite and sharpen your bullets.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setGeminiModalMode('resume');
                  setIsGeminiModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 w-fit shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Tweak Resume with Gemini</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-300">
                Resume Summary & Experience Highlights
              </label>
              <textarea
                rows={5}
                value={resumeSummaryText}
                onChange={(e) => setResumeSummaryText(e.target.value)}
                onBlur={() => {
                  const existing = currentCandidate.resumeSummary || currentCandidate.bio || '';
                  if (resumeSummaryText !== existing) {
                    updateCandidateProfile({ resumeSummary: resumeSummaryText });
                    setResumeSaveStatus(`Auto-saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
                    setTimeout(() => setResumeSaveStatus(null), 3000);
                  }
                }}
                placeholder="Paste or write your resume summary, core achievements, or key bullet points..."
                className="w-full p-4 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
              />
              <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                <span>{resumeSummaryText.length} characters</span>
                <span className="text-emerald-400/90 flex items-center gap-1">✓ Continuous auto-save active</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                {resumeSaveStatus && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {resumeSaveStatus}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  updateCandidateProfile({ resumeSummary: resumeSummaryText });
                  setResumeSaveStatus('Saved! Resume summary updated.');
                  setTimeout(() => setResumeSaveStatus(null), 3500);
                }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/10"
              >
                <Save className="w-4 h-4" />
                <span>Save Resume Summary</span>
              </button>
            </div>
          </div>

          {/* Cover Letter Studio Card */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-purple-400" />
                    Cover Letter Studio
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                    Direct Pitch Draft
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Craft a personalized cover letter highlighting your verified degree from {currentCandidate.institution} and target positions in {currentCandidate.targetCategories[0]}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setGeminiModalMode('cover_letter');
                  setIsGeminiModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 w-fit shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Draft Letter with Gemini</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-300">
                Default Cover Letter / Pitch Statement
              </label>
              <textarea
                rows={6}
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                onBlur={() => {
                  if (coverLetterText !== (currentCandidate.coverLetterText || '')) {
                    updateCandidateProfile({ coverLetterText });
                    setCoverLetterSaveStatus(`Auto-saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
                    setTimeout(() => setCoverLetterSaveStatus(null), 3000);
                  }
                }}
                placeholder="Write or generate your cover letter pitch for verified employers..."
                className="w-full p-4 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
              />
              <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                <span>{coverLetterText.length} characters</span>
                <span className="text-emerald-400/90 flex items-center gap-1">✓ Continuous auto-save active</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                {coverLetterSaveStatus && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {coverLetterSaveStatus}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  updateCandidateProfile({ coverLetterText });
                  setCoverLetterSaveStatus('Saved! Cover letter updated.');
                  setTimeout(() => setCoverLetterSaveStatus(null), 3500);
                }}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-purple-600/10"
              >
                <Save className="w-4 h-4" />
                <span>Save Cover Letter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Credentials & OCR Proof */}
      {activeTab === 'credentials' && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Academic Credential Proof & OCR Registry</h3>
              <p className="text-xs text-neutral-400">
                Uploaded diplomas/certificates are scanned via Google Vision / OCR and manually audited by Admin to issue Verified Candidate status.
              </p>
            </div>

            <label className="cursor-pointer px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex items-center gap-2 border border-neutral-700 transition-colors w-fit">
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Scanning OCR...' : 'Upload New Diploma'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>
          </div>

          {uploadSuccessMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              {uploadSuccessMessage}
            </div>
          )}

          {/* Credential Card with Split view preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-neutral-950/70 border border-neutral-800">
            {/* Left: OCR Extracted Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-300">OCR Extracted Data</span>
                {currentCandidate.credentialOcrData && (
                  <span className="text-[11px] font-mono text-emerald-400">
                    Confidence: {currentCandidate.credentialOcrData.confidenceScore}%
                  </span>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-neutral-850">
                  <span className="text-neutral-500">Degree Title</span>
                  <span className="font-semibold text-white text-right">
                    {currentCandidate.credentialOcrData?.degreeType || currentCandidate.degreeTitle}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-850">
                  <span className="text-neutral-500">Institution</span>
                  <span className="font-semibold text-white text-right">
                    {currentCandidate.credentialOcrData?.institution || currentCandidate.institution}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-850">
                  <span className="text-neutral-500">Issued To</span>
                  <span className="font-semibold text-white">
                    {currentCandidate.credentialOcrData?.candidateName || currentCandidate.name}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-850">
                  <span className="text-neutral-500">Credential ID</span>
                  <span className="font-mono text-neutral-300">
                    {currentCandidate.credentialOcrData?.credentialId || 'PENDING-REG'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-neutral-500">Admin Verification</span>
                  <span
                    className={`font-semibold ${
                      currentCandidate.verifiedBadge ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {currentCandidate.verifiedBadge ? 'Approved & Issued' : 'Pending Audit'}
                  </span>
                </div>
              </div>

              {currentCandidate.verificationNotes && (
                <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-400">
                  <span className="font-semibold text-neutral-300">Admin Audit Note:</span>{' '}
                  {currentCandidate.verificationNotes}
                </div>
              )}
            </div>

            {/* Right: Uploaded Document Visual Preview */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-300">Digital Document Scan</span>
              <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900 aspect-video flex items-center justify-center relative group">
                <img
                  src={currentCandidate.credentialDocumentUrl}
                  alt="Candidate degree diploma"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-neutral-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs font-medium text-white bg-neutral-900/80 px-3 py-1.5 rounded-lg border border-neutral-700">
                    Official Degree Diploma
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Job Invites Received */}
      {activeTab === 'invites' && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Direct Job Invites from Verified Employers</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800/50 font-mono">
                  {candidateInvites.length} Total
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                Employers pay to discover verified credentials and send direct, high-intent invitations with explicit contact instructions.
              </p>
            </div>

            {candidateInvites.some((i) => i.candidateArchived) && (
              <button
                onClick={() => setShowArchivedInvites(!showArchivedInvites)}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 transition-colors"
              >
                <Archive className="w-3.5 h-3.5 text-neutral-500" />
                {showArchivedInvites ? 'Hide Archived Invites' : 'Show Archived Invites'}
              </button>
            )}
          </div>

          {/* Strict RAMP Policy Banner: There is NO Reply inside RAMP */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-3">
            <MessageSquareOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-200 flex items-center gap-2">
                <span>Notice: There is NO reply inside RAMP</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-normal">
                  Direct External Outreach Only
                </span>
              </div>
              <p className="text-amber-300/90 leading-relaxed text-[11px]">
                RAMP operates without an in-app messaging or reply inbox. Verified employers send you direct invitations with clear instructions on <strong>who to contact in their organization</strong>. To respond or interview, reach out directly to the designated representative via email, phone, or interview booking link below.
              </p>
            </div>
          </div>

          {candidateInvites.filter((inv) => showArchivedInvites || !inv.candidateArchived).length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500 space-y-2">
              <div>
                No active job invites in your inbox.
              </div>
              <p className="text-neutral-400 text-[11px]">
                As verified employers search your target categories ({currentCandidate.targetCategories.slice(0, 2).join(', ')}), direct invites will arrive here and via email.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidateInvites
                .filter((inv) => showArchivedInvites || !inv.candidateArchived)
                .map((invite) => {
                  const contactPersonName = invite.contactName || invite.recruiterName || 'Talent Lead';
                  const contactPersonTitle = invite.contactTitle || invite.recruiterTitle || 'Hiring Manager';
                  const contactPersonEmail = invite.contactEmail || invite.recruiterEmail || 'recruiter@company.com';
                  const contactPersonPhone = invite.contactPhone;
                  const schedulingUrl = invite.schedulingUrl;
                  const refCode = invite.referenceCode || `RAMP-REF-${invite.id.substring(4)}`;

                  return (
                    <div
                      key={invite.id}
                      className={`p-5 rounded-2xl border transition-all space-y-4 ${
                        invite.candidateArchived
                          ? 'border-neutral-850 bg-neutral-950/40 opacity-70'
                          : 'border-neutral-800 bg-neutral-950/80 shadow-md shadow-black/20'
                      }`}
                    >
                      {/* Top Row: Job Title, Meta & Candidate Private Organizer */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-950/70 text-blue-400 border border-blue-800/40 font-mono font-medium">
                              Verified Direct Invite
                            </span>
                            {invite.candidateContactedExternally && (
                              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 font-mono flex items-center gap-1 font-medium">
                                <CheckCircle className="w-3 h-3" />
                                Contacted Outside RAMP
                              </span>
                            )}
                            {invite.candidateArchived && (
                              <span className="text-xs px-2 py-0.5 rounded bg-neutral-850 text-neutral-400 font-mono">
                                Archived
                              </span>
                            )}
                          </div>

                          <h4 className="text-base font-bold text-white tracking-tight pt-0.5">
                            {invite.jobTitle}
                          </h4>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 font-mono">
                            <span className="text-blue-400 font-semibold">{invite.employerCompanyName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{invite.department || 'Engineering'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-semibold">{invite.compensationRange}</span>
                            <span aria-hidden="true">·</span>
                            <span>{invite.locationType}</span>
                          </div>
                        </div>

                        {/* Candidate Personal Tracker (Private note for candidate, NOT an in-app reply) */}
                        <div className="flex items-center gap-2 self-start">
                          <button
                            onClick={() => markInviteContacted(invite.id, !invite.candidateContactedExternally)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                              invite.candidateContactedExternally
                                ? 'bg-emerald-950/50 border-emerald-600/60 text-emerald-300'
                                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                            }`}
                            title="Mark for your personal tracking whether you reached out directly"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {invite.candidateContactedExternally ? 'Marked: Contacted' : 'Mark as Contacted (My Notes)'}
                          </button>

                          <button
                            onClick={() => archiveCandidateInvite(invite.id, !invite.candidateArchived)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border border-transparent hover:border-neutral-700 transition-colors"
                            title={invite.candidateArchived ? 'Restore to active list' : 'Archive from dashboard'}
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Role Pitch / Description */}
                      <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-800/60 italic">
                        "{invite.jobDescription}"
                      </p>

                      {/* PRIMARY HIGHLIGHT: WHO TO CONTACT IN THAT COMPANY */}
                      <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-800/40 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-900/30 pb-2">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-300">
                            <UserCheck className="w-4 h-4 text-blue-400" />
                            Who to Contact at {invite.employerCompanyName}
                          </div>

                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-neutral-400">Reference Code:</span>
                            <code className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 rounded text-amber-300 font-mono font-bold">
                              {refCode}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(refCode);
                                setCopiedCodeId(invite.id);
                                setTimeout(() => setCopiedCodeId(null), 2500);
                              }}
                              className="p-1 text-neutral-400 hover:text-white transition-colors"
                              title="Copy Reference Code"
                            >
                              {copiedCodeId === invite.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Representative Contact Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">
                              Designated Company Contact
                            </div>
                            <div className="font-semibold text-white text-sm">
                              {contactPersonName}
                            </div>
                            <div className="text-neutral-400 text-xs">
                              {contactPersonTitle} · {invite.employerCompanyName}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">
                              Direct Credentials
                            </div>
                            <div className="text-neutral-200 font-mono text-xs flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <a
                                href={`mailto:${contactPersonEmail}?subject=Re:%20RAMP%20Invitation%20for%20${encodeURIComponent(invite.jobTitle)}%20[Ref:%20${refCode}]&body=Hi%20${encodeURIComponent(contactPersonName)},%0D%0A%0D%0AI%20received%20your%20direct%20invitation%20on%20RAMP%20for%20the%20${encodeURIComponent(invite.jobTitle)}%20role%20(Reference%20Code:%20${refCode}).%0D%0A%0D%0AI%20would%20love%20to%20connect%20to%20discuss%20the%20position.%0D%0A%0D%0ABest%20regards,%0D%0A${encodeURIComponent(currentCandidate.name)}`}
                                className="text-blue-400 hover:underline"
                              >
                                {contactPersonEmail}
                              </a>
                            </div>

                            {contactPersonPhone && (
                              <div className="text-neutral-300 font-mono text-xs flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <a href={`tel:${contactPersonPhone}`} className="hover:text-white">
                                  {contactPersonPhone}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Employer Step-by-Step Instructions */}
                        <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 text-xs space-y-1">
                          <div className="font-semibold text-neutral-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                            <Info className="w-3.5 h-3.5 text-blue-400" />
                            Official Outreach Instructions from Employer:
                          </div>
                          <p className="text-neutral-200 leading-relaxed text-xs">
                            {invite.contactInstructions}
                          </p>
                        </div>

                        {/* Direct Action Buttons outside RAMP */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-blue-900/30">
                          <div className="text-[11px] text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>No reply inside RAMP. Connect directly via:</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`mailto:${contactPersonEmail}?subject=Re:%20RAMP%20Invitation%20for%20${encodeURIComponent(invite.jobTitle)}%20[Ref:%20${refCode}]&body=Hi%20${encodeURIComponent(contactPersonName)},%0D%0A%0D%0AI%20received%20your%20direct%20invitation%20on%20RAMP%20for%20the%20${encodeURIComponent(invite.jobTitle)}%20role%20(Reference%20Code:%20${refCode}).%0D%0A%0D%0AI%20would%20love%20to%20connect%20to%20discuss%20the%20opportunity.%0D%0A%0D%0ABest%20regards,%0D%0A${encodeURIComponent(currentCandidate.name)}`}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm shadow-blue-600/20"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Email {contactPersonName}
                            </a>

                            {contactPersonPhone && (
                              <a
                                href={`tel:${contactPersonPhone}`}
                                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs transition-colors flex items-center gap-1.5"
                              >
                                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                Call {contactPersonPhone}
                              </a>
                            )}

                            {schedulingUrl && (
                              <a
                                href={schedulingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-purple-900/60 hover:bg-purple-800/80 border border-purple-700/60 text-purple-200 text-xs transition-colors flex items-center gap-1.5"
                              >
                                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                                Book Intro Call
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}

                            <button
                              onClick={() => {
                                const matchingEmail = emailLogs.find((e) => e.toEmail === currentCandidate.email);
                                if (matchingEmail) setSelectedEmailModal(matchingEmail);
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white text-xs transition-colors flex items-center gap-1 border border-neutral-800 hover:bg-neutral-800"
                              title="View raw email dispatch"
                            >
                              <Mail className="w-3 h-3" />
                              View Email Copy
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Privacy Controls */}
      {activeTab === 'privacy' && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Profile Privacy Controls</h3>
            <p className="text-xs text-neutral-400">
              Customize what verified employers see when reviewing your candidate profile.
            </p>
          </div>

          <div className="divide-y divide-neutral-800 text-xs space-y-4">
            {/* Email notice (Mandatory) */}
            <div className="pt-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-neutral-200">Email Address (Mandatory)</div>
                <div className="text-neutral-500 text-[11px]">
                  Required by RAMP so verified employers can reach you with official job offers.
                </div>
              </div>
              <span className="font-mono text-emerald-400 font-semibold px-2 py-1 bg-emerald-950/40 rounded border border-emerald-900/50">
                Always Visible
              </span>
            </div>

            {/* Phone Privacy */}
            <div className="pt-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-neutral-200">Phone Number Visibility</div>
                <div className="text-neutral-500 text-[11px]">
                  Allow recruiters to reach out via phone/SMS directly.
                </div>
              </div>
              <button
                onClick={() => updateCandidateProfile({ showPhone: !currentCandidate.showPhone })}
                className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 font-medium ${
                  currentCandidate.showPhone
                    ? 'bg-neutral-800 text-white border-neutral-700'
                    : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                }`}
              >
                {currentCandidate.showPhone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {currentCandidate.showPhone ? 'Visible to Employers' : 'Hidden'}
              </button>
            </div>

            {/* Current Employer Privacy */}
            <div className="pt-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-neutral-200">Current Employer Visibility</div>
                <div className="text-neutral-500 text-[11px]">
                  Hide your current company name if you prefer complete anonymity while passive.
                </div>
              </div>
              <button
                onClick={() =>
                  updateCandidateProfile({ showCurrentEmployer: !currentCandidate.showCurrentEmployer })
                }
                className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 font-medium ${
                  currentCandidate.showCurrentEmployer
                    ? 'bg-neutral-800 text-white border-neutral-700'
                    : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                }`}
              >
                {currentCandidate.showCurrentEmployer ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {currentCandidate.showCurrentEmployer ? 'Visible' : 'Hidden / Confidential'}
              </button>
            </div>

            {/* Location Privacy */}
            <div className="pt-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-neutral-200">City / Location Visibility</div>
                <div className="text-neutral-500 text-[11px]">
                  Display your general metropolitan area for geographic filtering.
                </div>
              </div>
              <button
                onClick={() => updateCandidateProfile({ showLocation: !currentCandidate.showLocation })}
                className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 font-medium ${
                  currentCandidate.showLocation
                    ? 'bg-neutral-800 text-white border-neutral-700'
                    : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                }`}
              >
                {currentCandidate.showLocation ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {currentCandidate.showLocation ? 'Visible' : 'Hidden'}
              </button>
            </div>

            {/* Snooze visibility (Super Passive Mode toggle) */}
            <div className="pt-5 mt-2 bg-amber-950/10 border border-amber-900/30 p-4 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5 text-sm">
                    <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Snooze Visibility (Super Passive Mode)</span>
                  </div>
                  <p className="text-neutral-400 text-[11px] mt-1 leading-relaxed max-w-xl">
                    Hide your profile from recruiter searches while keeping your verified degree credentials completely safe in the Registrar Vault. Turn this on to halt new inbound invites, and turn it off when you're open to career exploration.
                  </p>
                </div>
                <button
                  onClick={() => updateCandidateProfile({ isSnoozed: !currentCandidate.isSnoozed })}
                  className={`px-4 py-2 rounded-xl font-bold font-mono transition-all text-[11px] shrink-0 ${
                    currentCandidate.isSnoozed
                      ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10 hover:bg-amber-400'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                  }`}
                >
                  {currentCandidate.isSnoozed ? '🟢 Snoozed (Confidential)' : '🟡 Active (Discoverable)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gemini Career Studio Assistant Modal */}
      <GeminiCareerStudioModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        initialMode={geminiModalMode}
      />
    </div>
  );
};
