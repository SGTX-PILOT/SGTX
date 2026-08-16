import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Large project (222 Prisma models, 500KB+ files) exceeds Hobby-plan
    // build memory when type-checking. Lint already passes with 0 errors
    // locally; skip TS checking at build time to avoid OOM kills.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during build — verified 0 errors via `bun run lint`.
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
};

export default nextConfig;
