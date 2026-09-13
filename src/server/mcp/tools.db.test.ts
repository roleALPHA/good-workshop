import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generatePersonalAccessToken } from '@/server/auth/tokens'
import { startCollabServer } from '@/server/collab/ws'
import type { PatActor } from './auth'
import { buildMcpServer } from './server'

/**
 * The MCP surface as a client sees it: tool calls in, text and structured
 * content out.
 *
 * Through a real client over an in-memory transport rather than by calling the
 * handlers, because what a model depends on is the contract -- the tool names,
 * the argument shapes, the error text it decides its next call from.
 *
 * The scope is what the library and the day editor offer a person. Sharing,
 * collaborators and members are deliberately not reachable from here, and one
 * test below holds that line.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const PORT = 3904
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

type Person = { identityId: string; memberId: string; token: string; actor: PatActor }

let server: { close: () => Promise<void> }
let me: Person
let admin: Person
let stranger: Person
let strangersWorkshop: string

async function person(role: 'member' | 'admin'): Promise<Person> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `mcp-tools-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, $4, 'active')`,
    [memberId, TENANT, identityId, role],
  )

  const pat = generatePersonalAccessToken()
  const patId = randomUUID()
  await ops.query(
    `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
     values ($1, $2, $3, 'Test', $4, $5, '{workshops:read,workshops:write,module_types:read}')`,
    [patId, TENANT, memberId, pat.tokenId, pat.tokenHash],
  )

  return {
    identityId,
    memberId,
    token: pat.token,
    actor: {
      tenantId: TENANT,
      memberId,
      tenantRole: role,
      source: 'mcp',
      patId,
      scopes: ['workshops:read', 'workshops:write', 'module_types:read'],
    },
  }
}

beforeAll(async () => {
  await ops.connect()
  process.env.GW_COLLAB_INTERNAL_URL = `ws://127.0.0.1:${PORT}/collab`

  me = await person('member')
  admin = await person('admin')
  stranger = await person('member')

  strangersWorkshop = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, $3, $4, 'a0')`,
    [strangersWorkshop, TENANT, `Fremd ${strangersWorkshop}`, stranger.memberId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [uuidv7(), TENANT, strangersWorkshop],
  )

  server = startCollabServer({
    port: PORT,
    host: '127.0.0.1',
    timings: { persistDebounceMs: 50, materializeDebounceMs: 200, emptyGraceMs: 200 },
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
})

afterAll(async () => {
  await server.close()
  for (const p of [me, admin, stranger]) {
    await ops.query('delete from personal_access_token where member_id = $1', [p.memberId])
    await ops.query('delete from workshop where owner_id = $1', [p.memberId])
    await ops.query('delete from folder where created_by = $1', [p.memberId])
    await ops.query('delete from identity where id = $1', [p.identityId])
  }
  await ops.end()
})

async function connect(who: Person) {
  const mcp = buildMcpServer(who.actor, `Bearer ${who.token}`)
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([mcp.connect(serverSide), client.connect(clientSide)])

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      content: { type: string; text: string }[]
      structuredContent?: Record<string, unknown>
      isError?: boolean
    }
    return {
      text: result.content.map((c) => c.text).join('\n'),
      data: (result.structuredContent ?? {}) as Record<string, unknown>,
      isError: result.isError === true,
    }
  }

  /** A call that has to succeed; the text is the failure message if not. */
  const must = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args)
    expect(result.isError, result.text).toBe(false)
    return result
  }

  return { client, call, must }
}

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`

describe('the tool list', () => {
  it('covers the library and the day, and nothing about who may see what', async () => {
    const { client } = await connect(me)
    const names = (await client.listTools()).tools.map((tool) => tool.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'list_folders',
        'create_folder',
        'move_folder',
        'delete_folder',
        'list_tags',
        'list_workshops',
        'create_workshop',
        'rename_workshop',
        'move_workshop',
        'set_workshop_tags',
        'trash_workshop',
        'list_trash',
        'restore_workshop',
        'purge_workshop',
        'list_days',
        'create_day',
        'update_day',
        'move_day',
        'delete_day',
        'add_cluster',
        'update_module',
      ]),
    )
    // Held on purpose: an MCP client must never hand out access.
    expect(names.filter((name) => /shar|collaborat|member|invite|guest|token/.test(name))).toEqual(
      [],
    )
  })
})

describe('list_workshops', () => {
  it('does not list a workshop the member cannot open', async () => {
    const { must } = await connect(me)
    const { data } = await must('list_workshops', { limit: 100 })
    const ids = (data.workshops as { id: string }[]).map((w) => w.id)
    expect(ids).not.toContain(strangersWorkshop)
  })
})

describe('folders', () => {
  it('creates a tree and files a workshop in it', async () => {
    const { must } = await connect(me)

    const parentName = unique('Kunden')
    const parent = await must('create_folder', { name: parentName })
    const child = await must('create_folder', { name: 'Acme', parentId: parent.data.id })

    const tree = await must('list_folders')
    const folders = tree.data.folders as { id: string; parentId: string | null; depth: number }[]
    expect(folders.find((f) => f.id === child.data.id)).toMatchObject({
      parentId: parent.data.id,
      depth: 1,
    })

    const created = await must('create_workshop', {
      title: unique('Kickoff'),
      folderId: child.data.id,
    })
    const inFolder = await must('list_workshops', { folderId: child.data.id })
    expect((inFolder.data.workshops as { id: string }[]).map((w) => w.id)).toEqual([
      created.data.workshopId,
    ])
  })

  it('names a folder that already exists instead of failing blindly', async () => {
    const { call, must } = await connect(me)
    const name = unique('Archiv')
    await must('create_folder', { name })

    const again = await call('create_folder', { name: name.toUpperCase() })
    expect(again.isError).toBe(true)
    expect(again.text).toContain('already a folder of that name')
  })

  it('refuses a workshop in a folder that does not exist', async () => {
    const { call } = await connect(me)
    const result = await call('create_workshop', { title: 'Nirgends', folderId: randomUUID() })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no such target folder')
  })

  it('leaves moving and deleting folders to tenant admins, as the library does', async () => {
    const mine = await connect(me)
    const folder = await mine.must('create_folder', { name: unique('Ordnung') })
    const target = await mine.must('create_folder', { name: unique('Ziel') })
    const workshop = await mine.must('create_workshop', {
      title: unique('Darin'),
      folderId: folder.data.id,
    })

    const refused = await mine.call('move_folder', {
      folderId: folder.data.id,
      parentId: target.data.id,
    })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('Only tenant admins')

    const theAdmin = await connect(admin)
    await theAdmin.must('move_folder', { folderId: folder.data.id, parentId: target.data.id })
    await theAdmin.must('delete_folder', { folderId: folder.data.id })

    // The workshop is not deleted with it; it moves up to where the folder was.
    const { rows } = await ops.query('select folder_id from workshop where id = $1', [
      workshop.data.workshopId,
    ])
    expect(rows[0].folder_id).toBe(target.data.id)
  })
})

describe('workshops', () => {
  it('renames, files, tags, bins, restores and purges', async () => {
    const { must, call } = await connect(me)
    const folder = await must('create_folder', { name: unique('Projekt') })
    const { data } = await must('create_workshop', {
      title: unique('Entwurf'),
      folderId: folder.data.id,
    })
    const workshopId = data.workshopId as string

    const title = unique('Strategie')
    await must('rename_workshop', { workshopId, title })
    await must('move_workshop', { workshopId, folderId: null })
    const tag = unique('Onboarding')
    await must('set_workshop_tags', { workshopId, tags: [tag] })

    const row = await ops.query('select title, folder_id from workshop where id = $1', [workshopId])
    expect(row.rows[0]).toEqual({ title, folder_id: null })

    const tags = await must('list_tags')
    const tagRow = (tags.data.tags as { id: string; name: string }[]).find((t) => t.name === tag)
    expect(tagRow).toBeDefined()
    const byTag = await must('list_workshops', { tagId: tagRow!.id })
    expect((byTag.data.workshops as { id: string }[]).map((w) => w.id)).toEqual([workshopId])

    // Purging something that is not in the bin is refused: two decisions.
    expect((await call('purge_workshop', { workshopId })).isError).toBe(true)

    await must('trash_workshop', { workshopId })
    const searched = await must('list_workshops', { search: title })
    expect(searched.data.workshops).toEqual([])
    const bin = await must('list_trash')
    expect((bin.data.workshops as { id: string }[]).map((w) => w.id)).toContain(workshopId)

    await must('restore_workshop', { workshopId })
    const back = await must('list_workshops', { search: title })
    expect((back.data.workshops as { id: string }[]).map((w) => w.id)).toEqual([workshopId])

    await must('trash_workshop', { workshopId })
    await must('purge_workshop', { workshopId })
    const gone = await ops.query('select 1 from workshop where id = $1', [workshopId])
    expect(gone.rowCount).toBe(0)
  })

  it('does not let a member rename a workshop they cannot open', async () => {
    const { call } = await connect(me)
    const result = await call('rename_workshop', { workshopId: strangersWorkshop, title: 'Meins' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('Not found')
  })
})

describe('days', () => {
  it('adds, describes and removes days, and never the last one', async () => {
    const { must, call } = await connect(me)
    const { data } = await must('create_workshop', { title: unique('Zweitägig') })
    const workshopId = data.workshopId as string
    const firstDay = data.dayId as string

    const second = await must('create_day', {
      workshopId,
      title: 'Tag 2',
      date: '2026-10-02',
      startMinute: 600,
    })
    const days = await must('list_days', { workshopId })
    expect((days.data.days as { id: string }[]).map((d) => d.id)).toEqual([
      firstDay,
      second.data.dayId,
    ])

    const dayRow = await ops.query(
      'select title, date::text, start_time::text from workshop_day where id = $1',
      [second.data.dayId],
    )
    expect(dayRow.rows[0]).toEqual({ title: 'Tag 2', date: '2026-10-02', start_time: '10:00:00' })

    await must('update_day', {
      workshopId,
      dayId: firstDay,
      title: 'Auftakt',
      date: '2026-10-01',
      startMinute: 510,
      note: 'Raum 4.12, Flipchart mitbringen',
    })
    const updated = await ops.query(
      'select title, date::text, start_time::text, json_desc from workshop_day where id = $1',
      [firstDay],
    )
    expect(updated.rows[0]).toEqual({
      title: 'Auftakt',
      date: '2026-10-01',
      start_time: '08:30:00',
      json_desc: { text: 'Raum 4.12, Flipchart mitbringen' },
    })

    await must('delete_day', { workshopId, dayId: second.data.dayId })
    const last = await call('delete_day', { workshopId, dayId: firstDay })
    expect(last.isError).toBe(true)
    expect(last.text).toContain('last day')

    const remaining = await ops.query('select id from workshop_day where workshop_id = $1', [
      workshopId,
    ])
    expect(remaining.rows.map((r: { id: string }) => r.id)).toEqual([firstDay])
  })

  it('orders days, and keeps one parking area across all of them', async () => {
    const { must } = await connect(me)
    const { data } = await must('create_workshop', { title: unique('Parkplatz') })
    const workshopId = data.workshopId as string
    const firstDay = data.dayId as string
    const secondDay = (await must('create_day', { workshopId, title: 'Tag 2' })).data
      .dayId as string

    await must('move_day', { workshopId, dayId: secondDay, afterId: null })
    const days = await must('list_days', { workshopId })
    expect((days.data.days as { id: string }[]).map((d) => d.id)).toEqual([secondDay, firstDay])

    // Parked on one day, seen from the other: a model that cannot see the
    // shelf of the whole workshop cannot bring anything off it.
    const block = await must('add_module', {
      workshopId,
      dayId: firstDay,
      typeKey: 'break',
      title: 'Plan B',
    })
    await must('update_module', {
      workshopId,
      dayId: firstDay,
      moduleId: block.data.id,
      parked: true,
    })

    const seen = await must('get_workshop', { workshopId, dayId: secondDay })
    expect(seen.data.parkedElsewhere).toEqual([
      expect.objectContaining({ id: block.data.id, dayId: firstDay, title: 'Plan B' }),
    ])
    expect(seen.text).toContain('Plan B')

    const moved = await must('move_module', {
      workshopId,
      dayId: firstDay,
      moduleId: block.data.id,
      toDayId: secondDay,
      parked: false,
    })
    expect(moved.data.id).not.toBe(block.data.id)

    const arrived = await must('get_workshop', { workshopId, dayId: secondDay })
    expect(arrived.data.blocks).toEqual([
      expect.objectContaining({ id: moved.data.id, title: 'Plan B', parked: false }),
    ])
    expect(arrived.data.parkedElsewhere).toEqual([])

    // Deleting a day takes its schedule, not its shelf.
    await must('update_module', {
      workshopId,
      dayId: secondDay,
      moduleId: moved.data.id,
      parked: true,
    })
    const deleted = await must('delete_day', { workshopId, dayId: secondDay })
    expect(deleted.text).toContain('1 parked')

    const kept = await must('get_workshop', { workshopId, dayId: firstDay })
    expect(kept.data.blocks).toEqual([expect.objectContaining({ title: 'Plan B', parked: true })])
  })
})

describe('blocks', () => {
  it('edits what the day editor edits', async () => {
    const { must, call } = await connect(me)
    const { data } = await must('create_workshop', { title: unique('Blöcke') })
    const workshopId = data.workshopId as string
    const dayId = data.dayId as string

    const section = await must('add_cluster', {
      workshopId,
      dayId,
      title: 'Einstieg',
      color: 'teal',
    })
    const block = await must('add_module', {
      workshopId,
      dayId,
      typeKey: 'break',
      clusterId: section.data.id,
    })

    await must('update_module', {
      workshopId,
      dayId,
      moduleId: block.data.id,
      title: 'Kaffee',
      durationMinutes: 25,
      pinnedStartMinute: 630,
    })
    await must('update_module', { workshopId, dayId, moduleId: section.data.id, title: 'Ankommen' })

    const moduleRow = await ops.query(
      'select title, duration_minutes, pinned_start_time::text, parked, cluster_id from module where id = $1',
      [block.data.id],
    )
    expect(moduleRow.rows[0]).toEqual({
      title: 'Kaffee',
      duration_minutes: 25,
      pinned_start_time: '10:30:00',
      parked: false,
      cluster_id: section.data.id,
    })
    const clusterRow = await ops.query('select title, color from cluster where id = $1', [
      section.data.id,
    ])
    expect(clusterRow.rows[0]).toEqual({ title: 'Ankommen', color: 'teal' })

    // A cluster has no duration; saying so beats silently storing one.
    const wrongKind = await call('update_module', {
      workshopId,
      dayId,
      moduleId: section.data.id,
      durationMinutes: 10,
    })
    expect(wrongKind.isError).toBe(true)
    expect(wrongKind.text).toContain('durationMinutes')

    await must('update_module', { workshopId, dayId, moduleId: block.data.id, parked: true })
    const outline = await must('get_workshop', { workshopId, dayId })
    const blocks = outline.data.blocks as { id: string; kind: string; parked?: boolean }[]
    expect(blocks.find((b) => b.id === block.data.id)).toMatchObject({ parked: true })
    expect(blocks.find((b) => b.id === section.data.id)).toMatchObject({ kind: 'cluster' })
    expect(outline.text).toContain('Parked')
  })
})
