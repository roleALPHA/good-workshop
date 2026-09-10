import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Single self-contained artifact for the on-prem Docker image.
  output: 'standalone',

  // Pinned rather than inferred. Next guesses the workspace root from the
  // nearest lockfile, and in a git worktree (or any checkout under another
  // project) it guesses wrong -- the traced bundle then lands somewhere else
  // and `.next/standalone` comes out holding nothing but a package.json.
  // Inside the Docker image there is only one lockfile, so the failure is
  // invisible exactly where it would hurt most to discover it late.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  /**
   * One copy of Yjs in the process, not one per chunk.
   *
   * The editor bundle and the MCP route both reach for it, and two bundled
   * copies mean two different Y.Doc classes: y-protocols checks instances, so
   * a document created by one copy silently fails to sync through the other.
   * Yjs prints "Yjs was already imported" when this happens -- a warning that
   * describes a real, subtle breakage rather than noise. `ws` is here because
   * it is a native-ish server library with no business in a bundle.
   */
  serverExternalPackages: ['yjs', 'y-protocols', 'lib0', 'ws'],

  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
}

export default nextConfig
