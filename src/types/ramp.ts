export type UserRole = 'candidate' | 'employer' | 'admin';

export type JobCategory =
  | 'Full-Stack Software Engineer'
  | 'Product Manager'
  | 'DevOps & Cloud Architect'
  | 'Data Scientist & ML Engineer'
  | 'Cybersecurity Specialist'
  | 'UI/UX Product Designer'
  | 'Mobile App Engineer (iOS/Android)'
  | 'Financial Analyst & Quant'
  | 'Backend Systems Engineer'
  | 'AI Research Scientist';

export const JOB_CATEGORIES: JobCategory[] = [
  'Full-Stack Software Engineer',
  'Product Manager',
  'DevOps & Cloud Architect',
  'Data Scientist & ML Engineer',
  'Cybersecurity Specialist',
  'UI/UX Product Designer',
  'Mobile App Engineer (iOS/Android)',
  'Financial Analyst & Quant',
  'Backend Systems Engineer',
  'AI Research Scientist',
];

export type DegreeType =
  | "Associate's Degree"
  | "Bachelor's Degree"
  | "Master's Degree"
  | 'Doctorate / Ph.D.'
  | 'Professional Certification';

export const DEGREE_TYPES: DegreeType[] = [
  "Associate's Degree",
  "Bachelor's Degree",
  "Master's Degree",
  'Doctorate / Ph.D.',
  'Professional Certification',
];

export type RemotePreference = 'remote_only' | 'hybrid' | 'onsite';

export interface CredentialOcrData {
  candidateName: string;
  degreeType: string;
  institution: string;
  issueDate: string;
  credentialId: string;
  confidenceScore: number;
  extractedFieldsMatch: boolean;
  rawOcrText?: string;
}

export interface AboutMeChecklistItem {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  promptHint: string;
  keywords: string[];
}

export const ABOUT_ME_CHECKLIST_ITEMS: AboutMeChecklistItem[] = [
  {
    id: 'values',
    title: 'Core Values & Work Philosophy',
    shortLabel: 'Core Values',
    description: 'What principles guide your decisions when faced with ambiguity, trade-offs, or pressure? (e.g. intellectual humility, craft integrity, user empathy, transparency)',
    promptHint: 'I believe the best work happens when...',
    keywords: ['value', 'principle', 'integrity', 'humility', 'ethics', 'believe', 'philosophy', 'craft', 'transparency', 'respect'],
  },
  {
    id: 'collaboration',
    title: 'Collaboration & Communication Style',
    shortLabel: 'Team Style',
    description: 'How do you work with cross-functional teammates, give/receive critique, and foster psychological safety in a group?',
    promptHint: 'In a team setting, I prioritize...',
    keywords: ['collaborat', 'team', 'feedback', 'listen', 'psychological safety', 'partner', 'cross-functional', 'communicate', 'mentorship'],
  },
  {
    id: 'curiosity',
    title: 'Curiosity & Problem-Solving Mindset',
    shortLabel: 'Curiosity & Solving',
    description: 'What intellectual or technical puzzles excite you, and how do you approach learning unfamiliar tools or domains?',
    promptHint: 'I am most energized by challenges involving...',
    keywords: ['curious', 'learn', 'problem', 'solve', 'puzzle', 'explore', 'investigat', 'tinker', 'experiment', 'system'],
  },
  {
    id: 'passions',
    title: 'Life Beyond Work (Passions & Hobbies)',
    shortLabel: 'Passions Outside Work',
    description: 'Who are you when you step away from the keyboard? Mention authentic creative pursuits, sports, arts, volunteering, or hobbies that recharge you.',
    promptHint: 'When offline, you will usually find me...',
    keywords: ['outside', 'hobby', 'hike', 'music', 'read', 'cook', 'art', 'sport', 'run', 'volunteer', 'coffee', 'offline', 'recharge', 'keyboard'],
  },
  {
    id: 'culture_fit',
    title: 'Ideal Team Culture & Environment',
    shortLabel: 'Ideal Culture',
    description: 'What type of culture brings out your best work? (e.g. blameless postmortems, high agency, thoughtful documentation, quiet focus time)',
    promptHint: 'I do my best work on teams that value...',
    keywords: ['culture', 'environment', 'thrive', 'blameless', 'agency', 'document', 'autonomy', 'growth', 'cadence', 'pace'],
  },
];

export interface CandidateProfile {
  id: string;
  name: string;
  email: string; // Mandatory & always visible to verified employers
  phone?: string;
  showPhone: boolean; // Privacy toggle
  currentEmployer?: string;
  showCurrentEmployer: boolean; // Privacy toggle
  location: string;
  showLocation: boolean; // Privacy toggle
  portfolioUrl?: string;
  targetCategories: JobCategory[]; // Candidate-driven (No AI classification)
  degreeType: DegreeType;
  degreeTitle: string;
  institution: string;
  graduationYear: string;
  remotePreference: RemotePreference;
  yearsOfExperience: number;
  bio: string;
  aboutMe?: string; // Who the person actually is beyond accomplishments (values, philosophy, working style, interests)
  skills: string[];
  resumeFileName?: string;
  resumeSummary?: string;
  coverLetterText?: string;
  credentialDocumentUrl: string; // Sample diploma or user uploaded base64
  credentialOcrData?: CredentialOcrData;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verifiedBadge: boolean;
  verificationNotes?: string;
  // Activity Check-in Engine (Strict 14/30 Rule)
  lastCheckInDate: string; // ISO string
  simulatedDaysInactive: number; // For demo time traveler
  lifecycleStatus: 'active' | 'warning_3day' | 'warning_1day' | 'archived' | 'deletion_warning' | 'deleted';
  streakDays: number;
  createdAt: string;
  isSnoozed?: boolean; // Toggle for "Snoozed / Confidential (Super Passive)" visibility
}

