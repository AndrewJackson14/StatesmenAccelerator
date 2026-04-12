import { useAuth } from '@/auth/AuthProvider';

export default function GentlemanDashboard() {
  const { profile } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Welcome, {profile?.name ?? 'Gentleman'}.</h1>
        <p className="mt-1 text-sm text-slate-400">Your current week at a glance.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Widget title="Weekly pulse" body="Trend chart coming soon." />
        <Widget title="Leadership score" body="Score, rank, and trend." />
        <Widget title="Squad standing" body="Your squad’s position." />
        <Widget title="Challenge completion" body="Streak and percent complete." />
        <Widget title="Peer rating average" body="Rolling weekly average." />
        <Widget title="Active flags" body="Yellow / Red status." />
      </div>
    </div>
  );
}

function Widget({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{title}</div>
      <div className="mt-2 text-sm text-slate-300">{body}</div>
    </div>
  );
}
