import React from 'react';
import { useRamp } from '../../context/RampContext';
import { X, Mail, Send, CheckCircle, Shield } from 'lucide-react';

export const EmailViewerModal: React.FC = () => {
  const { selectedEmailModal, setSelectedEmailModal } = useRamp();

  if (!selectedEmailModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 font-mono">
                Email Dispatch Inspector · Live SMTP Simulator
              </div>
              <h3 className="text-sm font-bold text-white truncate max-w-md">
                {selectedEmailModal.subject}
              </h3>
            </div>
          </div>
          <button
            onClick={() => setSelectedEmailModal(null)}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Email Meta Information */}
        <div className="px-6 py-3 bg-neutral-950/70 border-b border-neutral-800 text-xs font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-neutral-500">From:</span>
            <span className="text-neutral-300">{selectedEmailModal.senderName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">To:</span>
            <span className="text-neutral-300">
              {selectedEmailModal.toName} &lt;{selectedEmailModal.toEmail}&gt;
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Date:</span>
            <span className="text-neutral-400">
              {new Date(selectedEmailModal.sentAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Rendered HTML Body */}
        <div className="p-6 bg-neutral-100 text-neutral-900 max-h-[500px] overflow-y-auto">
          <div
            dangerouslySetInnerHTML={{ __html: selectedEmailModal.htmlBody }}
            className="email-content"
          />
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex justify-end">
          <button
            onClick={() => setSelectedEmailModal(null)}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
