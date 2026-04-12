import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';

interface SlotRow {
  id: string;
  start_at: string;
  duration_min: number;
  webex_link: string | null;
  status: 'available' | 'booked' | 'cancelled';
}

interface BookingRow {
  slot_id: string;
  user_id: string;
  profiles: { name: string | null; email: string | null } | null;
}

export default function InterviewAvailabilityPage() {
  const { user } = useAuth();
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [bookings, setBookings] = useState<Record<string, BookingRow>>({});
  const [loading, setLoading] = useState(true);

  // New-slot form state
  const [newStart, setNewStart] = useState('');
  const [newDuration, setNewDuration] = useState(15);
  const [newWebex, setNewWebex] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: slotData } = await supabase
      .from('interview_slots')
      .select('*')
      .order('start_at', { ascending: true });
    setSlots(slotData ?? []);

    const { data: bookingData } = await supabase
      .from('interview_bookings')
      .select('slot_id, user_id, profiles!interview_bookings_user_id_fkey(name, email)')
      .is('cancelled_at', null);

    const byId: Record<string, BookingRow> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (bookingData as any[]) ?? []) {
      const profile = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
      byId[b.slot_id] = {
        slot_id: b.slot_id,
        user_id: b.user_id,
        profiles: profile ?? null,
      };
    }
    setBookings(byId);
    setLoading(false);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!newStart) {
      setError('Pick a start time.');
      return;
    }
    setCreating(true);
    setError(null);
    const { error: dbErr } = await supabase.from('interview_slots').insert({
      headmaster_id: user?.id,
      start_at: new Date(newStart).toISOString(),
      duration_min: newDuration,
      webex_link: newWebex.trim() || null,
      status: 'available',
    });
    setCreating(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setNewStart('');
    setNewWebex('');
    load();
  }

  async function cancel(slotId: string) {
    if (!confirm('Cancel this slot?')) return;
    await supabase.from('interview_slots').update({ status: 'cancelled' }).eq('id', slotId);
    load();
  }

  const upcomingAvailable = slots.filter(
    (s) => s.status === 'available' && new Date(s.start_at) > new Date(),
  );
  const booked = slots.filter((s) => s.status === 'booked');
  const past = slots.filter(
    (s) => new Date(s.start_at) <= new Date() && s.status !== 'cancelled',
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Interview Availability</h1>
        <p className="mt-1 text-sm text-slate-400">
          Publish slots for candidates to book. Each slot is a 15-min Webex call by default.
        </p>
      </div>

      {/* Create form */}
      <form onSubmit={create} className="card space-y-4">
        <div className="text-lg font-serif text-slate-100">Add a Slot</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">Start Time</label>
            <input
              type="datetime-local"
              className="input"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Duration (min)</label>
            <input
              type="number"
              className="input"
              min={5}
              max={120}
              value={newDuration}
              onChange={(e) => setNewDuration(parseInt(e.target.value) || 15)}
            />
          </div>
        </div>
        <div>
          <label className="label">Webex Link</label>
          <input
            className="input"
            value={newWebex}
            onChange={(e) => setNewWebex(e.target.value)}
            placeholder="https://webex.com/meet/..."
          />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button type="submit" className="btn-primary" disabled={creating}>
          {creating ? 'Creating…' : 'Add Slot'}
        </button>
      </form>

      {/* Available */}
      <Section title={`Available (${upcomingAvailable.length})`}>
        {loading ? (
          <Empty message="Loading…" />
        ) : upcomingAvailable.length === 0 ? (
          <Empty message="No open slots. Add one above." />
        ) : (
          <div className="space-y-2">
            {upcomingAvailable.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3"
              >
                <div>
                  <div className="text-sm text-slate-100">{fmtSlot(s.start_at)}</div>
                  <div className="text-xs text-slate-500">
                    {s.duration_min} min {s.webex_link && '· Webex ready'}
                  </div>
                </div>
                <button className="btn text-xs text-red-400" onClick={() => cancel(s.id)}>
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Booked */}
      <Section title={`Booked (${booked.length})`}>
        {booked.length === 0 ? (
          <Empty message="No booked slots." />
        ) : (
          <div className="space-y-2">
            {booked.map((s) => {
              const b = bookings[s.id];
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3"
                >
                  <div>
                    <div className="text-sm text-slate-100">{fmtSlot(s.start_at)}</div>
                    <div className="text-xs text-slate-400">
                      with {b?.profiles?.name ?? 'Unknown'} ({b?.profiles?.email})
                    </div>
                  </div>
                  {s.webex_link && (
                    <a
                      href={s.webex_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary text-xs"
                    >
                      Join
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Past */}
      {past.length > 0 && (
        <Section title={`Past (${past.length})`}>
          <div className="space-y-2">
            {past.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3 opacity-60"
              >
                <div className="text-sm text-slate-300">{fmtSlot(s.start_at)}</div>
                <span className="text-xs text-slate-500">{s.status}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function fmtSlot(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
