export default function CaptainDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Captain</h1>
        <p className="mt-1 text-sm text-slate-400">Your assigned squads and pending actions.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Tile title="Assigned squads" body="Attendance, engagement, flags." />
        <Tile title="Flag queue" body="Yellow / Red requiring action." />
        <Tile title="Pending observations" body="Forms awaiting submission." />
        <Tile title="At-risk list" body="Gentlemen needing 1:1." />
        <Tile title="Engagement heatmap" body="By Gentleman, last 14 days." />
        <Tile title="Upcoming sessions" body="Schedule overview." />
      </div>
    </div>
  );
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{title}</div>
      <div className="mt-2 text-sm text-slate-300">{body}</div>
    </div>
  );
}
