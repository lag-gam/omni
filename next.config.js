/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};

module.exports = nextConfig;
