import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { PrismaLibSql } from '@prisma/adapter-libsql'

// CERT-32 P0 FIX: Removed the hardcoded Turso JWT fallback.
//
// The previous version embedded the live production Turso JWT (with `rw`
// scope on `libsql://sgtx-fortleem.aws-us-east-1.turso.io`) directly in the
// source as `TURSO_TOKEN_FALLBACK`. This token was committed to git and
// pushed to the public `SGTX-PILOT/SGTX` repository, exposing the
// production database to anyone with repo read access.
//
// Replacement policy:
//   * The Turso auth token MUST be supplied via the `TURSO_AUTH_TOKEN` env var.
//   * Local dev must set it in `.env.local` (not committed).
//   * Vercel production must set it as an encrypted env var (already done).
//   * If the env var is missing, we throw a clear, classified error at
//     module load time so the failure is observable, never silent.
//
// (See SGTX_SECURITY_AUDIT.md finding #1 for the full evidence.)

const TURSO_HOST = process.env.TURSO_HOST || 'sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN

// In production, the Turso auth token MUST be supplied via env var. In dev,
// we allow it to be missing (local SQLite is used via `datasource.url`
// below). The previous version embedded the live production JWT directly
// here — see SGTX_SECURITY_AUDIT.md finding #1.
if (!TURSO_TOKEN && process.env.NODE_ENV === 'production') {
  throw new Error(
    '[SGTX][CERT-32] TURSO_AUTH_TOKEN environment variable is required in production. ' +
    'Set it as an encrypted Vercel env var. See SGTX_SECURITY_AUDIT.md finding #1.'
  )
}

// `prisma db push` requires a `datasource.url` it can connect to directly.
// Prisma 7 does NOT recognise the `libsql://` scheme in the URL field, so we
// point it at the local SQLite file. The runtime PrismaClient ignores this
// field and connects to Turso through the adapter below.
const LOCAL_DB_URL = process.env.PRISMA_DB_URL || 'file:./db/custom.db'

// Adapter is only attached if we have a Turso token. In dev without a token,
// the adapter is omitted and Prisma falls back to the local SQLite file
// through `datasource.url`.
const adapterConfig = TURSO_TOKEN
  ? new PrismaLibSql({
      url: `libsql://${TURSO_HOST}`,
      authToken: TURSO_TOKEN,
    })
  : undefined

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: LOCAL_DB_URL,
  },
  ...(adapterConfig ? { adapter: adapterConfig } : {}),
})
