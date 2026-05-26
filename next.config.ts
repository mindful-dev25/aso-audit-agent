import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'is1-ssl.mzstatic.com',
      },
      {
        protocol: 'https',
        hostname: '*.mzstatic.com',
      },
    ],
  },
  serverExternalPackages: ['@mastra/core', '@mastra/libsql', '@mendable/firecrawl-js'],
}

export default nextConfig
