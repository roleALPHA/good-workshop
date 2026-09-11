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
 * One tool call, retried once if the stream came back empty.
 *
 * Under parallel workers the server-sent-events response is sometimes closed
 * before anything was flushed into it. The call itself may well have happened,
 * so a retry can duplicate work -- which is harmless here: these are seeds, and
 * both create_workshop and apply_agenda produce a usable state either way.
 *
 * Retried rather than tolerated because the one answer that matters,
 * create_workshop's pair of ids, has nothing to fall back on.
 */
async function call(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const first = await callOnce(request, name, args)
  if (first.body !== '') return first.structured
  return (await callOnce(request, name, args)).structured
}

async function callOnce(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>,
): Promise<{ body: string; structured: Record<string, unknown> }> {
  const response = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${tokenForMcp()}`,
      accept: 'application/json, text/event-stream',
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const body = await response.text()
  expect(response.ok(), `${name}: HTTP ${response.status()} ${body}`).toBeTruthy()

  // The transport is server-sent events, so the JSON sits behind a `data:` line.
  const payload = /^data: (.+)$/m.exec(body)
  if (!payload) return { body: '', structured: {} }

  // Read from structuredContent rather than from the human-readable text: the
  // ids are in both, but the prose carries them across an escaped newline, and
  // a regex over that is a trap somebody falls into twice.
  const parsed = JSON.parse(payload[1]!) as {
    result?: { structuredContent?: Record<string, unknown>; isError?: boolean }
  }
  // A tool that reports a problem still says so in words -- most often that the
  // collaboration server is unreachable, which is worth reading rather than
  // discovering as "the block never showed up".
  expect(parsed.result?.isError, `${name}: ${body}`).toBeFalsy()
  return { body, structured: parsed.result?.structuredContent ?? {} }
}

/**
 * Creates a workshop, fills its first day with the reference agenda and leaves
 * the browser on that day.
 */
export async function seedReferenceDay(page: Page, request: APIRequestContext): Promise<void> {
  const doc = createDemoDay()
  const title = `Referenz ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const created = await call(request, 'create_workshop', { title, date: doc.date ?? undefined })
  const workshopId = String(created.workshopId ?? '')
  const dayId = String(created.dayId ?? '')
  // The one call whose answer is load-bearing: everything below addresses the
  // workshop by id, so an empty stream here has to fail loudly.
  expect(workshopId && dayId, `create_workshop ohne Ids: ${JSON.stringify(created)}`).toBeTruthy()

  await call(request, 'apply_agenda', {
    workshopId,
    dayId,
    mode: 'replace',
    items: agendaItems(),
  })

  // The day starts at 13:00 in the fixture, and every derived time below
  // depends on it. apply_agenda writes blocks, not the day itself.
  await call(request, 'set_day_start', { workshopId, dayId, startMinute: doc.startMinute })

  await page.goto(`/w/${workshopId}/d/${dayId}`)
  // The first block of the fixture, as the signal that the write arrived: a
  // page that raced the materialiser would otherwise fail further down in a
  // way that reads like a layout bug.
  await expect(page.getByRole('article', { name: doc.modules[0]!.title })).toBeVisible()
}
