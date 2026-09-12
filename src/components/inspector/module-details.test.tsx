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
 * value is already in state. `tags` -- the widget behind Material -- committed
 * on blur instead, and React's blur bubbles: the panel committed the snapshot
 * from before the tag field spoke, and the round trip through the document
 * then overwrote what had been typed. Material never persisted.
 */

const type = MODULE_TYPES_BY_KEY.admin!

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
        materials: { type: 'array', items: { type: 'string' }, title: 'Material' },
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
    await user.type(screen.getByLabelText('Material'), 'Marker')
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
  it('keeps a material typed into the tag field when the panel commits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModuleDetails module={moduleWith()} type={type} onChange={onChange} />)

    await user.type(screen.getByLabelText('Material'), 'Flipchart, Marker')
    await leaveThePanel(user)

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      materials: ['Flipchart', 'Marker'],
    })
  })

  it('does not lose the materials when another field is edited afterwards', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModuleDetails module={moduleWith()} type={type} onChange={onChange} />)

    await user.type(screen.getByLabelText('Material'), 'Flipchart')
    await user.selectOptions(screen.getByLabelText('Sozialform'), 'small_groups')
    await leaveThePanel(user)

    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      materials: ['Flipchart'],
      participation: 'small_groups',
    })
  })

  it('shows a material that arrived from elsewhere in the text field, not just as a chip', () => {
    render(
      <ModuleDetails
        module={moduleWith({ materials: ['Beamer'] })}
        type={type}
        onChange={() => {}}
      />,
    )

    expect(screen.getByLabelText('Material')).toHaveValue('Beamer')
  })

  it('clears the materials when the field is emptied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ModuleDetails
        module={moduleWith({ materials: ['Beamer'] })}
        type={type}
        onChange={onChange}
      />,
    )

    await user.clear(screen.getByLabelText('Material'))
    await leaveThePanel(user)

    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('materials')
  })
})
