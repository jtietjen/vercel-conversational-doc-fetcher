import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // All API routes run on the Node.js runtime (not Edge) because:
  // - @vercel/kv uses Node.js net APIs
  // - downloadMedia needs Node.js fetch with arraybuffer support
  // - Gemini SDK uses Node.js crypto
};

export default nextConfig;
