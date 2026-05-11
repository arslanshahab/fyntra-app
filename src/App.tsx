function App() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fyntra</h1>
        <p className="mt-1 text-sm text-slate-600">Phase 1 stack ready.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <span className="rounded-full bg-status-present/10 px-3 py-1 text-sm font-medium text-status-present">
            Present
          </span>
          <span className="rounded-full bg-status-late/10 px-3 py-1 text-sm font-medium text-status-late">
            Late
          </span>
          <span className="rounded-full bg-status-notyet/10 px-3 py-1 text-sm font-medium text-status-notyet">
            Not yet
          </span>
          <span className="rounded-full bg-status-unverified/10 px-3 py-1 text-sm font-medium text-status-unverified">
            Unverified
          </span>
          <span className="rounded-full bg-status-absent/10 px-3 py-1 text-sm font-medium text-status-absent">
            Absent
          </span>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Step 2 will replace this with providers, router, and i18n.
        </p>
      </div>
    </main>
  )
}

export default App
