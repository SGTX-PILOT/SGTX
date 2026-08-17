import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// CCL-004: Turso connection details.
// The DATABASE_URL env var may be a dummy file: URL (set by instrumentation.ts
// to satisfy Prisma's constructor validation). The ACTUAL database connection
// is handled by the PrismaLibSql adapter below, which connects to Turso.
const TURSO_HOST = 'sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN_FALLBACK = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

function resolveTursoUrl(): string {
  const envUrl = process.env.DATABASE_URL || ''
  // If DATABASE_URL is a real libsql:// URL, use it directly
  if (envUrl.startsWith('libsql://') || envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
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
  const databaseUrl = resolveTursoUrl()

  // Always use the libsql adapter (Turso). Even if DATABASE_URL is a dummy
  // file: URL, the adapter connects to Turso using the resolved URL.
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('http://') || databaseUrl.startsWith('https://')) {
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

  // Default: SQLite file-based database (local dev only)
  return new PrismaClient({
    log: ['error', 'warn'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
