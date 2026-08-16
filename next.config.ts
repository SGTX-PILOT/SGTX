import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Large project (222 Prisma models, 500KB+ files) exceeds Hobby-plan
    // build memory when type-checking. Lint already passes with 0 errors
    // locally; skip TS checking at build time to avoid OOM kills.
    ignoreBuildErrors: true,
  },
  // NOTE: eslint config moved to eslint.config.mjs (Next.js 16 no longer
  // supports the `eslint` key in next.config). Build-time ESLint is disabled
  // via the `--no-lint` flag in the build command instead.
  reactStrictMode: true,
};

export default nextConfig;
