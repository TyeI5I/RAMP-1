import React, { createContext, useContext, useState, useEffect } from 'react';
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
  InvoiceRecord,
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

interface RampContextType {
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
  ) => Promise<CredentialOcrData>;
  registerCandidate: (data: Partial<CandidateProfile>) => CandidateProfile;

  // Employer Actions
  registerEmployer: (data: Partial<EmployerProfile>) => EmployerProfile;
  updateEmployerProfile: (updated: Partial<EmployerProfile>) => void;
  upgradeSubscription: (
    tier: SubscriptionTier,
    cadence: BillingCadence,
    invoiceData?: Partial<InvoiceRecord>,
    alertCategories?: JobCategory[]
  ) => InvoiceRecord;
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
  // Initialize state from localStorage or seeds
  const [candidates, setCandidates] = useState<CandidateProfile[]>(() => {
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
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}employers`);
      return stored ? JSON.parse(stored) : INITIAL_EMPLOYERS;
    } catch {
      return INITIAL_EMPLOYERS;
    }
  });

  const [jobInvites, setJobInvites] = useState<JobInvite[]>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}invites`);
      return stored ? JSON.parse(stored) : INITIAL_JOB_INVITES;
    } catch {
      return INITIAL_JOB_INVITES;
    }
  });

  const [notifications, setNotifications] = useState<PushNotification[]>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}notifications`);
      return stored ? JSON.parse(stored) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  });

  const [emailLogs, setEmailLogs] = useState<EmailLog[]>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}emails`);
      return stored ? JSON.parse(stored) : INITIAL_EMAILS;
    } catch {
      return INITIAL_EMAILS;
    }
  });

  // Current session persona
  const [currentRole, setCurrentRole] = useState<UserRole>('employer');
  const [currentCandidateId, setCurrentCandidateId] = useState<string>('cand-001');
  const [currentEmployerId, setCurrentEmployerId] = useState<string>('emp-001');

  // UI state
  const [mobilePreviewMode, setMobilePreviewMode] = useState<boolean>(false);
  const [selectedEmailModal, setSelectedEmailModal] = useState<EmailLog | null>(null);
  const [selectedCandidateForInvite, setSelectedCandidateForInvite] = useState<CandidateProfile | null>(null);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}candidates`, JSON.stringify(candidates));
  }, [candidates]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}employers`, JSON.stringify(employers));
  }, [employers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}invites`, JSON.stringify(jobInvites));
  }, [jobInvites]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}emails`, JSON.stringify(emailLogs));
  }, [emailLogs]);

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
        subject: 'Confirmation: Your RAMP Profile is Active',
        senderName: 'RAMP Activity Engine',
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
  };

  // OCR Processing logic (OCR Textract / Vision simulation with high fidelity)
  const uploadCandidateCredential = async (
    fileDataUrl: string,
    manualOverrides?: Partial<CredentialOcrData>
  ): Promise<CredentialOcrData> => {
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

    return extracted;
  };

  const registerCandidate = (data: Partial<CandidateProfile>): CandidateProfile => {
    const newCand: CandidateProfile = {
      id: `cand-${Date.now()}`,
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
      credentialDocumentUrl: data.credentialDocumentUrl || SAMPLE_DIPLOMA_IMAGE,
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
    setCurrentRole('candidate');
    return newCand;
  };

  const registerEmployer = (data: Partial<EmployerProfile>): EmployerProfile => {
    const newEmp: EmployerProfile = {
      id: `emp-${Date.now()}`,
      companyName: data.companyName || 'New Venture Inc',
      recruiterName: data.recruiterName || 'Talent Partner',
      recruiterTitle: data.recruiterTitle || 'Head of Talent',
      email: data.email || 'talent@newventure.com',
      phone: data.phone || '+1 (555) 019-2831',
      corporateDomain: data.corporateDomain || 'newventure.com',
      taxId: data.taxId || 'EIN: 84-0000000',
      websiteUrl: data.websiteUrl || 'https://newventure.com',
      industry: data.industry || 'Technology',
      companySize: data.companySize || '50-100 employees',
      verificationStatus: 'pending', // Requires admin verification gate!
      subscriptionTier: 'tier1',
      subscriptionCadence: 'monthly',
    };

    setEmployers((prev) => [newEmp, ...prev]);
    setCurrentEmployerId(newEmp.id);
    setCurrentRole('employer');
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
  };

  const upgradeSubscription = (
    tier: SubscriptionTier,
    cadence: BillingCadence,
    invoiceData?: Partial<InvoiceRecord>,
    alertCategories?: JobCategory[]
  ) => {
    const isTier2 = tier === 'tier2';
    const basePrice = cadence === 'monthly' ? (isTier2 ? 599 : 299) : (isTier2 ? 5990 : 2990);
    const tax = Math.round(basePrice * 0.0825 * 100) / 100;
    const total = basePrice + tax;

    const newInvoice: InvoiceRecord = {
      id: `inv-rec-${Date.now()}`,
      invoiceNumber: `INV-RAMP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      employerId: currentEmployerId,
      companyName: currentEmployer?.companyName || 'Apex Innovations',
      planName: tier === 'tier2' ? 'RAMP Tier 2 · Real-Time Instant Alerts' : 'RAMP Tier 1 · Verified Search',
      tier,
      cadence,
      amount: basePrice,
      currency: 'USD',
      taxAmount: tax,
      totalAmount: total,
      date: new Date().toISOString(),
      status: 'paid',
      stripePaymentIntentId: `pi_3P${Math.random().toString(36).substring(2, 15)}`,
      stripeSubscriptionId: `sub_1N${Math.random().toString(36).substring(2, 15)}`,
      stripeCustomerId: `cus_${Math.random().toString(36).substring(2, 12)}`,
      paymentMethod: invoiceData?.paymentMethod || {
        brand: 'Visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
      },
      billingAddress: invoiceData?.billingAddress || {
        name: currentEmployer?.recruiterName || 'Billing Manager',
        line1: '100 Montgomery St, Suite 1400',
        city: 'San Francisco',
        postalCode: '94104',
        country: 'United States',
        taxId: currentEmployer?.taxId || 'EIN: 84-3991204',
      },
    };

    setEmployers((prev) =>
      prev.map((e) => {
        if (e.id === currentEmployerId) {
          const existingInvoices = e.invoices || [];
          return {
            ...e,
            subscriptionTier: tier,
            subscriptionCadence: cadence,
            subscriptionActiveUntil: new Date(
              Date.now() + (cadence === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000
            ).toISOString(),
            instantAlertsEnabled: tier === 'tier2',
            instantAlertCategories: alertCategories || e.instantAlertCategories || ['Full-Stack Software Engineer', 'Data Scientist & ML Engineer'],
            invoices: [newInvoice, ...existingInvoices],
          };
        }
        return e;
      })
    );

    // Push notification for subscription
    const pushNotif: PushNotification = {
      id: `notif-${Date.now()}`,
      userId: currentEmployerId,
      title: `Subscription Active: ${tier === 'tier2' ? 'Tier 2 (Real-Time Alerts)' : 'Tier 1 Plan'}`,
      message: `Your Stripe payment of $${total.toFixed(2)} was successfully processed. Unlimited direct invites are now active.`,
      type: 'verification',
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [pushNotif, ...prev]);

    // Send confirmation email with receipt
    const receiptEmail: EmailLog = {
      id: `email-${Date.now()}`,
      toEmail: currentEmployer?.email || 'billing@company.com',
      toName: currentEmployer?.recruiterName || 'Talent Lead',
      subject: `Receipt for ${newInvoice.invoiceNumber} · RAMP Subscription`,
      senderName: 'RAMP Billing & Stripe Receipts',
      sentAt: new Date().toISOString(),
      category: 'employer_verified',
      htmlBody: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #0f172a;">
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h1 style="font-size: 20px; font-weight: 800; margin: 0; color: #0f172a;">RAMP · Payment Receipt</h1>
            <span style="font-family: monospace; font-size: 13px; color: #64748b;">${newInvoice.invoiceNumber}</span>
          </div>

          <p style="font-size: 14px; margin-top: 0;">Hi ${currentEmployer?.recruiterName},</p>
          <p style="font-size: 14px;">Thank you for subscribing to RAMP. Your payment has been processed via Stripe.</p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #475569;">Plan</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${newInvoice.planName} (${cadence})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #475569;">Stripe Payment ID</td>
                <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #64748b;">${newInvoice.stripePaymentIntentId}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #475569;">Subtotal</td>
                <td style="padding: 6px 0; text-align: right; color: #0f172a;">$${basePrice.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #475569;">Sales Tax / VAT (8.25%)</td>
                <td style="padding: 6px 0; text-align: right; color: #0f172a;">$${tax.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 1px solid #cbd5e1; font-weight: 700; font-size: 15px;">
                <td style="padding: 10px 0; color: #0f172a;">Total Paid</td>
                <td style="padding: 10px 0; text-align: right; color: #0f172a;">$${total.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #64748b;">Card charged: ${newInvoice.paymentMethod.brand} ending in ${newInvoice.paymentMethod.last4}</p>
          <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
            RAMP Technologies Inc. · 100 Montgomery St, San Francisco, CA · Stripe Verified Merchant
          </p>
        </div>
      `,
    };
    setEmailLogs((prev) => [receiptEmail, ...prev]);

    return newInvoice;
  };

  // Job Invite & Notification Pipeline
  const sendJobInvite = (inviteData: Omit<JobInvite, 'id' | 'sentAt' | 'viewedByCandidate'>): JobInvite => {
    const contactName = inviteData.contactName || inviteData.recruiterName || 'Talent Representative';
    const contactTitle = inviteData.contactTitle || inviteData.recruiterTitle || 'Hiring Lead';
    const contactEmail = inviteData.contactEmail || inviteData.recruiterEmail || 'recruiter@company.com';
    const referenceCode = inviteData.referenceCode || `RAMP-REF-${Math.floor(1000 + Math.random() * 9000)}`;

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

    setJobInvites((prev) => [newInvite, ...prev]);

    // 1. Immediately fire In-App Push Notification to candidate
    const pushNotif: PushNotification = {
      id: `notif-${Date.now()}`,
      userId: inviteData.candidateId,
      title: `Direct Invite: ${inviteData.employerCompanyName} [No In-App Reply]`,
      message: `${inviteData.employerCompanyName} sent you an invitation for "${inviteData.jobTitle}". Note: There is NO reply in RAMP. Follow the company contact instructions to connect directly with ${contactName}.`,
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
      senderName: `${contactName} (${inviteData.employerCompanyName} via RAMP)`,
      sentAt: new Date().toISOString(),
      category: 'job_invite',
      htmlBody: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #0f172a;">
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h1 style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin: 0; color: #0f172a;">RAMP</h1>
            <span style="font-size: 12px; font-weight: 600; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #475569;">Verified Direct Invite</span>
          </div>

          <!-- Strict No-In-App-Reply Policy Banner -->
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
            <div style="font-weight: 800; color: #92400e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
              ⚠️ IMPORTANT: There is NO reply inside RAMP
            </div>
            <div style="font-size: 13px; color: #78350f; line-height: 1.5;">
              RAMP is an unbiased discovery platform and does not offer an in-app messaging or reply tool. To respond to this invitation, follow the instructions below to contact the employer representative directly.
            </div>
          </div>

          <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">Hi ${inviteData.candidateName},</p>
          <p style="font-size: 15px; line-height: 1.6;">
            <strong>${inviteData.employerCompanyName}</strong> discovered your verified academic credentials on RAMP and sent you a direct, non-public invitation to explore an open position:
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
              <div><strong>Direct Email:</strong> <a href="mailto:${contactEmail}?subject=Re:%20RAMP%20Invitation%20for%20${encodeURIComponent(inviteData.jobTitle)}%20[Ref:%20${referenceCode}]" style="color: #2563eb; text-decoration: underline; font-weight: 600;">${contactEmail}</a></div>
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
            You received this invite because you are a verified candidate on RAMP. You are under no obligation to reach out; your profile remains passive until you choose to contact the company directly.
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
  };

  // Admin: Split-Screen Credential Verification Action
  const verifyCandidateCredential = (candidateId: string, approved: boolean, notes?: string) => {
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
          ? 'Your academic credentials have been verified by RAMP administrators. You are now discoverable by verified employers.'
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
          ? `RAMP Corporate Account Approved: ${emp.companyName}`
          : `RAMP Verification Update: Additional Business Proof Required`,
        senderName: 'RAMP Trust & Safety',
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
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    const email: EmailLog = {
      id: `email-${Date.now()}`,
      toEmail: cand.email,
      toName: cand.name,
      subject,
      senderName: 'RAMP Platform Administrator',
      sentAt: new Date().toISOString(),
      category: 'credential_approved',
      htmlBody: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
          <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">
            <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #6366f1; font-family: monospace;">RAMP governance communication</span>
          </div>
          <h2 style="color: #0f172a; margin-top: 0;">Message from RAMP Platform Admin</h2>
          <p>Dear ${cand.name},</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #cbd5e1; padding: 12px 16px; margin: 16px 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${bodyText}</div>
          <p style="font-size: 13px; color: #64748b; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
            This email was sent to you directly by a verified platform administrator regarding your RAMP account status and academic credential verification.
          </p>
        </div>
      `,
    };

    setEmailLogs((prev) => [email, ...prev]);
    setSelectedEmailModal(email);
  };

  // Inactivity Lifecycle Engine Simulator (Time Traveler)
  const simulateInactivityDays = (candidateId: string, days: number) => {
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
  };

  return (
    <RampContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        currentCandidateId,
        setCurrentCandidateId,
        currentEmployerId,
        setCurrentEmployerId,
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
        upgradeSubscription,
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
