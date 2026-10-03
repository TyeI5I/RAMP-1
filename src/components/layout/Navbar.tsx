import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import { UserRole } from '../../types/ramp';
import {
  Bell,
  Smartphone,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Briefcase,
  UserCheck,
  Clock,
  Mail,
  ChevronDown,
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'search' | 'candidate' | 'admin' | 'lifecycle' | 'onboarding';
  setActiveTab: (tab: 'search' | 'candidate' | 'admin' | 'lifecycle' | 'onboarding') => void;
  onOpenNotifications: () => void;
  onOpenEmails: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNotifications,
  onOpenEmails,
}) => {
  const {
    currentRole,
    setCurrentRole,
    currentCandidate,
    currentEmployer,
    candidates,
    employers,
    setCurrentCandidateId,
    setCurrentEmployerId,
    unreadNotificationCount,
    emailLogs,
    resetAllSeedData,
    mobilePreviewMode,
    setMobilePreviewMode,
  } = useRamp();

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const handleRoleSelect = (role: UserRole) => {
    setCurrentRole(role);
    setRoleMenuOpen(false);
    if (role === 'employer') setActiveTab('search');
    else if (role === 'candidate') setActiveTab('candidate');
    else if (role === 'admin') setActiveTab('admin');
  };

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
              RAMP
            </span>
            <span className="hidden md:inline-block text-xs text-neutral-400 font-normal">
              Recruiter & Applicant Matching Platform
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links (single line, clean typography) */}
        <nav className="hidden lg:flex items-center gap-1 text-xs font-medium">
          <button
            onClick={() => {
              setCurrentRole('employer');
              setActiveTab('search');
            }}
            className={`px-3 py-2 rounded-md transition-colors ${
              activeTab === 'search'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Employer Search
          </button>

          <button
            onClick={() => {
              setCurrentRole('candidate');
              setActiveTab('candidate');
            }}
            className={`px-3 py-2 rounded-md transition-colors ${
              activeTab === 'candidate'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Candidate Portal
          </button>

          <button
            onClick={() => {
              setCurrentRole('admin');
              setActiveTab('admin');
            }}
            className={`px-3 py-2 rounded-md transition-colors ${
              activeTab === 'admin'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Admin Verification
          </button>

          <button
            onClick={() => setActiveTab('lifecycle')}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'lifecycle'
                ? 'bg-neutral-800 text-amber-400 font-semibold'
                : 'text-neutral-400 hover:text-amber-300 hover:bg-neutral-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            14/30 Lifecycle Simulator
          </button>
        </nav>

        {/* Zone 3: Actions & Role Quick-Switcher */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Email Inbox Preview Button */}
          <button
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
          </button>

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

          {/* Role Persona Switcher */}
          <div className="relative">
            <button
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg border border-neutral-800 bg-neutral-900 text-xs font-medium text-neutral-200 hover:border-neutral-700 transition-colors"
            >
              {currentRole === 'candidate' && <UserCheck className="w-3.5 h-3.5 text-emerald-400" />}
              {currentRole === 'employer' && <Briefcase className="w-3.5 h-3.5 text-blue-400" />}
              {currentRole === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />}
              <span className="capitalize">{currentRole} View</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </button>

            {roleMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl z-50">
                <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase px-2 py-1">
                  Switch Active Persona
                </div>

                <button
                  onClick={() => handleRoleSelect('employer')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors ${
                    currentRole === 'employer'
                      ? 'bg-neutral-800 text-white font-medium'
                      : 'text-neutral-300 hover:bg-neutral-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    <div>
                      <div>Employer (Verified)</div>
                      <div className="text-[11px] text-neutral-400 font-normal">
                        {currentEmployer?.companyName || 'Apex Innovations'}
                      </div>
                    </div>
                  </div>
                  {currentEmployer?.subscriptionTier && (
                    <span className="text-[10px] font-mono text-neutral-400 uppercase">
                      {currentEmployer.subscriptionTier}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleRoleSelect('candidate')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors ${
                    currentRole === 'candidate'
                      ? 'bg-neutral-800 text-white font-medium'
                      : 'text-neutral-300 hover:bg-neutral-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div>Candidate (Passive)</div>
                      <div className="text-[11px] text-neutral-400 font-normal">
                        {currentCandidate?.name || 'Elena Rostova'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-400">
                    Day {currentCandidate?.simulatedDaysInactive || 0}
                  </span>
                </button>

                <button
                  onClick={() => handleRoleSelect('admin')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors ${
                    currentRole === 'admin'
                      ? 'bg-neutral-800 text-white font-medium'
                      : 'text-neutral-300 hover:bg-neutral-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <div>
                      <div>Platform Admin</div>
                      <div className="text-[11px] text-neutral-400 font-normal">OCR Audit & Approvals</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-purple-400">Audit</span>
                </button>

                <div className="border-t border-neutral-800 my-1 pt-1">
                  <button
                    onClick={() => {
                      resetAllSeedData();
                      setRoleMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/40 rounded-lg text-left transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset All Demo Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
