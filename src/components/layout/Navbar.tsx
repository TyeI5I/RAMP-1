import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import { AccountDataControls } from '../auth/AccountDataControls';
import {
  Bell,
  Smartphone,
  Monitor,
  Mail,
} from 'lucide-react';

interface NavbarProps {
  setActiveTab: (tab: 'search' | 'candidate' | 'admin' | 'lifecycle' | 'onboarding') => void;
  onOpenNotifications: () => void;
  onOpenEmails: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  setActiveTab,
  onOpenNotifications,
  onOpenEmails,
}) => {
  const {
    isDemoMode,
    authSession,
    signOut,
    currentRole,
    unreadNotificationCount,
    emailLogs,
    mobilePreviewMode,
    setMobilePreviewMode,
  } = useRamp();

  const [authActionError, setAuthActionError] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single text wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (currentRole === 'candidate') setActiveTab('candidate');
              else if (currentRole === 'admin') setActiveTab('admin');
              else setActiveTab('search');
            }}
            className="flex items-center gap-2 text-left focus-visible:outline-none"
          >
            <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              RAMPED
            </span>
            <span className="hidden md:inline-block text-xs text-neutral-400 font-normal">
              Recruiter & Applicant Matching Platform for Employment and Discovery
            </span>
          </button>
        </div>

        {/* Zone 2: Account and notifications */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Email Inbox Preview Button */}
          {isDemoMode && <button
            onClick={onOpenEmails}
            title="Inspect candidate email notifications"
            className="relative p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
          >
            <Mail className="w-4 h-4" />
            {emailLogs.length > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
            )}
          </button>}

          {/* In-App Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            title="In-App Push Notifications"
            className="relative p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>

          {/* Mobile frame toggle */}
          <button
            onClick={() => setMobilePreviewMode(!mobilePreviewMode)}
            title={mobilePreviewMode ? 'Switch to Full Desktop View' : 'Preview Mobile App Layout'}
            className={`p-2 rounded-md transition-colors hidden sm:inline-flex ${
              mobilePreviewMode
                ? 'bg-neutral-800 text-amber-400 border border-neutral-700'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            {mobilePreviewMode ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </button>

          {!isDemoMode && (
            <div className="flex items-center gap-2">
              <AccountDataControls />
              <span className="hidden sm:inline text-xs text-neutral-400">{authSession?.user.email}</span>
              <button
                type="button"
                onClick={() => {
                  setAuthActionError(null);
                  void signOut().catch((error: unknown) =>
                    setAuthActionError(error instanceof Error ? error.message : 'Unable to sign out.')
                  );
                }}
                className="rounded-md border border-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-900"
              >
                Sign out
              </button>
            </div>
          )}

          {authActionError && <span role="alert" className="text-[11px] text-red-300">{authActionError}</span>}
        </div>
      </div>
    </header>
  );
};
