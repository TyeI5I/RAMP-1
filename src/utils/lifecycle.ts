import { CandidateProfile, PushNotification, EmailLog } from '../types/ramp';

export function calculateLifecycleStatus(daysInactive: number): CandidateProfile['lifecycleStatus'] {
  if (daysInactive >= 30) return 'deleted';
  if (daysInactive >= 27) return 'deletion_warning';
  if (daysInactive >= 14) return 'archived';
  if (daysInactive >= 13) return 'warning_1day';
  if (daysInactive >= 11) return 'warning_3day';
  return 'active';
}

export function isCandidateSearchable(candidate: CandidateProfile): boolean {
  // Must be verified and NOT archived or deleted (daysInactive < 14)
  return candidate.verificationStatus === 'verified' && candidate.simulatedDaysInactive < 14;
}

export function generateNotificationForLifecycle(
  candidate: CandidateProfile,
  daysInactive: number
): { push?: Omit<PushNotification, 'id' | 'timestamp' | 'read'>; email?: Omit<EmailLog, 'id' | 'sentAt'> } | null {
  if (daysInactive === 11) {
    return {
      push: {
        userId: candidate.id,
        title: 'Check in to keep your profile active on RAMP',
        message: 'Your profile has been inactive for 11 days. In 3 days, it will be automatically archived from employer searches.',
        type: 'inactivity_warning',
      },
      email: {
        toEmail: candidate.email,
        toName: candidate.name,
        subject: 'Action Required: Check in to keep your RAMP profile active',
        category: 'inactivity_warning',
        senderName: 'RAMP Activity Engine',
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
              <h2 style="margin: 0; color: #0f172a; font-size: 20px;">RAMP Inactivity Lifecycle Notice</h2>
            </div>
            <p>Hello ${candidate.name},</p>
            <p>You have not checked in to your RAMP account for <strong>11 days</strong>. Under RAMP's fair discovery policy, passive profiles without a check-in are archived after 14 days to ensure recruiters connect only with responsive talent.</p>
            <div style="background: #f8fafc; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0;">
              <p style="margin: 0; font-weight: 600; color: #b45309;">3 Days Remaining Before Profile Archival</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">If you do not check in by Day 14, your profile will be hidden from all employer search pools.</p>
            </div>
            <p>To keep your verified profile active and searchable for direct job invites, simply click below:</p>
            <p style="margin: 24px 0;">
              <a href="#checkin" style="background: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500;">Check In Now (1 Click)</a>
            </p>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">RAMP · Recruiter & Applicant Matching Platform · Automated Safety Engine</p>
          </div>
        `,
      },
    };
  }

  if (daysInactive === 13) {
    return {
      push: {
        userId: candidate.id,
        title: 'URGENT: 24 Hours Left Before Profile Archival',
        message: 'Your profile will be removed from all employer search pools tomorrow unless you check in today.',
        type: 'inactivity_warning',
      },
      email: {
        toEmail: candidate.email,
        toName: candidate.name,
        subject: 'URGENT: 24 Hours Left Before RAMP Profile Archival',
        category: 'inactivity_warning',
        senderName: 'RAMP Activity Engine',
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-bottom: 16px;">
              <h2 style="margin: 0; color: #dc2626; font-size: 20px;">Urgent: 1-Day Inactivity Warning</h2>
            </div>
            <p>Hello ${candidate.name},</p>
            <p>This is your final notice. Your RAMP profile has been inactive for <strong>13 days</strong>. In exactly <strong>24 hours</strong>, your profile will transition to the <strong>ARCHIVED</strong> state.</p>
            <p>Archived profiles are instantly removed from employer search results and cannot receive new direct job invites.</p>
            <p style="margin: 24px 0;">
              <a href="#checkin" style="background: #dc2626; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Check In Now to Stay Visible</a>
            </p>
          </div>
        `,
      },
    };
  }

  if (daysInactive === 14) {
    return {
      push: {
        userId: candidate.id,
        title: 'Your RAMP Profile Has Been Archived',
        message: 'Your profile is now hidden from employer searches. Log in anytime before Day 30 to restore in 1 click.',
        type: 'archived',
      },
      email: {
        toEmail: candidate.email,
        toName: candidate.name,
        subject: 'Notice: Your RAMP Profile is Now Archived',
        category: 'account_archived',
        senderName: 'RAMP Lifecycle Engine',
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #475569;">Profile Archived (Day 14)</h2>
            <p>Hello ${candidate.name},</p>
            <p>Because you have reached 14 days of inactivity, your candidate profile is now <strong>archived</strong>.</p>
            <p>Your uploaded credentials, resume, and verified status remain safe in our encrypted database, but you will not appear in employer searches until you check in.</p>
            <p><strong>Note:</strong> Profiles remaining inactive until Day 30 will be permanently expunged.</p>
            <p><a href="#checkin" style="background: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Restore Profile in 1-Click</a></p>
          </div>
        `,
      },
    };
  }

  if (daysInactive === 27) {
    return {
      push: {
        userId: candidate.id,
        title: 'FINAL WARNING: Account Scheduled for Deletion in 3 Days',
        message: 'Your account and all uploaded credentials will be permanently erased on Day 30 unless you check in.',
        type: 'deletion_warning',
      },
      email: {
        toEmail: candidate.email,
        toName: candidate.name,
        subject: 'FINAL WARNING: Your RAMP Account Will Be Permanently Deleted in 3 Days',
        category: 'deletion_warning',
        senderName: 'RAMP Account Retention',
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #ef4444; border-radius: 8px;">
            <h2 style="color: #dc2626;">3 Days Until Permanent Deletion</h2>
            <p>Hello ${candidate.name},</p>
            <p>You have been inactive for 27 days. In accordance with RAMP's Strict 14/30 Inactivity Lifecycle Engine, all inactive accounts are permanently purged on <strong>Day 30</strong>.</p>
            <p>If you take no action, your account, resume, verified degree certificates, and invite logs will be <strong>irreversibly deleted</strong>.</p>
            <p><a href="#checkin" style="background: #dc2626; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 700;">Prevent Deletion & Restore Account</a></p>
          </div>
        `,
      },
    };
  }

  return null;
}
