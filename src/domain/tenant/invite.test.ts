import { describe, expect, it } from 'vitest'
import { inviteDisclosure } from './invite'

/**
 * Whether an admin gets to see the link.
 *
 * The rule the code already describes in prose: the link goes back to the admin
 * ONLY when it did not reach the recipient, because an install without a relay
 * would otherwise have an invitation screen that does nothing. That much is a
 * good decision.
 *
 * What the prose missed is that a link is issued even when the address already
 * belongs to an ACTIVE member -- and an active member's magic link is not an
 * invitation, it is that person's login. An admin already reads every workshop
 * in the tenant, so the gain is not data: it is acting as somebody else, under
 * their name, in audit entries and in presence.
 *
 * A table rather than a branch, because the interesting cases are the corners.
 */
describe('inviteDisclosure', () => {
  it.each([
    {
      name: 'new invitee, mail delivered: the link stays between server and inbox',
      input: { alreadyMember: false, mailed: true },
      expected: false,
    },
    {
      name: 'new invitee, no relay: the admin needs the link or the screen is a decoration',
      input: { alreadyMember: false, mailed: false },
      expected: true,
    },
    {
      name: 'existing member, mail delivered: nothing to show',
      input: { alreadyMember: true, mailed: true },
      expected: false,
    },
    {
      name: 'existing member, no relay: still nothing -- this is a login, not an invitation',
      input: { alreadyMember: true, mailed: false },
      expected: false,
    },
  ])('$name', ({ input, expected }) => {
    expect(inviteDisclosure(input)).toBe(expected)
  })
})
