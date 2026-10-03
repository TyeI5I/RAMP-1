import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import { CandidateProfile } from '../../types/ramp';
import {
  X,
  Send,
  Mail,
  Phone,
  Calendar,
  Building2,
  AlertTriangle,
  UserCheck,
  Hash,
  Sparkles,
  Info,
  ExternalLink,
} from 'lucide-react';

interface SendInviteModalProps {
  candidate: CandidateProfile | null;
  onClose: () => void;
}

export const SendInviteModal: React.FC<SendInviteModalProps> = ({ candidate, onClose }) => {
  const { currentEmployer, sendJobInvite } = useRamp();

  // Position details
  const [jobTitle, setJobTitle] = useState(
    candidate ? `Senior ${candidate.targetCategories[0] || 'Software Engineer'}` : 'Lead Technical Specialist'
  );
  const [department, setDepartment] = useState('Core Engineering & Platform');
  const [compensationRange, setCompensationRange] = useState('$195,000 - $235,000 + Equity & Bonus');
  const [locationType, setLocationType] = useState('100% Remote (US/Canada)');
  const [jobDescription, setJobDescription] = useState(
    `We came across your verified degree from ${candidate?.institution || 'your university'} and your passive profile on RAMP. Our team is expanding our infrastructure and we believe your verified skill set matches what we need for this high-impact position.`
  );

  // Designated company contact information (Who to contact in that company)
  const [contactName, setContactName] = useState(
    currentEmployer?.recruiterName || 'Sarah Jenkins'
  );
  const [contactTitle, setContactTitle] = useState(
    currentEmployer?.recruiterTitle || 'Director of Talent Acquisition'
  );
  const [contactEmail, setContactEmail] = useState(
    currentEmployer?.email || 'sarah.jenkins@apexinnovations.tech'
  );
  const [contactPhone, setContactPhone] = useState(
    currentEmployer?.phone || '+1 (415) 890-4412'
  );
  const [schedulingUrl, setSchedulingUrl] = useState(
    'https://calendly.com/talent-team/intro-chat'
  );

  // Auto-generate reference code
  const [referenceCode, setReferenceCode] = useState(
    () => `RAMP-${(currentEmployer?.companyName || 'INV').substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
  );

  // Clear instructions to the candidate on who to contact in that company (No reply in RAMP)
  const generateDefaultInstructions = (
    cName = contactName,
    cTitle = contactTitle,
    cEmail = contactEmail,
    cPhone = contactPhone,
    sUrl = schedulingUrl,
    ref = referenceCode
  ) => {
    let text = `To respond to this invitation, please contact ${cName} (${cTitle}) directly by emailing ${cEmail}`;
    if (cPhone) {
      text += ` or dialing ${cPhone}`;
    }
    if (sUrl) {
      text += `. You may also book an introductory sync directly at ${sUrl}`;
    }
    text += `. Please quote reference code ${ref} in your correspondence.\n\nIMPORTANT: There is NO reply inside RAMP. All communications are conducted directly with our team.`;
    return text;
  };

  const [contactInstructions, setContactInstructions] = useState(() =>
    generateDefaultInstructions()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!candidate) return null;

  const handleRegenerateCode = () => {
    const newCode = `RAMP-${(currentEmployer?.companyName || 'INV').substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    setReferenceCode(newCode);
    setContactInstructions(generateDefaultInstructions(contactName, contactTitle, contactEmail, contactPhone, schedulingUrl, newCode));
  };

  const handleUpdateContactDetails = (
    name: string,
    title: string,
    email: string,
    phone: string,
    schedUrl: string
  ) => {
    setContactName(name);
    setContactTitle(title);
    setContactEmail(email);
    setContactPhone(phone);
    setSchedulingUrl(schedUrl);
    setContactInstructions(generateDefaultInstructions(name, title, email, phone, schedUrl, referenceCode));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmployer) return;

    setIsSubmitting(true);
    sendJobInvite({
      employerId: currentEmployer.id,
      employerCompanyName: currentEmployer.companyName,
      contactName,
      contactTitle,
      contactEmail,
      contactPhone,
      schedulingUrl,
      referenceCode,
      recruiterName: contactName,
      recruiterTitle: contactTitle,
      recruiterEmail: contactEmail,
      candidateId: candidate.id,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      jobTitle,
      department,
      compensationRange,
      locationType,
      jobDescription,
      contactInstructions,
    });

    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-950/70">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 font-mono flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Verified Employer Direct Outreach Pipeline
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">
              Send Direct Invite to {candidate.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Policy Alert Banner: There is NO reply inside RAMP */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-200">
              RAMP Communication Policy: There is NO Reply Inside RAMP
            </div>
            <p className="text-amber-300/90 leading-relaxed text-[11px]">
              RAMP operates strictly as a discovery and credential verification platform. Candidates do not reply or chat inside RAMP. Your invitation must give <strong>clear instructions on who to contact in your company</strong> so the candidate can contact them directly via email, phone, or calendar booking.
            </p>
          </div>
        </div>

        {/* Candidate Recipient Bar */}
        <div className="px-6 py-2.5 bg-neutral-950/60 border-b border-neutral-800 text-xs text-neutral-400 flex flex-wrap items-center justify-between gap-2">
          <div>
            Candidate: <strong className="text-white">{candidate.name}</strong> ·{' '}
            <span className="text-neutral-300">{candidate.email}</span>
          </div>
          <div className="text-[11px] text-emerald-400 font-mono">
            Verified Credential: {candidate.degreeTitle} ({candidate.institution})
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* SECTION 1: WHO TO CONTACT IN THAT COMPANY */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-blue-900/40 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-850 pb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  1. Designated Company Contact (Who Candidate Contacts)
                </h3>
              </div>
              <span className="text-[11px] text-blue-400 font-mono">Mandatory Contact Protocol</span>
            </div>

            <p className="text-[11px] text-neutral-400">
              Specify the exact person the candidate should reach out to outside of RAMP.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Company Contact Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) =>
                    handleUpdateContactDetails(e.target.value, contactTitle, contactEmail, contactPhone, schedulingUrl)
                  }
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Contact Role / Title in Company *
                </label>
                <input
                  type="text"
                  required
                  value={contactTitle}
                  onChange={(e) =>
                    handleUpdateContactDetails(contactName, e.target.value, contactEmail, contactPhone, schedulingUrl)
                  }
                  placeholder="e.g. Director of Talent Acquisition"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-blue-400" />
                  Direct Corporate Email *
                </label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) =>
                    handleUpdateContactDetails(contactName, contactTitle, e.target.value, contactPhone, schedulingUrl)
                  }
                  placeholder="sarah.jenkins@company.com"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-emerald-400" />
                  Direct Phone / Office Line
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) =>
                    handleUpdateContactDetails(contactName, contactTitle, contactEmail, e.target.value, schedulingUrl)
                  }
                  placeholder="+1 (415) 890-4412"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-purple-400" />
                  Interview Scheduling / Booking URL
                </label>
                <input
                  type="url"
                  value={schedulingUrl}
                  onChange={(e) =>
                    handleUpdateContactDetails(contactName, contactTitle, contactEmail, contactPhone, e.target.value)
                  }
                  placeholder="https://calendly.com/your-team/intro-chat"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Hash className="w-3 h-3 text-amber-400" />
                    Reference Code for Candidate
                  </span>
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="text-[10px] text-blue-400 hover:text-blue-300 underline font-mono"
                  >
                    Regenerate
                  </button>
                </label>
                <input
                  type="text"
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-amber-300 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: CLEAR INSTRUCTIONS ON WHO & HOW TO CONTACT */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-850 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                2. Clear Instructions for Candidate (No In-App Reply)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setContactInstructions(
                    generateDefaultInstructions(contactName, contactTitle, contactEmail, contactPhone, schedulingUrl, referenceCode)
                  )
                }
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Reset Standard Instructions
              </button>
            </div>

            <p className="text-[11px] text-neutral-400">
              These clear instructions will be prominently highlighted in the candidate's dashboard and dispatched via official notification email.
            </p>

            <textarea
              rows={3}
              required
              value={contactInstructions}
              onChange={(e) => setContactInstructions(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
            />
          </div>

          {/* SECTION 3: ROLE & POSITION DETAILS */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-neutral-850 pb-2">
              3. Position Specifications
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Target Job Title *
                </label>
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Department / Team *
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Compensation Range *
                </label>
                <input
                  type="text"
                  required
                  value={compensationRange}
                  onChange={(e) => setCompensationRange(e.target.value)}
                  placeholder="$190,000 - $230,000 + Equity"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Location & Workplace Policy *
                </label>
                <input
                  type="text"
                  required
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value)}
                  placeholder="100% Remote or Hybrid"
                  className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Personalized Role Pitch & Description *
              </label>
              <textarea
                rows={3}
                required
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>
          </div>

          {/* Dispatch summary */}
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
            <div className="font-semibold text-neutral-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              Automated Dispatch Protocol:
            </div>
            <div>
              Submitting sends an in-app alert and official HTML email to <strong>{candidate.email}</strong> detailing <strong>{contactName}</strong>'s direct contact instructions, phone, and booking link.
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-2 flex items-center justify-between border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
            >
              <Send className="w-4 h-4" />
              Send Invite with Contact Instructions
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
