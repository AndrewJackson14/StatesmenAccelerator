import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import AssessmentRenderer from '@/components/AssessmentRenderer';
import type { AssessmentInstanceRow, AssessmentTemplateRow } from '@/types/database';

interface AvailableAssessment {
  instance: AssessmentInstanceRow;
  template: AssessmentTemplateRow;
  submitted: boolean;
}

export default function AssessmentsPage() {
  const { user } = useAuth();
  const uid = user?.id;

  const [assessments, setAssessments] = useState<AvailableAssessment[]>([]);
  const [active, setActive] = useState<AvailableAssessment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (uid) loadAssessments(); }, [uid]);

  async function loadAssessments() {
    setLoading(true);

    // Get user's cohort
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid!)
      .limit(1)
      .maybeSingle();

    if (!membership) { setLoading(false); return; }

    // Get open/scheduled instances for this cohort
    const { data: instances } = await supabase
      .from('assessment_instances')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .in('status', ['open', 'scheduled'])
      .order('release_date', { ascending: true });

    if (!instances || instances.length === 0) { setAssessments([]); setLoading(false); return; }

    // Get templates
    const templateIds = [...new Set(instances.map((i) => i.template_id))];
    const { data: templates } = await supabase
      .from('assessment_templates')
      .select('*')
      .in('id', templateIds);

    // Get user's submissions
    const { data: responses } = await supabase
      .from('assessment_responses')
      .select('instance_id')
      .eq('user_id', uid!)
      .not('submitted_at', 'is', null);

    const submittedIds = new Set(responses?.map((r) => r.instance_id) ?? []);
    const templateMap = new Map((templates ?? []).map((t) => [t.id, t]));

    const available: AvailableAssessment[] = instances
      .map((inst) => {
        const tmpl = templateMap.get(inst.template_id);
        if (!tmpl) return null;
        return {
          instance: inst,
          template: tmpl,
          submitted: submittedIds.has(inst.id),
        };
      })
      .filter((a): a is AvailableAssessment => a !== null);

    setAssessments(available);
    setLoading(false);
  }

  if (active) {
    return (
      <AssessmentRenderer
        template={active.template}
        instance={active.instance}
        onComplete={() => { setActive(null); loadAssessments(); }}
        onCancel={() => setActive(null)}
      />
    );
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading assessments…</div></div>;

  const pending = assessments.filter((a) => !a.submitted && a.instance.status === 'open');
  const completed = assessments.filter((a) => a.submitted);
  const upcoming = assessments.filter((a) => !a.submitted && a.instance.status === 'scheduled');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Assessments</h1>
        <p className="mt-1 text-sm text-slate-400">Complete your assessments to track your growth.</p>
      </div>

      {/* Pending */}
      <Section title={`Ready to Take (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState message="No assessments waiting. You're all caught up." />
        ) : (
          <div className="space-y-2">
            {pending.map((a) => (
              <div key={a.instance.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">{a.template.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {fmtType(a.template.type)}
                    {a.instance.deadline && ` · Due ${fmtDate(a.instance.deadline)}`}
                  </div>
                </div>
                <button className="btn-primary text-xs" onClick={() => setActive(a)}>Start</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Section title={`Upcoming (${upcoming.length})`}>
          <div className="space-y-2">
            {upcoming.map((a) => (
              <div key={a.instance.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3 opacity-60">
                <div>
                  <div className="text-sm text-slate-300">{a.template.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {a.instance.release_date && `Opens ${fmtDate(a.instance.release_date)}`}
                  </div>
                </div>
                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs text-slate-500">Scheduled</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <Section title={`Completed (${completed.length})`}>
          <div className="space-y-2">
            {completed.map((a) => (
              <div key={a.instance.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                <div>
                  <div className="text-sm text-slate-300">{a.template.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{fmtType(a.template.type)}</div>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">✓ Done</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}

function fmtType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
