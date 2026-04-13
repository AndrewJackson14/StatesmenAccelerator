// ============================================================
// Email helper
// Wraps supabase.functions.invoke('send-email') and provides
// canonical templates for every transactional message the app
// sends. Pairs with src/lib/sms.ts — same trigger points, two
// channels.
// ============================================================

import { supabase } from '@/lib/supabase';

interface SendResult {
  sent: boolean;
  reason?: 'no_email' | 'invoke_error' | 'dry_run';
  id?: string;
  error?: string;
}

/**
 * Send a transactional email. Fire-and-forget unless you await.
 * Silently no-ops when Resend credentials are missing (the edge
 * function dry-runs) so the rest of the platform keeps working.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  userId?: string,
): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject, html, user_id: userId },
  });
  if (error) return { sent: false, reason: 'invoke_error', error: error.message };
  const result = data as { ok: boolean; dry_run?: boolean; id?: string };
  if (result?.dry_run) return { sent: false, reason: 'dry_run' };
  return { sent: !!result?.ok, id: result?.id };
}

/**
 * Send an email to a user, looking up their email address first.
 * Returns sent:false if the user has no email on file. Never throws.
 */
export async function sendEmailToUser(
  userId: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, name')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.email) return { sent: false, reason: 'no_email' };
  return sendEmail(profile.email, subject, html, userId);
}

// ============================================================
// Template shell
// ============================================================

const APP_URL = 'https://accelerator.statesmen.org';
const SUPPORT = 'support@statesmen.org';

