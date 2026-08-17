import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// CCL-004: Turso fallback. If process.env.DATABASE_URL is not injected
// at runtime (Vercel env var propagation issue), fall back to the Turso
// URL with the auth token from TURSO_AUTH_TOKEN. This ensures the app
// always connects to Turso in production.
const TURSO_HOST = 'sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || ''

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL || ''
  if (envUrl && (envUrl.startsWith('libsql://') || envUrl.startsWith('http'))) {
    return envUrl
  }
  // Fallback: construct from TURSO_AUTH_TOKEN
  if (TURSO_TOKEN) {
    return `libsql://${TURSO_HOST}?authToken=${TURSO_TOKEN}`
  }
  return ''
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
