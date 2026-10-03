import React, { useState } from 'react';
import { RampProvider, useRamp } from './context/RampContext';
import { Navbar } from './components/layout/Navbar';
import { CandidateDashboard } from './components/candidate/CandidateDashboard';
import { CandidateOnboardingModal } from './components/candidate/CandidateOnboardingModal';
import { EmployerSearchPortal } from './components/employer/EmployerSearchPortal';
import { AdminPortal } from './components/admin/AdminPortal';
import { LifecycleTimeMachine } from './components/common/LifecycleTimeMachine';
import { EmailViewerModal } from './components/common/EmailViewerModal';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { EmailListDrawer } from './components/common/EmailListDrawer';
import {
  Smartphone,
  ShieldCheck,
  Zap,
  Lock,
  ArrowRight,
  Flame,
  Shuffle,
  Mail,
  UserCheck,
} from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentRole,
    setCurrentRole,
    mobilePreviewMode,
    setMobilePreviewMode,
  } = useRamp();

  const [activeTab, setActiveTab] = useState<'search' | 'candidate' | 'admin' | 'lifecycle' | 'onboarding'>('search');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isEmailsOpen, setIsEmailsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenEmails={() => setIsEmailsOpen(true)}
      />

      {/* Hero Explainer Sub-Banner (Concise & Domain-Authentic) */}
      <div className="border-b border-neutral-800 bg-neutral-900/40 py-2.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="font-bold text-white uppercase tracking-wider text-[10px] bg-neutral-800 px-2 py-0.5 rounded font-mono">
              Model Reversal
            </span>
            <span>
              Candidates remain passive with verified credentials · Employers search categories and send direct job invites.
            </span>
          </div>

          <div className="flex items-center gap-4 text-neutral-400 font-mono text-[11px] shrink-0">
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              OCR Verified Credentials
            </span>
            <span className="hidden md:inline-block">·</span>
            <span className="hidden md:flex items-center gap-1 text-blue-400">
              <Shuffle className="w-3.5 h-3.5" />
              Fairness Random Shuffle
            </span>
            <span className="hidden md:inline-block">·</span>
            <span className="hidden md:flex items-center gap-1 text-amber-400">
              <Flame className="w-3.5 h-3.5" />
              Strict 14/30 Inactivity Rule
            </span>
          </div>
        </div>
      </div>

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {mobilePreviewMode ? (
          /* Mobile Device Frame Simulator */
          <div className="flex flex-col items-center justify-center my-4">
            <div className="text-center mb-3">
              <div className="text-xs font-bold text-amber-400 font-mono">
                📱 Mobile Viewport Simulator (390px × 844px)
              </div>
              <div className="text-[11px] text-neutral-500">
                Testing responsive touch ergonomics & strict 15% sticky layout rules
              </div>
            </div>

            <div className="w-[390px] h-[844px] rounded-[48px] border-[10px] border-neutral-800 bg-neutral-950 overflow-y-auto shadow-2xl relative p-4 space-y-4">
              {/* iPhone Notch */}
              <div className="sticky top-0 z-50 -mt-4 -mx-4 pb-2 pt-2 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center border-b border-neutral-850">
                <div className="w-24 h-4 rounded-full bg-neutral-800"></div>
              </div>

              {activeTab === 'search' && <EmployerSearchPortal />}
              {activeTab === 'candidate' && (
                <CandidateDashboard onOpenOnboarding={() => setIsOnboardingOpen(true)} />
              )}
              {activeTab === 'admin' && <AdminPortal />}
              {activeTab === 'lifecycle' && <LifecycleTimeMachine />}
            </div>
          </div>
        ) : (
          /* Standard Desktop View */
          <div>
            {activeTab === 'search' && <EmployerSearchPortal />}
            {activeTab === 'candidate' && (
              <CandidateDashboard onOpenOnboarding={() => setIsOnboardingOpen(true)} />
            )}
            {activeTab === 'admin' && <AdminPortal />}
            {activeTab === 'lifecycle' && <LifecycleTimeMachine />}
          </div>
        )}
      </main>

      {/* Drawers & Modals */}
      <CandidateOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      <NotificationDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      <EmailListDrawer
        isOpen={isEmailsOpen}
        onClose={() => setIsEmailsOpen(false)}
      />

      <EmailViewerModal />

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-950 py-6 px-4 text-center text-xs text-neutral-400 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            RAMP · Recruiter & Applicant Matching Platform · Reversing the traditional job board
          </div>
          <div className="flex items-center gap-4 text-neutral-400">
            <span>Candidate Free Access</span>
            <span aria-hidden="true">·</span>
            <span>Enterprise Tier 1 & 2 Subscriptions</span>
            <span aria-hidden="true">·</span>
            <span>Google Vision OCR Verification</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <RampProvider>
      <AppContent />
    </RampProvider>
  );
}
