import { useAuth } from '../../hooks/useAuth'

/**
 * Dashboard home — the first thing a user sees after login.
 * Will evolve into the Pulse feed (high-SQ-score experience alerts).
 */
export function HomePage() {
  const { profile, user } = useAuth()

  const displayName = profile?.full_name?.split(' ')[0] ?? user?.email ?? 'there'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hey, {displayName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what you&apos;re about to miss.
        </p>
      </div>

      {/* Pulse placeholder */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Your Pulse</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Coming soon
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5 animate-pulse"
            >
              <div className="mb-3 h-4 w-3/4 rounded bg-muted" />
              <div className="mb-2 h-3 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="mt-4 flex items-center justify-between">
                <div className="h-5 w-12 rounded-full bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Dream List placeholder */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Dream List</h2>
          <button className="text-xs font-medium text-primary hover:underline">
            View all
          </button>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">No quests yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add experiences you don&apos;t want to miss.
          </p>
          <button className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            Explore quests
          </button>
        </div>
      </section>
    </div>
  )
}
