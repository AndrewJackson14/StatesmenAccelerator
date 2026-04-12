export default function OfficerDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Officer</h1>
        <p className="mt-1 text-sm text-slate-400">Welcome, mentor.</p>
      </div>
      <div className="card">
        <p className="text-sm text-slate-300">
          As an Officer you have limited access. Use Direct Messages to coordinate with Captains
          and the Headmaster. Session participation history will appear here.
        </p>
      </div>
    </div>
  );
}
