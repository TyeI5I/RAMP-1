import React from 'react';
import { useRamp } from '../../context/RampContext';
import { EmailLog } from '../../types/ramp';
import { X, Mail, ExternalLink, Calendar, User } from 'lucide-react';

interface EmailListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailListDrawer: React.FC<EmailListDrawerProps> = ({ isOpen, onClose }) => {
  const { emailLogs, setSelectedEmailModal } = useRamp();

  if (!isOpen) return null;

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
              <Mail className="w-4 h-4 text-blue-400" />
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Simulated SMTP Email Outbox
                </h2>
                <div className="text-[11px] text-neutral-400 font-mono">
                  {emailLogs.length} Official Emails Dispatched
                </div>
              </div>
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
            {emailLogs.length === 0 ? (
              <div className="text-center py-12 text-xs text-neutral-500">
                No emails dispatched yet.
              </div>
            ) : (
              emailLogs.map((email) => (
                <div
                  key={email.id}
                  onClick={() => {
                    setSelectedEmailModal(email);
                    onClose();
                  }}
                  className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 hover:border-neutral-700 text-xs space-y-2 cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between font-semibold text-white group-hover:text-blue-400 transition-colors">
                    <span className="truncate pr-2">{email.subject}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-neutral-500 group-hover:text-blue-400" />
                  </div>

                  <div className="text-[11px] text-neutral-400 space-y-0.5 font-mono">
                    <div>To: {email.toName} ({email.toEmail})</div>
                    <div>From: {email.senderName}</div>
                    <div className="text-neutral-500">
                      Sent: {new Date(email.sentAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-neutral-800 bg-neutral-950 text-center">
            <span className="text-[11px] text-neutral-500 font-mono">
              Click any email to inspect the full HTML template
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
