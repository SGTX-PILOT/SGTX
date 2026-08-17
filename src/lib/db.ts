import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

// CCL-004: Ensure DATABASE_URL is set BEFORE PrismaClient is imported.
// The Prisma Client constructor validates env("DATABASE_URL") even when
// using an adapter. If the env var is not injected at runtime (Vercel
// propagation issue), the client throws URL_INVALID 'undefined'. We set
// a fallback here so the constructor doesn't fail — the actual DB
// connection is handled by the PrismaLibSql adapter below.
if (!process.env.DATABASE_URL) {
  const TURSO_HOST = 'sgtx-fortleem.aws-us-east-1.turso.io'
  const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'
  process.env.DATABASE_URL = `libsql://${TURSO_HOST}?authToken=${TURSO_TOKEN}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// CCL-004: Turso fallback. If process.env.DATABASE_URL is not injected
// at runtime (Vercel env var propagation issue), fall back to the Turso
// URL with the auth token from TURSO_AUTH_TOKEN. This ensures the app
// always connects to Turso in production.
const TURSO_HOST = 'sgtx-fortleem.aws-us-east-1.turso.io'
// Last-resort fallback token — ensures the app connects to Turso even if
// Vercel env var injection fails. The token is read-write scoped to the
// sgtx-fortleem Turso database. Rotate via the Turso dashboard if needed.
const TURSO_TOKEN_FALLBACK = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL || ''
  if (envUrl && (envUrl.startsWith('libsql://') || envUrl.startsWith('http'))) {
    return envUrl
  }
  // Fallback 1: construct from TURSO_AUTH_TOKEN env var
  const tursoToken = process.env.TURSO_AUTH_TOKEN || ''
  if (tursoToken) {
    return `libsql://${TURSO_HOST}?authToken=${tursoToken}`
  }
  // Fallback 2: hardcoded token (last resort for Vercel env var propagation issues)
  return `libsql://${TURSO_HOST}?authToken=${TURSO_TOKEN_FALLBACK}`
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = resolveDatabaseUrl()

  // If the DATABASE_URL is a libsql:// URL, use the libsql adapter
  // (Turso or any libsql-compatible database).
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('http://') || databaseUrl.startsWith('https://')) {
    // Parse authToken from query string if present
    const url = new URL(databaseUrl)
    const authToken = url.searchParams.get('authToken') || undefined
    const tursoUrl = `${url.protocol}//${url.host}`

    const libsql = createClient({
      url: tursoUrl,
      authToken,
    })

    const adapter = new PrismaLibSql(libsql)
    return new PrismaClient({ adapter, log: ['error', 'warn'] })
  }

  // Default: SQLite file-based database (local dev)
  return new PrismaClient({
    log: ['error', 'warn'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
