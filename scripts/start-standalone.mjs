#!/usr/bin/env node
/**
 * Starts the production server the same way the Docker image does.
 *
 * `next start` does not work with `output: 'standalone'` -- it warns and serves
 * something else. Running the standalone server directly is what production
 * actually does, so the E2E suite has to run against it too; otherwise the
 * tests pass against an artifact nobody ships.
 *
 * The two copy steps mirror the Dockerfile's COPY lines exactly. Keep them in
 * sync: a divergence here means E2E is green while the image is broken.
 */
import { cp, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const standalone = join(root, '.next', 'standalone')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

if (!(await exists(join(standalone, 'server.js')))) {
  console.error('No standalone build found. Run `pnpm build` first.')
  process.exit(1)
}

await cp(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true })
if (await exists(join(root, 'public'))) {
  await cp(join(root, 'public'), join(standalone, 'public'), { recursive: true })
}

const child = spawn(process.execPath, [join(standalone, 'server.js')], {
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0' },
})
child.on('exit', (code) => process.exit(code ?? 0))
