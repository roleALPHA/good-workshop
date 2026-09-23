#!/usr/bin/env node
/**
 * Runs both server processes in one container.
 *
 * Two processes rather than two images, so the on-prem promise stays "one
 * image plus Postgres". Next cannot serve a WebSocket upgrade from a route
 * handler, so the collaboration server needs its own listener -- but it does
 * not need its own deployment.
 *
 * No supervisor, deliberately: if either process dies the container dies, and
 * Docker's restart policy brings both back together. A container that keeps
 * running with half its function missing is the harder failure to notice.
 *
 * GW_MIGRATE_ON_START=1 runs the `migrate` service's chain here first, for
 * installations whose images are swapped by an updater such as Watchtower:
 * it replaces only this container, so the separate `migrate` service would
 * never run and the new code would start against the old schema. The price is
 * the role separation -- this container then needs the superuser and gw_owner
 * passwords as well, which is why it is off unless an operator decides
 * otherwise. Should a step fail, nothing is started: the restart policy retries
 * and the log names the step.
 */
import { spawn, spawnSync } from 'node:child_process'

if (process.env.GW_MIGRATE_ON_START === '1') {
  const missing = ['MIGRATION_DATABASE_URL', 'ADMIN_DATABASE_URL'].filter(
    (name) => !process.env[name],
  )
  if (missing.length > 0) {
    console.error(
      `GW_MIGRATE_ON_START=1, aber ${missing.join(' und ')} ${missing.length > 1 ? 'fehlen' : 'fehlt'} -- ohne die Rollen des ` +
        '`migrate`-Dienstes kann dieser Container nicht migrieren. Siehe README, "Automatic updates".',
    )
    process.exit(1)
  }
  // Same order as the `migrate` service in compose.yaml, for the same reason:
  // preflight only reads and stops BEFORE migrate touches the first row.
  for (const script of ['db-bootstrap.mjs', 'preflight.mjs', 'migrate.mjs', 'provision.mjs']) {
    const { status, signal } = spawnSync(process.execPath, [`scripts/${script}`], {
      stdio: 'inherit',
      env: process.env,
    })
    if (status !== 0) {
      console.error(
        `${script} fehlgeschlagen (code=${status} signal=${signal}) — Container startet nicht.`,
      )
      process.exit(status ?? 1)
    }
  }
}

const children = []

function start(name, args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env })
  child.on('exit', (code, signal) => {
    console.error(`${name} beendet (code=${code} signal=${signal}) — Container wird beendet.`)
    for (const other of children) if (other !== child) other.kill('SIGTERM')
    process.exit(code ?? 1)
  })
  children.push(child)
  return child
}

start('web', ['server.js'])
start('collab', ['dist/collab-server.mjs'])

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal)
  })
}
