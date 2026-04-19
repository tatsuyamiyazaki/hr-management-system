import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // React Strict Mode for development best practices
  reactStrictMode: true,

  // Type-safe routes (moved from experimental in Next.js 15)
  typedRoutes: true,
}

export default nextConfig
