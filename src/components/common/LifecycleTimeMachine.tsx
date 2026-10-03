import React, { useState } from 'react';
import { useRamp } from '../../context/RampContext';
import {
  Clock,
  AlertTriangle,
  Flame,
  CheckCircle,
  ShieldAlert,
  ArrowRight,
  Mail,
  Bell,
  RotateCcw,
} from 'lucide-react';

export const LifecycleTimeMachine: React.FC = () => {
  const {
    candidates,
    currentCandidateId,
    setCurrentCandidateId,
    simulateInactivityDays,
    checkInCandidate,
    emailLogs,
    notifications,
    setSelectedEmailModal,
  } = useRamp();

  const activeCandidate =
    candidates.find((c) => c.id === currentCandidateId) || candidates[0];

  const [sliderValue, setSliderValue] = useState<number>(
    activeCandidate?.simulatedDaysInactive ?? 0
  );

  if (!activeCandidate) return null;

  const handleSliderChange = (newDays: number) => {
    setSliderValue(newDays);
    simulateInactivityDays(activeCandidate.id, newDays);
  };

  const daysInactive = activeCandidate.simulatedDaysInactive;
  const isArchived = daysInactive >= 14;
  const isWarning = daysInactive >= 11 && !isArchived;

  // Recent notifications and emails for this candidate
  const candidateEmails = emailLogs.filter((e) => e.toEmail === activeCandidate.email);
  const candidateNotifs = notifications.filter((n) => n.userId === activeCandidate.id);

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
          <Clock className="w-4 h-4" />
          Strict 14/30 Inactivity Lifecycle Engine · Interactive Simulator
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Test Candidate Activity Decay & Automated Retention Warnings
        </h2>
        <p className="text-xs text-neutral-400 max-w-3xl leading-relaxed">
          RAMP completely eliminates stale "ghost profiles" on traditional job boards. Passive candidates must check in every 14 days or they are automatically removed from employer search pools. If inactive for 30 days, accounts are permanently expunged.
        </p>
      </div>

      {/* Main Testing Control Panel */}
      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-6">
        {/* Candidate Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
          <div>
            <div className="text-xs font-semibold text-neutral-400">Selected Candidate for Simulation:</div>
            <div className="text-base font-bold text-white mt-0.5">
              {activeCandidate.name} ({activeCandidate.targetCategories[0]})
            </div>
            <div className="text-xs text-neutral-500 font-mono">{activeCandidate.email}</div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {candidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => {
                  setCurrentCandidateId(cand.id);
                  setSliderValue(cand.simulatedDaysInactive);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeCandidate.id === cand.id
                    ? 'bg-neutral-800 text-amber-400 border border-amber-500/40 font-bold'
                    : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-850'
                }`}
              >
                {cand.name.split(' ')[0]} ({cand.simulatedDaysInactive}d)
              </button>
            ))}
          </div>
        </div>

        {/* Current State Indicator Box */}
        <div
          className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            daysInactive >= 30
              ? 'bg-red-950/30 border-red-800/60 text-red-200'
              : daysInactive >= 14
              ? 'bg-red-950/20 border-red-800/40 text-red-200'
              : daysInactive >= 11
              ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
              : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
          }`}
        >
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider">
              {daysInactive >= 30
                ? 'Status: PERMANENTLY PURGED (Day 30+)'
                : daysInactive >= 27
                ? 'Status: DELETION WARNING (Day 27-29)'
                : daysInactive >= 14
                ? 'Status: ARCHIVED / HIDDEN FROM SEARCH (Day 14-26)'
                : daysInactive >= 13
                ? 'Status: 1-DAY URGENT WARNING (Day 13)'
                : daysInactive >= 11
                ? 'Status: 3-DAY WARNING (Day 11-12)'
                : 'Status: ACTIVE IN SEARCH POOL (Day 0-10)'}
            </div>
            <div className="text-base font-bold text-white mt-1">
              Candidate Inactivity: <span className="font-mono text-xl">{daysInactive}</span> Days
            </div>
            <div className="text-xs text-neutral-300 mt-1">
              Employer Search Pool Visibility:{' '}
              <strong className={isArchived ? 'text-red-400' : 'text-emerald-400'}>
                {isArchived ? 'HIDDEN (Excluded from search results)' : 'VISIBLE (Discoverable)'}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                checkInCandidate(activeCandidate.id);
                setSliderValue(0);
              }}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-neutral-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              1-Click Reactivate & Reset Clock
            </button>
          </div>
        </div>

        {/* Days Slider Control */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-neutral-300">
              Drag Time Slider (Fast-forward days inactive):
            </label>
            <span className="font-mono font-bold text-amber-400 text-sm">
              Day {sliderValue} of 30
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={sliderValue}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full h-2 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />

          <div className="flex justify-between text-[11px] font-mono text-neutral-500">
            <span>Day 0 (Active)</span>
            <span>Day 11 (3d Warn)</span>
            <span>Day 13 (1d Warn)</span>
            <span>Day 14 (Archived)</span>
            <span>Day 27 (Purge Warn)</span>
            <span>Day 30 (Purged)</span>
          </div>
        </div>

        {/* Quick Jump Buttons */}
        <div className="space-y-2 pt-2">
          <div className="text-xs font-semibold text-neutral-400">Quick-Jump Presets:</div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <button
              onClick={() => handleSliderChange(0)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                sliderValue === 0
                  ? 'bg-neutral-800 text-white border-neutral-600'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              Day 0 (Active)
            </button>

            <button
              onClick={() => handleSliderChange(11)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                sliderValue === 11
                  ? 'bg-amber-950/40 text-amber-300 border-amber-600'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-amber-400'
              }`}
            >
              Day 11 (3d Warn)
            </button>

            <button
              onClick={() => handleSliderChange(13)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                sliderValue === 13
                  ? 'bg-amber-950/40 text-amber-300 border-amber-600'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-amber-400'
              }`}
            >
              Day 13 (1d Warn)
            </button>

            <button
              onClick={() => handleSliderChange(14)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                sliderValue === 14
                  ? 'bg-red-950/40 text-red-300 border-red-600'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-red-400'
              }`}
            >
              Day 14 (ARCHIVED)
            </button>

            <button
              onClick={() => handleSliderChange(27)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                sliderValue === 27
                  ? 'bg-red-950/40 text-red-300 border-red-600'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-red-400'
              }`}
            >
              Day 27 (Final Warn)
            </button>

            <button
              onClick={() => handleSliderChange(30)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                sliderValue === 30
                  ? 'bg-red-950/40 text-red-300 border-red-600'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-red-400'
              }`}
            >
              Day 30 (Deleted)
            </button>
          </div>
        </div>
      </div>

      {/* Generated Automated Notifications & Emails Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* In-App Push Notifications Fired */}
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-emerald-400" />
              In-App Push Notifications Fired ({candidateNotifs.length})
            </h3>
            <span className="text-[11px] font-mono text-neutral-500">Live Queue</span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {candidateNotifs.length === 0 ? (
              <div className="text-xs text-neutral-500 py-4 text-center">
                No notifications logged for this candidate.
              </div>
            ) : (
              candidateNotifs.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs space-y-1"
                >
                  <div className="font-semibold text-white flex items-center justify-between">
                    <span>{n.title}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {new Date(n.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-neutral-400 text-[11px] leading-relaxed">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Automated Emails Dispatched */}
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-blue-400" />
              Official Emails Dispatched ({candidateEmails.length})
            </h3>
            <span className="text-[11px] font-mono text-neutral-500">SMTP Pipeline</span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {candidateEmails.length === 0 ? (
              <div className="text-xs text-neutral-500 py-4 text-center">
                No emails dispatched yet.
              </div>
            ) : (
              candidateEmails.map((e) => (
                <div
                  key={e.id}
                  onClick={() => setSelectedEmailModal(e)}
                  className="cursor-pointer p-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-xs space-y-1 transition-colors group"
                >
                  <div className="font-semibold text-white flex items-center justify-between">
                    <span className="truncate group-hover:text-blue-400 transition-colors">
                      {e.subject}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono shrink-0 ml-2">
                      Inspect
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    To: {e.toName} ({e.toEmail})
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
