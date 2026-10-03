import React from 'react';
import { useRamp } from '../../context/RampContext';
import { X, Bell, Mail, Check, ShieldCheck, Clock, Zap } from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  const {
    notifications,
    markNotificationAsRead,
    currentRole,
    currentCandidateId,
    currentEmployerId,
  } = useRamp();

  if (!isOpen) return null;

  // Filter relevant notifications
  const relevantNotifications = notifications.filter((n) => {
    if (currentRole === 'candidate') return n.userId === currentCandidateId;
    if (currentRole === 'employer') return n.userId === currentEmployerId;
    return true; // admin sees all
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-neutral-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">
                In-App Push Notifications
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {relevantNotifications.length === 0 ? (
              <div className="text-center py-12 text-xs text-neutral-500">
                No notifications for current user persona.
              </div>
            ) : (
              relevantNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => markNotificationAsRead(notif.id)}
                  className={`p-4 rounded-xl border text-xs space-y-1.5 cursor-pointer transition-all ${
                    notif.read
                      ? 'bg-neutral-950/60 border-neutral-850 text-neutral-400'
                      : 'bg-neutral-950 border-neutral-700/80 text-white shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5">
                      {!notif.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      )}
                      {notif.title}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                      {new Date(notif.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">{notif.message}</p>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-neutral-800 bg-neutral-950 text-center">
            <span className="text-[11px] text-neutral-500 font-mono">
              RAMP Push Event Channel · Instant In-App Dispatch
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
