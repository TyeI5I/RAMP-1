import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import { CandidateProfile, EmployerProfile } from '../../types/ramp';
import {
  ShieldCheck,
  Building,
  CheckCircle,
  XCircle,
  FileSearch,
  Eye,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  RotateCw,
  Sparkles,
  ExternalLink,
  Users,
  Briefcase,
  Clock,
  Layers,
  Mail,
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const {
    candidates,
    employers,
    jobInvites,
    verifyCandidateCredential,
    verifyEmployerBusiness,
    sendAdminEmailToCandidate,
  } = useRamp();

  const [activeSection, setActiveSection] = useState<'credentials' | 'employers' | 'metrics'>('credentials');

  // Filter pending candidates or select any candidate for audit
  const pendingCandidates = candidates.filter((c) => c.verificationStatus === 'pending');
  const allVerifiedCandidates = candidates.filter((c) => c.verificationStatus === 'verified');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    pendingCandidates[0]?.id || candidates[0]?.id || ''
  );

  // Split-screen document zoom control
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rejectionNotes, setRejectionNotes] = useState<string>('');

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0];

  // Employers pending verification
  const pendingEmployers = employers.filter((e) => e.verificationStatus === 'pending');
  const approvedEmployers = employers.filter((e) => e.verificationStatus === 'approved');

  // Email modal and composer state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailTemplate, setEmailTemplate] = useState<'none' | 'legibility' | 'grad_year' | 'congrats'>('none');

  const handleTemplateChange = (templateType: 'none' | 'legibility' | 'grad_year' | 'congrats') => {
    setEmailTemplate(templateType);
    if (templateType === 'none') {
      setEmailSubject('');
      setEmailBody('');
    } else if (templateType === 'legibility') {
      setEmailSubject('Action Required: Please re-upload a legible credential document');
      setEmailBody(`Thank you for submitting your profile to RAMP.

During our platform audit, we found that your uploaded graduation document/diploma is blurry or illegible. To complete your credential verification and grant you the verified RAMP badge, please re-upload a clear, high-resolution PDF or image of your diploma/transcript from your Candidate Portal.

Please let us know if you have any questions.`);
    } else if (templateType === 'grad_year') {
      setEmailSubject('Clarification Required: Graduation Year discrepancy');
      setEmailBody(`Hi ${selectedCandidate?.name || 'there'},

We are currently reviewing your academic credentials for verification. We noticed a slight discrepancy between your self-reported graduation year and the date shown on your official diploma document.

Please reply with clarification so we can proceed with issuing your RAMP Verified Badge.

Thank you!`);
    } else if (templateType === 'congrats') {
      setEmailSubject('Congratulations! Your RAMP Academic Credentials have been verified');
      setEmailBody(`Fantastic news!

Our platform administration has successfully audited and verified your academic credentials. Your RAMP profile now displays the Verified Badge and is highlighted in premier employer search portals.

No further action is required from you at this time. Keep your profile check-in active every 14 days to remain discoverable!`);
    }
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    sendAdminEmailToCandidate(selectedCandidate.id, emailSubject, emailBody);
    setIsEmailModalOpen(false);
    setEmailSubject('');
    setEmailBody('');
    setEmailTemplate('none');
  };

  const handleApprove = () => {
    if (!selectedCandidate) return;
    verifyCandidateCredential(
      selectedCandidate.id,
      true,
      'Academic diploma and institution registrar record verified by Platform Admin.'
    );
  };

  const handleReject = () => {
    if (!selectedCandidate) return;
    verifyCandidateCredential(
      selectedCandidate.id,
      false,
      rejectionNotes || 'Document illegible or registrar seal could not be validated.'
    );
    setRejectionNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Admin Top Header & Platform Metrics Summary */}
      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400 font-mono">
              RAMP Governance & Trust Engine
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Platform Admin & Credential Verification Console
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Dual-pane OCR visual audit for candidate diplomas and corporate entity validation.
          </p>
        </div>

        {/* Global Key Metrics */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-center">
            <div className="text-[10px] text-neutral-500 uppercase">Pending OCR Audit</div>
            <div className="text-lg font-bold text-amber-400 tabular-nums">
              {pendingCandidates.length}
            </div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-center">
            <div className="text-[10px] text-neutral-500 uppercase">Verified Talent</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">
              {allVerifiedCandidates.length}
            </div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-center">
            <div className="text-[10px] text-neutral-500 uppercase">Pending Employers</div>
            <div className="text-lg font-bold text-blue-400 tabular-nums">
              {pendingEmployers.length}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setActiveSection('credentials')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeSection === 'credentials'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <FileSearch className="w-3.5 h-3.5" />
          Split-Screen Credential Audit ({pendingCandidates.length} Pending)
        </button>

        <button
          onClick={() => setActiveSection('employers')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeSection === 'employers'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          Employer Business Queue ({pendingEmployers.length} Pending)
        </button>

        <button
          onClick={() => setActiveSection('metrics')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeSection === 'metrics'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Platform Health & 14/30 Engine
        </button>
      </div>

      {/* SECTION 1: Split-Screen Credential Verification Panel */}
      {activeSection === 'credentials' && (
        <div className="space-y-4">
          {/* Candidate Queue Selector */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-neutral-900 border border-neutral-800 rounded-xl text-xs">
            <span className="text-neutral-400 font-semibold">Select Credential in Queue:</span>
            {candidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => setSelectedCandidateId(cand.id)}
                className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                  selectedCandidate?.id === cand.id
                    ? 'bg-neutral-800 text-white font-semibold border border-purple-500/40'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
                }`}
              >
                <span>{cand.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    cand.verificationStatus === 'verified'
                      ? 'bg-emerald-950 text-emerald-400'
                      : cand.verificationStatus === 'rejected'
                      ? 'bg-red-950 text-red-400'
                      : 'bg-amber-950 text-amber-400'
                  }`}
                >
                  {cand.verificationStatus}
                </span>
              </button>
            ))}
          </div>

          {selectedCandidate && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              {/* Top Banner for selected candidate */}
              <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{selectedCandidate.name}</span>
                    <span className="text-neutral-500 font-mono">({selectedCandidate.email})</span>
                  </div>
                  <div className="text-neutral-400 font-mono mt-0.5">
                    Target Positions: {selectedCandidate.targetCategories.join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Direct Admin-to-Candidate Email button */}
                  <button
                    onClick={() => {
                      setEmailSubject(`Update regarding your RAMP Academic Credential audit`);
                      setEmailBody(`Hi ${selectedCandidate.name},\n\nThis is a message from the RAMP Platform Administrator regarding your academic credentials.\n\n`);
                      setIsEmailModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-950 text-purple-300 hover:bg-purple-900 border border-purple-800/60 font-bold transition-colors flex items-center gap-1.5 shadow-md"
                    title="Send direct email to this candidate"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email Candidate</span>
                  </button>

                  <div className="text-right">
                    <div className="text-[10px] text-neutral-500 uppercase font-mono">Current Status</div>
                    <div
                      className={`font-bold capitalize ${
                        selectedCandidate.verificationStatus === 'verified'
                          ? 'text-emerald-400'
                          : selectedCandidate.verificationStatus === 'rejected'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {selectedCandidate.verificationStatus}
                    </div>
                  </div>

                  {selectedCandidate.verificationStatus === 'pending' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleReject}
                        className="px-3.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-bold transition-colors flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        onClick={handleApprove}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold transition-colors flex items-center gap-1 shadow-md shadow-emerald-500/10"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve & Issue Badge
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleApprove}
                        className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                      >
                        Re-Approve
                      </button>
                      <button
                        onClick={handleReject}
                        className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                      >
                        Revoke Badge
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* SPLIT-SCREEN PANEL */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800 min-h-[500px]">
                {/* LEFT PANE: OCR-Extracted Data & Field Validation */}
                <div className="p-6 space-y-5 bg-neutral-900/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        Google Vision / OCR Extracted Payload
                      </h3>
                      <p className="text-xs text-neutral-400">
                        Automated document text extraction and entity recognition.
                      </p>
                    </div>
                    {selectedCandidate.credentialOcrData && (
                      <div className="px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-800/50 text-[11px] font-mono text-purple-300 font-semibold">
                        Confidence: {selectedCandidate.credentialOcrData.confidenceScore}%
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase">1. Degree Title Conferred</div>
                      <div className="text-white font-semibold text-sm">
                        {selectedCandidate.credentialOcrData?.degreeType || selectedCandidate.degreeTitle}
                      </div>
                      <div className="text-emerald-400 text-[11px]">
                        ✓ Matches candidate self-reported major
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase">2. Issuing Academic Institution</div>
                      <div className="text-white font-semibold text-sm">
                        {selectedCandidate.credentialOcrData?.institution || selectedCandidate.institution}
                      </div>
                      <div className="text-emerald-400 text-[11px]">
                        ✓ Accredited Higher Education Provider
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase">3. Conferred Recipient Name</div>
                      <div className="text-white font-semibold text-sm">
                        {selectedCandidate.credentialOcrData?.candidateName || selectedCandidate.name}
                      </div>
                      <div className="text-emerald-400 text-[11px]">
                        ✓ Matches applicant government identity
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                        <div className="text-[10px] text-neutral-500 uppercase">4. Conferred Date</div>
                        <div className="text-white font-semibold">
                          {selectedCandidate.credentialOcrData?.issueDate || `May ${selectedCandidate.graduationYear}`}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                        <div className="text-[10px] text-neutral-500 uppercase">5. Credential / Seal ID</div>
                        <div className="text-white font-semibold truncate">
                          {selectedCandidate.credentialOcrData?.credentialId || 'STAN-CS-2023-94821'}
                        </div>
                      </div>
                    </div>

                    {/* Raw OCR Text Log */}
                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase">Raw OCR Scan String</div>
                      <div className="text-[11px] text-neutral-400 line-clamp-3 leading-relaxed">
                        {selectedCandidate.credentialOcrData?.rawOcrText ||
                          `${selectedCandidate.institution} • DIPLOMA RECORD • ${selectedCandidate.name} • ${selectedCandidate.degreeTitle} • OFFICIAL REGISTRAR ARCHIVE`}
                      </div>
                    </div>
                  </div>

                  {/* Optional Rejection note */}
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">
                      Audit Notes / Rejection Reason (if rejecting):
                    </label>
                    <input
                      type="text"
                      value={rejectionNotes}
                      onChange={(e) => setRejectionNotes(e.target.value)}
                      placeholder="e.g. Uploaded document missing registrar seal or blurred text"
                      className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white"
                    />
                  </div>
                </div>

                {/* RIGHT PANE: Uploaded Document Image (with zoom/pan controls) */}
                <div className="p-6 flex flex-col space-y-4 bg-neutral-950/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-emerald-400" />
                        Uploaded Credential Visual Scan
                      </h3>
                      <p className="text-xs text-neutral-400">
                        Inspect official calligraphy, watermark seal, and signatures.
                      </p>
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-lg">
                      <button
                        onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.2))}
                        className="p-1 text-neutral-400 hover:text-white"
                        title="Zoom out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-[11px] font-mono text-neutral-300 px-1">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <button
                        onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
                        className="p-1 text-neutral-400 hover:text-white"
                        title="Zoom in"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setZoomLevel(1)}
                        className="p-1 text-neutral-400 hover:text-white"
                        title="Reset zoom"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Document Container */}
                  <div className="flex-1 min-h-[380px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden relative flex items-center justify-center p-4">
                    <div
                      className="transition-transform duration-200 ease-out origin-center"
                      style={{ transform: `scale(${zoomLevel})` }}
                    >
                      <img
                        src={selectedCandidate.credentialDocumentUrl}
                        alt="Candidate official academic diploma"
                        referrerPolicy="no-referrer"
                        className="max-h-[360px] object-contain rounded-lg shadow-2xl border border-neutral-800"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-neutral-400 font-mono flex items-center justify-between">
                    <span>File: {selectedCandidate.name.replace(/\s+/g, '_')}_Official_Diploma.pdf</span>
                    <span className="text-emerald-400 font-semibold">256-bit Hash: Valid</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Employer Verification Queue */}
      {activeSection === 'employers' && (
        <div className="space-y-4">
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">Employer Corporate Verification Queue</h3>
              <p className="text-xs text-neutral-400">
                To protect passive talent, hiring entities must submit verified EIN Tax IDs and corporate domains before gaining search access.
              </p>
            </div>

            <div className="divide-y divide-neutral-800">
              {employers.map((emp) => (
                <div key={emp.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{emp.companyName}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded capitalize ${
                          emp.verificationStatus === 'approved'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-900'
                            : emp.verificationStatus === 'rejected'
                            ? 'bg-red-950 text-red-400 border border-red-900'
                            : 'bg-amber-950 text-amber-400 border border-amber-900'
                        }`}
                      >
                        {emp.verificationStatus}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-400 font-mono">
                      <span>{emp.taxId}</span>
                      <span aria-hidden="true" className="mx-1.5">·</span>
                      <span>Domain: {emp.corporateDomain}</span>
                      <span aria-hidden="true" className="mx-1.5">·</span>
                      <span>{emp.industry}</span>
                    </div>

                    <div className="text-xs text-neutral-300">
                      Recruiter: {emp.recruiterName} ({emp.recruiterTitle}) ·{' '}
                      <a href={`mailto:${emp.email}`} className="text-blue-400 hover:underline">
                        {emp.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {emp.verificationStatus === 'pending' ? (
                      <>
                        <button
                          onClick={() => verifyEmployerBusiness(emp.id, false, 'Invalid EIN or corporate domain')}
                          className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => verifyEmployerBusiness(emp.id, true)}
                          className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition-colors shadow-md shadow-emerald-500/10"
                        >
                          Approve Corporate Account
                        </button>
                      </>
                    ) : emp.verificationStatus === 'approved' ? (
                      <button
                        onClick={() => verifyEmployerBusiness(emp.id, false, 'Corporate credentials revoked')}
                        className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs transition-colors"
                      >
                        Revoke Access
                      </button>
                    ) : (
                      <button
                        onClick={() => verifyEmployerBusiness(emp.id, true)}
                        className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                      >
                        Re-Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: Platform Metrics & Inactivity Engine Overview */}
      {activeSection === 'metrics' && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Platform Health & Lifecycle Metrics</h3>
            <p className="text-xs text-neutral-400">
              Overview of the RAMP ecosystem and active talent pools.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
              <div className="text-[11px] text-neutral-500">TOTAL CANDIDATE POOL</div>
              <div className="text-2xl font-bold text-white mt-1 tabular-nums">
                {candidates.length}
              </div>
              <div className="text-[10px] text-emerald-400 mt-1">100% Free for Talent</div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
              <div className="text-[11px] text-neutral-500">VERIFIED DEGREE BADGES</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                {allVerifiedCandidates.length}
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">OCR Validated Credentials</div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
              <div className="text-[11px] text-neutral-500">JOB INVITES DISPATCHED</div>
              <div className="text-2xl font-bold text-blue-400 mt-1 tabular-nums">
                {jobInvites.length}
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Direct Employer Reachouts</div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
              <div className="text-[11px] text-neutral-500">14/30 ARCHIVED PROFILES</div>
              <div className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">
                {candidates.filter((c) => c.simulatedDaysInactive >= 14).length}
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Hidden from search pools</div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Email Composer Modal */}
      {isEmailModalOpen && selectedCandidate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Direct Email Composer</h3>
                  <p className="text-[11px] text-neutral-400">Send an official platform update to candidate</p>
                </div>
              </div>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* To/From Fields */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <label className="block text-neutral-500 uppercase tracking-wider text-[10px] mb-1">From (Verified)</label>
                  <input
                    type="text"
                    disabled
                    value="governance@ramp.platform"
                    className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-neutral-500 uppercase tracking-wider text-[10px] mb-1">To Candidate</label>
                  <input
                    type="text"
                    disabled
                    value={`${selectedCandidate.name} <${selectedCandidate.email}>`}
                    className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-400 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Quick Templates Selector */}
              <div>
                <label className="block text-neutral-400 text-xs font-medium mb-1.5">Quick-Insert Templates</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('legibility')}
                    className={`px-2.5 py-1.5 text-left text-[11px] rounded-lg border transition-colors ${
                      emailTemplate === 'legibility'
                        ? 'bg-purple-950/40 border-purple-800 text-purple-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    🔍 Request Legible Re-upload
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('grad_year')}
                    className={`px-2.5 py-1.5 text-left text-[11px] rounded-lg border transition-colors ${
                      emailTemplate === 'grad_year'
                        ? 'bg-purple-950/40 border-purple-800 text-purple-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    📅 Discrepancy Clarification
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('congrats')}
                    className={`px-2.5 py-1.5 text-left text-[11px] rounded-lg border transition-colors ${
                      emailTemplate === 'congrats'
                        ? 'bg-purple-950/40 border-purple-800 text-purple-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    🎉 Congratulate & Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('none')}
                    className={`px-2.5 py-1.5 text-left text-[11px] rounded-lg border transition-colors ${
                      emailTemplate === 'none'
                        ? 'bg-purple-950/40 border-purple-800 text-purple-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    ✍️ Draft Custom Blank
                  </button>
                </div>
              </div>

              {/* Subject Input */}
              <div className="space-y-1">
                <label className="block text-neutral-400 text-xs font-medium">Subject Line</label>
                <input
                  type="text"
                  required
                  placeholder="Enter email subject..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-xs placeholder-neutral-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Message Body Input */}
              <div className="space-y-1">
                <label className="block text-neutral-400 text-xs font-medium">Message Body</label>
                <textarea
                  required
                  rows={8}
                  placeholder="Write your email body here..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-xs placeholder-neutral-600 focus:outline-none focus:border-purple-500 font-sans leading-relaxed"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-md shadow-purple-600/20"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
