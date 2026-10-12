import { expect, test } from '@playwright/test'
import { seedReferenceDay } from './fixtures/seed-day'
import { callMcpTool } from './fixtures/mcp'
import { markdownToRichText } from '@/lib/richtext/markdown'

/**
 * A breakout on paper.
 *
 * Two things only the print layout can answer: whether the strands really sit
 * side by side there, and whether a strand heading still says what it belongs
 * to -- because the breakout may break between two strands, and a column on a
 * fresh page with no context is the failure this guards against.
 */
test('prints a breakout as columns, each strand naming its breakout', async ({ page, request }) => {
  const url = String(await seedReferenceDay(page, request))
  const [, workshopId, dayId] = url.match(/\/w\/([^/]+)\/d\/([^/]+)/)!

  await callMcpTool(request, 'apply_agenda', {
    workshopId,
    dayId,
    mode: 'append',
    items: [
      {
        kind: 'breakout',
        title: 'Werkstattrunde',
        children: [
          {
            title: 'X · Zahlen',
            children: [
              { typeKey: 'group_work', title: 'Bestandsaufnahme', durationMinutes: 45 },
              { typeKey: 'group_work', title: 'Zielbild skizzieren', durationMinutes: 45 },
            ],
          },
          {
            title: 'Y · Rollen',
            children: [
              { typeKey: 'group_work', title: 'Prozesslandkarte', durationMinutes: 50 },
              { typeKey: 'group_work', title: 'Engpässe markieren', durationMinutes: 30 },
            ],
          },
          {
            title: 'Z · Technik',
            children: [{ typeKey: 'group_work', title: 'RACI bauen', durationMinutes: 60 }],
          },
        ],
      },
    ],
  })

  await page.goto(url.replace('/w/', '/print/w/'))

  // Three identical times in a row are misleading unless it says why.
  await expect(page.getByText('3 Stränge, gleichzeitig')).toBeVisible()

  // Self-supporting after a page break: the breakout, then which strand.
  const strand = page.getByText('X · Zahlen')
  await expect(page.getByText('Werkstattrunde · Strang 1 von 3')).toBeVisible()

  const first = await strand.boundingBox()
  const second = await page.getByText('Y · Rollen').boundingBox()
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(4)
  expect(second!.x).toBeGreaterThan(first!.x + first!.width - 4)

  // Both strand columns start together, and the longer one sets the end.
  await expect(page.getByText('3 Stränge, gleichzeitig')).toBeVisible()
})

/**
 * "Es gibt keine Druckoption, wo auch die ‚versteckten' ebenfalls in der
 * Druckansicht sind." What sits behind "Mehr Felder" and the note on the day
 * reached paper by no route at all. With "Alle Felder" both do; without it the
 * sheet stays the short one handed to the group.
 */
test('prints every field and the day’s note only when asked for', async ({ page, request }) => {
  const url = String(await seedReferenceDay(page, request))
  const [, workshopId, dayId] = url.match(/\/w\/([^/]+)\/d\/([^/]+)/)!

  await callMcpTool(request, 'apply_agenda', {
    workshopId,
    dayId,
    mode: 'append',
    items: [
      {
        kind: 'module',
        typeKey: 'group_work',
        title: 'Thesen sammeln',
        durationMinutes: 20,
        desc: { task: markdownToRichText('Jede Gruppe notiert drei Thesen') },
      },
    ],
  })
  await callMcpTool(request, 'update_day', { workshopId, dayId, note: 'Raum 4.12 im Erdgeschoss' })

  const print = url.replace('/w/', '/print/w/')

  await page.goto(print)
  await expect(page.getByRole('heading', { name: /Thesen sammeln/ })).toBeVisible()
  await expect(page.getByText('Jede Gruppe notiert drei Thesen')).toHaveCount(0)
  await expect(page.getByText('Raum 4.12 im Erdgeschoss')).toHaveCount(0)

  await page.goto(`${print}?all=1`)
  await expect(page.getByText('Arbeitsauftrag', { exact: true })).toBeVisible()
  await expect(page.getByText('Jede Gruppe notiert drei Thesen')).toBeVisible()
  await expect(page.getByText('Raum 4.12 im Erdgeschoss')).toBeVisible()
})
