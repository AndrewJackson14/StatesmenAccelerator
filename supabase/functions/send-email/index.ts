// ============================================================
// Edge Function: send-email
// Sends transactional email via Resend.
//
// Required environment variables (set via Supabase secrets):
//   RESEND_API_KEY       (re_...)
//   RESEND_FROM_EMAIL    (e.g. "Statesmen Accelerator <noreply@statesmen.org>")
//
// Invocation payload:
//   {
//     to: string,
//     subject: string,
//     html?: string,
//     text?: string,
//     user_id?: string,
//   }
//
// If Resend env vars are missing, the function logs the attempt
// and returns 200 ok with dry_run=true so the rest of the
// platform can run before real credentials are configured.
// ============================================================

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: {
    to?: string;
    subject?: string;
    html?: string;
    text?: string;
    user_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { to, subject, html, text, user_id } = payload;
  if (!to || !subject || (!html && !text)) {
    return json({ error: 'to, subject, and html or text are required' }, 400);
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');

  if (!apiKey || !from) {
    console.log('[send-email dry run]', { to, subject, user_id });
    return json({
      ok: true,
      dry_run: true,
      message: 'Resend credentials not configured; email not actually sent.',
    });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    const data: any = await res.json();

    if (!res.ok) {
      console.error('[send-email resend error]', data);
      return json(
        { ok: false, error: data.message ?? data.name ?? 'Resend error' },
        res.status,
      );
    }

    return json({
      ok: true,
      dry_run: false,
      id: data.id,
    });
  } catch (err: any) {
    console.error('[send-email fetch error]', err);
    return json({ ok: false, error: err?.message ?? 'Network error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
