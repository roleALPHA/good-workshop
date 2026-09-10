import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { bytea, citext, TENANT_POLICY_USING, tenantId, timestamps } from './columns'

/**
 * Four invariants hold across this file without exception. Violating one means
 * the cloud edition eventually needs a fork:
 *
 *  1. Every tenant-scoped table has tenant_id NOT NULL and RLS enabled *and*
 *     forced (the FORCE is applied by scripts/migrate.mjs across all tables,
 *     because a new table without it is a silent, total data leak).
 *  2. Every cross-row FK inside the tenant boundary is a composite FK including
 *     tenant_id. RLS stops reads across tenants; composite FKs stop WRITES.
 *  3. Every request runs in one transaction that sets app.tenant_id first --
 *     see withTenant.ts. The raw db handle is never exported.
 *  4. Derived data is never stored. Start times, cluster durations and
 *     effective permissions are all computed.
 *
 * `unique(tenant_id, id)` on every tenant-scoped table is what makes rule 2
 * possible. It costs one index per table; pay it.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Identity layer — global, no tenant_id
//
// The one deliberate break from rule 1, and it is load-bearing: a consultant
// with three client workspaces must not have to register three passkeys.
// These tables are protected by grants (gw_auth) rather than by RLS.
// ═══════════════════════════════════════════════════════════════════════════

export const identity = pgTable(
  'identity',
  {
    id: uuid('id').primaryKey(),
    email: citext('email').notNull().unique(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    displayName: text('display_name').notNull().default(''),
    avatarUrl: text('avatar_url'),
    status: text('status').notNull().default('active'),
    // Seam for OIDC/SAML self-hosters. Unused in v1, but adding these columns
    // later would mean a migration on the busiest table in the system.
    externalIdp: text('external_idp'),
    externalId: text('external_id'),
    locale: text('locale').notNull().default('de'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('identity_status', sql`${t.status} in ('active','disabled')`),
    unique('identity_external_uq').on(t.externalIdp, t.externalId),
  ],
)

export const webauthnCredential = pgTable(
  'webauthn_credential',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identity.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    signCount: bigint('sign_count', { mode: 'number' }).notNull().default(0),
    transports: text('transports')
      .array()
      .notNull()
      .default(sql`'{}'`),
    backedUp: boolean('backed_up').notNull().default(false),
    deviceType: text('device_type'),
    nickname: text('nickname').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('webauthn_credential_identity_idx').on(t.identityId)],
)

export const webauthnChallenge = pgTable(
  'webauthn_challenge',
  {
    id: uuid('id').primaryKey(),
    challenge: text('challenge').notNull(),
    // Null for a discoverable-credential login, where we do not yet know who
    // is knocking.
    identityId: uuid('identity_id').references(() => identity.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('webauthn_challenge_purpose', sql`${t.purpose} in ('registration','authentication')`),
    index('webauthn_challenge_expiry_idx').on(t.expiresAt),
  ],
)

/** Magic links, admin invites and e-mail changes: one table, one expiry sweep. */
export const emailToken = pgTable(
  'email_token',
  {
    id: uuid('id').primaryKey(),
    purpose: text('purpose').notNull(),
    email: citext('email').notNull(),
    identityId: uuid('identity_id').references(() => identity.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    invitedRole: text('invited_role'),
    // Only the hash is stored. A stolen database must not yield working links.
    tokenHash: text('token_hash').notNull().unique(),
    redirectTo: text('redirect_to'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    requestedIp: inet('requested_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('email_token_purpose', sql`${t.purpose} in ('login','invite','email_change')`),
    check(
      'email_token_invited_role',
      sql`${t.invitedRole} is null or ${t.invitedRole} in ('member','admin')`,
    ),
    index('email_token_rate_idx').on(t.email, t.createdAt),
    index('email_token_expiry_idx').on(t.expiresAt),
  ],
)

/**
 * Database sessions, not JWTs. A tenant admin disabling someone has to take
 * effect now, not at the next token expiry.
 */
export const authSession = pgTable(
  'auth_session',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identity.id, { onDelete: 'cascade' }),
    activeTenantId: uuid('active_tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    secretHash: text('secret_hash').notNull(),
    method: text('method').notNull(),
    userAgent: text('user_agent'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('auth_session_method', sql`${t.method} in ('passkey','magic_link')`),
    index('auth_session_identity_idx').on(t.identityId),
    index('auth_session_expiry_idx').on(t.expiresAt),
  ],
)

// ═══════════════════════════════════════════════════════════════════════════
// Tenancy
// ═══════════════════════════════════════════════════════════════════════════

export const tenant = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey(),
    slug: citext('slug').notNull().unique(),
    name: text('name').notNull(),
    settings: jsonb('settings')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('active'),
    // Branding. One brand hex is converted to OKLCH and expanded into a ramp
    // server-side; the logo is small and hard-capped, which is why it may live
    // in the row: pg_dump stays a complete backup of the whole application.
    brandName: text('brand_name'),
    brandHex: text('brand_hex'),
    logo: text('logo'),
    logoMime: text('logo_mime'),
    logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('tenant_status', sql`${t.status} in ('active','suspended')`),
    check('tenant_brand_hex', sql`${t.brandHex} is null or ${t.brandHex} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
)

/** The tenant-scoped principal. Every domain FK points here, never at identity. */
export const member = pgTable(
  'member',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identity.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('invited'),
    displayName: text('display_name'),
    invitedBy: uuid('invited_by'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('member_tenant_id_uq').on(t.tenantId, t.id),
    unique('member_tenant_identity_uq').on(t.tenantId, t.identityId),
    check('member_role', sql`${t.role} in ('member','admin')`),
    check('member_status', sql`${t.status} in ('invited','active','disabled')`),
    index('member_tenant_role_idx').on(t.tenantId, t.role),
    index('member_identity_idx').on(t.identityId),
    pgPolicy('member_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

// ═══════════════════════════════════════════════════════════════════════════
// Organisation
// ═══════════════════════════════════════════════════════════════════════════

export const folder = pgTable(
  'folder',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    // A materialised path beats ltree here: no extension dependency, which
    // matters when the on-prem story is "just use the official postgres image".
    ancestorIds: uuid('ancestor_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    position: text('position').notNull(),
    createdBy: uuid('created_by'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('folder_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.parentId], foreignColumns: [t.tenantId, t.id] }).onDelete(
      'cascade',
    ),
    check('folder_name_length', sql`length(${t.name}) between 1 and 120`),
    check('folder_depth', sql`cardinality(${t.ancestorIds}) <= 7`),
    check('folder_no_self_cycle', sql`not (${t.ancestorIds} @> array[${t.id}])`),
    // coalesce rather than NULLS NOT DISTINCT: a NULL parent means "root", and
    // two root folders called "Kunden" must still collide.
    uniqueIndex('folder_sibling_name_uq').on(
      t.tenantId,
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
    index('folder_children_idx').on(t.tenantId, t.parentId, t.position),
    index('folder_subtree_idx').using('gin', t.ancestorIds),
    pgPolicy('folder_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

export const tag = pgTable(
  'tag',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    name: citext('name').notNull(),
    color: text('color').notNull().default('slate'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('tag_tenant_id_uq').on(t.tenantId, t.id),
    unique('tag_tenant_name_uq').on(t.tenantId, t.name),
    pgPolicy('tag_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

// ═══════════════════════════════════════════════════════════════════════════
// Module types
// ═══════════════════════════════════════════════════════════════════════════

export const moduleType = pgTable(
  'module_type',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('content'),
    // A token name from the curated palette, never a hex value: dark mode,
    // print and tenant branding all have to agree about what "rose" means.
    color: text('color').notNull().default('slate'),
    icon: text('icon').notNull().default('square'),
    defaultDurationMinutes: integer('default_duration_minutes').notNull().default(15),
    // False for break / lunch / buffer. A first-class column rather than a
    // desc field because it drives the content-vs-breaks split facilitators
    // check before sending an agenda out.
    countsAsContent: boolean('counts_as_content').notNull().default(true),
    schemaVersion: integer('schema_version').notNull().default(1),
    jsonSchema: jsonb('json_schema').notNull(),
    uiSchema: jsonb('ui_schema')
      .notNull()
      .default(sql`'{}'::jsonb`),
    defaultJsonDesc: jsonb('default_json_desc')
      .notNull()
      .default(sql`'{}'::jsonb`),
    isSystem: boolean('is_system').notNull().default(false),
    systemKey: text('system_key'),
    systemRevision: integer('system_revision'),
    // Set the moment a tenant edits a built-in. Upgrades then skip that row --
    // the tenant owns it now.
    customizedAt: timestamp('customized_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(100),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('module_type_tenant_id_uq').on(t.tenantId, t.id),
    unique('module_type_tenant_key_uq').on(t.tenantId, t.key),
    check('module_type_key_format', sql`${t.key} ~ '^[a-z][a-z0-9_]{1,48}$'`),
    check(
      'module_type_category',
      sql`${t.category} in ('opening','content','activity','logistics','closing','custom')`,
    ),
    check('module_type_duration', sql`${t.defaultDurationMinutes} between 0 and 1440`),
    check('module_type_schema_size', sql`octet_length(${t.jsonSchema}::text) <= 32768`),
    check('module_type_system_key', sql`${t.isSystem} = false or ${t.systemKey} is not null`),
    uniqueIndex('module_type_system_uq')
      .on(t.tenantId, t.systemKey)
      .where(sql`is_system`),
    pgPolicy('module_type_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

/** Immutable history, so a module written last year can still be interpreted. */
export const moduleTypeVersion = pgTable(
  'module_type_version',
  {
    tenantId: tenantId(),
    moduleTypeId: uuid('module_type_id').notNull(),
    version: integer('version').notNull(),
    jsonSchema: jsonb('json_schema').notNull(),
    uiSchema: jsonb('ui_schema')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.moduleTypeId, t.version] }),
    foreignKey({
      columns: [t.tenantId, t.moduleTypeId],
      foreignColumns: [moduleType.tenantId, moduleType.id],
    }).onDelete('cascade'),
    pgPolicy('module_type_version_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

// ═══════════════════════════════════════════════════════════════════════════
// Workshop
// ═══════════════════════════════════════════════════════════════════════════

export const workshop = pgTable(
  'workshop',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'),
    isTemplate: boolean('is_template').notNull().default(false),
    ownerId: uuid('owner_id').notNull(),
    /** IANA zone. Stored for display and future calendar export only -- the
     *  scheduler never converts to an instant, so DST is a non-event. */
    timezone: text('timezone').notNull().default('Europe/Berlin'),
    jsonDesc: jsonb('json_desc')
      .notNull()
      .default(sql`'{}'::jsonb`),
    position: text('position').notNull(),
    /**
     * Bumped on ANY descendant change. The one deliberate exception to "derived
     * data is never stored", because it is a counter rather than a derivation.
     * Powers HTTP ETags, editor conflict detection and MCP compare-and-swap.
     */
    contentVersion: bigint('content_version', { mode: 'bigint' })
      .notNull()
      .default(sql`1`),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('workshop_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.folderId],
      foreignColumns: [folder.tenantId, folder.id],
    }).onDelete('set null'),
    // restrict, not cascade: deleting a member must not silently delete the
    // workshops they own. Transfer ownership first, deliberately.
    foreignKey({
      columns: [t.tenantId, t.ownerId],
      foreignColumns: [member.tenantId, member.id],
    }).onDelete('restrict'),
    check('workshop_title_length', sql`length(${t.title}) between 1 and 300`),
    check('workshop_status', sql`${t.status} in ('draft','ready','delivered','archived')`),
    index('workshop_folder_idx')
      .on(t.tenantId, t.folderId, t.position)
      .where(sql`deleted_at is null`),
    index('workshop_owner_idx')
      .on(t.tenantId, t.ownerId)
      .where(sql`deleted_at is null`),
    index('workshop_recent_idx')
      .on(t.tenantId, t.updatedAt)
      .where(sql`deleted_at is null`),
    pgPolicy('workshop_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

export const workshopTag = pgTable(
  'workshop_tag',
  {
    tenantId: tenantId(),
    workshopId: uuid('workshop_id').notNull(),
    tagId: uuid('tag_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workshopId, t.tagId] }),
    foreignKey({
      columns: [t.tenantId, t.workshopId],
      foreignColumns: [workshop.tenantId, workshop.id],
    }).onDelete('cascade'),
    foreignKey({ columns: [t.tenantId, t.tagId], foreignColumns: [tag.tenantId, tag.id] }).onDelete(
      'cascade',
    ),
    index('workshop_tag_by_tag_idx').on(t.tenantId, t.tagId),
    pgPolicy('workshop_tag_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

export const workshopCollaborator = pgTable(
  'workshop_collaborator',
  {
    tenantId: tenantId(),
    workshopId: uuid('workshop_id').notNull(),
    memberId: uuid('member_id').notNull(),
    role: text('role').notNull(),
    addedBy: uuid('added_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workshopId, t.memberId] }),
    foreignKey({
      columns: [t.tenantId, t.workshopId],
      foreignColumns: [workshop.tenantId, workshop.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.memberId],
      foreignColumns: [member.tenantId, member.id],
    }).onDelete('cascade'),
    check('workshop_collaborator_role', sql`${t.role} in ('editor','viewer')`),
    index('workshop_collaborator_member_idx').on(t.tenantId, t.memberId),
    pgPolicy('workshop_collaborator_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

// ═══════════════════════════════════════════════════════════════════════════
// Agenda: day / cluster / module
// ═══════════════════════════════════════════════════════════════════════════

export const workshopDay = pgTable(
  'workshop_day',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    workshopId: uuid('workshop_id').notNull(),
    title: text('title').notNull().default(''),
    date: date('date'),
    startTime: time('start_time').notNull().default('09:00'),
    targetEndTime: time('target_end_time'),
    timezone: text('timezone'),
    jsonDesc: jsonb('json_desc')
      .notNull()
      .default(sql`'{}'::jsonb`),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('workshop_day_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.workshopId],
      foreignColumns: [workshop.tenantId, workshop.id],
    }).onDelete('cascade'),
    index('workshop_day_order_idx').on(t.tenantId, t.workshopId, t.position),
    pgPolicy('workshop_day_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

export const cluster = pgTable(
  'cluster',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    /** Denormalised so a whole workshop loads in one query. */
    workshopId: uuid('workshop_id').notNull(),
    dayId: uuid('day_id').notNull(),
    title: text('title').notNull().default(''),
    color: text('color'),
    jsonDesc: jsonb('json_desc')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Shares ONE key space with day-level modules -- see the note on module.position. */
    position: text('position').notNull(),
    pinnedStartTime: time('pinned_start_time'),
    /** A budget for a "planned 45m, actual 60m" warning. Never affects the schedule. */
    targetDurationMinutes: integer('target_duration_minutes'),
    collapsed: boolean('collapsed').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('cluster_tenant_id_uq').on(t.tenantId, t.id),
    // The target of module's day-consistency FK below.
    unique('cluster_tenant_id_day_uq').on(t.tenantId, t.id, t.dayId),
    foreignKey({
      columns: [t.tenantId, t.workshopId],
      foreignColumns: [workshop.tenantId, workshop.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.dayId],
      foreignColumns: [workshopDay.tenantId, workshopDay.id],
    }).onDelete('cascade'),
    check('cluster_position_format', sql`${t.position} ~ '^[0-9A-Za-z]{1,64}$'`),
    check(
      'cluster_target_duration',
      sql`${t.targetDurationMinutes} is null or ${t.targetDurationMinutes} between 0 and 1440`,
    ),
    index('cluster_day_order_idx').on(t.tenantId, t.dayId, t.position),
    index('cluster_workshop_idx').on(t.tenantId, t.workshopId),
    pgPolicy('cluster_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

/**
 * "A module hangs on a cluster or directly on a day."
 *
 * Rather than a nullable XOR (`check ((day_id is null) <> (cluster_id is
 * null))`), day_id is ALWAYS set and cluster_id is the optional refinement.
 * The requested semantics are preserved exactly -- cluster_id IS NULL means
 * "hangs on the day" -- and three things are gained:
 *
 *  - `where day_id = $1` loads a day in one indexed scan regardless of nesting.
 *  - The composite FK (tenant_id, cluster_id, day_id) makes "a module's cluster
 *    is on the module's own day" a DATABASE invariant rather than an app
 *    convention. With the XOR form it is unenforceable, and a buggy move WILL
 *    eventually violate it.
 *  - parent_kind / parent_id become stored generated columns, so ordering,
 *    moves and indexes all work on one indexable column.
 *
 * A composite FK with any NULL column is skipped under MATCH SIMPLE, so a
 * day-level module passes it trivially. That is exactly the wanted behaviour.
 */
export const workshopModule = pgTable(
  'module',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    workshopId: uuid('workshop_id').notNull(),
    dayId: uuid('day_id').notNull(),
    clusterId: uuid('cluster_id'),
    moduleTypeId: uuid('module_type_id').notNull(),
    /** The schema version this json_desc was written against. Reads stay lenient. */
    typeVersion: integer('type_version').notNull().default(1),
    title: text('title').notNull().default(''),
    durationMinutes: integer('duration_minutes').notNull().default(15),
    pinnedStartTime: time('pinned_start_time'),
    jsonDesc: jsonb('json_desc')
      .notNull()
      .default(sql`'{}'::jsonb`),
    position: text('position').notNull(),
    parentKind: text('parent_kind').generatedAlwaysAs(
      sql`case when cluster_id is null then 'day' else 'cluster' end`,
    ),
    parentId: uuid('parent_id').generatedAlwaysAs(sql`coalesce(cluster_id, day_id)`),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('module_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.workshopId],
      foreignColumns: [workshop.tenantId, workshop.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.dayId],
      foreignColumns: [workshopDay.tenantId, workshopDay.id],
    }).onDelete('cascade'),
    // THE key constraint: a module's cluster must be on the module's own day.
    foreignKey({
      columns: [t.tenantId, t.clusterId, t.dayId],
      foreignColumns: [cluster.tenantId, cluster.id, cluster.dayId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.moduleTypeId],
      foreignColumns: [moduleType.tenantId, moduleType.id],
    }).onDelete('restrict'),
    check('module_duration', sql`${t.durationMinutes} between 0 and 1440`),
    check('module_position_format', sql`${t.position} ~ '^[0-9A-Za-z]{1,64}$'`),
    check('module_desc_size', sql`octet_length(${t.jsonDesc}::text) <= 262144`),
    index('module_parent_order_idx').on(t.tenantId, t.parentId, t.position),
    index('module_workshop_idx').on(t.tenantId, t.workshopId),
    index('module_day_idx').on(t.tenantId, t.dayId),
    index('module_type_idx').on(t.tenantId, t.moduleTypeId),
    pgPolicy('module_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

/**
 * Append-only field history. Cheap insurance, written from day one even though
 * nothing reads it yet: it is the reason a paragraph someone was mid-way
 * through typing is recoverable after a last-write-wins collision.
 */
export const moduleRevision = pgTable(
  'module_revision',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: tenantId(),
    moduleId: uuid('module_id').notNull(),
    field: text('field').notNull(),
    oldValue: jsonb('old_value'),
    actorMemberId: uuid('actor_member_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('module_revision_module_idx').on(t.tenantId, t.moduleId, t.createdAt),
    pgPolicy('module_revision_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

// ═══════════════════════════════════════════════════════════════════════════
// Tokens, sharing, audit
// ═══════════════════════════════════════════════════════════════════════════

export const personalAccessToken = pgTable(
  'personal_access_token',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    name: text('name').notNull(),
    /** Public 12-char lookup key carried in the token string. Indexed, so a
     *  lookup is O(1) rather than a scan over a table of hashes. */
    tokenId: text('token_id').notNull().unique(),
    tokenHash: text('token_hash').notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{workshops:read}'`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    unique('pat_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.memberId],
      foreignColumns: [member.tenantId, member.id],
    }).onDelete('cascade'),
    index('pat_member_idx').on(t.tenantId, t.memberId),
    pgPolicy('pat_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

/** Reserved but unbuilt: creating the table now avoids a painful retrofit. */
export const workshopShareLink = pgTable(
  'workshop_share_link',
  {
    id: uuid('id').notNull(),
    tenantId: tenantId(),
    workshopId: uuid('workshop_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').notNull().default('viewer'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    foreignKey({
      columns: [t.tenantId, t.workshopId],
      foreignColumns: [workshop.tenantId, workshop.id],
    }).onDelete('cascade'),
    check('share_link_role', sql`${t.role} in ('viewer')`),
    pgPolicy('share_link_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

export const auditEvent = pgTable(
  'audit_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    actorMemberId: uuid('actor_member_id'),
    source: text('source').notNull(),
    tokenId: uuid('token_id'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    action: text('action').notNull(),
    data: jsonb('data')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('audit_source', sql`${t.source} in ('web','mcp','api','system')`),
    index('audit_entity_idx').on(t.tenantId, t.entityType, t.entityId, t.createdAt),
    index('audit_recent_idx').on(t.tenantId, t.createdAt),
    pgPolicy('audit_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

// ═══════════════════════════════════════════════════════════════════════════
// Collaboration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The CRDT state of one day, as an append-only log of Yjs updates.
 *
 * Append-only because that is what a CRDT is: the document is the sum of its
 * updates, and appending is the only operation that never needs a lock. Two
 * clients writing at the same moment simply both insert.
 *
 * The log is compacted -- all rows merged into one -- once it grows past a
 * threshold. Compaction is an optimisation, never a correctness requirement:
 * a log that is never compacted still replays to exactly the same document.
 *
 * Note what this table is NOT: the source of truth for reading. Export, print,
 * MCP and every server action read the relational tables, which a materialiser
 * keeps up to date. Yjs is the editing layer, not the record.
 */
export const collabUpdate = pgTable(
  'collab_update',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    dayId: uuid('day_id').notNull(),
    payload: bytea('payload').notNull(),
    /** True for a row produced by compaction, so a reader can tell them apart. */
    isSnapshot: boolean('is_snapshot').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.dayId],
      foreignColumns: [workshopDay.tenantId, workshopDay.id],
    }).onDelete('cascade'),
    // Replay order. The primary key alone would do, but the day has to filter
    // first or every read scans the whole log.
    index('collab_update_replay_idx').on(t.tenantId, t.dayId, t.id),
    pgPolicy('collab_update_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()

/**
 * What the relational tables were last brought in line with.
 *
 * Lets the materialiser skip work when nothing has changed since, and makes
 * "is the database behind the CRDT, and by how much" answerable rather than a
 * matter of trust.
 */
export const collabState = pgTable(
  'collab_state',
  {
    tenantId: tenantId().references(() => tenant.id, { onDelete: 'cascade' }),
    dayId: uuid('day_id').notNull(),
    /** The highest collab_update.id folded into the relational tables. */
    materializedUpTo: bigint('materialized_up_to', { mode: 'number' }).notNull().default(0),
    materializedAt: timestamp('materialized_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.dayId] }),
    foreignKey({
      columns: [t.tenantId, t.dayId],
      foreignColumns: [workshopDay.tenantId, workshopDay.id],
    }).onDelete('cascade'),
    pgPolicy('collab_state_tenant_isolation', {
      for: 'all',
      to: 'gw_app',
      using: TENANT_POLICY_USING,
      withCheck: TENANT_POLICY_USING,
    }),
  ],
).enableRLS()
