import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // React Strict Mode for development best practices
  reactStrictMode: true,

  // Experimental features for Next.js 15
  experimental: {
    // Type-safe environment variables
    typedRoutes: true,
  },
}

export default nextConfig
