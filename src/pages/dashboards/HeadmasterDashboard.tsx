export default function HeadmasterDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Headmaster</h1>
        <p className="mt-1 text-sm text-slate-400">All cohorts and program health.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Tile title="All cohorts" body="Active, upcoming, completed." />
        <Tile title="All flags" body="Across every cohort." />
        <Tile title="Captain activity" body="Observations and response times." />
        <Tile title="System health" body="Completion rates, engagement." />
        <Tile title="Confirmation projections" body="Standing forecasts." />
        <Tile title="Manual overrides" body="Audit log entries." />
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
