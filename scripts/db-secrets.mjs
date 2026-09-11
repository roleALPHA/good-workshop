#!/usr/bin/env node
/**
 * Creates the secrets an installation needs, once, into volumes of their own.
 *
 * Named db-secrets because it began as the database half, and kept that name on
 * purpose when the application key was added: compose.yaml on every running
 * installation invokes this path by name, and a rename would take the next
 * automatic image update down with it. The name is a little narrow; a stack
 * that stops starting at three in the morning is worse.
 *
 *
 * WHY THERE ARE PASSWORDS AT ALL. The earlier design authenticated over a
 * shared Unix socket with peer authentication and kept no secret anywhere,
 * which is a better story than this one. It could not work: peer compares the
 * OS user of the connecting PROCESS against the database role, and the
 * application container runs as `node` (uid 1000) while the database container
 * knows uid 70 as `postgres` and nothing at 1000. Every connection across the
 * container boundary failed, and the stack could not start at all.
 *
 * The rejected alternatives, so nobody re-litigates them quietly:
 *
 *   - `POSTGRES_HOST_AUTH_METHOD=trust`: the container starts, and every
 *     process in every container on the compose network can connect as any
 *     role, superuser included. RLS, NOINHERIT and the revoke on the identity
 *     tables all rest on the application only ever being gw_app.
 *   - One shared password: the same thing with an extra step.
 *   - A second database image that creates matching OS users: keeps the peer
 *     story, costs an image, and breaks whenever the base image renumbers.
 *
 * WHAT IS AND IS NOT PROTECTED. The files live on a volume mounted only into
 * db, migrate and app, are generated here and never leave the host. They are
 * not in the .env, not in `docker inspect`, not in a database dump, and not in
 * a support log. They ARE readable by any process inside those three
 * containers -- which already reach the database anyway. This is the line that
 * matters: a secret nobody has to type is a secret nobody pastes into a ticket.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.GW_DB_SECRETS_DIR ?? '/run/db-secrets'

/**
 * Every role the stack connects as, each in its OWN directory -- because each
 * directory is its own volume, and compose mounts only the ones a service is
 * entitled to. The app container gets gw_app and nothing else.
 *
 * That separation is the whole point. One shared directory would put the
 * superuser password inside the container an attacker reaches first, which is
 * exactly the "zwei Anker" objection compose.yaml raises against handing the
 * web container the admin connection.
 *
 * `postgres` is included because initdb needs it before any other role exists.
 */
const ROLES = ['postgres', 'gw_owner', 'gw_app', 'gw_ops']

/**
 * The application key, in its own directory next to the role passwords.
 *
 * It encrypts the configured credentials in tenant.settings -- the SMTP URL, the
 * Graph client secret -- so that a database dump alone cannot send mail as the
 * organisation.
 *
 * IT BELONGS IN THE BACKUP. Unlike the role passwords, which any fresh install
 * can regenerate, this one is the only thing that can read values already in
 * the database. Restore a dump without it and those two fields come back empty:
 * nothing else breaks, and the operator types them again -- but they should
 * know that before it happens, which is why the README says so next to pg_dump.
 */
const APP_KEY = 'app'

let created = 0
for (const role of [...ROLES, APP_KEY]) {
  const file = join(dir, role, role === APP_KEY ? 'secret-key' : 'password')
  mkdirSync(join(dir, role), { recursive: true })

  if (!existsSync(file) || readFileSync(file, 'utf8').trim().length < 32) {
    // base64url: no characters that need escaping inside a connection URL, and
    // none that a shell would interpret if somebody echoes the file.
    //
    // The application key is EXACTLY 32 bytes because AES-256 takes a 256-bit
    // key and secretbox.ts refuses anything else rather than padding it. The
    // role passwords have no such constraint; 33 bytes only avoids the `=`
    // padding that 32 would produce.
    const bytes = role === APP_KEY ? 32 : 33
    writeFileSync(file, randomBytes(bytes).toString('base64url'), { mode: 0o644 })
    created += 1
  }

  // Re-applied even for a file that already existed: a volume restored from a
  // backup, or written by an older version of this script, can carry a mode
  // that the database container -- a different uid -- cannot read.
  chmodSync(file, 0o644)
}

console.log(
  created === 0
    ? `Geheimnisse vorhanden (${ROLES.length} Rollen und der Anwendungsschlüssel).`
    : `${created} Geheimnis/-se erzeugt.`,
)
