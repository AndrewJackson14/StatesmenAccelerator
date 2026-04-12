import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const EXPORTABLE_TABLES = [
  { key: 'profiles', label: 'User Profiles', description: 'All user profiles with roles and standings' },
  { key: 'cohort_members', label: 'Cohort Enrollments', description: 'Who is enrolled in which cohort' },
  { key: 'squad_members', label: 'Squad Assignments', description: 'Squad membership and roles' },
  { key: 'session_attendance', label: 'Session Attendance', description: 'Attendance records with engagement data' },
  { key: 'assessment_responses', label: 'Assessment Responses', description: 'All submitted assessment data' },
  { key: 'peer_ratings', label: 'Peer Ratings', description: 'Session peer ratings' },
  { key: 'peer_360_ratings', label: 'Peer 360 Ratings', description: 'Comprehensive peer feedback' },
  { key: 'coach_observations', label: 'Coach Observations', description: 'Captain observation forms' },
  { key: 'leadership_scores', label: 'Leadership Scores', description: 'Weekly leadership scores and ranks' },
  { key: 'squad_points', label: 'Squad Points', description: 'Points awarded to squads' },
  { key: 'challenge_completions', label: 'Challenge Completions', description: 'Who completed what challenges' },
  { key: 'flags', label: 'Flags', description: 'All automated and manual flags' },
  { key: 'confirmation_standings', label: 'Confirmation Standings', description: 'Final standing calculations' },
  { key: 'payments', label: 'Payments', description: 'Payment records and statuses' },
  { key: 'audit_log', label: 'Audit Log', description: 'System activity log' },
];

export default function DataExportPage() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportTable(table: string) {
    setExporting(table);
    setError(null);

    try {
      const { data, error: dbError } = await supabase.from(table).select('*');
      if (dbError) throw new Error(dbError.message);
      if (!data || data.length === 0) { setError(`No data in ${table}.`); setExporting(null); return; }

      const csv = toCsv(data);
      downloadCsv(csv, `${table}_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err: any) {
      setError(err.message);
    }

    setExporting(null);
  }

  async function exportAll() {
    setExporting('all');
    setError(null);

    for (const table of EXPORTABLE_TABLES) {
      try {
        const { data } = await supabase.from(table.key).select('*');
        if (data && data.length > 0) {
          const csv = toCsv(data);
          downloadCsv(csv, `${table.key}_${new Date().toISOString().slice(0, 10)}.csv`);
        }
      } catch (err) {
        // Skip failed tables
      }
      // Small delay to prevent download issues
      await new Promise((r) => setTimeout(r, 300));
    }

    setExporting(null);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl">Data Export</h1>
          <p className="mt-1 text-sm text-slate-400">Export raw data as CSV files.</p>
        </div>
        <button className="btn-primary text-xs" onClick={exportAll} disabled={exporting !== null}>
          {exporting === 'all' ? 'Exporting…' : 'Export All'}
        </button>
      </div>

      {error && <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="space-y-2">
        {EXPORTABLE_TABLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-100">{t.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{t.description}</div>
            </div>
            <button
              className="btn text-xs"
              onClick={() => exportTable(t.key)}
              disabled={exporting !== null}
            >
              {exporting === t.key ? '…' : 'CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function toCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
