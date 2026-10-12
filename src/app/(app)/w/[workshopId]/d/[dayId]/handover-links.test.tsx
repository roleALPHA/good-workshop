import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithIntl as render } from '@/test/intl'
import { HandoverLinks } from './handover-links'

/**
 * What the switches beside "Markdown" and "Drucken" put into the two links.
 *
 * "Alle Felder" was asked for as a print option that also carries what sits
 * behind "Mehr Felder" and the note on the day. Off by default, like the
 * notes: the common copy is the one for the group.
 */
const hrefs = () => ({
  markdown: screen.getByRole('link', { name: /Markdown/ }).getAttribute('href'),
  print: screen.getByRole('link', { name: /Drucken/ }).getAttribute('href'),
})

describe('HandoverLinks', () => {
  it('hands over the short copy unless asked for more', () => {
    render(<HandoverLinks workshopId="w1" dayId="d1" />)
    expect(hrefs()).toEqual({ markdown: '/api/w/w1/d/d1/export', print: '/print/w/w1/d/d1' })
  })

  it('asks both for every field once "Alle Felder" is ticked', async () => {
    const user = userEvent.setup()
    render(<HandoverLinks workshopId="w1" dayId="d1" />)

    await user.click(screen.getByRole('checkbox', { name: 'Alle Felder' }))
    expect(hrefs()).toEqual({
      markdown: '/api/w/w1/d/d1/export?all=1',
      print: '/print/w/w1/d/d1?all=1',
    })
  })

  it('combines it with the notes and the whole workshop', async () => {
    const user = userEvent.setup()
    render(<HandoverLinks workshopId="w1" dayId="d1" />)

    await user.click(screen.getByRole('checkbox', { name: 'Mit Moderationsnotizen' }))
    await user.click(screen.getByRole('checkbox', { name: 'Alle Felder' }))
    await user.click(screen.getByRole('checkbox', { name: 'Ganzer Workshop' }))
    expect(hrefs()).toEqual({
      markdown: '/api/w/w1/export?notes=1&all=1',
      print: '/print/w/w1?notes=1&all=1',
    })
  })
})
