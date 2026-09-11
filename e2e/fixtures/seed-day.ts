import { execFileSync } from 'node:child_process'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
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

let mcpToken: string | undefined

function tokenForMcp(): string {
  mcpToken ??= /gwp_[A-Za-z0-9_-]+/.exec(
    execFileSync(
      'node',
      [
        'scripts/cli.mjs',
        'token',
        'create',
        '--email',
        process.env.E2E_EMAIL ?? 'e2e@example.test',
        '--name',
        'e2e-seed',
        '--scopes',
        'workshops:read,workshops:write',
      ],
      { encoding: 'utf8' },
    ),
  )?.[0]
  if (!mcpToken) throw new Error('Kein MCP-Token aus der CLI')
  return mcpToken
}

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

export function idsFrom(page: Page): { workshopId: string; dayId: string } {
  const match = /\/w\/([0-9a-f-]+)\/d\/([0-9a-f-]+)/.exec(page.url())
  if (!match) throw new Error(`Keine Workshop-Ids in ${page.url()}`)
  return { workshopId: match[1]!, dayId: match[2]! }
}

/**
 * Creates a workshop, fills its first day with the reference agenda and leaves
 * the browser on that day.
 *
 * The day's start and target end come from the fixture too -- "30m über Plan"
 * is an assertion about the day, not about the blocks in it.
 */
export async function seedReferenceDay(page: Page, request: APIRequestContext): Promise<void> {
  const doc = createDemoDay()
  const title = `Referenz ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  await page.goto('/library')
  await page.getByRole('button', { name: 'Neuer Workshop' }).click()
  await page.getByLabel('Titel des Workshops').fill(title)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  const { workshopId, dayId } = idsFrom(page)

  const response = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${tokenForMcp()}`,
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'apply_agenda',
        arguments: { workshopId, dayId, mode: 'replace', items: agendaItems() },
      },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()

  await page.reload()
  // The first block of the fixture, as the signal that the write arrived: a
  // reload that raced the materialiser would otherwise fail further down in a
  // way that reads like a layout bug.
  await expect(page.getByRole('article', { name: doc.modules[0]!.title })).toBeVisible()
}
