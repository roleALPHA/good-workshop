#!/usr/bin/env node
/**
 * Bundles the collaboration server.
 *
 * Next's output tracing only follows what a route imports, and nothing imports
 * this process -- it would be left out of the image entirely. One esbuild pass
 * puts it next to the standalone server, in the same image, so the on-prem
 * promise stays "one image plus Postgres".
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(root, 'src/server/collab/entry.ts')],
  outfile: join(root, 'dist/collab-server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Native and heavy dependencies stay external and are resolved from
  // node_modules at runtime, exactly as the Next server resolves its own.
  external: ['pg', 'pg-native', 'ws'],
  alias: { '@': join(root, 'src') },
  banner: {
    // The bundle is ESM but some dependencies still reach for require().
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
})
