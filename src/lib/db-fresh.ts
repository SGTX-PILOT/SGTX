import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// ═══════════════════════════════════════════════════════════════════════════════
// CERT-32 P0 FIX: Removed the hardcoded Turso JWT fallback.
// (See src/lib/db.ts for the full remediation note.)
//
// This is the "fresh" DB client used by the auth/onboarding flows. It
// follows the same certified connection resolution as the main `db`:
//   * Local SQLite when DATABASE_URL=file:...
//   * Turso when TURSO_AUTH_TOKEN (or TURSO_LIBSQL_URL, or libsql:// URL)
//     is set
//   * Explicit error on ambiguous config in production
//   * No hardcoded credentials.
// ═══════════════════════════════════════════════════════════════════════════════

const TURSO_HOST = process.env.TURSO_HOST || "sgtx-fortleem.aws-us-east-1.turso.io";

interface DbConfig {
  mode: "local-sqlite" | "turso";
  url?: string;
  authToken?: string;
}

function resolveDbConfig(): DbConfig {
  const envUrl = process.env.DATABASE_URL || "";
  const libsqlUrl = process.env.TURSO_LIBSQL_URL || "";

  if (libsqlUrl.startsWith("libsql://")) {
    try {
      const parsed = new URL(libsqlUrl);
      const authToken =
        parsed.searchParams.get("authToken") ||
        process.env.TURSO_AUTH_TOKEN ||
        "";
      if (!authToken) {
        throw new Error(
          "[SGTX][CERT-32] TURSO_LIBSQL_URL is set but no authToken is available. Set TURSO_AUTH_TOKEN.",
        );
      }
      return { mode: "turso", url: `libsql://${parsed.host}`, authToken };
    } catch (e: any) {
      throw new Error(`[SGTX][CERT-32] Invalid TURSO_LIBSQL_URL: ${e.message}`);
    }
  }

  if (envUrl.startsWith("libsql://")) {
    try {
      const parsed = new URL(envUrl);
      const authToken =
        parsed.searchParams.get("authToken") ||
        process.env.TURSO_AUTH_TOKEN ||
        "";
      if (!authToken) {
        throw new Error(
          "[SGTX][CERT-32] DATABASE_URL is libsql:// but no authToken is available.",
        );
      }
      return { mode: "turso", url: `libsql://${parsed.host}`, authToken };
    } catch (e: any) {
      throw new Error(`[SGTX][CERT-32] Invalid DATABASE_URL: ${e.message}`);
    }
  }

  const tursoToken = process.env.TURSO_AUTH_TOKEN || "";
  if (tursoToken) {
    return { mode: "turso", url: `libsql://${TURSO_HOST}`, authToken: tursoToken };
  }

  if (envUrl.startsWith("file:")) {
    return { mode: "local-sqlite", url: envUrl };
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[SGTX][CERT-32] No DATABASE_URL configured; falling back to local SQLite at file:./db/custom.db.",
    );
    return { mode: "local-sqlite", url: "file:./db/custom.db" };
  }

  throw new Error(
    "[SGTX][CERT-32] No database configuration in production. Set TURSO_AUTH_TOKEN.",
  );
}

function createFreshPrismaClient(): PrismaClient {
  const config = resolveDbConfig();
  // Prisma 7 with driverAdapters REQUIRES an adapter for every PrismaClient
  // instance. We use the PrismaLibSql adapter for both modes — for local
  // SQLite (dev), the @libsql/client supports `file:` URLs directly; for
  // Turso (prod), we pass the libsql:// URL + authToken.
  const adapter = new PrismaLibSql(
    config.mode === "turso"
      ? { url: config.url!, authToken: config.authToken! }
      : { url: config.url! },
  );
  return new PrismaClient({ adapter, log: ["error", "warn"] });
}

const globalForFresh = globalThis as unknown as {
  __sgtxFreshDb: PrismaClient | undefined;
};

let _freshDb: PrismaClient | null = null;

function getFreshDb(): PrismaClient {
  if (_freshDb) return _freshDb;
  if (process.env.NODE_ENV === "production") {
    if (!globalForFresh.__sgtxFreshDb) {
      globalForFresh.__sgtxFreshDb = createFreshPrismaClient();
    }
    _freshDb = globalForFresh.__sgtxFreshDb;
  } else {
    _freshDb = createFreshPrismaClient();
  }
  return _freshDb;
}

export const freshDb = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getFreshDb();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
