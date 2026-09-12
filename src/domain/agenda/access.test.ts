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
  type Row = [string, Actor, string | null, string | null, WorkshopRole | null]

  it.each<Row>([
    ['the owner', member({ memberId: OWNER }), null, null, 'owner'],
    ['an editor collaborator', member(), 'editor', null, 'editor'],
    ['a viewer collaborator', member(), 'viewer', null, 'viewer'],
    ['a tenant admin with no row', member({ tenantRole: 'admin' }), null, null, 'admin'],
    ['a member with no row at all', member(), null, null, null],
    // Owner beats a collaborator row, so an owner who also has one is not
    // demoted by it.
    ['the owner who also has a viewer row', member({ memberId: OWNER }), 'viewer', null, 'owner'],

    // ── what a folder confers ──────────────────────────────────────────────
    ['a folder editor, with no row on the workshop', member(), null, 'editor', 'editor'],
    ['a folder viewer, with no row on the workshop', member(), null, 'viewer', 'viewer'],
    // The whole point of "the most specific wins": a subtree shared as editor
    // can still hold one workshop pinned back to viewer, and the way to say so
    // is a row on the workshop.
    ['a workshop row narrowing what the folder gave', member(), 'viewer', 'editor', 'viewer'],
    ['a workshop row widening what the folder gave', member(), 'editor', 'viewer', 'editor'],
    // Owner is still first: filing your own workshop in somebody's read-only
    // folder does not cost you your own workshop.
    [
      'the owner, in a folder that grants them viewer',
      member({ memberId: OWNER }),
      null,
      'viewer',
      'owner',
    ],
    // Before the admin override, so an admin named by a folder grant is that
    // grant -- the same shape a workshop grant has.
    [
      'an admin the folder grants viewer',
      member({ tenantRole: 'admin' }),
      null,
      'viewer',
      'viewer',
    ],

    ['a guest invited to write', guest('editor'), null, null, 'guestEditor'],
    ['a guest invited to read', guest('viewer'), null, null, 'guestViewer'],
    // The ways a guest could otherwise widen their grant.
    ['a guest asking about another workshop', guest('editor', OTHER), null, null, null],
    // Stays a guest rather than becoming 'admin': the grant is the answer, and
    // the override below it is never reached. `guest` never sets this role --
    // the case is here so that a future one cannot.
    [
      'a guest carrying a tenant admin role',
      guest('viewer', WORKSHOP, { tenantRole: 'admin' }),
      null,
      null,
      'guestViewer',
    ],
    [
      'a guest asking about another workshop as admin',
      guest('editor', OTHER, { tenantRole: 'admin' }),
      null,
      null,
      null,
    ],
    // A folder grant must never reach a guest either: they have no library, and
    // the grant they carry names one workshop.
    ['a guest in a folder that grants editor', guest('viewer'), null, 'editor', 'guestViewer'],
  ])('%s', (_name, actor, collaboratorRole, inheritedRole, expected) => {
    expect(
      effectiveRole({
        ownerId: OWNER,
        collaboratorRole,
        inheritedRole,
        actor,
        workshopId: WORKSHOP,
      }),
    ).toBe(expected)
  })

  /**
   * Not a restatement of the table above: this asserts that the guest branch is
   * FIRST. A guest whose id happened to equal the owner's -- which cannot occur
   * today, and is exactly the kind of thing a refactor introduces -- must still
   * be a guest.
   */
  it('resolves the share grant before anything else', () => {
    const actor = guest('viewer', WORKSHOP, { memberId: OWNER })
    expect(
      effectiveRole({
        ownerId: OWNER,
        collaboratorRole: 'editor',
        inheritedRole: 'editor',
        actor,
        workshopId: WORKSHOP,
      }),
    ).toBe('guestViewer')
  })
})
