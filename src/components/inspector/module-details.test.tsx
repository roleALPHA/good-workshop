import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModuleDto } from '@/domain/agenda/types'
import { MODULE_TYPES_BY_KEY } from '@/features/agenda/fixtures/module-types'
import { ModuleDetails } from './module-details'

/**
 * The type-specific fields, and whether what was typed into them survives.
 *
 * The bug these tests were written for: every widget but one hands its value
 * up on each keystroke, so by the time the panel's blur handler runs, that
 * value is already in state. `tags` committed on blur instead, and React's
 * blur bubbles: the panel committed the snapshot from before the tag field
 * spoke, and the round trip through the document then overwrote what had been
 * typed. It was reported on Material, which is a tags field; every other tags
 * field had it too.
 */

// A decision block, because its `options` is a `tags` field that stays in this
// panel. Material is a tags field too and was what the bug below was reported
// on -- but the row edits it in place now, so the panel no longer offers it.
const type = MODULE_TYPES_BY_KEY.decision!

const moduleWith = (desc: Record<string, unknown> = {}): ModuleDto => ({
  id: 'm-1',
  clusterId: null,
  moduleTypeId: type.id,
  title: 'Begrüßung',
  durationMinutes: 10,
  pinnedStartMinute: null,
  desc,
  parked: false,
  order: 0,
})

/** Blur is what commits; the field has to lose focus to something outside. */
const leaveThePanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(document.body)
}

/**
 * A module type's schema can change under an open tab.
 *
 * Compiled validators are cached by (type id, schema version), so a panel that
 * reports a hardcoded version keeps validating against the schema from when it
 * first rendered -- and refuses a field an administrator has just added, with
 * an error naming a rule that no longer exists.
 */
describe('a module type whose schema changed while the panel was open', () => {
  const evolving = (schemaVersion: number, extra: Record<string, unknown>) => ({
    ...type,
    id: 'mt-evolving',
    schemaVersion,
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        // Deliberately not a field the row edits in place, or this panel would
        // filter it out and the test would be asserting about nothing.
        notiz: { type: 'string', title: 'Notiz' },
        ...extra,
      },
    },
  })

  it('validates against the version it was handed, not the one it first saw', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    // v1 compiles and caches, keyed on this type and version 1.
    const { unmount } = render(
      <ModuleDetails module={moduleWith()} type={evolving(1, {})} onChange={() => {}} />,
    )
    await user.type(screen.getByLabelText('Notiz'), 'Etwas')
    await leaveThePanel(user)
    unmount()

    // v2 adds a field. Reporting version 1 here would reuse the old validator
    // and refuse `room`, dropping the whole commit.
    render(
      <ModuleDetails
        module={moduleWith()}
        type={evolving(2, { room: { type: 'string', title: 'Raum' } })}
        onChange={onChange}
      />,
    )
    await user.type(screen.getByLabelText('Raum'), 'Raum 2.14')
    await leaveThePanel(user)

    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ room: 'Raum 2.14' })
  })
})

describe('the module detail fields', () => {
  it('keeps what was typed into a tag field when the panel commits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModuleDetails module={moduleWith()} type={type} onChange={onChange} />)

    await user.type(screen.getByLabelText('Optionen'), 'Variante A, Variante B')
    await leaveThePanel(user)

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      options: ['Variante A', 'Variante B'],
    })
  })

  it('does not lose the tags when another field is edited afterwards', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModuleDetails module={moduleWith()} type={type} onChange={onChange} />)

    await user.type(screen.getByLabelText('Optionen'), 'Variante A')
    await user.selectOptions(screen.getByLabelText('Verfahren'), 'consent')
    await leaveThePanel(user)

    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      options: ['Variante A'],
      method: 'consent',
    })
  })

  it('shows a value that arrived from elsewhere in the text field, not just as a chip', () => {
    render(
      <ModuleDetails
        module={moduleWith({ options: ['Variante A'] })}
        type={type}
        onChange={() => {}}
      />,
    )

    expect(screen.getByLabelText('Optionen')).toHaveValue('Variante A')
  })

  it('clears the field when it is emptied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ModuleDetails
        module={moduleWith({ options: ['Variante A'] })}
        type={type}
        onChange={onChange}
      />,
    )

    await user.clear(screen.getByLabelText('Optionen'))
    await leaveThePanel(user)

    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('options')
  })

  /**
   * The row edits the social form and the material in place. Offering them
   * here as well is not merely redundant: two controls over one value means
   * whichever one somebody did not touch writes its stale copy over the other
   * on blur, and the change vanishes with both controls still on screen.
   */
  it('leaves out the fields the row already edits in place', () => {
    render(
      <ModuleDetails
        module={moduleWith({ materials: ['Beamer'], participation: 'pairs' })}
        type={type}
        onChange={() => {}}
      />,
    )

    expect(screen.queryByLabelText('Material')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sozialform')).not.toBeInTheDocument()
    // Still offered, because the row shows the description but cannot change it.
    expect(screen.getByLabelText('Beschreibung')).toBeInTheDocument()
  })

  it('does not mistake a row-edited value for one whose field is gone', () => {
    render(
      <ModuleDetails
        module={moduleWith({ materials: ['Beamer'] })}
        type={type}
        onChange={() => {}}
      />,
    )

    // The legacy disclosure is for values the schema no longer declares. A
    // value this panel simply does not render is not one of them.
    expect(screen.queryByText(/Beamer/)).not.toBeInTheDocument()
  })
})
