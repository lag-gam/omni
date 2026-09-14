const path = require("path");

const elevenWeb = path.join(
  __dirname,
  "node_modules/@elevenlabs/client/dist/platform/web/index.js"
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  serverExternalPackages: [
    "@modelcontextprotocol/sdk",
    "@huggingface/transformers",
  ],
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@elevenlabs/client": elevenWeb,
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@elevenlabs/client": elevenWeb,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
