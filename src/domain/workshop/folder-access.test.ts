import { describe, expect, it } from 'vitest'
import type { Actor } from '@/server/db'
import {
  effectiveFolderRole,
  grantableRoles,
  inheritedWorkshopRole,
  mayGrant,
  type FolderStep,
  type GrantableFolderRole,
} from './folder-access'

/**
 * The whole folder authorisation rule, and the order of its lines is
 * load-bearing -- which is why it gets a table rather than a handful of cases.
 */

const ME = 'm-me'
const SOMEBODY = 'm-other'

const actor = (over: Partial<Actor> = {}): Actor =>
  ({ tenantId: 't', memberId: ME, tenantRole: 'member', source: 'web', ...over }) as Actor

/** root → … → the folder in question. */
const path = (...steps: [string, string | null][]): FolderStep[] =>
  steps.map(([id, createdBy]) => ({ id, createdBy }))

const grants = (...pairs: [string, GrantableFolderRole][]) => new Map(pairs)

describe('the role a member holds on a folder', () => {
  it.each<[string, FolderStep[], Map<string, GrantableFolderRole>, Actor, string | null]>([
    ['nothing anywhere', path(['a', SOMEBODY]), grants(), actor(), null],
    ['created it', path(['a', ME]), grants(), actor(), 'owner'],
    ['created an ancestor of it', path(['a', ME], ['b', SOMEBODY]), grants(), actor(), 'owner'],
    ['granted on it', path(['a', SOMEBODY]), grants(['a', 'editor']), actor(), 'editor'],
    [
      'granted on an ancestor, inherited down the subtree',
      path(['a', SOMEBODY], ['b', SOMEBODY], ['c', SOMEBODY]),
      grants(['a', 'editor']),
      actor(),
      'editor',
    ],
    [
      'the nearer folder narrows the wider one',
      path(['a', SOMEBODY], ['b', SOMEBODY]),
      grants(['a', 'editor'], ['b', 'viewer']),
      actor(),
      'viewer',
    ],
    [
      'the nearer folder widens the narrower one',
      path(['a', SOMEBODY], ['b', SOMEBODY]),
      grants(['a', 'viewer'], ['b', 'editor']),
      actor(),
      'editor',
    ],
    [
      'a grant cannot demote somebody out of their own folder',
      path(['a', ME]),
      grants(['a', 'viewer']),
      actor(),
      'owner',
    ],
    [
      'but it can, further down, in a folder somebody else made',
      path(['a', ME], ['b', SOMEBODY]),
      grants(['b', 'viewer']),
      actor(),
      'viewer',
    ],
    [
      'an admin reaches a folder nobody shared',
      path(['a', SOMEBODY]),
      grants(),
      actor({ tenantRole: 'admin' }),
      'admin',
    ],
    [
      'an admin named by a grant is that grant, the way a workshop grant works',
      path(['a', SOMEBODY]),
      grants(['a', 'viewer']),
      actor({ tenantRole: 'admin' }),
      'viewer',
    ],
  ])('%s', (_name, p, g, a, expected) => {
    expect(effectiveFolderRole(p, g, a)).toBe(expected)
  })

  it('never lets a share link reach a folder, however the tree looks', () => {
    const guest = actor({
      memberId: null,
      share: { workshopId: 'w', role: 'editor' },
    } as Partial<Actor>)

    expect(effectiveFolderRole(path(['a', SOMEBODY]), grants(['a', 'editor']), guest)).toBeNull()
  })
})

describe('what a role may hand on', () => {
  it.each<[FolderRoleish, GrantableFolderRole[]]>([
    ['owner', ['editor', 'viewer']],
    ['admin', ['editor', 'viewer']],
    // Equal is not more: a shared folder has to work without an admin in the
    // loop for every addition.
    ['editor', ['editor', 'viewer']],
    ['viewer', ['viewer']],
    [null, []],
  ])('%s', (own, expected) => {
    expect(grantableRoles(own)).toEqual(expected)
  })

  it('holds for taking away as well as for giving', () => {
    // Without this a viewer could revoke an editor, and "not more than you
    // have" would hold in one direction only.
    expect(mayGrant('viewer', 'editor')).toBe(false)
    expect(mayGrant('viewer', 'viewer')).toBe(true)
    expect(mayGrant('editor', 'editor')).toBe(true)
    expect(mayGrant(null, 'viewer')).toBe(false)
  })
})

describe('what a folder role means for a workshop inside it', () => {
  it.each<[FolderRoleish, string | null]>([
    // Collaboration, never ownership: deleting or transferring a colleague's
    // workshop is not something filing it in your folder may confer.
    ['owner', 'editor'],
    ['editor', 'editor'],
    ['viewer', 'viewer'],
    // The tenant-admin override lives in effectiveRole, comes after this and
    // writes an audit event. Answering here would route around that.
    ['admin', null],
    [null, null],
  ])('%s', (own, expected) => {
    expect(inheritedWorkshopRole(own)).toBe(expected)
  })
})

type FolderRoleish = Parameters<typeof grantableRoles>[0]
