// SGTX — fresh Prisma client for newly-introduced schema fields.
// Some Prisma Client instances cached before a `db:push` cannot see newly-added models
// (e.g. PlatformFeatureToggle, BreakGlassEvent). `freshDb` always returns a freshly
// instantiated PrismaClient so code paths touching those new models never trip over
// stale generated-client caches during a hot-reload dev session.
//
// Both `db` (legacy singleton) and `freshDb` (this module) target the same Turso DB
// via the @prisma/adapter-libsql driver adapter.
//
// NOTE: In dev mode we do NOT cache the client on globalThis — that prevents stale
// PrismaClient classes from surviving a `prisma generate` cycle. Each dev-process
// import gets a fresh PrismaClient bound to the latest generated code in
// node_modules/@prisma/client.

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const TURSO_HOST = "sgtx-fortleem.aws-us-east-1.turso.io";
const TURSO_TOKEN_FALLBACK = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";

function resolveTursoUrl(): string {
  // Priority 1: TURSO_LIBSQL_URL (set by instrumentation.ts)
  const libsqlUrl = process.env.TURSO_LIBSQL_URL || "";
  if (libsqlUrl && (libsqlUrl.startsWith("libsql://") || libsqlUrl.startsWith("http"))) {
    return libsqlUrl;
  }
  // Priority 2: DATABASE_URL if libsql://
  const envUrl = process.env.DATABASE_URL || "";
  if (envUrl.startsWith("libsql://") || envUrl.startsWith("http://") || envUrl.startsWith("https://")) {
    return envUrl;
  }
  // Priority 3: TURSO_AUTH_TOKEN
  const tursoToken = process.env.TURSO_AUTH_TOKEN || "";
  if (tursoToken) {
    return `libsql://${TURSO_HOST}?authToken=${tursoToken}`;
  }
  // Priority 4: hardcoded fallback
  return `libsql://${TURSO_HOST}?authToken=${TURSO_TOKEN_FALLBACK}`;
}

function createFreshPrismaClient(): PrismaClient {
  const databaseUrl = resolveTursoUrl();
  if (databaseUrl.startsWith("libsql://") || databaseUrl.startsWith("http://") || databaseUrl.startsWith("https://")) {
    const url = new URL(databaseUrl);
    const authToken = url.searchParams.get("authToken") || undefined;
    const tursoUrl = `${url.protocol}//${url.host}`;
    const libsql = createClient({ url: tursoUrl, authToken });
    const adapter = new PrismaLibSql(libsql);
    return new PrismaClient({ adapter, log: ["error", "warn"] });
  }
  return new PrismaClient({ log: ["error", "warn"] });
}

const globalForFresh = globalThis as unknown as {
  __sgtxFreshDb: PrismaClient | undefined;
};

if (process.env.NODE_ENV === "production") {
  // Production: cache singleton on globalThis to avoid reconnect storms.
  if (!globalForFresh.__sgtxFreshDb) {
    globalForFresh.__sgtxFreshDb = createFreshPrismaClient();
  }
}

// Dev: always instantiate fresh, so newly-generated Prisma Client is picked up.
export const freshDb =
  process.env.NODE_ENV === "production"
    ? (globalForFresh.__sgtxFreshDb as PrismaClient)
    : createFreshPrismaClient();
