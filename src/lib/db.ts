import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || ''

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
