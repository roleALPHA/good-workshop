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
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
}

export default nextConfig
