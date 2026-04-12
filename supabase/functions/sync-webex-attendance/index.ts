import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webexToken = Deno.env.get('WEBEX_BOT_TOKEN')!;

const WEBEX_API = 'https://webexapis.com/v1';

serve(async (req) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { session_id } = await req.json();

  if (!session_id) return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400 });

  // Get session details
  const { data: session } = await supabase.from('sessions').select('*').eq('id', session_id).single();
  if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
  if (!session.webex_link) return new Response(JSON.stringify({ error: 'No Webex link' }), { status: 400 });

  // Extract meeting ID from Webex link
  const meetingId = extractMeetingId(session.webex_link);
  if (!meetingId) return new Response(JSON.stringify({ error: 'Could not parse Webex meeting ID' }), { status: 400 });

  // Get participants from Webex API
  let participants: WebexParticipant[] = [];
  try {
    const res = await fetch(`${WEBEX_API}/meetingParticipants?meetingId=${meetingId}`, {
      headers: { Authorization: `Bearer ${webexToken}` },
    });
    if (!res.ok) throw new Error(`Webex API error: ${res.status}`);
    const data = await res.json();
    participants = data.items ?? [];
  } catch (err) {
    return new Response(JSON.stringify({ error: `Webex API: ${err.message}` }), { status: 502 });
  }

  // Get cohort members for email matching
  const { data: cohortMembers } = await supabase
    .from('cohort_members')
    .select('user_id')
    .eq('cohort_id', session.cohort_id);

  if (!cohortMembers) return new Response(JSON.stringify({ error: 'No cohort members' }), { status: 404 });

  const userIds = cohortMembers.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds);

  const emailToUserId = new Map((profiles ?? []).map((p) => [p.email?.toLowerCase(), p.id]));

  // Match Webex participants to users
  const attendanceRecords: {
    session_id: string;
    user_id: string;
    status: string;
    joined_at: string | null;
    left_at: string | null;
    duration_min: number | null;
    camera_on_pct: number | null;
    speaking_time_sec: number | null;
  }[] = [];

  const sessionStart = new Date(session.scheduled_at).getTime();
  const lateThresholdMs = 10 * 60 * 1000; // 10 minutes

  for (const p of participants) {
    const email = p.email?.toLowerCase();
    const userId = email ? emailToUserId.get(email) : null;
    if (!userId) continue;

    const joinedAt = p.joinedTime ? new Date(p.joinedTime) : null;
    const leftAt = p.leftTime ? new Date(p.leftTime) : null;
    const durationMs = joinedAt && leftAt ? leftAt.getTime() - joinedAt.getTime() : null;
    const durationMin = durationMs ? Math.round(durationMs / 60000) : null;

    // Determine status
    let status = 'present';
    if (!joinedAt) {
      status = 'absent';
    } else if (joinedAt.getTime() - sessionStart > lateThresholdMs) {
      status = 'late';
    } else if (durationMin && session.duration_min && durationMin < session.duration_min * 0.75) {
      status = 'left_early';
    }

    attendanceRecords.push({
      session_id,
      user_id: userId,
      status,
      joined_at: joinedAt?.toISOString() ?? null,
      left_at: leftAt?.toISOString() ?? null,
      duration_min: durationMin,
      camera_on_pct: p.videoStatus === 'on' ? 100 : p.videoStatus === 'off' ? 0 : null,
      speaking_time_sec: null, // Webex API doesn't always expose this
    });
  }

  // Mark absent members who didn't join at all
  for (const member of cohortMembers) {
    if (!attendanceRecords.some((r) => r.user_id === member.user_id)) {
      attendanceRecords.push({
        session_id,
        user_id: member.user_id,
        status: 'absent',
        joined_at: null,
        left_at: null,
        duration_min: null,
        camera_on_pct: null,
        speaking_time_sec: null,
      });
    }
  }

  // Upsert attendance
  const { error: upsertError } = await supabase
    .from('session_attendance')
    .upsert(attendanceRecords, { onConflict: 'session_id,user_id' });

  if (upsertError) return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });

  // Audit
  await supabase.from('audit_log').insert({
    action: 'webex_attendance_synced',
    entity_type: 'session',
    entity_id: session_id,
    details: { matched: attendanceRecords.length, webex_participants: participants.length },
  });

  return new Response(JSON.stringify({
    synced: attendanceRecords.length,
    present: attendanceRecords.filter((r) => r.status === 'present').length,
    late: attendanceRecords.filter((r) => r.status === 'late').length,
    absent: attendanceRecords.filter((r) => r.status === 'absent').length,
  }), { headers: { 'Content-Type': 'application/json' } });
});

// ── Types ──

interface WebexParticipant {
  email?: string;
  displayName?: string;
  joinedTime?: string;
  leftTime?: string;
  videoStatus?: string;
}

// ── Helpers ──

function extractMeetingId(link: string): string | null {
  // Webex links: https://meet.webex.com/meet/j.php?MTID=xxx or similar
  const match = link.match(/(?:meetingId=|MTID=|\/(\w{10,}))/);
  if (match) return match[1] ?? match[0].split('=')[1];
  // Try to use the full link as meeting number
  const numMatch = link.match(/(\d{9,12})/);
  return numMatch ? numMatch[1] : null;
}
