import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Single self-contained artifact for the on-prem Docker image.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
}

export default nextConfig
