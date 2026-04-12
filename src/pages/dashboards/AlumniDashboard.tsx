export default function AlumniDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Alumni</h1>
        <p className="mt-1 text-sm text-slate-400">Your Session 1 record and the directory.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Tile title="Session 1 record" body="Read-only assessments and reports." />
        <Tile title="Alumni directory" body="Searchable, filterable." />
        <Tile title="Session 2" body="Enrollment status." />
        <Tile title="Accomplishments" body="Add post-program updates." />
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
