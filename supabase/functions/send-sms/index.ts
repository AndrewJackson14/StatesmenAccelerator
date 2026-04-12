// ============================================================
// Edge Function: send-sms
// Sends an SMS via Twilio REST API.
//
// Required environment variables (set via Supabase secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER    (e.g. +15555555555)
//
// Invocation payload:
//   { to: string, body: string, user_id?: string }
//
// If Twilio env vars are missing, the function logs the send
// attempt and returns 200 ok with dry_run=true so the rest of
// the platform can run before real credentials are configured.
// ============================================================

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: { to?: string; body?: string; user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { to, body, user_id } = payload;
  if (!to || !body) {
    return json({ error: 'to and body are required' }, 400);
  }

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');

  // Dry run if credentials aren't set yet
  if (!sid || !token || !from) {
    console.log('[send-sms dry run]', { to, body, user_id });
    return json({
      ok: true,
      dry_run: true,
      message: 'Twilio credentials not configured; SMS not actually sent.',
    });
  }

  // Real Twilio API call
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const creds = btoa(`${sid}:${token}`);
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', from);
  form.set('Body', body);

  try {
    const twilioResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const twilioData: any = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('[send-sms twilio error]', twilioData);
      return json({ ok: false, error: twilioData.message ?? 'Twilio error' }, 500);
    }

    return json({
      ok: true,
      dry_run: false,
      sid: twilioData.sid,
      status: twilioData.status,
    });
  } catch (err: any) {
    console.error('[send-sms fetch error]', err);
    return json({ ok: false, error: err?.message ?? 'Network error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
