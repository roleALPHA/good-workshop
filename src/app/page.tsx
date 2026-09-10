import { AgendaSurface } from '@/components/agenda/agenda-surface'
import { AppFooter } from '@/components/layout/app-footer'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'

/**
 * Preview of the agenda while persistence is being built. Renders the demo
 * fixture through exactly the pipeline the real editor uses:
 *   DayDoc -> flattenDay -> computeSchedule -> withGapRows -> rows
 *
 * Edits live in client state only -- there is no database yet, so a reload
 * brings the fixture back.
 */
export default function HomePage() {
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
