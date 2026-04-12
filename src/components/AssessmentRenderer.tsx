import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { AssessmentTemplateRow, AssessmentInstanceRow } from '@/types/database';

interface Props {
  template: AssessmentTemplateRow;
  instance: AssessmentInstanceRow;
  onComplete: () => void;
  onCancel: () => void;
}

interface Item {
  id: string | number;
  text: string;
  subscale?: string;
  reversed?: boolean;
  scale?: string; // 'likert5', 'likert4', 'likert10', 'percentage', 'open'
  options?: { value: number; label: string }[];
  flag_threshold?: number | string;
}

const LIKERT5 = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
];

const LIKERT4 = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

export default function AssessmentRenderer({ template, instance, onComplete, onCancel }: Props) {
  const { user } = useAuth();
  const items = (template.items as unknown as Item[]) ?? [];
  const [responses, setResponses] = useState<Record<string, number | string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.length;
  const current = items[currentIndex];
  const progress = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;
  const allAnswered = items.every((item) => responses[item.id] !== undefined);

  function getScale(item: Item): { value: number; label: string }[] {
    if (item.options) return item.options;
    if (item.scale === 'likert4') return LIKERT4;
    return LIKERT5;
  }

  function handleAnswer(value: number | string) {
    setResponses((prev) => ({ ...prev, [current.id]: value }));
    // Auto-advance after short delay
    if (currentIndex < total - 1) {
      setTimeout(() => setCurrentIndex((i) => i + 1), 200);
    }
  }

  function calculateScore(): { score: number; subscores: Record<string, number> } {
    const subscaleScores: Record<string, { sum: number; count: number }> = {};

    for (const item of items) {
      const raw = responses[item.id];
      if (typeof raw !== 'number') continue;

      let val = raw;
      // Reverse scoring
      if (item.reversed) {
        const scale = getScale(item);
        const max = Math.max(...scale.map((s) => s.value));
        const min = Math.min(...scale.map((s) => s.value));
        val = max + min - raw;
      }

      const sub = item.subscale ?? 'total';
      if (!subscaleScores[sub]) subscaleScores[sub] = { sum: 0, count: 0 };
      subscaleScores[sub].sum += val;
      subscaleScores[sub].count++;
    }

    const subscores: Record<string, number> = {};
    for (const [key, { sum, count }] of Object.entries(subscaleScores)) {
      // Average for likert scales
      subscores[key] = Math.round((sum / count) * 100) / 100;
    }

    // Overall score depends on type
    let score = 0;
    const type = template.type;

    if (type === 'resolve_scale') {
      // Average of all items (1-5 scale)
      const allVals = Object.values(subscores);
      score = allVals.length > 0 ? Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 100) / 100 : 0;
    } else if (type === 'efficacy_index') {
      // Sum of all items (10-40 range)
      score = items.reduce((sum, item) => {
        const raw = responses[item.id];
        return sum + (typeof raw === 'number' ? raw : 0);
      }, 0);
    } else if (type === 'weekly_pulse') {
      // Store individual scores as subscores, overall is average
      const nums = Object.values(responses).filter((v): v is number => typeof v === 'number');
      score = nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
      // Map pulse dimensions to named subscores
      items.forEach((item, i) => {
        const val = responses[item.id];
        if (typeof val === 'number') {
          const dimName = item.subscale ?? `q${i + 1}`;
          subscores[dimName] = val;
        }
      });
    } else if (type === 'character_profile') {
      // Each dimension averaged (4 items each, score 4-20 per dimension)
      score = Object.values(subscores).reduce((a, b) => a + b, 0) / (Object.keys(subscores).length || 1);
      score = Math.round(score * 100) / 100;
    } else if (type === 'self_assessment') {
      // Average across all dimensions
      const vals = Object.values(subscores);
      score = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
    } else {
      // Default: average
      const nums = Object.values(responses).filter((v): v is number => typeof v === 'number');
      score = nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
    }

    return { score, subscores };
  }

  async function handleSubmit() {
    if (!allAnswered) { setError('Please answer all questions.'); return; }

    setSubmitting(true);
    setError(null);

    const { score, subscores } = calculateScore();

    const { error: dbError } = await supabase.from('assessment_responses').insert({
      instance_id: instance.id,
      user_id: user!.id,
      responses,
      score,
      subscores,
      submitted_at: new Date().toISOString(),
    });

    if (dbError) {
      if (dbError.code === '23505') {
        setError('You have already submitted this assessment.');
      } else {
        setError(dbError.message);
      }
      setSubmitting(false);
      return;
    }

    // Check for mental health flags
    if (template.type === 'mental_health_screen') {
      for (const item of items) {
        const val = responses[item.id];
        if (item.flag_threshold !== undefined) {
          const threshold = typeof item.flag_threshold === 'number' ? item.flag_threshold : parseInt(item.flag_threshold, 10);
          if (typeof val === 'number' && val >= threshold) {
            await supabase.from('flags').insert({
              user_id: user!.id,
              flag_type: 'concern_wellbeing',
              severity: 'red',
              trigger_data: { assessment_type: 'mental_health_screen', item_id: item.id, response: val },
            });
          }
        }
      }
    }

    setSubmitting(false);
    onComplete();
  }

  if (total === 0) {
    return (
      <div className="card">
        <div className="py-8 text-center text-sm text-slate-500">This assessment has no items configured.</div>
        <div className="flex justify-end"><button className="btn" onClick={onCancel}>Close</button></div>
      </div>
    );
  }

  const isPulseOrShort = total <= 5;
  const isOpen = current?.scale === 'open';

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-serif">{template.name}</h2>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-line">
            <div className="h-full rounded-full bg-brass transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-slate-500">{currentIndex + 1}/{total}</span>
        </div>
      </div>

      {/* Question */}
      <div className="card">
        {current.subscale && !isPulseOrShort && (
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">{current.subscale}</div>
        )}
        <div className="text-lg text-slate-100">{current.text}</div>
        {current.reversed && (
          <div className="mt-1 text-xs text-slate-500 italic">Reverse scored</div>
        )}

        {/* Answer options */}
        <div className="mt-6">
          {isOpen ? (
            <textarea
              className="input min-h-[80px] resize-y"
              value={(responses[current.id] as string) ?? ''}
              onChange={(e) => setResponses((prev) => ({ ...prev, [current.id]: e.target.value }))}
              placeholder="Your response…"
            />
          ) : current.scale === 'percentage' ? (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={(responses[current.id] as number) ?? 50}
                onChange={(e) => setResponses((prev) => ({ ...prev, [current.id]: parseInt(e.target.value) }))}
                className="flex-1 accent-brass"
              />
              <span className="w-12 text-right text-sm text-brass">{(responses[current.id] as number) ?? 50}%</span>
            </div>
          ) : (
            <div className="flex justify-center gap-2">
              {getScale(current).map((opt) => {
                const selected = responses[current.id] === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleAnswer(opt.value)}
                    className={`flex h-12 w-12 items-center justify-center rounded-lg border text-sm font-medium transition ${
                      selected
                        ? 'border-brass bg-brass/20 text-brass'
                        : 'border-ink-line bg-ink text-slate-400 hover:border-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Scale labels */}
        {!isOpen && current.scale !== 'percentage' && (
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{getScale(current)[0]?.value === 1 ? (current.scale === 'likert4' ? 'Not at all true' : 'Not at all like me') : ''}</span>
            <span>{getScale(current).at(-1)?.value === 5 ? 'Very much like me' : getScale(current).at(-1)?.value === 4 ? 'Exactly true' : ''}</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          className="btn text-xs"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          ← Previous
        </button>

        {currentIndex < total - 1 ? (
          <button
            className="btn text-xs"
            onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
            disabled={responses[current.id] === undefined}
          >
            Next →
          </button>
        ) : (
          <button
            className="btn-primary text-xs"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        )}
      </div>

      {/* Skip dots */}
      <div className="flex justify-center gap-1">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`h-2 w-2 rounded-full transition ${
              i === currentIndex
                ? 'bg-brass'
                : responses[items[i].id] !== undefined
                ? 'bg-brass/40'
                : 'bg-ink-line'
            }`}
          />
        ))}
      </div>

      {error && <div className="text-center text-sm text-red-400">{error}</div>}

      <div className="text-center">
        <button className="text-xs text-slate-500 hover:text-slate-300" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
