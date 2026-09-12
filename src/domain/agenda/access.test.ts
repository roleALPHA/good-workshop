import { describe, expect, it } from 'vitest'
import type { Actor } from '@/server/db'
import { effectiveRole, type WorkshopRole } from './access'

/**
 * The authorisation rule, without a database.
 *
 * `assertWorkshopAccess` is covered against a real Postgres in
 * src/domain/workshop/*.db.test.ts -- what is asserted here is the part that has
 * no rows in it: which role wins, in which order, and that a share-link guest
 * cannot reach anything the grant did not name.
 */

const WORKSHOP = 'w-1'
const OTHER = 'w-2'
const OWNER = 'm-owner'

const member = (over: Partial<Actor> = {}): Actor => ({
  tenantId: 't-1',
  memberId: 'm-1',
  tenantRole: 'member',
  source: 'web',
  ...over,
})

const guest = (
  role: 'editor' | 'viewer',
  workshopId = WORKSHOP,
  over: Partial<Actor> = {},
): Actor =>
  member({
    memberId: null,
    source: 'guest',
    share: { linkId: 'l-1', workshopId, role },
    ...over,
  })

describe('effectiveRole', () => {
  it.each<[string, Actor, string | null, WorkshopRole | null]>([
    ['the owner', member({ memberId: OWNER }), null, 'owner'],
    ['an editor collaborator', member(), 'editor', 'editor'],
    ['a viewer collaborator', member(), 'viewer', 'viewer'],
    ['a tenant admin with no row', member({ tenantRole: 'admin' }), null, 'admin'],
    ['a member with no row at all', member(), null, null],
    // Owner beats a collaborator row, so an owner who also has one is not
    // demoted by it.
    ['the owner who also has a viewer row', member({ memberId: OWNER }), 'viewer', 'owner'],

    ['a guest invited to write', guest('editor'), null, 'guestEditor'],
    ['a guest invited to read', guest('viewer'), null, 'guestViewer'],
    // The three ways a guest could otherwise widen their grant.
    ['a guest asking about another workshop', guest('editor', OTHER), null, null],
    // Stays a guest rather than becoming 'admin': the grant is the answer, and
    // the override below it is never reached. `guestActor` never sets this role
    // -- the case is here so that a future one cannot.
    [
      'a guest carrying a tenant admin role',
      guest('viewer', WORKSHOP, { tenantRole: 'admin' }),
      null,
      'guestViewer',
    ],
    [
      'a guest asking about another workshop as admin',
      guest('editor', OTHER, { tenantRole: 'admin' }),
      null,
      null,
    ],
  ])('%s', (_name, actor, collaboratorRole, expected) => {
    expect(effectiveRole(OWNER, collaboratorRole, actor, WORKSHOP)).toBe(expected)
  })

  /**
   * Not a restatement of the table above: this asserts that the guest branch is
   * FIRST. A guest whose id happened to equal the owner's -- which cannot occur
   * today, and is exactly the kind of thing a refactor introduces -- must still
   * be a guest.
   */
  it('resolves the share grant before anything else', () => {
    const actor = guest('viewer', WORKSHOP, { memberId: OWNER })
    expect(effectiveRole(OWNER, 'editor', actor, WORKSHOP)).toBe('guestViewer')
  })
})
