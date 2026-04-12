// ============================================================
// SMS helper
// Wraps supabase.functions.invoke('send-sms') and adds a
// user-aware helper that looks up phone + consent before firing.
// ============================================================

import { supabase } from '@/lib/supabase';

interface SendResult {
  sent: boolean;
  reason?: 'no_phone' | 'no_consent' | 'invoke_error' | 'dry_run';
  sid?: string;
  error?: string;
}

/**
 * Send an SMS to a specific phone number. Fire-and-forget unless you await.
 * Skips silently if Twilio credentials aren't set (edge function dry-runs).
 */
export async function sendSms(to: string, body: string, userId?: string): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: { to, body, user_id: userId },
  });
  if (error) return { sent: false, reason: 'invoke_error', error: error.message };
  const result = data as { ok: boolean; dry_run?: boolean; sid?: string };
  if (result?.dry_run) return { sent: false, reason: 'dry_run' };
  return { sent: !!result?.ok, sid: result?.sid };
}

/**
 * Send an SMS to a user, looking up their phone and consent first.
 * Skips silently (returns sent:false) if the user has no phone or has not
 * opted in to SMS. Never throws — SMS is always best-effort.
 */
export async function sendSmsToUser(userId: string, body: string): Promise<SendResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, sms_opt_in')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.phone) return { sent: false, reason: 'no_phone' };
  if (!profile.sms_opt_in) return { sent: false, reason: 'no_consent' };

  return sendSms(profile.phone, body, userId);
}

/**
 * Canonical SMS message templates. Keep each under ~160 chars so it stays
 * a single segment. Branding the sender is important because many messages
 * are the candidate's first SMS from us.
 */
export const SMS = {
  interviewInvite: () =>
    `Statesmen Accelerator: your application is ready. Pick an interview slot at https://accelerator.statesmen.org Reply STOP to opt out.`,
  interviewConfirmed: (when: string) =>
    `Statesmen Accelerator: interview confirmed for ${when}. Webex link inside the app. Reply STOP to opt out.`,
  approvedConfirmed: () =>
    `Statesmen Accelerator: you're approved! Pay $450 to confirm enrollment: https://accelerator.statesmen.org Reply STOP to opt out.`,
  approvedWaitlisted: () =>
    `Statesmen Accelerator: approved for the waitlist. Reserve your spot with a $225 deposit: https://accelerator.statesmen.org Reply STOP to opt out.`,
  declined: () =>
    `Statesmen Accelerator: thank you for applying. After review, the program isn't the right fit at this time. Your PDP materials remain yours.`,
  onHold: () =>
    `Statesmen Accelerator: your application is on hold pending further review. We'll be in touch with an update. Reply STOP to opt out.`,
  squadAssigned: (squadName: string) =>
    `Statesmen Accelerator: you're assigned to Squad ${squadName}. Check your dashboard at https://accelerator.statesmen.org Reply STOP to opt out.`,
} as const;
