import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { callMcpTool, mcpAddress } from './mcp'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { MODULE_TYPES_BY_ID } from '@/features/agenda/fixtures/module-types'

/**
 * Puts the reference agenda into a real workshop.
 *
 * These assertions used to run against /demo, a public page that rendered this
 * same fixture from client state. That page is gone: it showed something that
 * looked like the product and saved nothing, and it was the first thing a
 * visitor met. What it bought the test suite was a screen with a rich agenda
 * that needed no database -- so that is what this rebuilds, on the real path.
 *
 * Translated from the SAME fixture the export snapshots and unit tests read,
 * rather than retyped here: a second copy of "Check-in & Start at 13:00" would
 * drift from the first, and every assertion below depends on those exact
 * titles and times.
 *
 * Written through apply_agenda rather than into the tables, because a day has
 * exactly one writer -- the collaboration room. A seed that wrote SQL directly
 * would be deleted by the materialiser a few seconds later, and only sometimes.
 */

/** The fixture, as apply_agenda understands it. */
function agendaItems() {
  const doc = createDemoDay()
  const typeKey = (moduleTypeId: string) => {
    const type = MODULE_TYPES_BY_ID[moduleTypeId]
    if (!type) throw new Error(`Unbekannter Modultyp ${moduleTypeId}`)
    return type.key
  }

  const asModule = (m: (typeof doc.modules)[number]) => ({
    kind: 'module' as const,
    typeKey: typeKey(m.moduleTypeId),
    title: m.title,
    durationMinutes: m.durationMinutes,
    ...(m.pinnedStartMinute === null ? {} : { pinnedStartMinute: m.pinnedStartMinute }),
  })

  // Day-level blocks and clusters, in the order the fixture gives them.
  const ordered = [
    ...doc.clusters.map((c) => ({ order: c.order, cluster: c })),
    ...doc.modules.filter((m) => m.clusterId === null).map((m) => ({ order: m.order, module: m })),
  ].sort((a, b) => a.order - b.order)

  return ordered.map((entry) =>
    'cluster' in entry
      ? {
          kind: 'cluster' as const,
          title: entry.cluster.title,
          color: entry.cluster.color ?? undefined,
          children: doc.modules
            .filter((m) => m.clusterId === entry.cluster.id)
            .sort((a, b) => a.order - b.order)
            .map((m) => {
              const { kind: _kind, ...child } = asModule(m)
              return child
            }),
        }
      : asModule(entry.module),
  )
}

/**
 * One MCP call, and the answer carries both ids.
 *
 * The workshop used to be created by clicking through the library, which works
 * on a desktop viewport and times out on a phone -- the editor does not mount
 * below 1024px, and the seed was waiting for something that layout never shows.
 * A fixture that only works at one window size is a trap, and this one sprang
 * it on the reading-view suite, whose whole point is the phone.
 */
/**
 * Creates a workshop, fills its first day with the reference agenda and leaves
 * the browser on that day.
 */
export async function seedReferenceDay(
  page: Page,
  request: APIRequestContext,
  /** A readable name, for the pictures on the website. Tests do not care. */
  name?: string,
): Promise<string> {
  const doc = createDemoDay()
  const title = name ?? `Referenz ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  // One address for the whole seed: three calls out of a budget of sixty is a
  // client behaving normally, and giving each its own would only hide a real
  // limit being hit.
  const address = mcpAddress()

  const { structured: created } = await callMcpTool(
    request,
    'create_workshop',
    { title, date: doc.date ?? undefined },
    address,
  )
  const workshopId = String(created.workshopId ?? '')
  const dayId = String(created.dayId ?? '')
  // The one call whose answer is load-bearing: everything below addresses the
  // workshop by id, so an empty stream here has to fail loudly.
  expect(workshopId && dayId, `create_workshop ohne Ids: ${JSON.stringify(created)}`).toBeTruthy()

  await callMcpTool(
    request,
    'apply_agenda',
    { workshopId, dayId, mode: 'replace', items: agendaItems() },
    address,
  )

  // The day starts at 13:00 in the fixture, and every derived time below
  // depends on it. apply_agenda writes blocks, not the day itself.
  await callMcpTool(
    request,
    'set_day_start',
    { workshopId, dayId, startMinute: doc.startMinute },
    address,
  )

  const url = `/w/${workshopId}/d/${dayId}`
  await page.goto(url)
  // The first block of the fixture, as the signal that the write arrived: a
  // page that raced the materialiser would otherwise fail further down in a
  // way that reads like a layout bug.
  await expect(page.getByRole('article', { name: doc.modules[0]!.title })).toBeVisible()

  // Handed back so a read-only suite can seed once and navigate many times.
  // Seeding per test costs an MCP call per test, and the tool endpoint is rate
  // limited -- rightly so, and the tests should not be the reason it trips.
  return url
}
