import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// CCL-004: Turso connection details.
const TURSO_HOST = 'sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN_FALLBACK = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

function resolveTursoConfig(): { url: string; authToken: string } {
  // Priority 1: TURSO_LIBSQL_URL (set by instrumentation.ts from the real env var)
  const libsqlUrl = process.env.TURSO_LIBSQL_URL || ''
  if (libsqlUrl && libsqlUrl.startsWith('libsql://')) {
    try {
      const parsed = new URL(libsqlUrl)
      const authToken = parsed.searchParams.get('authToken') || ''
      if (authToken) return { url: `libsql://${parsed.host}`, authToken }
    } catch {}
  }
  // Priority 2: DATABASE_URL if it's a libsql:// URL
  const envUrl = process.env.DATABASE_URL || ''
  if (envUrl.startsWith('libsql://')) {
    try {
      const parsed = new URL(envUrl)
      const authToken = parsed.searchParams.get('authToken') || ''
      if (authToken) return { url: `libsql://${parsed.host}`, authToken }
    } catch {}
  }
  // Priority 3: TURSO_AUTH_TOKEN env var
  const tursoToken = process.env.TURSO_AUTH_TOKEN || ''
  if (tursoToken) {
    return { url: `libsql://${TURSO_HOST}`, authToken: tursoToken }
  }
  // Priority 4: hardcoded fallback token
  return { url: `libsql://${TURSO_HOST}`, authToken: TURSO_TOKEN_FALLBACK }
}

function createPrismaClient(): PrismaClient {
  const config = resolveTursoConfig()
  // CCL-004: Pass the URL + authToken DIRECTLY to PrismaLibSql.
  // Do NOT wrap createClient first — the adapter loses the URL internally.
  const adapter = new PrismaLibSql(config)
  return new PrismaClient({ adapter, log: ['error', 'warn'] })
}

// Create the PrismaClient eagerly. The instrumentation hook ensures
// env vars are set before this module loads.
export const db = createPrismaClient()