export type SubscriptionTier = 'none' | 'tier1' | 'tier2';
export type BillingCadence = 'monthly' | 'annual';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  employerId: string;
  companyName: string;
  planName: string;
  tier: SubscriptionTier;
  cadence: BillingCadence;
  amount: number;
  currency: string;
  taxAmount: number;
  totalAmount: number;
  date: string;
  status: 'paid' | 'pending' | 'failed';
  stripePaymentIntentId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingAddress: {
    name: string;
    line1: string;
    city: string;
    postalCode: string;
    country: string;
    taxId: string;
  };
}

export interface TierDifferentiator {
  id: string;
  feature: string;
  tier1: string;
  tier2: string;
  tier2Advantage: string;
}

export const TIER_DIFFERENTIATORS: TierDifferentiator[] = [
  {
    id: 'invites',
    feature: 'Direct Job Invitations',
    tier1: '25 invites / month',
    tier2: 'Unlimited invites + Priority VIP Delivery Badge',
    tier2Advantage: 'No monthly cap, prioritized in candidate inbox',
  },
  {
    id: 'search',
    feature: 'AI Values & Narrative Search',
    tier1: 'Manual category & degree filters',
    tier2: 'Gemini Natural Language Search across "About Me" narratives & values',
    tier2Advantage: 'Match on collaboration philosophy, work ethics & passions',
  },
  {
    id: 'registrar',
    feature: 'Degree Verification Depth',
    tier1: 'Verified badge & basic major metadata',
    tier2: 'Full High-Res Parchment & Cryptographic Registrar Audit Vault',
    tier2Advantage: 'Inspect original university seal, honors & OCR confidence logs',
  },
  {
    id: 'contact_channels',
    feature: 'Candidate Direct Contact Channels',
    tier1: 'Corporate work email only',
    tier2: 'Direct Email + Direct Phone / SMS & Calendar Booking Links',
    tier2Advantage: 'Instant intro calls and direct desk line reachouts',
  },
  {
    id: 'alerts',
    feature: 'Real-Time Candidate Alerts',
    tier1: 'Manual periodic browsing',
    tier2: 'Instant push & email notifications as candidates pass verification',
    tier2Advantage: 'First-mover access the second verified talent joins',
  },
  {
    id: 'team_seats',
    feature: 'Recruiter Team Seats',
    tier1: '1 Recruiter seat',
    tier2: 'Up to 5 Team Recruiter seats with shared invite tracking',
    tier2Advantage: 'Collaborative team hiring and shared pipeline records',
  },
];

export interface EmployerProfile {
  id: string;
  companyName: string;
  recruiterName: string;
  recruiterTitle: string;
  email: string;
  phone: string;
  corporateDomain: string;
  taxId: string; // EIN / Business Tax ID
  websiteUrl: string;
  industry: string;
  companySize: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionCadence: BillingCadence;
  subscriptionActiveUntil?: string;
  instantAlertsEnabled?: boolean;
  instantAlertCategories?: JobCategory[];
  monthlyInvitesSent?: number; // Quota tracking (25 for Tier 1, unlimited for Tier 2)
  teamSeats?: number; // 1 for Tier 1, 5 for Tier 2
  invoices?: InvoiceRecord[];
}

export interface JobInvite {
  id: string;
  employerId: string;
  employerCompanyName: string;
  // Designated Company Contact Representative (Who Candidate Contacts)
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone?: string;
  schedulingUrl?: string;
  referenceCode?: string;
  // Candidate recipient details
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  // Position specifications
  jobTitle: string;
  department: string;
  compensationRange: string;
  locationType: string;
  jobDescription: string;
  // Explicit step-by-step instructions on who to contact in that company
  contactInstructions: string;
  sentAt: string;
  // Note: There is NO in-app reply in RAMP. Candidate outreach occurs externally.
  candidateContactedExternally?: boolean; // Candidate personal tracker: "I reached out directly"
  candidateArchived?: boolean; // Candidate personal tracker: archived from active list
  status?: 'pending' | 'accepted' | 'declined'; // Maintained for backward compatibility
  viewedByCandidate: boolean;
  // Backward compatibility aliases
  recruiterName?: string;
  recruiterTitle?: string;
  recruiterEmail?: string;
}

export interface PushNotification {
  id: string;
  userId: string; // 'candidate' or candidateId
  title: string;
  message: string;
  type: 'invite' | 'inactivity_warning' | 'archived' | 'deletion_warning' | 'verification' | 'tier2_alert';
  timestamp: string;
  read: boolean;
  metadata?: Record<string, any>;
}

export interface EmailLog {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  htmlBody: string;
  senderName: string;
  sentAt: string;
  category: 'job_invite' | 'inactivity_warning' | 'account_archived' | 'deletion_warning' | 'account_restored' | 'employer_verified' | 'credential_approved';
}
