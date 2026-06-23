// SGTX — fresh Prisma client for newly-introduced schema fields.
// Some Prisma Client instances cached before a `db:push` cannot see newly-added models
// (e.g. PlatformFeatureToggle, BreakGlassEvent). `freshDb` always returns a freshly
// instantiated PrismaClient so code paths touching those new models never trip over
// stale generated-client caches during a hot-reload dev session.
//
// Both `db` (legacy singleton) and `freshDb` (this module) target the same SQLite file.
//
// NOTE: In dev mode we do NOT cache the client on globalThis — that prevents stale
// PrismaClient classes from surviving a `prisma generate` cycle. Each dev-process
// import gets a fresh PrismaClient bound to the latest generated code in
// node_modules/@prisma/client.

import { PrismaClient } from "@prisma/client";

const globalForFresh = globalThis as unknown as {
  __sgtxFreshDb: PrismaClient | undefined;
};

if (process.env.NODE_ENV === "production") {
  // Production: cache singleton on globalThis to avoid reconnect storms.
  if (!globalForFresh.__sgtxFreshDb) {
    globalForFresh.__sgtxFreshDb = new PrismaClient({ log: ["error", "warn"] });
  }
}

// Dev: always instantiate fresh, so newly-generated Prisma Client is picked up.
export const freshDb =
  process.env.NODE_ENV === "production"
    ? (globalForFresh.__sgtxFreshDb as PrismaClient)
    : new PrismaClient({ log: ["error", "warn"] });
