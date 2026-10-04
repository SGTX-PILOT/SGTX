import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client", "z-ai-web-dev-sdk"],
};

export default nextConfig;
