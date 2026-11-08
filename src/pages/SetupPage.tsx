import { Database, KeyRound, Terminal } from 'lucide-react'

export function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-sm font-black text-white dark:bg-white dark:text-ink-950">
            E
          </span>
          <div>
            <p className="text-sm font-extrabold tracking-[0.16em] text-ink-950 dark:text-white">
              EVOLAIRE
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
              Invoice system
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8 dark:border-ink-800 dark:bg-ink-900">
          <h1 className="text-2xl font-bold tracking-tight text-ink-950 dark:text-white">
            Connect your Supabase project
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
            The app is running, but no Supabase credentials were found. Add them to{' '}
            <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs dark:bg-ink-800">.env.local</code>{' '}
            and restart the dev server.
          </p>

          <ol className="mt-6 space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                1
              </span>
              <div>
                <p className="font-semibold text-ink-900 dark:text-white">Create a Supabase project</p>
                <p className="mt-0.5 text-ink-500 dark:text-ink-400">
                  Then run <code className="rounded bg-ink-100 px-1 py-0.5 text-xs dark:bg-ink-800">supabase/migrations/0001_init.sql</code>{' '}
                  in the SQL editor.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                2
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 dark:text-white">Copy the example env file</p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-ink-950 px-3 py-2 text-xs text-ink-100">
                  <code>cp .env.example .env.local</code>
                </pre>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                3
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 dark:text-white">Paste your project values</p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-ink-950 px-3 py-2 text-xs leading-relaxed text-ink-100">
                  <code>{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}</code>
                </pre>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <KeyRound className="h-3.5 w-3.5" />
                  Only the anon key belongs in the browser. Never use the service-role key.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                4
              </span>
              <div>
                <p className="font-semibold text-ink-900 dark:text-white">Restart the app</p>
                <p className="mt-0.5 text-ink-500 dark:text-ink-400">
                  Create the owner user, then sign in.
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-6 flex flex-wrap gap-3 text-xs text-ink-500 dark:text-ink-400">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 dark:bg-ink-800">
              <Database className="h-3.5 w-3.5" /> Postgres + RLS
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 dark:bg-ink-800">
              <Terminal className="h-3.5 w-3.5" /> npm run dev
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
