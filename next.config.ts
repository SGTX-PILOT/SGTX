import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel handles deployment natively — no standalone output needed
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
};

export default nextConfig;
