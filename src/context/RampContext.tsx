import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import {
  CandidateProfile,
  EmployerProfile,
  JobInvite,
  PushNotification,
  EmailLog,
  UserRole,
  JobCategory,
  DegreeType,
  RemotePreference,
  SubscriptionTier,
  BillingCadence,
  CredentialOcrData,
} from '../types/ramp';
import {
  INITIAL_CANDIDATES,
  INITIAL_EMPLOYERS,
  INITIAL_JOB_INVITES,
  INITIAL_NOTIFICATIONS,
  INITIAL_EMAILS,
  SAMPLE_DIPLOMA_IMAGE,
} from '../data/seedData';
import { calculateLifecycleStatus, generateNotificationForLifecycle } from '../utils/lifecycle';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface RampContextType {
  isDemoMode: boolean;
  authSession: Session | null;
  authReady: boolean;
  marketplaceReady: boolean;
  hasMarketplaceProfile: boolean;
  marketplaceError: string | null;
  clearMarketplaceError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: 'candidate' | 'employer') => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMarketplace: () => Promise<void>;
  startPersonaVerification: (type: 'identity' | 'employer') => Promise<string>;

  // Active Persona
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  currentCandidateId: string;
  setCurrentCandidateId: (id: string) => void;
  currentEmployerId: string;
  setCurrentEmployerId: (id: string) => void;

  // Data Collections
  candidates: CandidateProfile[];
  employers: EmployerProfile[];
  jobInvites: JobInvite[];
  notifications: PushNotification[];
  emailLogs: EmailLog[];

  // Active User Objects
  currentCandidate: CandidateProfile | null;
  currentEmployer: EmployerProfile | null;

  // Candidate Actions
  checkInCandidate: (candidateId?: string) => void;
  updateCandidateProfile: (updated: Partial<CandidateProfile>) => void;
  uploadCandidateCredential: (
    fileDataUrl: string,
    extractedData?: Partial<CredentialOcrData>
  ) => Promise<CredentialOcrData | undefined>;
  registerCandidate: (data: Partial<CandidateProfile>) => CandidateProfile;

  // Employer Actions
  registerEmployer: (data: Partial<EmployerProfile>) => EmployerProfile;
  updateEmployerProfile: (updated: Partial<EmployerProfile>) => void;
  activateSubscription: (
    tier: SubscriptionTier,
    cadence: BillingCadence,
    activeUntil: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    alertCategories?: JobCategory[]
  ) => void;
  deactivateSubscription: () => void;
  sendJobInvite: (inviteData: Omit<JobInvite, 'id' | 'sentAt' | 'viewedByCandidate'>) => JobInvite;
  respondToInvite: (inviteId: string, status: 'accepted' | 'declined') => void;
  markInviteContacted: (inviteId: string, contacted: boolean) => void;
  archiveCandidateInvite: (inviteId: string, archived: boolean) => void;

  // Admin Actions
  verifyCandidateCredential: (candidateId: string, approved: boolean, notes?: string) => void;
  verifyEmployerBusiness: (employerId: string, approved: boolean, reason?: string) => void;
  sendAdminEmailToCandidate: (candidateId: string, subject: string, bodyText: string) => void;

  // Strict 14/30 Lifecycle Simulator
  simulateInactivityDays: (candidateId: string, days: number) => void;
  resetAllSeedData: () => void;

  // Notification & Email Helpers
  markNotificationAsRead: (notificationId: string) => void;
  unreadNotificationCount: number;

  // UI state
  mobilePreviewMode: boolean;
  setMobilePreviewMode: (val: boolean) => void;
  selectedEmailModal: EmailLog | null;
  setSelectedEmailModal: (email: EmailLog | null) => void;
  selectedCandidateForInvite: CandidateProfile | null;
  setSelectedCandidateForInvite: (cand: CandidateProfile | null) => void;
}

const RampContext = createContext<RampContextType | null>(null);

const STORAGE_KEY_PREFIX = 'ramp_platform_v2_';

