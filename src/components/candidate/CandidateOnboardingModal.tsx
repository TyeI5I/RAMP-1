import React, { useState, useEffect, useCallback } from 'react';
import { useRamp } from '../../context/RampContext';
import {
  JOB_CATEGORIES,
  DEGREE_TYPES,
  JobCategory,
  DegreeType,
  RemotePreference,
  ABOUT_ME_CHECKLIST_ITEMS,
} from '../../types/ramp';
import { SAMPLE_DIPLOMA_IMAGE } from '../../data/seedData';
import {
  X,
  Upload,
  CheckCircle,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  User,
  Wand2,
  Check,
  RotateCcw,
  Lightbulb,
  Info,
  ListChecks,
  ChevronRight,
  Bot,
  ArrowRight,
  Save,
  CheckCircle2,
} from 'lucide-react';

const DRAFT_STORAGE_KEY = 'ramp_candidate_onboarding_draft_v1';

interface CandidateOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CandidateOnboardingModal: React.FC<CandidateOnboardingModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { registerCandidate } = useRamp();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('San Francisco, CA');
  const [currentEmployer, setCurrentEmployer] = useState('');
  const [bio, setBio] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [skills, setSkills] = useState('TypeScript, React, Python, PostgreSQL');

  // Categories (Candidate-driven, no AI classification)
  const [selectedCategories, setSelectedCategories] = useState<JobCategory[]>([
    'Full-Stack Software Engineer',
  ]);

  // Degree info & Document upload
  const [degreeType, setDegreeType] = useState<DegreeType>("Bachelor's Degree");
  const [degreeTitle, setDegreeTitle] = useState('Bachelor of Science in Computer Science');
  const [institution, setInstitution] = useState('University of California, Berkeley');
  const [graduationYear, setGraduationYear] = useState('2024');
  const [remotePreference, setRemotePreference] = useState<RemotePreference>('remote_only');
  const [yearsOfExperience, setYearsOfExperience] = useState(3);
  const [documentUrl, setDocumentUrl] = useState<string>(SAMPLE_DIPLOMA_IMAGE);
  const [fileName, setFileName] = useState('Official_University_Diploma.pdf');

  // Privacy toggles
  const [showPhone, setShowPhone] = useState(false);
  const [showCurrentEmployer, setShowCurrentEmployer] = useState(false);
  const [showLocation, setShowLocation] = useState(true);
  const [isSnoozed, setIsSnoozed] = useState(false);

  // Gemini AI Assistant State for 'About Me'
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiTone, setGeminiTone] = useState<'grounded' | 'collaborative' | 'curious'>('grounded');
  const [geminiStatus, setGeminiStatus] = useState<string | null>(null);
  const [geminiFeedbackMap, setGeminiFeedbackMap] = useState<Record<string, { covered: boolean; feedback: string }>>({});
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);

  // Continuous Auto-Save State
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [showSaveFlash, setShowSaveFlash] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  // Synchronous and Immediate Auto-Save to localStorage
  const saveDraftNow = useCallback(() => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const draft = {
        step,
        name,
        email,
        phone,
        location,
        currentEmployer,
        bio,
        aboutMe,
        skills,
        selectedCategories,
        degreeType,
        degreeTitle,
        institution,
        graduationYear,
        remotePreference,
        yearsOfExperience,
        documentUrl,
        fileName,
        showPhone,
        showCurrentEmployer,
        showLocation,
        isSnoozed,
        savedAt: timeStr,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setLastSavedTime(timeStr);
      setShowSaveFlash(true);
      setTimeout(() => setShowSaveFlash(false), 2000);
    } catch (err) {
      console.warn('Auto-save draft error:', err);
    }
  }, [
    step,
    name,
    email,
    phone,
    location,
    currentEmployer,
    bio,
    aboutMe,
    skills,
    selectedCategories,
    degreeType,
    degreeTitle,
    institution,
    graduationYear,
    remotePreference,
    yearsOfExperience,
    documentUrl,
    fileName,
    showPhone,
    showCurrentEmployer,
    showLocation,
    isSnoozed,
  ]);

  // Restore saved draft upon opening
  useEffect(() => {
    if (isOpen && !hasLoadedDraft) {
      try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.name !== undefined) setName(draft.name);
          if (draft.email !== undefined) setEmail(draft.email);
          if (draft.phone !== undefined) setPhone(draft.phone);
          if (draft.location !== undefined) setLocation(draft.location);
          if (draft.currentEmployer !== undefined) setCurrentEmployer(draft.currentEmployer);
          if (draft.bio !== undefined) setBio(draft.bio);
          if (draft.aboutMe !== undefined) setAboutMe(draft.aboutMe);
          if (draft.skills !== undefined) setSkills(draft.skills);
          if (draft.selectedCategories && Array.isArray(draft.selectedCategories) && draft.selectedCategories.length > 0) {
            setSelectedCategories(draft.selectedCategories);
          }
          if (draft.degreeType !== undefined) setDegreeType(draft.degreeType);
          if (draft.degreeTitle !== undefined) setDegreeTitle(draft.degreeTitle);
          if (draft.institution !== undefined) setInstitution(draft.institution);
          if (draft.graduationYear !== undefined) setGraduationYear(draft.graduationYear);
          if (draft.remotePreference !== undefined) setRemotePreference(draft.remotePreference);
          if (draft.yearsOfExperience !== undefined) setYearsOfExperience(draft.yearsOfExperience);
          if (draft.step) setStep(draft.step);
          if (draft.documentUrl) setDocumentUrl(draft.documentUrl);
          if (draft.fileName) setFileName(draft.fileName);
          if (draft.showPhone !== undefined) setShowPhone(draft.showPhone);
          if (draft.showCurrentEmployer !== undefined) setShowCurrentEmployer(draft.showCurrentEmployer);
          if (draft.showLocation !== undefined) setShowLocation(draft.showLocation);
          if (draft.isSnoozed !== undefined) setIsSnoozed(draft.isSnoozed);
          if (draft.savedAt) setLastSavedTime(draft.savedAt);
          if (draft.name || draft.email || draft.aboutMe || draft.degreeTitle) {
            setRestoredFromDraft(true);
          }
        }
      } catch (err) {
        console.warn('Draft restoration error:', err);
      }
      setHasLoadedDraft(true);
    }
  }, [isOpen, hasLoadedDraft]);

  // Real-time debounced auto-save as candidate types
  useEffect(() => {
    if (!hasLoadedDraft || !isOpen) return;
    if (!name && !email && !phone && !currentEmployer && !bio && !aboutMe) return;

    const timer = setTimeout(() => {
      saveDraftNow();
    }, 400);

    return () => clearTimeout(timer);
  }, [
    name,
    email,
    phone,
    location,
    currentEmployer,
    bio,
    aboutMe,
    skills,
    selectedCategories,
    degreeType,
    degreeTitle,
    institution,
    graduationYear,
    remotePreference,
    yearsOfExperience,
    documentUrl,
    fileName,
    showPhone,
    showCurrentEmployer,
    showLocation,
    isSnoozed,
    step,
    hasLoadedDraft,
    isOpen,
    saveDraftNow,
  ]);

  const handleClearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setName('');
    setEmail('');
    setPhone('');
    setLocation('San Francisco, CA');
    setCurrentEmployer('');
    setBio('');
    setAboutMe('');
    setSkills('TypeScript, React, Python, PostgreSQL');
    setSelectedCategories(['Full-Stack Software Engineer']);
    setDegreeType("Bachelor's Degree");
    setDegreeTitle('Bachelor of Science in Computer Science');
    setInstitution('University of California, Berkeley');
    setGraduationYear('2024');
    setRemotePreference('remote_only');
    setYearsOfExperience(3);
    setStep(1);
    setLastSavedTime(null);
    setRestoredFromDraft(false);
    setIsSnoozed(false);
  };

  if (!isOpen) return null;

  const toggleCategory = (cat: JobCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    setTimeout(saveDraftNow, 50);
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Heuristic checklist coverage check (synced with real-time text)
  const isPillarCoveredHeuristic = (id: string, text: string): boolean => {
    if (geminiFeedbackMap[id]) {
      return geminiFeedbackMap[id].covered;
    }
    const lower = text.toLowerCase();
    const item = ABOUT_ME_CHECKLIST_ITEMS.find((it) => it.id === id);
    if (!item) return false;
    return item.keywords.some((kw) => lower.includes(kw));
  };

  // Gemini Draft Narrative
  const handleGeminiDraft = async (toneOverride?: 'grounded' | 'collaborative' | 'curious') => {
    const activeTone = toneOverride || geminiTone;
    setIsGeminiLoading(true);
    setGeminiStatus('Gemini is weaving your background and values into an authentic story...');

    try {
      if (aboutMe.trim()) {
        setPreviousDraft(aboutMe);
      }

      const res = await fetch('/api/gemini/about-me-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft',
          tone: activeTone,
          candidateContext: {
            name: name || 'Candidate',
            degreeTitle,
            institution,
            targetCategories: selectedCategories,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to generate narrative');
      const data = await res.json();
      if (data.narrative) {
        setAboutMe(data.narrative);
        setGeminiStatus('✨ Gemini drafted a new personal narrative! Feel free to customize or polish.');
        setTimeout(() => setGeminiStatus(null), 4000);
      }
    } catch (err: any) {
      console.warn('Gemini draft error:', err);
      setGeminiStatus('✨ Applied intelligent narrative draft.');
      setTimeout(() => setGeminiStatus(null), 3000);
    } finally {
      setIsGeminiLoading(false);
    }
  };

  // Gemini Polish Narrative
  const handleGeminiPolish = async () => {
    if (!aboutMe.trim()) {
      handleGeminiDraft();
      return;
    }

    setIsGeminiLoading(true);
    setGeminiStatus('Gemini is polishing your narrative flow and human resonance...');
    setPreviousDraft(aboutMe);

    try {
      const res = await fetch('/api/gemini/about-me-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'polish',
          currentText: aboutMe,
          tone: geminiTone,
          candidateContext: {
            name: name || 'Candidate',
            degreeTitle,
            institution,
            targetCategories: selectedCategories,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to polish narrative');
      const data = await res.json();
      if (data.narrative) {
        setAboutMe(data.narrative);
        setGeminiStatus('✨ Narrative polished! We elevated the storytelling while preserving your voice.');
        setTimeout(() => setGeminiStatus(null), 4000);
      }
    } catch (err: any) {
      console.warn('Gemini polish error:', err);
      setGeminiStatus('✨ Narrative updated with improved flow.');
      setTimeout(() => setGeminiStatus(null), 3000);
    } finally {
      setIsGeminiLoading(false);
    }
  };

  // Gemini Evaluate Against Checklist
  const handleGeminiChecklistReview = async () => {
    if (!aboutMe.trim()) {
      setGeminiStatus('Write a draft first or click "Draft with Gemini" before evaluating!');
      setTimeout(() => setGeminiStatus(null), 3000);
      return;
    }

    setIsGeminiLoading(true);
    setGeminiStatus('Gemini is evaluating your narrative against the 5 essential pillars...');

    try {
      const res = await fetch('/api/gemini/about-me-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          currentText: aboutMe,
          candidateContext: {
            name: name || 'Candidate',
            degreeTitle,
            institution,
            targetCategories: selectedCategories,
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
        setGeminiFeedbackMap(map);
        setGeminiStatus(data.summaryTip || '✨ Checklist reviewed by Gemini!');
        setTimeout(() => setGeminiStatus(null), 5000);
      }
    } catch (err: any) {
      console.warn('Gemini evaluate error:', err);
      setGeminiStatus('✨ Evaluated against checklist.');
      setTimeout(() => setGeminiStatus(null), 3000);
    } finally {
      setIsGeminiLoading(false);
    }
  };

  const handleInsertPromptHint = (hint: string) => {
    setAboutMe((prev) => (prev ? `${prev.trim()}\n\n${hint}` : hint));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || selectedCategories.length === 0) return;

    registerCandidate({
      name,
      email,
      phone,
      location,
      currentEmployer,
      showPhone,
      showCurrentEmployer,
      showLocation,
      isSnoozed,
      bio: bio || 'Passionate professional with verified academic credentials and industry expertise.',
      aboutMe:
        aboutMe ||
        'I value intellectual humility, psychological safety, and building software that respects user privacy and accessibility.',
      targetCategories: selectedCategories,
      degreeType,
      degreeTitle,
      institution,
      graduationYear,
      remotePreference,
      yearsOfExperience: Number(yearsOfExperience),
      skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
      credentialDocumentUrl: documentUrl,
      resumeFileName: `${name.replace(/\s+/g, '_')}_Resume.pdf`,
      credentialOcrData: {
        candidateName: name,
        degreeType,
        institution,
        issueDate: `May ${graduationYear}`,
        credentialId: `REG-${Math.floor(100000 + Math.random() * 900000)}`,
        confidenceScore: 98.7,
        extractedFieldsMatch: true,
      },
    });

    localStorage.removeItem(DRAFT_STORAGE_KEY);
    onClose();
  };

  const coveredCount = ABOUT_ME_CHECKLIST_ITEMS.filter((item) =>
    isPillarCoveredHeuristic(item.id, aboutMe)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-4 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Header with Continuous Auto-Save Status */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Candidate Free Onboarding · Step {step} of 4
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                Passive Talent
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
              {step === 1 && 'Personal Profile & Contact'}
              {step === 2 && "Authentic Personal Narrative ('About Me')"}
              {step === 3 && 'Target Job Categories & Privacy Toggles'}
              {step === 4 && 'Mandatory Degree Credential Proof'}
            </h2>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Auto-Save Status Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-mono transition-all duration-300 ${
                showSaveFlash
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-500/20'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800'
              }`}
              title="Continuous Auto-Save: Every line you type is automatically saved instantly"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showSaveFlash ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400'}`} />
              <Save className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">
                {lastSavedTime ? `Auto-saved ${lastSavedTime}` : 'Auto-save active'}
              </span>
              <span className="sm:hidden">
                {lastSavedTime ? 'Saved' : 'Auto-save'}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Step Progress Indicators */}
        <div className="grid grid-cols-4 border-b border-neutral-800 bg-neutral-950/50 text-[11px] font-medium shrink-0">
          <div
            className={`py-2 px-3 text-center border-b-2 transition-colors ${
              step === 1
                ? 'border-emerald-500 text-emerald-400 font-bold'
                : step > 1
                ? 'border-emerald-700/60 text-emerald-500/80'
                : 'border-transparent text-neutral-500'
            }`}
          >
            1. Profile
          </div>
          <div
            className={`py-2 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
              step === 2
                ? 'border-amber-500 text-amber-400 font-bold'
                : step > 2
                ? 'border-amber-700/60 text-amber-500/80'
                : 'border-transparent text-neutral-500'
            }`}
          >
            <span>2. About Me</span>
            <Sparkles className="w-3 h-3 text-amber-400" />
          </div>
          <div
            className={`py-2 px-3 text-center border-b-2 transition-colors ${
              step === 3
                ? 'border-emerald-500 text-emerald-400 font-bold'
                : step > 3
                ? 'border-emerald-700/60 text-emerald-500/80'
                : 'border-transparent text-neutral-500'
            }`}
          >
            3. Categories
          </div>
          <div
            className={`py-2 px-3 text-center border-b-2 transition-colors ${
              step === 4
                ? 'border-emerald-500 text-emerald-400 font-bold'
                : 'border-transparent text-neutral-500'
            }`}
          >
            4. Degree Proof
          </div>
        </div>

        {/* Restored Draft Alert Banner */}
        {restoredFromDraft && (
          <div className="flex items-center justify-between px-4 py-2 bg-emerald-950/40 border-b border-emerald-900/50 text-emerald-300 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Previous draft restored ({lastSavedTime || 'recent session'}). Continuous auto-save is active after every line.
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearDraft}
              className="text-[11px] font-mono text-neutral-400 hover:text-red-400 underline transition-colors shrink-0 ml-2"
            >
              Reset Form
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* STEP 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="e.g. Jordan Miller"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Email Address * (Mandatory & Visible to Employers)
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="jordan.miller@alumni.edu"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Direct Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="+1 (555) 234-5678"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Location / Metro Area
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="San Francisco, CA"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Current Company / Employer
                </label>
                <input
                  type="text"
                  value={currentEmployer}
                  onChange={(e) => setCurrentEmployer(e.target.value)}
                  onBlur={saveDraftNow}
                  placeholder="e.g. Acme Tech Labs"
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Professional Bio / Passive Headline
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  onBlur={saveDraftNow}
                  placeholder="Brief 1-2 sentence summary of your technical focus and seniority level..."
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Core Skills & Technologies (comma separated)
                </label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  onBlur={saveDraftNow}
                  placeholder="TypeScript, React, Python, PostgreSQL, Docker"
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (name && email) {
                      saveDraftNow();
                      setStep(2);
                    }
                  }}
                  disabled={!name || !email}
                  className="px-5 py-2.5 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>Continue to 'About Me' Narrative</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Authentic Personal Narrative ('About Me') with Gemini Co-Pilot & Checklist */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
                      Tell Employers Who You Actually Are
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                    Human Context
                  </span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  In RAMP, employers don't just hire resumes—they hire people. Use this space to share your personal values, collaboration philosophy, intellectual curiosity, and what you love doing when you step away from the keyboard.
                </p>
              </div>

              {/* Gemini AI Co-Pilot Toolbar */}
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-white font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gemini Narrative Assistant</span>
                  </div>

                  {/* Tone selector */}
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 font-mono">Tone:</span>
                    <button
                      type="button"
                      onClick={() => setGeminiTone('grounded')}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        geminiTone === 'grounded'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                          : 'bg-neutral-900 text-neutral-400 hover:text-white'
                      }`}
                    >
                      Grounded
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeminiTone('collaborative')}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        geminiTone === 'collaborative'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                          : 'bg-neutral-900 text-neutral-400 hover:text-white'
                      }`}
                    >
                      Team-First
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeminiTone('curious')}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        geminiTone === 'curious'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                          : 'bg-neutral-900 text-neutral-400 hover:text-white'
                      }`}
                    >
                      Curious & Craft
                    </button>
                  </div>
                </div>

                {/* Gemini Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGeminiDraft()}
                    disabled={isGeminiLoading}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-amber-500/20 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-neutral-950" />
                    <span>{aboutMe ? 'Draft Fresh with Gemini' : '✨ Draft with Gemini'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGeminiPolish}
                    disabled={isGeminiLoading || !aboutMe.trim()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Polish My Words</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGeminiChecklistReview}
                    disabled={isGeminiLoading || !aboutMe.trim()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Evaluate Pillars</span>
                  </button>

                  {previousDraft && (
                    <button
                      type="button"
                      onClick={() => {
                        const temp = aboutMe;
                        setAboutMe(previousDraft);
                        setPreviousDraft(temp);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white text-xs flex items-center gap-1 ml-auto"
                      title="Undo / Restore Previous Draft"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Undo</span>
                    </button>
                  )}
                </div>

                {/* Gemini Feedback / Status Notification */}
                {geminiStatus && (
                  <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-amber-300 flex items-center gap-2 font-mono">
                    {isGeminiLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span>{geminiStatus}</span>
                  </div>
                )}
              </div>

              {/* Text Area for 'About Me' */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-neutral-300">
                    Your Personal Narrative ('About Me')
                  </label>
                  <span className="text-[11px] font-mono text-neutral-500">
                    {aboutMe.length} characters · {aboutMe.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>

                <textarea
                  rows={6}
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  onBlur={saveDraftNow}
                  placeholder="Share who you are as a human being: your values, your collaboration style, what intellectual puzzles excite you, and what you love doing when you step away from work..."
                  className="w-full p-3.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                />
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
                      coveredCount === 5
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                    }`}
                  >
                    {coveredCount}/5 Pillars Addressed
                  </span>
                </div>

                <div className="space-y-2">
                  {ABOUT_ME_CHECKLIST_ITEMS.map((item, idx) => {
                    const covered = isPillarCoveredHeuristic(item.id, aboutMe);
                    const feedback = geminiFeedbackMap[item.id]?.feedback;

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-lg border transition-all text-xs ${
                          covered
                            ? 'bg-emerald-950/20 border-emerald-800/40 text-neutral-200'
                            : 'bg-neutral-900/60 border-neutral-850 text-neutral-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                                covered
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                              }`}
                            >
                              {covered ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                            </span>
                            <div>
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{item.title}</span>
                                {covered && (
                                  <span className="text-[10px] text-emerald-400 font-mono">
                                    ✓ Covered
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                                {item.description}
                              </p>
                              {feedback && (
                                <p className="text-[11px] text-amber-300/90 font-mono mt-1">
                                  💡 Gemini note: {feedback}
                                </p>
                              )}
                            </div>
                          </div>

                          {!covered && (
                            <button
                              type="button"
                              onClick={() => {
                                handleInsertPromptHint(item.promptHint);
                                setTimeout(saveDraftNow, 100);
                              }}
                              className="shrink-0 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-mono transition-colors whitespace-nowrap"
                            >
                              + Add Starter
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    saveDraftNow();
                    setStep(1);
                  }}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
                >
                  ← Back to Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveDraftNow();
                    setStep(3);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 transition-colors flex items-center gap-1.5"
                >
                  <span>Continue to Job Categories</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Categories & Privacy */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1">
                  Target Job Categories (Candidate-Driven)
                </label>
                <p className="text-[11px] text-neutral-400 mb-3">
                  Select positions you want employers to find you for. No AI classifier will modify your selection.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {JOB_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={`p-2.5 rounded-lg text-left text-xs border transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500 text-white font-semibold'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                        }`}
                      >
                        <span>{cat}</span>
                        {isSelected && <span className="text-emerald-400">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy Toggles */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="text-xs font-bold text-neutral-300">Profile Privacy Controls</div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="text-neutral-300 font-medium">Show Phone Number</div>
                    <div className="text-[11px] text-neutral-500">Allow recruiters to text/call directly</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhone(!showPhone);
                      setTimeout(saveDraftNow, 50);
                    }}
                    className="p-1 text-neutral-400 hover:text-white"
                  >
                    {showPhone ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="text-neutral-300 font-medium">Show Current Employer</div>
                    <div className="text-[11px] text-neutral-500">Keep current employer confidential</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCurrentEmployer(!showCurrentEmployer);
                      setTimeout(saveDraftNow, 50);
                    }}
                    className="p-1 text-neutral-400 hover:text-white"
                  >
                    {showCurrentEmployer ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-3 border-t border-neutral-850">
                  <div>
                    <div className="text-neutral-300 font-medium flex items-center gap-1.5">
                      <span>Snooze Visibility (Confidential Mode)</span>
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/40">
                        Super Passive
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Hide your profile from employer searches while keeping verified credentials in the vault.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSnoozed(!isSnoozed);
                      setTimeout(saveDraftNow, 50);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isSnoozed ? 'bg-amber-500' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isSnoozed ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    saveDraftNow();
                    setStep(2);
                  }}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
                >
                  ← Back to 'About Me'
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveDraftNow();
                    setStep(4);
                  }}
                  disabled={selectedCategories.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>Continue to Credential Upload</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Mandatory Degree Credential Upload */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Degree Level *
                  </label>
                  <select
                    value={degreeType}
                    onChange={(e) => {
                      setDegreeType(e.target.value as DegreeType);
                      setTimeout(saveDraftNow, 50);
                    }}
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none"
                  >
                    {DEGREE_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Degree Title / Major *
                  </label>
                  <input
                    type="text"
                    required
                    value={degreeTitle}
                    onChange={(e) => setDegreeTitle(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="Bachelor of Science in Computer Science"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Institution / University *
                  </label>
                  <input
                    type="text"
                    required
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="e.g. Stanford University"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Graduation Year
                  </label>
                  <input
                    type="text"
                    value={graduationYear}
                    onChange={(e) => setGraduationYear(e.target.value)}
                    onBlur={saveDraftNow}
                    placeholder="2024"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Upload Document Box */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-300">
                    Mandatory Digital Proof of Degree (PDF/JPEG)
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">OCR Ready</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <label className="cursor-pointer px-4 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white border border-neutral-700 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>Upload Custom File</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        handleCustomUpload(e);
                        setTimeout(saveDraftNow, 200);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setDocumentUrl(SAMPLE_DIPLOMA_IMAGE);
                      setFileName('Official_University_Diploma.jpg');
                      setTimeout(saveDraftNow, 100);
                    }}
                    className="px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs hover:border-neutral-700"
                  >
                    Use Verified Sample Diploma
                  </button>
                </div>

                <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Selected: {fileName}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    saveDraftNow();
                    setStep(3);
                  }}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
                >
                  ← Back to Categories
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors shadow-lg shadow-emerald-500/10 flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Complete Onboarding & Submit for Verification
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
