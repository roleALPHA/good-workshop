import { AgendaSurface } from '@/components/agenda/agenda-surface'
import { AppFooter } from '@/components/layout/app-footer'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'

/**
 * The agenda, rendered from a fixture and reachable without an account.
 *
 * It was the start page while persistence was being built; now that there is a
 * database it lives here. Worth keeping at its own address for two reasons: it
 * runs the demo fixture through exactly the pipeline the real editor uses --
 * DayDoc -> flattenDay -> computeSchedule -> withGapRows -> rows -- which makes
 * it the one surface the end-to-end tests can exercise without signing in, and
 * it shows what the product does to somebody who has no account yet.
 *
 * Edits live in client state only: nothing here is written anywhere, so a
 * reload brings the fixture back.
 */
export default function DemoPage() {
  const doc = createDemoDay()

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-0 py-8 md:px-6">
        <header className="mb-6 px-4 md:px-2">
          <p className="text-[13px] tracking-wide text-[var(--fg-subtle)] uppercase">
            Design Sprint Kickoff · {doc.date}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{doc.title}</h1>
        </header>

        <AgendaSurface doc={doc} />
      </main>
      <AppFooter />
    </div>
  )
}
