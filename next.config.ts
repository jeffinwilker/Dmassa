import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bullmq"],
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  // Next 15.5+ bufera o body pro middleware. Default 10MB corta upload de video.
  // Bumpa pra 250mb (mesmo teto do Nginx e do MAX_SIZE_MB da API).
  // Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize
  middlewareClientMaxBodySize: "250mb",
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "minio" },
    ],
  },
};

export default nextConfig;
