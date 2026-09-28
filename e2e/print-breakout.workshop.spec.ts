import { expect, test } from '@playwright/test'
import { seedReferenceDay } from './fixtures/seed-day'
import { callMcpTool } from './fixtures/mcp'

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
        title: 'Drei Räume',
        children: [
          {
            title: 'A · Datenmodell',
            children: [
              { typeKey: 'group_work', title: 'Bestandsaufnahme', durationMinutes: 45 },
              { typeKey: 'group_work', title: 'Zielbild skizzieren', durationMinutes: 45 },
            ],
          },
          {
            title: 'B · Prozesse',
            children: [
              { typeKey: 'group_work', title: 'Prozesslandkarte', durationMinutes: 50 },
              { typeKey: 'group_work', title: 'Engpässe markieren', durationMinutes: 30 },
            ],
          },
          {
            title: 'C · Rollen',
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
  const strand = page.getByText('A · Datenmodell')
  await expect(page.getByText('Drei Räume · Strang 1 von 3')).toBeVisible()

  const first = await strand.boundingBox()
  const second = await page.getByText('B · Prozesse').boundingBox()
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(4)
  expect(second!.x).toBeGreaterThan(first!.x + first!.width - 4)

  // The day resumes after the LONGEST strand: 17:30 + 1h30.
  await expect(page.getByText('Ende 19:00')).toBeVisible()
})
