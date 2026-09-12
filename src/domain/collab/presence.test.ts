import { describe, expect, it } from 'vitest'
import { authoritativePresence, presenceHue } from './presence'

/**
 * Who the room says you are.
 *
 * `LocalPresence` in the provider carries a comment that states the goal
 * outright: "an LLM joins this room too and must not be able to pass for a
 * colleague". Nothing enforced it. The awareness state arrives from the client
 * and is broadcast to every peer unread, while the server has known the real
 * actor since the handshake.
 *
 * This is not a data leak -- it is worse in one specific way. The presence
 * strip is read as testimony: "Anna is editing this block". A model that
 * presents itself as Anna, or a person who presents themselves as another
 * person, makes that testimony false, and it is the one part of the interface
 * a reader has no way to check.
 *
 * Only the parts the server actually knows are overruled. Hue is a preference,
 * and taking it away would be enforcement for its own sake.
 */
describe('authoritativePresence', () => {
  const actor = { displayName: 'Anna Meier', source: 'web' as const }

  it.each([
    {
      name: 'a browser client claiming somebody else’s name',
      claimed: { name: 'Bert Schulz', hue: 210, kind: 'person' as const },
      expected: { name: 'Anna Meier', kind: 'person' },
    },
    {
      name: 'a browser client claiming to be a model',
      claimed: { name: 'Anna Meier', hue: 210, kind: 'model' as const },
      expected: { name: 'Anna Meier', kind: 'person' },
    },
    {
      name: 'no claim at all',
      claimed: undefined,
      expected: { name: 'Anna Meier', kind: 'person' },
    },
  ])('overrules $name', ({ claimed, expected }) => {
    expect(authoritativePresence(claimed, actor)).toMatchObject(expected)
  })

  it('marks an MCP client as a model however it introduces itself', () => {
    expect(
      authoritativePresence(
        { name: 'Anna Meier', hue: 10, kind: 'person' },
        {
          displayName: 'Claude',
          source: 'mcp',
        },
      ),
    ).toMatchObject({ name: 'Claude', kind: 'model' })
  })

  it('leaves the hue to the client', () => {
    // A preference the server has no opinion about. Overriding everything
    // because some of it was forged is how a fix becomes a regression.
    expect(authoritativePresence({ name: 'x', hue: 137, kind: 'person' }, actor)).toMatchObject({
      hue: 137,
    })
  })
})

describe('presenceHue', () => {
  it('is stable for the same participant', () => {
    // The whole reason it is derived rather than stored: a colleague keeps their
    // colour across sessions and devices without anybody setting a preference.
    expect(presenceHue('m-1')).toBe(presenceHue('m-1'))
  })

  it('lands on one of the eight steps around the wheel', () => {
    // Not a free hash: adjacent hues are indistinguishable at avatar size, which
    // is the only size this is ever seen at.
    const ids = ['m-1', 'm-2', 'guest-link-1', '', '01a09554-ea6f-7ae4-8d4f-b84b92d98a6a']
    for (const id of ids) {
      const hue = presenceHue(id)
      expect(hue % 45).toBe(0)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })

  it('separates participants whose ids differ', () => {
    // Not a guarantee -- eight buckets collide by construction -- but two ids
    // this close must not fold onto the same colour.
    expect(presenceHue('m-1')).not.toBe(presenceHue('m-2'))
  })
})
