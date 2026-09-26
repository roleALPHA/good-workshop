import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { createShareLink } from '@/domain/workshop/share-links'
import { createAuthorizationCode, issueTokens, registerClient } from '@/domain/oauth/repo'
import { inviteMember } from '@/domain/tenant/membership'
import { issueMagicLink } from '@/server/auth/magic-link'
import { readShareGate } from '@/server/auth/share-invite'
import { hashSecret, parseOAuthToken } from '@/server/auth/tokens'
import { edition } from '@/server/edition'
import { readInvoiceDocument } from '@/cloud/workspace/invoice-download'
import { CLIENT_REGISTRY_TENANT } from './cloud'

/**
 * The cloud edition, two tenants side by side.
 *
 * What is asserted is the thing a second tenant breaks first: that somebody
 * who belongs to B signs into B, that B's share links and OAuth grants resolve
 * to B, and that nothing about A leaks into those answers. Plus the rule the
 * whole edition rests on -- one membership per person -- held by the database.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const A = randomUUID()
const B = randomUUID()
const identities: string[] = []

type Person = { identityId: string; memberId: string; email: string; actor: Actor }

async function person(tenantId: string, status = 'active'): Promise<Person> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  const email = `cloud-${identityId}@example.test`
  identities.push(identityId)
  await ops.query(`insert into identity (id, email, status) values ($1, $2, 'active')`, [
    identityId,
    email,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status, first_name, last_name)
     values ($1, $2, $3, 'admin', $4, 'Wolke', 'Test')`,
    [memberId, tenantId, identityId, status],
  )
  return {
    identityId,
    memberId,
    email,
    actor: { tenantId, memberId, tenantRole: 'admin', source: 'web' },
  }
}

let inA: Person
let inB: Person

beforeAll(async () => {
  await ops.connect()
  for (const [id, slug] of [
    [A, `cloud-a-${A.slice(0, 8)}`],
    [B, `cloud-b-${B.slice(0, 8)}`],
  ]) {
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Cloudtest')`, [id, slug])
  }
  inA = await person(A)
  inB = await person(B)
})

afterAll(async () => {
  await ops.query('delete from tenant where id = any($1::uuid[])', [[A, B]])
  await ops.query('delete from identity where id = any($1::uuid[])', [identities])
  await ops.end()
})

describe('signing in', () => {
  it('opens the tenant the person belongs to', async () => {
    expect(await edition.tenantForSignIn(inA.identityId)).toBe(A)
    expect(await edition.tenantForSignIn(inB.identityId)).toBe(B)
  })

  it('opens nothing for somebody without a membership, or a disabled one', async () => {
    expect(await edition.tenantForSignIn(randomUUID())).toBeNull()
    const off = await person(B, 'disabled')
    expect(await edition.tenantForSignIn(off.identityId)).toBeNull()
  })

  it('opens an invitation, which is how it becomes active', async () => {
    const invited = await person(B, 'invited')
    expect(await edition.tenantForSignIn(invited.identityId)).toBe(B)
  })

  it('opens nothing in a suspended tenant', async () => {
    const tenant = randomUUID()
    await ops.query(
      `insert into tenant (id, slug, name, status) values ($1, $2, 'Gesperrt', 'suspended')`,
      [tenant, `cloud-s-${tenant.slice(0, 8)}`],
    )
    try {
      const inSuspended = await person(tenant)
      expect(await edition.tenantForSignIn(inSuspended.identityId)).toBeNull()
    } finally {
      await ops.query('delete from tenant where id = $1', [tenant])
    }
  })

  it('issues the login link of the login form into the right tenant', async () => {
    const issued = await issueMagicLink(inB.email)
    expect(issued?.tenantId).toBe(B)
    const rows = await ops.query(
      `select tenant_id from email_token where email = $1 order by created_at desc limit 1`,
      [inB.email],
    )
    expect(rows.rows[0].tenant_id).toBe(B)
  })
})

describe('one membership per person', () => {
  it('is held by the database', async () => {
    await expect(
      ops.query(
        `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
        [randomUUID(), A, inB.identityId],
      ),
    ).rejects.toThrow(/member_one_tenant_per_identity/)
  })

  it('turns an invitation of somebody from another workspace into a neutral refusal', async () => {
    await expect(
      inviteMember(inA.actor, inB.email, 'member', 'de', {
        firstName: 'Nicht',
        lastName: 'Möglich',
      }),
    ).rejects.toThrow('member.cannotInvite')
  })
})

describe('guest share links', () => {
  it('resolve into the tenant of the workshop, and read there', async () => {
    const workshopId = uuidv7()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Cloudgast', $3, 'a0')`,
      [workshopId, B, inB.memberId],
    )
    const token = `token-${randomUUID()}`
    await withTenant(inB.actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, inB.actor, workshopId, 'workshop.share')
      await createShareLink(tx, access, 'gast@example.test', 'viewer', hashSecret(token))
    })

    expect(await edition.tenantForShareToken(hashSecret(token))).toBe(B)
    expect(await readShareGate(token)).toMatchObject({ tenantId: B, workshopTitle: 'Cloudgast' })
    expect(await edition.tenantForShareToken(hashSecret('nothing'))).toBeNull()
  })
})

describe('OAuth', () => {
  it('registers clients in the registry, and finds grants and tokens in their tenant', async () => {
    expect(await edition.tenantForClientRegistration()).toBe(CLIENT_REGISTRY_TENANT)

    const { code, tokens } = await withTenant(inB.actor, async (tx) => {
      const client = await registerClient(tx, {
        name: 'Cloud client',
        redirectUris: ['https://client.example.test/callback'],
        confidential: false,
      })
      const code = await createAuthorizationCode(tx, {
        clientId: client.id,
        memberId: inB.memberId,
        scopes: ['workshops:read'],
        resource: 'https://app.example.test/api/mcp',
        redirectUri: 'https://client.example.test/callback',
        codeChallenge: 'x'.repeat(43),
      })
      const tokens = await issueTokens(tx, {
        clientId: client.id,
        memberId: inB.memberId,
        scopes: ['workshops:read'],
        resource: 'https://app.example.test/api/mcp',
        withRefresh: true,
      })
      return { code, tokens }
    })

    expect(await edition.tenantForAuthorizationCode(hashSecret(code))).toBe(B)
    expect(await edition.tenantForOAuthToken(parseOAuthToken(tokens.accessToken)!.tokenKey)).toBe(B)
    expect(await edition.tenantForOAuthToken(parseOAuthToken(tokens.refreshToken!)!.tokenKey)).toBe(
      B,
    )
    expect(await edition.tenantForAuthorizationCode(hashSecret('unknown'))).toBeNull()
  })
})

describe('before anybody has said who they are', () => {
  it('shows nobody’s branding and offers no setup', async () => {
    expect(await edition.tenantForAnonymousBrand()).toBeNull()
    expect(await edition.tenantForSetup()).toBeNull()
  })
})

describe('invoices', () => {
  it('hands each workspace its own document and nothing else', async () => {
    const inA = await person(A)
    const inB = await person(B)
    const month = '2026-07-01'
    for (const [tenantId, mark] of [
      [A, 'A'],
      [B, 'B'],
    ] as const) {
      await ops.query(
        `insert into invoice_document (tenant_id, month, filename, content, byte_size)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, month) do update set content = excluded.content`,
        [tenantId, month, `RE-${mark}.pdf`, Buffer.from(`%PDF ${mark}`), 7],
      )
    }

    // Each admin asks for the same month. The policy decides whose row that is.
    expect(await readInvoiceDocument(inA.actor, '2026-07')).toMatchObject({
      filename: 'RE-A.pdf',
    })
    expect(await readInvoiceDocument(inB.actor, '2026-07')).toMatchObject({
      filename: 'RE-B.pdf',
    })
  })

  it('answers nothing for a month the workspace has no invoice for', async () => {
    const inA = await person(A)
    expect(await readInvoiceDocument(inA.actor, '2019-01')).toBeNull()
    // Not a database error either: a malformed month is a refusal, not a crash.
    expect(await readInvoiceDocument(inA.actor, 'nonsense')).toBeNull()
  })
})

describe('a maintenance window', () => {
  const windows: string[] = []
  const announce = async (startsIn: number, lastsMs = 2 * 3_600_000, cancelled = false) => {
    const startsAt = new Date(Date.now() + startsIn)
    const { rows } = await ops.query(
      `insert into maintenance_window (starts_at, ends_at, note, cancelled_at)
       values ($1, $2, $3, $4) returning id`,
      [
        startsAt,
        new Date(startsAt.getTime() + lastsMs),
        `Fenster ${randomUUID().slice(0, 8)}`,
        cancelled ? new Date() : null,
      ],
    )
    windows.push(rows[0].id)
    return rows[0].id as string
  }

  const clear = async () => {
    await ops.query('delete from maintenance_window where id = any($1::uuid[])', [windows])
    windows.length = 0
  }

  afterAll(clear)

  it('is the same window for every workspace, because it belongs to none', async () => {
    await clear()
    await announce(3 * 86_400_000)

    // The table has no tenant_id on purpose: one installation goes down, not
    // one customer. Both tenants have to be told the same thing.
    // Asked twice, because the question takes no tenant at all: the signature
    // is what makes "the same for everybody" true rather than merely likely.
    const forA = await edition.maintenanceWindow()
    const forB = await edition.maintenanceWindow()
    expect(forA).not.toBeNull()
    expect(forB).toEqual(forA)
  })

  it('shows the next one that is still to come, and hides what is over or called off', async () => {
    await clear()
    const soon = await announce(2 * 86_400_000)
    await announce(5 * 86_400_000)
    await announce(-10 * 86_400_000)
    await announce(4 * 86_400_000, 2 * 3_600_000, true)

    const shown = await edition.maintenanceWindow()
    const { rows } = await ops.query('select note from maintenance_window where id = $1', [soon])
    expect(shown?.note).toBe(rows[0].note)
  })

  it('keeps showing one that has already started, so the banner can say it is running', async () => {
    await clear()
    // Began an hour ago and runs for another hour.
    await announce(-3_600_000, 2 * 3_600_000)

    const shown = await edition.maintenanceWindow()
    expect(shown).not.toBeNull()
    expect(shown!.startsAt.getTime()).toBeLessThan(Date.now())
    expect(shown!.endsAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('answers with nothing when there is none', async () => {
    // Every upcoming window, not only the ones this file made: the table has no
    // tenant_id, so "none" is a statement about the whole installation and
    // cannot be made while somebody else's row is still standing.
    await clear()
    await ops.query('delete from maintenance_window where cancelled_at is null and ends_at > now()')
    expect(await edition.maintenanceWindow()).toBeNull()
  })
})

describe('an announced change', () => {
  const clear = async () => {
    await ops.query('delete from legal_acknowledgement where tenant_id = any($1::uuid[])', [[A, B]])
    await ops.query('delete from price_change_notice where tenant_id = any($1::uuid[])', [[A, B]])
  }

  afterAll(clear)

  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

  it('is shown to the workspace it was announced to, and to no other', async () => {
    await clear()
    await ops.query(
      `insert into legal_acknowledgement (tenant_id, document, version, effective_from)
       values ($1, 'agb', '2027-01-01', $2)`,
      [A, day(30)],
    )
    await ops.query(
      `insert into price_change_notice (tenant_id, plan, effective_from, net_cents)
       values ($1, 'per_user', $2, 900)`,
      [A, day(45)],
    )

    expect((await edition.announcedChanges(A)).map((change) => change.kind)).toEqual([
      'terms',
      'price',
    ])
    // B has its own announcements or none; it never reads A's.
    expect(await edition.announcedChanges(B)).toEqual([])
  })

  it('stops showing a change on the day it applies', async () => {
    await clear()
    await ops.query(
      `insert into legal_acknowledgement (tenant_id, document, version, effective_from)
       values ($1, 'agb', '2027-02-01', $2)`,
      [A, day(0)],
    )
    // A change in force is not news any more; it is the agreement.
    expect(await edition.announcedChanges(A)).toEqual([])
  })

  it('stops showing a change the workspace has objected to', async () => {
    await clear()
    await ops.query(
      `insert into legal_acknowledgement (tenant_id, document, version, effective_from, objected_at)
       values ($1, 'agb', '2027-03-01', $2, now())`,
      [A, day(30)],
    )
    expect(await edition.announcedChanges(A)).toEqual([])
  })
})