function layout(opts: {
  preheader?: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  signoff?: string;
}) {
  const { preheader = '', title, body, cta, signoff = 'The Statesmen team' } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<div style="display:none; max-height:0; overflow:hidden;">${escape(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px; background:#ffffff; border:1px solid #e4e4e7; border-radius:8px; overflow:hidden;">
      <tr><td style="background:#0b0f17; padding:24px 32px; text-align:center;">
        <span style="font-family: Georgia, 'Times New Roman', serif; font-size:22px; color:#c8a96a; letter-spacing:0.02em;">Statesmen Accelerator</span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px; font-family: Georgia, 'Times New Roman', serif; font-size:22px; line-height:1.3; color:#0b0f17;">${escape(title)}</h1>
        <div style="font-size:15px; line-height:1.6; color:#27272a;">${body}</div>
        ${
          cta
            ? `<div style="margin:28px 0 8px;"><a href="${escape(cta.href)}" style="display:inline-block; background:#c8a96a; color:#0b0f17; text-decoration:none; padding:12px 22px; border-radius:6px; font-weight:600; font-size:14px;">${escape(cta.label)}</a></div>`
            : ''
        }
        <p style="margin:28px 0 0; font-size:14px; color:#52525b;">${escape(signoff)}</p>
      </td></tr>
      <tr><td style="padding:20px 32px; background:#fafafa; border-top:1px solid #e4e4e7; font-size:12px; color:#71717a; text-align:center;">
        Questions? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#71717a;">${SUPPORT}</a>.<br>
        Confidence • Character • Ambition
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escape(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Canonical templates — one per notification type
// ============================================================

export const EMAIL = {
  interviewInvite: (firstName?: string) => ({
    subject: 'Your Statesmen Accelerator interview is ready to schedule',
    html: layout({
      preheader: 'Choose a 15-minute interview slot to continue your Accelerator application.',
      title: `${firstName ? `${firstName}, y` : 'Y'}our application is moving forward`,
      body: `
        <p>Thank you for completing the intake assessments. After reviewing your results, the Headmaster has invited you to a brief 15-minute interview to discuss whether the Accelerator is the right fit for this season of your life.</p>
        <p>Choose a time that works for you from the available slots. You'll receive a confirmation with your Webex link as soon as you book.</p>
      `,
      cta: { label: 'Schedule your interview', href: APP_URL },
    }),
  }),

  interviewConfirmed: (whenLabel: string, webexLink?: string | null) => ({
    subject: 'Interview confirmed — Statesmen Accelerator',
    html: layout({
      preheader: `Your interview is scheduled for ${whenLabel}.`,
      title: 'Your interview is confirmed',
      body: `
        <p>Your interview with the Headmaster is scheduled for <strong>${escape(whenLabel)}</strong>.</p>
        <p>We'll send a reminder 24 hours and 15 minutes before the call. Come prepared to talk about your goals, your results from the intake assessments, and why the Accelerator interests you.</p>
        ${
          webexLink
            ? `<p style="margin-top:20px;"><strong>Webex link:</strong><br><a href="${escape(webexLink)}" style="color:#c8a96a;">${escape(webexLink)}</a></p>`
            : ''
        }
      `,
      cta: webexLink ? { label: 'Join Webex', href: webexLink } : undefined,
    }),
  }),

  approvedConfirmed: () => ({
    subject: "You've been approved for Statesmen Accelerator",
    html: layout({
      preheader: 'Complete enrollment to confirm your spot in the upcoming cohort.',
      title: 'Welcome to the Accelerator',
      body: `
        <p>After careful review, we're inviting you to join the next cohort of the Statesmen Accelerator. Your intake scores and interview showed the kind of readiness we look for.</p>
        <p>To confirm your spot, complete enrollment with the <strong>$450 full fee</strong>. Once you've paid, you'll be guided through the final onboarding steps and your dashboard will unlock.</p>
      `,
      cta: { label: 'Confirm enrollment', href: APP_URL },
    }),
  }),

  approvedWaitlisted: () => ({
    subject: "You've been approved to the Statesmen Accelerator waitlist",
    html: layout({
      preheader: 'Reserve your spot with a $225 deposit.',
      title: 'You made the cut — welcome to the waitlist',
      body: `
        <p>After careful review, we're approving your application. The next cohort is filling quickly, so we've placed you on the <strong>waitlist</strong> for the following one.</p>
        <p>To reserve your spot, submit the <strong>$225 deposit</strong> now. When the next cohort opens, we'll automatically charge the remaining $225 and you'll move into full onboarding.</p>
      `,
      cta: { label: 'Reserve your spot', href: APP_URL },
    }),
  }),

  declined: () => ({
    subject: 'Thank you for applying to Statesmen Accelerator',
    html: layout({
      preheader: 'Your Personal Development Package materials remain yours.',
      title: 'Thank you for applying',
      body: `
        <p>After careful consideration, we've determined that the Accelerator isn't the right fit for you at this time. This decision reflects cohort dynamics and fit, not your worth or potential.</p>
        <p>Your Personal Development Package — including the book and your baseline report — remain yours to keep and use. If the timing changes, you're welcome to reapply for a future cohort.</p>
        <p>We wish you the best on the road ahead.</p>
      `,
      signoff: 'With respect,\nThe Statesmen team',
    }),
  }),

  onHold: () => ({
    subject: 'Your Statesmen Accelerator application is under further review',
    html: layout({
      preheader: "We're taking a closer look. No action needed from you.",
      title: 'Your application is on hold',
      body: `
        <p>We've received your interview and are taking a closer look at your application before making a final decision. This doesn't mean anything about you personally — sometimes we need time to balance cohorts or get clarity on a specific question.</p>
        <p>We'll be in touch with an update soon. No action is needed from you in the meantime.</p>
      `,
    }),
  }),

  squadAssigned: (squadName: string) => ({
    subject: `You've been assigned to Squad ${squadName}`,
    html: layout({
      preheader: `Your Statesmen Accelerator squad is ready. Meet the brothers you'll build with.`,
      title: `Welcome to Squad ${squadName}`,
      body: `
        <p>You've been assigned to <strong>Squad ${escape(squadName)}</strong>. Your squad is the small group you'll rely on through the 13 weeks — for accountability, challenges, and the team competitions that shape cohort standings.</p>
        <p>Head to your dashboard to meet your squadmates and introduce yourself in the squad chat.</p>
      `,
      cta: { label: 'Open dashboard', href: APP_URL },
    }),
  }),
} as const;
