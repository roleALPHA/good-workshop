import { AgendaSummary } from '@/components/agenda/agenda-summary'
import { AgendaSurface } from '@/components/agenda/agenda-surface'
import { CategoryLegend } from '@/components/agenda/category-legend'
import { AppFooter } from '@/components/layout/app-footer'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'

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
  const rows = flattenDay(doc)
  const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-0 py-8 md:px-6">
        <header className="mb-6 px-4 md:px-2">
          <p className="text-[13px] tracking-wide text-[var(--fg-subtle)] uppercase">
            Design Sprint Kickoff · {doc.date}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <div className="mt-2">
            <AgendaSummary doc={doc} schedule={schedule} />
          </div>
          <div className="mt-4">
            <CategoryLegend doc={doc} />
          </div>
        </header>

        <AgendaSurface doc={doc} />
      </main>
      <AppFooter />
    </div>
  )
}
