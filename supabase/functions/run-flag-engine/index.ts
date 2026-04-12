import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Load thresholds from config
  const { data: configRow } = await supabase.from('system_config').select('value').eq('key', 'flag_thresholds').single();
  const thresholds = configRow?.value as Record<string, Record<string, number>>;
  if (!thresholds) return new Response(JSON.stringify({ error: 'No thresholds configured' }), { status: 500 });

  // Get active cohorts
  const { data: cohorts } = await supabase.from('cohorts').select('id').eq('status', 'active');
  if (!cohorts || cohorts.length === 0) return new Response(JSON.stringify({ flagged: 0 }));

  const cohortIds = cohorts.map((c) => c.id);

  // Get active gentlemen
  const { data: members } = await supabase
    .from('cohort_members')
    .select('user_id, cohort_id')
    .in('cohort_id', cohortIds)
    .eq('role', 'gentleman')
    .is('dropped_at', null);

  if (!members || members.length === 0) return new Response(JSON.stringify({ flagged: 0 }));

  // Get existing open flags to avoid duplicates
  const { data: existingFlags } = await supabase
    .from('flags')
    .select('user_id, flag_type')
    .in('status', ['open', 'acknowledged']);

  const existingSet = new Set((existingFlags ?? []).map((f) => `${f.user_id}:${f.flag_type}`));

  const newFlags: { user_id: string; cohort_id: string; flag_type: string; severity: string; trigger_data: Record<string, unknown> }[] = [];

  function addFlag(userId: string, cohortId: string, flagType: string, severity: string, data: Record<string, unknown>) {
    if (!existingSet.has(`${userId}:${flagType}`)) {
      newFlags.push({ user_id: userId, cohort_id: cohortId, flag_type: flagType, severity, trigger_data: data });
    }
  }

  // ── 1. Attendance flags ──
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('id, cohort_id')
    .in('cohort_id', cohortIds)
    .eq('status', 'completed')
    .gte('scheduled_at', twoWeeksAgo);

  if (recentSessions && recentSessions.length > 0) {
    const { data: attendance } = await supabase
      .from('session_attendance')
      .select('session_id, user_id, status')
      .in('session_id', recentSessions.map((s) => s.id));

    const sessionCohortMap = new Map(recentSessions.map((s) => [s.id, s.cohort_id]));

    for (const member of members) {
      const memberSessions = recentSessions.filter((s) => s.cohort_id === member.cohort_id);
      const memberAtt = (attendance ?? []).filter((a) => a.user_id === member.user_id && memberSessions.some((s) => s.id === a.session_id));
      const total = memberSessions.length;
      if (total === 0) continue;

      const present = memberAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
      const pct = Math.round((present / total) * 100);

      // Check consecutive absences
      const absent = memberAtt.filter((a) => a.status === 'absent');
      const consecutiveAbsences = memberSessions.length - present; // simplified

      if (pct < (thresholds.attendance_critical?.threshold ?? 60) || consecutiveAbsences >= (thresholds.attendance_critical?.consecutive_absences ?? 2)) {
        addFlag(member.user_id, member.cohort_id, 'attendance_critical', 'red', { attendance_pct: pct, consecutive_absences: consecutiveAbsences });
      } else if (pct < (thresholds.attendance_drop?.threshold ?? 80)) {
        addFlag(member.user_id, member.cohort_id, 'attendance_drop', 'yellow', { attendance_pct: pct });
      }
    }
  }

  // ── 2. Pulse decline flags ──
  const { data: pulseTemplates } = await supabase
    .from('assessment_templates')
    .select('id')
    .eq('type', 'weekly_pulse');

  if (pulseTemplates && pulseTemplates.length > 0) {
    const { data: pulseInstances } = await supabase
      .from('assessment_instances')
      .select('id, cohort_id')
      .in('template_id', pulseTemplates.map((t) => t.id))
      .in('cohort_id', cohortIds);

    if (pulseInstances && pulseInstances.length > 0) {
      const { data: pulseResponses } = await supabase
        .from('assessment_responses')
        .select('user_id, score, submitted_at, instance_id')
        .in('instance_id', pulseInstances.map((i) => i.id))
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false });

      for (const member of members) {
        const memberPulses = (pulseResponses ?? [])
          .filter((r) => r.user_id === member.user_id)
          .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime());

        if (memberPulses.length >= 2) {
          const current = memberPulses[0].score ?? 0;
          const previous = memberPulses[1].score ?? 0;
          const drop = previous - current;

          if (drop >= (thresholds.pulse_decline?.drop_points ?? 2)) {
            addFlag(member.user_id, member.cohort_id, 'pulse_decline', 'yellow', { current, previous, drop });
          }
        }

        // Pulse critical: score at 1 for 2+ weeks
        if (memberPulses.length >= 2) {
          const criticalWeeks = memberPulses.slice(0, 2).filter((p) => (p.score ?? 0) <= 1).length;
          if (criticalWeeks >= (thresholds.pulse_critical?.consecutive_weeks ?? 2)) {
            addFlag(member.user_id, member.cohort_id, 'pulse_critical', 'red', { consecutive_low_weeks: criticalWeeks });
          }
        }
      }
    }
  }

  // ── 3. Challenge dropout ──
  const { data: recentChallenges } = await supabase
    .from('challenges')
    .select('id, cohort_id')
    .in('cohort_id', cohortIds)
    .lte('due_date', new Date().toISOString())
    .gte('due_date', twoWeeksAgo);

  if (recentChallenges && recentChallenges.length > 0) {
    const { data: completions } = await supabase
      .from('challenge_completions')
      .select('challenge_id, user_id')
      .in('challenge_id', recentChallenges.map((c) => c.id));

    for (const member of members) {
      const memberChallenges = recentChallenges.filter((c) => c.cohort_id === member.cohort_id);
      if (memberChallenges.length === 0) continue;
      const completed = (completions ?? []).filter((c) => c.user_id === member.user_id && memberChallenges.some((mc) => mc.id === c.challenge_id)).length;
      const pct = Math.round((completed / memberChallenges.length) * 100);

      if (pct < (thresholds.challenge_dropout?.threshold ?? 50)) {
        addFlag(member.user_id, member.cohort_id, 'challenge_dropout', 'yellow', { completion_pct: pct });
      }
    }
  }

  // ── 4. Engagement gap (no app activity 5+ days) ──
  const gapDays = thresholds.engagement_gap?.days ?? 5;
  const gapCutoff = new Date(Date.now() - gapDays * 86400000).toISOString();

  for (const member of members) {
    // Check last activity across multiple tables
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('sender_id', member.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastResponse } = await supabase
      .from('assessment_responses')
      .select('submitted_at')
      .eq('user_id', member.user_id)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastCompletion } = await supabase
      .from('challenge_completions')
      .select('completed_at')
      .eq('user_id', member.user_id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dates = [lastMsg?.created_at, lastResponse?.submitted_at, lastCompletion?.completed_at].filter(Boolean) as string[];
    const lastActivity = dates.length > 0 ? dates.sort().reverse()[0] : null;

    if (!lastActivity || lastActivity < gapCutoff) {
      addFlag(member.user_id, member.cohort_id, 'engagement_gap', 'yellow', { last_activity: lastActivity, days_inactive: gapDays });
    }
  }

  // ── 5. Project stall ──
  const stallWeeks = thresholds.project_stall?.weeks ?? 2;
  const stallCutoff = new Date(Date.now() - stallWeeks * 7 * 86400000).toISOString();

  const { data: projects } = await supabase
    .from('personal_projects')
    .select('user_id, cohort_id, updated_at')
    .in('cohort_id', cohortIds)
    .lt('updated_at', stallCutoff)
    .in('status', ['planning', 'in_progress']);

  for (const proj of projects ?? []) {
    addFlag(proj.user_id, proj.cohort_id, 'project_stall', 'yellow', { last_updated: proj.updated_at });
  }

  // ── Insert all new flags ──
  if (newFlags.length > 0) {
    await supabase.from('flags').insert(newFlags);

    // Create notifications for each flag
    const notifs = newFlags.map((f) => ({
      user_id: f.user_id,
      type: 'flag',
      title: f.severity === 'red' ? 'Action Required' : 'Heads Up',
      body: formatFlagType(f.flag_type),
      channels: f.severity === 'red' ? ['in_app', 'push'] : ['in_app'],
    }));
    await supabase.from('notifications').insert(notifs);
  }

  return new Response(JSON.stringify({ flagged: newFlags.length, checked: members.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function formatFlagType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}