export const RampProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isDemoMode = import.meta.env.DEV;
  // Initialize state from localStorage or seeds
  const [candidates, setCandidates] = useState<CandidateProfile[]>(() => {
    if (!isDemoMode) return [];
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}candidates`);
      const parsed = stored ? JSON.parse(stored) : INITIAL_CANDIDATES;
      return parsed.map((c: any) => ({
        ...c,
        isSnoozed: c.isSnoozed !== undefined ? c.isSnoozed : false,
      }));
    } catch {
      return INITIAL_CANDIDATES.map((c: any) => ({
        ...c,
        isSnoozed: false,
      }));
    }
  });

  const [employers, setEmployers] = useState<EmployerProfile[]>(() => {
    if (!isDemoMode) return [];
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}employers`);
      return stored ? JSON.parse(stored) : INITIAL_EMPLOYERS;
    } catch {
      return INITIAL_EMPLOYERS;
    }
  });

  const [jobInvites, setJobInvites] = useState<JobInvite[]>(() => {
    if (!isDemoMode) return [];
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}invites`);
      return stored ? JSON.parse(stored) : INITIAL_JOB_INVITES;
    } catch {
      return INITIAL_JOB_INVITES;
    }
  });

  const [notifications, setNotifications] = useState<PushNotification[]>(() => {
    if (!isDemoMode) return [];
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}notifications`);
      return stored ? JSON.parse(stored) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  });

  const [emailLogs, setEmailLogs] = useState<EmailLog[]>(() => {
    if (!isDemoMode) return [];
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}emails`);
      return stored ? JSON.parse(stored) : INITIAL_EMAILS;
    } catch {
      return INITIAL_EMAILS;
    }
  });

  // Current session persona
  const [currentRole, setCurrentRoleState] = useState<UserRole>('employer');
  const [currentCandidateId, setCurrentCandidateId] = useState<string>('cand-001');
  const [currentEmployerId, setCurrentEmployerId] = useState<string>('emp-001');
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(isDemoMode);
  const [marketplaceReady, setMarketplaceReady] = useState(isDemoMode);
  const [hasMarketplaceProfile, setHasMarketplaceProfile] = useState(isDemoMode);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);

  // UI state
  const [mobilePreviewMode, setMobilePreviewMode] = useState<boolean>(false);
  const [selectedEmailModal, setSelectedEmailModal] = useState<EmailLog | null>(null);
  const [selectedCandidateForInvite, setSelectedCandidateForInvite] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    if (isDemoMode) return;
    if (!supabase) {
      setAuthReady(true);
      setMarketplaceReady(true);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMarketplaceError(error.message);
      setAuthSession(data.session);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isDemoMode]);

  const loadMarketplaceState = async (session: Session) => {
    const response = await fetch('/api/marketplace/state', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload: unknown = await response.json();
    if (response.status === 409) {
      setCandidates([]);
      setEmployers([]);
      setJobInvites([]);
      setNotifications([]);
      setEmailLogs([]);
      setHasMarketplaceProfile(false);
      const metadataRole = session.user.user_metadata?.account_role;
      if (metadataRole === 'candidate' || metadataRole === 'employer') {
        setCurrentRoleState(metadataRole);
      }
      return;
    }
    if (!response.ok || typeof payload !== 'object' || payload === null) {
      const message =
        typeof payload === 'object' && payload !== null && 'error' in payload &&
        typeof payload.error === 'string'
          ? payload.error
          : 'Unable to load marketplace data.';
      throw new Error(message);
    }
    const state = payload as {
      role: UserRole;
      userId: string;
      candidates: CandidateProfile[];
      employers: EmployerProfile[];
      jobInvites: JobInvite[];
      notifications: PushNotification[];
      emailLogs: EmailLog[];
    };
    setCurrentRoleState(state.role);
    setCurrentCandidateId(state.userId);
    setCurrentEmployerId(state.userId);
    setCandidates(state.candidates);
    setEmployers(state.employers);
    setJobInvites(state.jobInvites);
    setNotifications(state.notifications);
    setEmailLogs(state.emailLogs);
    setHasMarketplaceProfile(true);
  };

  useEffect(() => {
    if (isDemoMode || !authReady) return;
    if (!authSession) {
      setCandidates([]);
      setEmployers([]);
      setJobInvites([]);
      setNotifications([]);
      setEmailLogs([]);
      setHasMarketplaceProfile(false);
      setMarketplaceReady(true);
      setCurrentRole('employer');
      setMarketplaceError(null);
      return;
    }

    let active = true;
    setMarketplaceReady(false);
    void loadMarketplaceState(authSession)
      .catch((error: unknown) => {
        if (active) {
          setMarketplaceError(
            error instanceof Error ? error.message : 'Unable to load marketplace data.'
          );
        }
      })
      .finally(() => {
        if (active) setMarketplaceReady(true);
      });
    return () => {
      active = false;
    };
  }, [isDemoMode, authReady, authSession?.access_token]);

  useEffect(() => {
    if (isDemoMode || !authSession) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('verification') !== 'complete') return;
    url.searchParams.delete('verification');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    void loadMarketplaceState(authSession).catch((error: unknown) =>
      setMarketplaceError(error instanceof Error ? error.message : 'Unable to refresh verification status.')
    );
  }, [isDemoMode, authSession?.access_token]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, role: 'candidate' | 'employer') => {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { account_role: role } },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error('Check your email to confirm your account, then sign in to continue.');
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('type');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const refreshMarketplace = async () => {
    if (!authSession) return;
    await loadMarketplaceState(authSession);
  };

  const setCurrentRole = (role: UserRole) => {
    if (isDemoMode) {
      setCurrentRoleState(role);
      return;
    }
    if (role !== currentRole) {
      setMarketplaceError('Your account role cannot be changed.');
    }
  };
  const setCurrentCandidate = (id: string) => {
    if (isDemoMode || id === authSession?.user.id) setCurrentCandidateId(id);
  };
  const setCurrentEmployer = (id: string) => {
    if (isDemoMode || id === authSession?.user.id) setCurrentEmployerId(id);
  };

  const requestMarketplace = async (
    url: string,
    method: string,
    body?: unknown
  ): Promise<unknown> => {
    if (!authSession) throw new Error('Sign in before using the marketplace.');
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${authSession.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof payload === 'object' && payload !== null && 'error' in payload &&
          typeof payload.error === 'string'
          ? payload.error
          : 'Marketplace request failed.'
      );
    }
    return payload;
  };

  const startPersonaVerification = async (type: 'identity' | 'employer'): Promise<string> => {
    const payload = await requestMarketplace(
      `/api/persona/verification/${type}/start`,
      'POST',
      { consentAccepted: true }
    );
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('verificationUrl' in payload) ||
      typeof payload.verificationUrl !== 'string'
    ) {
      throw new Error('Persona did not return a verification link.');
    }
    return payload.verificationUrl;
  };

  const persistProfile = async (
    role: 'candidate' | 'employer',
    profile: CandidateProfile | EmployerProfile,
    isNew = false,
    checkIn = false
  ) => {
    if (isDemoMode) return;
    await requestMarketplace('/api/marketplace/profile', isNew ? 'POST' : 'PUT', {
      role,
      profile,
      checkIn,
    });
  };

  // Sync to local storage
  useEffect(() => {
    if (!isDemoMode) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}candidates`, JSON.stringify(candidates));
  }, [candidates, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}employers`, JSON.stringify(employers));
  }, [employers, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}invites`, JSON.stringify(jobInvites));
  }, [jobInvites, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, JSON.stringify(notifications));
  }, [notifications, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}emails`, JSON.stringify(emailLogs));
  }, [emailLogs, isDemoMode]);

  // Derived current user objects
  const currentCandidate = candidates.find((c) => c.id === currentCandidateId) || candidates[0] || null;
  const currentEmployer = employers.find((e) => e.id === currentEmployerId) || employers[0] || null;

  // Unread notifications for current persona
  const unreadNotificationCount = notifications.filter(
    (n) =>
      !n.read &&
      (currentRole === 'candidate'
        ? n.userId === currentCandidateId
        : currentRole === 'employer'
        ? n.userId === currentEmployerId
        : true)
  ).length;

  // 1-Click Check In Engine
  const checkInCandidate = (candidateId?: string) => {
    const targetId = candidateId || currentCandidateId;
    if (!isDemoMode) {
      if (targetId !== authSession?.user.id) return;
      void requestMarketplace('/api/marketplace/check-in', 'POST')
        .then(() => refreshMarketplace())
        .catch((error: unknown) =>
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to record check-in.')
        );
      return;
    }
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === targetId) {
          const wasArchived = c.lifecycleStatus === 'archived' || c.simulatedDaysInactive >= 14;
          const updated: CandidateProfile = {
            ...c,
            lastCheckInDate: new Date().toISOString(),
            simulatedDaysInactive: 0,
            lifecycleStatus: 'active',
            streakDays: wasArchived ? 1 : c.streakDays + 1,
          };
          return updated;
        }
        return c;
      })
    );

    // Add In-App notification & Confirmation Email
    const targetCand = candidates.find((c) => c.id === targetId);
    if (targetCand) {
      const newNotif: PushNotification = {
        id: `notif-${Date.now()}`,
        userId: targetCand.id,
        title: 'Profile Active · Check-in Recorded',
        message: 'Your 14-day inactivity clock has been reset. Your verified profile remains in employer search pools.',
        type: 'invite',
        timestamp: new Date().toISOString(),
        read: false,
      };

      const newEmail: EmailLog = {
        id: `email-${Date.now()}`,
        toEmail: targetCand.email,
        toName: targetCand.name,
        subject: 'Confirmation: Your RAMPED Profile is Active',
        senderName: 'RAMPED Activity Engine',
        sentAt: new Date().toISOString(),
        category: 'account_restored',
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #16a34a;">Check-in Confirmed</h2>
            <p>Hi ${targetCand.name},</p>
            <p>Your check-in has been registered successfully. Your profile is active and fully discoverable by verified employers looking for ${targetCand.targetCategories.join(', ')}.</p>
            <p>Your next mandatory check-in will be in 14 days.</p>
          </div>
        `,
      };

      setNotifications((prev) => [newNotif, ...prev]);
      setEmailLogs((prev) => [newEmail, ...prev]);
    }
  };

  const updateCandidateProfile = (updated: Partial<CandidateProfile>) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === currentCandidateId) {
          return { ...c, ...updated };
        }
        return c;
      })
    );
    if (!isDemoMode && currentCandidate) {
      void persistProfile('candidate', { ...currentCandidate, ...updated }).catch((error: unknown) =>
        setMarketplaceError(error instanceof Error ? error.message : 'Unable to save profile.')
      );
    }
  };

  // OCR Processing logic (OCR Textract / Vision simulation with high fidelity)
  const uploadCandidateCredential = async (
    fileDataUrl: string,
    manualOverrides?: Partial<CredentialOcrData>
  ): Promise<CredentialOcrData | undefined> => {
    if (!isDemoMode) {
      if (!currentCandidate) throw new Error('Complete your candidate profile before uploading a credential.');
      const updated: CandidateProfile = {
        ...currentCandidate,
        credentialDocumentUrl: fileDataUrl,
        credentialOcrData: undefined,
        verificationStatus: 'pending',
        verifiedBadge: false,
      };
      setCandidates((prev) => prev.map((candidate) =>
        candidate.id === currentCandidate.id ? updated : candidate
      ));
      await persistProfile('candidate', updated);
      return undefined;
    }

    // Simulate intelligent OCR extraction latency (600ms)
    await new Promise((res) => setTimeout(res, 600));

    const cand = currentCandidate;
    const extracted: CredentialOcrData = {
      candidateName: manualOverrides?.candidateName || cand?.name || 'Candidate Name',
      degreeType: manualOverrides?.degreeType || cand?.degreeTitle || 'Bachelor of Science in Computer Science',
      institution: manualOverrides?.institution || cand?.institution || 'Stanford University',
      issueDate: manualOverrides?.issueDate || 'May 20, 2024',
      credentialId: manualOverrides?.credentialId || `REG-${Math.floor(100000 + Math.random() * 900000)}`,
      confidenceScore: Math.round((95 + Math.random() * 4.9) * 10) / 10,
      extractedFieldsMatch: true,
      rawOcrText: `ACADEMIC DEGREE VERIFICATION\nINSTITUTION: ${
        manualOverrides?.institution || cand?.institution || 'Stanford University'
      }\nRECIPIENT: ${
        manualOverrides?.candidateName || cand?.name || 'Candidate'
      }\nDEGREE CONFERRED: ${
        manualOverrides?.degreeType || cand?.degreeTitle || 'Bachelor of Science'
      }\nISSUE DATE: ${manualOverrides?.issueDate || 'May 20, 2024'}\nSEAL: VALIDATED REGISTERED RECORD`,
    };

    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === currentCandidateId) {
          return {
            ...c,
            credentialDocumentUrl: fileDataUrl,
            credentialOcrData: extracted,
            verificationStatus: 'pending',
            verifiedBadge: false,
          };
        }
        return c;
      })
    );
    if (!isDemoMode && currentCandidate) {
      void persistProfile('candidate', {
        ...currentCandidate,
        credentialDocumentUrl: fileDataUrl,
        credentialOcrData: extracted,
        verificationStatus: 'pending',
        verifiedBadge: false,
      }).catch((error: unknown) =>
        setMarketplaceError(error instanceof Error ? error.message : 'Unable to save credential.')
      );
    }

    return extracted;
  };

  const registerCandidate = (data: Partial<CandidateProfile>): CandidateProfile => {
    const newCand: CandidateProfile = {
      id: isDemoMode ? `cand-${Date.now()}` : authSession?.user.id || '',
      name: data.name || 'Anonymous Candidate',
      email: data.email || 'candidate@example.com',
      phone: data.phone || '',
      showPhone: data.showPhone ?? false,
      currentEmployer: data.currentEmployer || '',
      showCurrentEmployer: data.showCurrentEmployer ?? false,
      location: data.location || 'Remote',
      showLocation: data.showLocation ?? true,
      portfolioUrl: data.portfolioUrl || '',
      targetCategories: data.targetCategories || ['Full-Stack Software Engineer'],
      degreeType: data.degreeType || "Bachelor's Degree",
      degreeTitle: data.degreeTitle || 'Bachelor of Science',
      institution: data.institution || 'University',
      graduationYear: data.graduationYear || '2024',
      remotePreference: data.remotePreference || 'remote_only',
      yearsOfExperience: data.yearsOfExperience || 2,
      bio: data.bio || '',
      aboutMe: data.aboutMe || '',
      skills: data.skills || ['JavaScript', 'React'],
      resumeFileName: data.resumeFileName || 'Resume.pdf',
      resumeSummary: data.resumeSummary || '',
      coverLetterText: data.coverLetterText || '',
      credentialDocumentUrl: data.credentialDocumentUrl || (isDemoMode ? SAMPLE_DIPLOMA_IMAGE : ''),
      credentialOcrData: data.credentialOcrData,
      verificationStatus: 'pending',
      verifiedBadge: false,
      lastCheckInDate: new Date().toISOString(),
      simulatedDaysInactive: 0,
      lifecycleStatus: 'active',
      streakDays: 1,
      createdAt: new Date().toISOString(),
      isSnoozed: data.isSnoozed ?? false,
    };

    setCandidates((prev) => [newCand, ...prev]);
    setCurrentCandidateId(newCand.id);
    setCurrentRoleState('candidate');
    if (!isDemoMode) {
      void persistProfile('candidate', newCand, true)
        .then(() => {
          setHasMarketplaceProfile(true);
          setMarketplaceError(null);
        })
        .catch((error: unknown) =>
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to create candidate profile.')
        );
    }
    return newCand;
  };

  const registerEmployer = (data: Partial<EmployerProfile>): EmployerProfile => {
    const newEmp: EmployerProfile = {
      id: isDemoMode ? `emp-${Date.now()}` : authSession?.user.id || '',
      companyName: data.companyName || 'New Venture Inc',
      recruiterName: data.recruiterName || 'Talent Partner',
      recruiterTitle: data.recruiterTitle || 'Head of Talent',
      email: data.email || 'talent@newventure.com',
      phone: data.phone || '+1 (555) 019-2831',
      corporateDomain: data.corporateDomain || 'newventure.com',
      websiteUrl: data.websiteUrl || 'https://newventure.com',
      industry: data.industry || 'Technology',
      companySize: data.companySize || '50-100 employees',
      verificationStatus: 'pending', // Requires admin verification gate!
      subscriptionTier: isDemoMode ? 'tier1' : 'none',
      subscriptionCadence: isDemoMode ? 'monthly' : null,
    };

    setEmployers((prev) => [newEmp, ...prev]);
    setCurrentEmployerId(newEmp.id);
    setCurrentRoleState('employer');
    if (!isDemoMode) {
      void persistProfile('employer', newEmp, true)
        .then(() => {
          setHasMarketplaceProfile(true);
          setMarketplaceError(null);
        })
        .catch((error: unknown) =>
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to create employer profile.')
        );
    }
    return newEmp;
  };

  const updateEmployerProfile = (updated: Partial<EmployerProfile>) => {
    setEmployers((prev) =>
      prev.map((e) => {
        if (e.id === currentEmployerId) {
          return { ...e, ...updated };
        }
        return e;
      })
    );
    if (!isDemoMode && currentEmployer) {
      void persistProfile('employer', { ...currentEmployer, ...updated }).catch((error: unknown) =>
        setMarketplaceError(error instanceof Error ? error.message : 'Unable to save employer profile.')
      );
    }
  };

  const activateSubscription = useCallback((
    tier: SubscriptionTier,
    cadence: BillingCadence,
    activeUntil: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    alertCategories: JobCategory[] = []
  ) => {
    setEmployers((prev) =>
      prev.map((employer) =>
        employer.id === currentEmployerId
          ? {
              ...employer,
              subscriptionTier: tier,
              subscriptionCadence: cadence,
              subscriptionActiveUntil: activeUntil,
              stripeCustomerId,
              stripeSubscriptionId,
              instantAlertsEnabled: tier === 'tier2',
              instantAlertCategories:
                tier === 'tier2' ? alertCategories : employer.instantAlertCategories,
            }
          : employer
      )
    );
  }, [currentEmployerId]);

  const deactivateSubscription = useCallback(() => {
    setEmployers((prev) =>
      prev.map((employer) =>
        employer.id === currentEmployerId
          ? {
              ...employer,
              subscriptionTier: 'none',
              subscriptionActiveUntil: undefined,
              instantAlertsEnabled: false,
            }
          : employer
      )
    );
  }, [currentEmployerId]);

  // Job Invite & Notification Pipeline
  const sendJobInvite = (inviteData: Omit<JobInvite, 'id' | 'sentAt' | 'viewedByCandidate'>): JobInvite => {
    const contactName = inviteData.contactName || inviteData.recruiterName || 'Talent Representative';
    const contactTitle = inviteData.contactTitle || inviteData.recruiterTitle || 'Hiring Lead';
    const contactEmail = inviteData.contactEmail || inviteData.recruiterEmail || 'recruiter@company.com';
    const referenceCode = inviteData.referenceCode || `RAMPED-REF-${Math.floor(1000 + Math.random() * 9000)}`;

    const newInvite: JobInvite = {
      ...inviteData,
      id: `inv-${Date.now()}`,
      contactName,
      contactTitle,
      contactEmail,
      contactPhone: inviteData.contactPhone,
      schedulingUrl: inviteData.schedulingUrl,
      referenceCode,
      recruiterName: contactName,
      recruiterTitle: contactTitle,
      recruiterEmail: contactEmail,
      sentAt: new Date().toISOString(),
      status: 'pending',
      candidateContactedExternally: false,
      candidateArchived: false,
      viewedByCandidate: false,
    };

    if (isDemoMode) {
      setJobInvites((prev) => [newInvite, ...prev]);
    } else {
      void requestMarketplace('/api/marketplace/invites', 'POST', { invite: newInvite })
        .then((payload) => {
          if (
            typeof payload !== 'object' ||
            payload === null ||
            !('invite' in payload) ||
            typeof payload.invite !== 'object' ||
            payload.invite === null
          ) {
            throw new Error('The server did not return the saved invite.');
          }
          const savedInvite = payload.invite as Partial<JobInvite>;
          if (typeof savedInvite.id !== 'string' || typeof savedInvite.sentAt !== 'string') {
            throw new Error('The saved invite response was invalid.');
          }
          setJobInvites((prev) => [
            { ...newInvite, ...savedInvite },
            ...prev.filter((invite) => invite.id !== newInvite.id),
          ]);
          const emailStatus =
            typeof payload === 'object' && payload !== null && 'emailStatus' in payload
              ? payload.emailStatus
              : 'sent';
          setMarketplaceError(
            emailStatus === 'sent'
              ? null
              : 'The invite was saved, but its email could not be delivered yet. RAMPED will retry it automatically.'
          );
        })
        .catch((error: unknown) => {
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to send invite.');
        });
      return newInvite;
    }

    // 1. Immediately fire In-App Push Notification to candidate
    const pushNotif: PushNotification = {
      id: `notif-${Date.now()}`,
      userId: inviteData.candidateId,
      title: `Direct Invite: ${inviteData.employerCompanyName} [No In-App Reply]`,
      message: `${inviteData.employerCompanyName} sent you an invitation for "${inviteData.jobTitle}". Note: There is NO reply in RAMPED. Follow the company contact instructions to connect directly with ${contactName}.`,
      type: 'invite',
      timestamp: new Date().toISOString(),
      read: false,
      metadata: { inviteId: newInvite.id },
    };
    setNotifications((prev) => [pushNotif, ...prev]);

    // 2. Dispatch official Email to candidate
    const email: EmailLog = {
      id: `email-${Date.now()}`,
      toEmail: inviteData.candidateEmail,
      toName: inviteData.candidateName,
      subject: `Direct Job Invite: ${inviteData.jobTitle} at ${inviteData.employerCompanyName} [No In-App Reply]`,
      senderName: `${contactName} (${inviteData.employerCompanyName} via RAMPED)`,
      sentAt: new Date().toISOString(),
      category: 'job_invite',
      htmlBody: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #0f172a;">
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h1 style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin: 0; color: #0f172a;">RAMPED</h1>
            <span style="font-size: 12px; font-weight: 600; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #475569;">Verified Direct Invite</span>
          </div>

          <!-- Strict No-In-App-Reply Policy Banner -->
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
            <div style="font-weight: 800; color: #92400e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
              ⚠️ IMPORTANT: There is NO reply inside RAMPED
            </div>
            <div style="font-size: 13px; color: #78350f; line-height: 1.5;">
              RAMPED is an unbiased discovery platform and does not offer an in-app messaging or reply tool. To respond to this invitation, follow the instructions below to contact the employer representative directly.
            </div>
          </div>

          <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">Hi ${inviteData.candidateName},</p>
          <p style="font-size: 15px; line-height: 1.6;">
            <strong>${inviteData.employerCompanyName}</strong> discovered your verified academic credentials on RAMPED and sent you a direct, non-public invitation to explore an open position:
          </p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h3 style="margin: 0 0 10px; font-size: 18px; color: #0f172a;">${inviteData.jobTitle}</h3>
            <div style="font-size: 14px; color: #475569; margin-bottom: 12px;">
              <span style="font-weight: 600;">Department:</span> ${inviteData.department || 'Engineering'} · 
              <span style="font-weight: 600;">Location:</span> ${inviteData.locationType} · 
              <span style="font-weight: 600;">Target Comp:</span> ${inviteData.compensationRange}
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0;">
              ${inviteData.jobDescription}
            </p>
          </div>

          <!-- Structured Who To Contact Box -->
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h4 style="margin: 0 0 12px; font-size: 15px; font-weight: 800; color: #1e3a8a;">
              Who to Contact at ${inviteData.employerCompanyName}:
            </h4>
            <div style="font-size: 14px; color: #1e40af; line-height: 1.6; margin-bottom: 14px;">
              <div><strong>Company Contact:</strong> ${contactName}</div>
              <div><strong>Role / Title:</strong> ${contactTitle}</div>
              <div><strong>Direct Email:</strong> <a href="mailto:${contactEmail}?subject=Re:%20RAMPED%20Invitation%20for%20${encodeURIComponent(inviteData.jobTitle)}%20[Ref:%20${referenceCode}]" style="color: #2563eb; text-decoration: underline; font-weight: 600;">${contactEmail}</a></div>
              ${inviteData.contactPhone ? `<div><strong>Direct Phone:</strong> ${inviteData.contactPhone}</div>` : ''}
              ${inviteData.schedulingUrl ? `<div><strong>Interview Booking Link:</strong> <a href="${inviteData.schedulingUrl}" style="color: #2563eb; text-decoration: underline;">${inviteData.schedulingUrl}</a></div>` : ''}
              <div><strong>Reference Code:</strong> <code style="background: #dbeafe; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: 700;">${referenceCode}</code></div>
            </div>

            <div style="border-top: 1px solid #bfdbfe; padding-top: 12px; font-size: 13px; color: #1e3a8a; line-height: 1.5;">
              <strong>Contact Instructions:</strong><br/>
              ${inviteData.contactInstructions}
            </div>
          </div>

          <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8;">
            You received this invite because you are a verified candidate on RAMPED. You are under no obligation to reach out; your profile remains passive until you choose to contact the company directly.
          </div>
        </div>
      `,
    };
    setEmailLogs((prev) => [email, ...prev]);

    // Automatically open the email modal for immediate inspection
    setSelectedEmailModal(email);

    return newInvite;
  };

  const respondToInvite = (inviteId: string, status: 'accepted' | 'declined') => {
    if (!isDemoMode) return;
    setJobInvites((prev) =>
      prev.map((inv) => {
        if (inv.id === inviteId) {
          return {
            ...inv,
            status,
            candidateContactedExternally: status === 'accepted',
            viewedByCandidate: true,
          };
        }
        return inv;
      })
    );
  };

  const markInviteContacted = (inviteId: string, contacted: boolean) => {
    setJobInvites((prev) =>
      prev.map((inv) => {
        if (inv.id === inviteId) {
          return { ...inv, candidateContactedExternally: contacted, viewedByCandidate: true };
        }
        return inv;
      })
    );
    if (!isDemoMode) {
      void requestMarketplace(`/api/marketplace/invites/${encodeURIComponent(inviteId)}`, 'PATCH', {
        candidateContactedExternally: contacted,
      }).catch((error: unknown) =>
        setMarketplaceError(error instanceof Error ? error.message : 'Unable to update invite.')
      );
    }
  };

  const archiveCandidateInvite = (inviteId: string, archived: boolean) => {
    setJobInvites((prev) =>
      prev.map((inv) => {
        if (inv.id === inviteId) {
          return { ...inv, candidateArchived: archived, viewedByCandidate: true };
        }
        return inv;
      })
    );
    if (!isDemoMode) {
      void requestMarketplace(`/api/marketplace/invites/${encodeURIComponent(inviteId)}`, 'PATCH', {
        candidateArchived: archived,
      }).catch((error: unknown) =>
        setMarketplaceError(error instanceof Error ? error.message : 'Unable to update invite.')
      );
    }
  };

  // Admin: Split-Screen Credential Verification Action
  const verifyCandidateCredential = (candidateId: string, approved: boolean, notes?: string) => {
    if (!isDemoMode) {
      void requestMarketplace('/api/admin/verification', 'POST', {
        userId: candidateId,
        approved,
        notes,
      })
        .then(async (payload) => {
          await refreshMarketplace();
          const emailStatus =
            typeof payload === 'object' && payload !== null && 'emailStatus' in payload
              ? payload.emailStatus
              : 'sent';
          setMarketplaceError(
            emailStatus === 'sent' || emailStatus === 'not_available'
              ? null
              : 'Verification was saved, but its email could not be delivered yet. RAMPED will retry it automatically.'
          );
        })
        .catch((error: unknown) =>
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to update verification.')
        );
      return;
    }
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          return {
            ...c,
            verificationStatus: approved ? 'verified' : 'rejected',
            verifiedBadge: approved,
            verificationNotes: notes || (approved ? 'Academic credential validated by Admin against institutional records.' : 'Rejected: Document illegible or seal mismatch.'),
          };
        }
        return c;
      })
    );

    const cand = candidates.find((c) => c.id === candidateId);
    if (cand) {
      const notif: PushNotification = {
        id: `notif-${Date.now()}`,
        userId: cand.id,
        title: approved ? 'Degree Verified! Verified Badge Issued' : 'Credential Verification Update',
        message: approved
          ? 'Your academic credentials have been verified by RAMPED administrators. You are now discoverable by verified employers.'
          : 'Your uploaded credential was rejected. Please review notes and upload an official degree certificate.',
        type: 'verification',
        timestamp: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev]);

      // If approved, trigger Tier 2 Instant Alerts to employers watching this category!
      if (approved) {
        employers.forEach((emp) => {
          if (emp.subscriptionTier === 'tier2' && emp.instantAlertsEnabled) {
            const matchesCategory = emp.instantAlertCategories?.some((cat) =>
              cand.targetCategories.includes(cat)
            );
            if (matchesCategory) {
              const tier2Notif: PushNotification = {
                id: `notif-tier2-${Date.now()}-${emp.id}`,
                userId: emp.id,
                title: 'Tier 2 Instant Alert: New Verified Candidate Match',
                message: `${cand.name} (${cand.targetCategories[0]}) was just verified with credentials from ${cand.institution}.`,
                type: 'tier2_alert',
                timestamp: new Date().toISOString(),
                read: false,
              };
              setNotifications((prevNotifs) => [tier2Notif, ...prevNotifs]);
            }
          }
        });
      }
    }
  };

  // Admin: Employer Corporate Verification Action
  const verifyEmployerBusiness = (employerId: string, approved: boolean, reason?: string) => {
    if (!isDemoMode) {
      void requestMarketplace('/api/admin/verification', 'POST', {
        userId: employerId,
        approved,
        notes: reason,
      })
        .then(async (payload) => {
          await refreshMarketplace();
          const emailStatus =
            typeof payload === 'object' && payload !== null && 'emailStatus' in payload
              ? payload.emailStatus
              : 'sent';
          setMarketplaceError(
            emailStatus === 'sent' || emailStatus === 'not_available'
              ? null
              : 'Verification was saved, but its email could not be delivered yet. RAMPED will retry it automatically.'
          );
        })
        .catch((error: unknown) =>
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to update verification.')
        );
      return;
    }
    setEmployers((prev) =>
      prev.map((e) => {
        if (e.id === employerId) {
          return {
            ...e,
            verificationStatus: approved ? 'approved' : 'rejected',
            rejectionReason: approved ? undefined : (reason || 'Corporate tax ID or domain verification failed.'),
          };
        }
        return e;
      })
    );

    const emp = employers.find((e) => e.id === employerId);
    if (emp) {
      const email: EmailLog = {
        id: `email-${Date.now()}`,
        toEmail: emp.email,
        toName: emp.recruiterName,
        subject: approved
          ? `RAMPED Corporate Account Approved: ${emp.companyName}`
          : `RAMPED Verification Update: Additional Business Proof Required`,
        senderName: 'RAMPED Trust & Safety',
        sentAt: new Date().toISOString(),
        category: 'employer_verified',
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2>${approved ? 'Corporate Verification Approved' : 'Verification Update'}</h2>
            <p>Hi ${emp.recruiterName},</p>
            <p>${
              approved
                ? `Your business registration for <strong>${emp.companyName}</strong> (Tax ID: ${emp.taxId}) has been verified. You now have full access to search verified candidates and send job invites.`
                : `We could not verify your business registration for ${emp.companyName}. Reason: ${reason || 'Tax ID verification failed.'}`
            }</p>
          </div>
        `,
      };
      setEmailLogs((prev) => [email, ...prev]);
    }
  };

  const sendAdminEmailToCandidate = (candidateId: string, subject: string, bodyText: string) => {
    if (!isDemoMode) {
      void requestMarketplace('/api/admin/email', 'POST', {
        userId: candidateId,
        subject,
        bodyText,
      })
        .then((payload) => {
          const emailStatus =
            typeof payload === 'object' && payload !== null && 'emailStatus' in payload
              ? payload.emailStatus
              : 'sent';
          setMarketplaceError(
            emailStatus === 'sent'
              ? null
              : 'The administrator email could not be delivered yet. RAMPED will retry it automatically.'
          );
        })
        .catch((error: unknown) =>
          setMarketplaceError(error instanceof Error ? error.message : 'Unable to send administrator email.')
        );
      return;
    }
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    const email: EmailLog = {
      id: `email-${Date.now()}`,
      toEmail: cand.email,
      toName: cand.name,
      subject,
      senderName: 'RAMPED Platform Administrator',
      sentAt: new Date().toISOString(),
      category: 'credential_approved',
      htmlBody: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
          <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">
            <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #6366f1; font-family: monospace;">RAMPED governance communication</span>
          </div>
          <h2 style="color: #0f172a; margin-top: 0;">Message from RAMPED Platform Admin</h2>
          <p>Dear ${cand.name},</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #cbd5e1; padding: 12px 16px; margin: 16px 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${bodyText}</div>
          <p style="font-size: 13px; color: #64748b; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
            This email was sent to you directly by a verified platform administrator regarding your RAMPED account status and academic credential verification.
          </p>
        </div>
      `,
    };

    setEmailLogs((prev) => [email, ...prev]);
    setSelectedEmailModal(email);
  };

  // Inactivity Lifecycle Engine Simulator (Time Traveler)
  const simulateInactivityDays = (candidateId: string, days: number) => {
    if (!isDemoMode) {
      setMarketplaceError('The lifecycle time-travel tool is available only in demo mode.');
      return;
    }
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const newStatus = calculateLifecycleStatus(days);
          const updated: CandidateProfile = {
            ...c,
            simulatedDaysInactive: days,
            lifecycleStatus: newStatus,
            streakDays: days >= 14 ? 0 : Math.max(1, c.streakDays - Math.floor(days / 3)),
          };

          // Generate automated notifications for Day 11, 13, 14, 27
          const triggered = generateNotificationForLifecycle(updated, days);
          if (triggered) {
            if (triggered.push) {
              const notif: PushNotification = {
                ...triggered.push,
                id: `notif-${Date.now()}`,
                timestamp: new Date().toISOString(),
                read: false,
              };
              setNotifications((p) => [notif, ...p]);
            }
            if (triggered.email) {
              const email: EmailLog = {
                ...triggered.email,
                id: `email-${Date.now()}`,
                sentAt: new Date().toISOString(),
              };
              setEmailLogs((p) => [email, ...p]);
            }
          }

          return updated;
        }
        return c;
      })
    );
  };

  const resetAllSeedData = () => {
    if (!isDemoMode) return;
    setCandidates(INITIAL_CANDIDATES);
    setEmployers(INITIAL_EMPLOYERS);
    setJobInvites(INITIAL_JOB_INVITES);
    setNotifications(INITIAL_NOTIFICATIONS);
    setEmailLogs(INITIAL_EMAILS);
    setCurrentCandidateId('cand-001');
    setCurrentEmployerId('emp-001');
  };

  const markNotificationAsRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    if (!isDemoMode) {
      void requestMarketplace(
        `/api/marketplace/notifications/${encodeURIComponent(notificationId)}/read`,
        'PATCH'
      ).catch((error: unknown) =>
        setMarketplaceError(error instanceof Error ? error.message : 'Unable to update notification.')
      );
    }
  };

  return (
    <RampContext.Provider
      value={{
        isDemoMode,
        authSession,
        authReady,
        marketplaceReady,
        hasMarketplaceProfile,
        marketplaceError,
        clearMarketplaceError: () => setMarketplaceError(null),
        signIn,
        signUp,
        resetPassword,
        updatePassword,
        signOut,
        refreshMarketplace,
        startPersonaVerification,
        currentRole,
        setCurrentRole,
        currentCandidateId,
          setCurrentCandidateId: setCurrentCandidate,
        currentEmployerId,
          setCurrentEmployerId: setCurrentEmployer,
        candidates,
        employers,
        jobInvites,
        notifications,
        emailLogs,
        currentCandidate,
        currentEmployer,
        checkInCandidate,
        updateCandidateProfile,
        uploadCandidateCredential,
        registerCandidate,
        registerEmployer,
        updateEmployerProfile,
        activateSubscription,
        deactivateSubscription,
        sendJobInvite,
        respondToInvite,
        markInviteContacted,
        archiveCandidateInvite,
        verifyCandidateCredential,
        verifyEmployerBusiness,
        sendAdminEmailToCandidate,
        simulateInactivityDays,
        resetAllSeedData,
        markNotificationAsRead,
        unreadNotificationCount,
        mobilePreviewMode,
        setMobilePreviewMode,
        selectedEmailModal,
        setSelectedEmailModal,
        selectedCandidateForInvite,
        setSelectedCandidateForInvite,
      }}
    >
      {children}
    </RampContext.Provider>
  );
};

export const useRamp = () => {
  const context = useContext(RampContext);
  if (!context) {
    throw new Error('useRamp must be used within a RampProvider');
  }
  return context;
};
