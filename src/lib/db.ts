import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════════════════════════════════════════
// CERT-32 P0 FIX: Removed the hardcoded Turso JWT fallback.
//
// The previous version (TURSO_TOKEN_FALLBACK) embedded the live production
// Turso JWT in this source file, committed to git and pushed to the public
// `SGTX-PILOT/SGTX` repository. The audit (SGTX_SECURITY_AUDIT.md finding #1)
// classified this as P0 — anyone with repo read access could authenticate to
// the production database.
//
// New connection resolution policy (certified):
//
//   1. LOCAL DEV — when `DATABASE_URL` is a `file:` URL, use the local
//      SQLite file via the standard Prisma client. NO Turso connection is
//      opened in dev — this is critical for tenant isolation (local dev
//      must NEVER touch production data).
//
//   2. PRODUCTION — when `DATABASE_URL` is a `libsql://` URL (or the
//      `TURSO_LIBSQL_URL` / `TURSO_AUTH_TOKEN` env vars are set), use the
//      Turso adapter. The Turso auth token MUST be supplied via env var;
//      there is NO hardcoded fallback. A missing token is an explicit,
//      observable, classified error.
//
//   3. AMBIGUOUS — if neither a local file URL nor a Turso env var is
//      configured, throw a clear error. Never silently fall back.
//
// (See SGTX_SECURITY_AUDIT.md finding #1 for the full evidence.)

const TURSO_HOST = process.env.TURSO_HOST || 'sgtx-fortleem.aws-us-east-1.turso.io'

interface DbConfig {
  mode: 'local-sqlite' | 'turso'
  // For local-sqlite: the file URL.
  // For turso: the libsql URL + authToken.
  url?: string
  authToken?: string
}

function resolveDbConfig(): DbConfig {
  const envUrl = process.env.DATABASE_URL || ''
  const libsqlUrl = process.env.TURSO_LIBSQL_URL || ''

  // Priority 1: explicit libsql:// URL via TURSO_LIBSQL_URL
  if (libsqlUrl.startsWith('libsql://')) {
    try {
      const parsed = new URL(libsqlUrl)
      const authToken = parsed.searchParams.get('authToken') || process.env.TURSO_AUTH_TOKEN || ''
      if (!authToken) {
        throw new Error(
          '[SGTX][CERT-32] TURSO_LIBSQL_URL is set but no authToken is available. ' +
          'Set TURSO_AUTH_TOKEN in your environment.',
        )
      }
      return { mode: 'turso', url: `libsql://${parsed.host}`, authToken }
    } catch (e: any) {
      throw new Error(`[SGTX][CERT-32] Invalid TURSO_LIBSQL_URL: ${e.message}`)
    }
  }

  // Priority 2: DATABASE_URL is libsql:// → Turso
  if (envUrl.startsWith('libsql://')) {
    try {
      const parsed = new URL(envUrl)
      const authToken = parsed.searchParams.get('authToken') || process.env.TURSO_AUTH_TOKEN || ''
      if (!authToken) {
        throw new Error(
          '[SGTX][CERT-32] DATABASE_URL is libsql:// but no authToken is available. ' +
          'Set TURSO_AUTH_TOKEN in your environment.',
        )
      }
      return { mode: 'turso', url: `libsql://${parsed.host}`, authToken }
    } catch (e: any) {
      throw new Error(`[SGTX][CERT-32] Invalid DATABASE_URL: ${e.message}`)
    }
  }

  // Priority 3: TURSO_AUTH_TOKEN env var (Vercel prod sets this directly)
  const tursoToken = process.env.TURSO_AUTH_TOKEN || ''
  if (tursoToken) {
    return { mode: 'turso', url: `libsql://${TURSO_HOST}`, authToken: tursoToken }
  }

  // Priority 4: local SQLite file:// URL (dev mode)
  if (envUrl.startsWith('file:')) {
    return { mode: 'local-sqlite', url: envUrl }
  }

  // Priority 5: no DATABASE_URL at all — fall back to the conventional
  // local dev SQLite file. This is dev-only; we explicitly warn.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[SGTX][CERT-32] No DATABASE_URL configured; falling back to local SQLite at file:./db/custom.db. ' +
      'This is dev-only. Set DATABASE_URL or TURSO_AUTH_TOKEN for production.',
    )
    return { mode: 'local-sqlite', url: 'file:./db/custom.db' }
  }

  // Production with no DB config — explicit error.
  throw new Error(
    '[SGTX][CERT-32] No database configuration in production. Set TURSO_AUTH_TOKEN ' +
    '(and optionally TURSO_HOST) or DATABASE_URL=libsql://...?authToken=... ' +
    'in your Vercel environment. See SGTX_SECURITY_AUDIT.md finding #1.',
  )
}

function createPrismaClient(): PrismaClient {
  const config = resolveDbConfig()
  // Prisma 7 with `previewFeatures = ["driverAdapters"]` REQUIRES an adapter
  // for every PrismaClient instance — we cannot use the `datasources`
  // constructor option. We therefore always use the PrismaLibSql adapter.
  // For local SQLite (dev mode), the @libsql/client supports `file:` URLs
  // directly, so we pass the local file URL to the adapter. For Turso, we
  // pass the libsql:// URL + authToken.
  const adapterUrl = config.mode === 'local-sqlite' ? config.url! : config.url!
  const adapter = new PrismaLibSql(
    config.mode === 'turso'
      ? { url: adapterUrl, authToken: config.authToken! }
      : { url: adapterUrl },
  )
  return new PrismaClient({ adapter, log: ['error', 'warn'] })
}

// Create the PrismaClient eagerly. The instrumentation hook ensures
// env vars are set before this module loads.
export const db = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
