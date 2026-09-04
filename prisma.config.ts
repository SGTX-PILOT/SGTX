import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { PrismaLibSql } from '@prisma/adapter-libsql'

// Turso (libsql) connection — production runtime database.
const TURSO_HOST = 'sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

// `prisma db push` requires a `datasource.url` it can connect to directly.
// Prisma 7 does NOT recognise the `libsql://` scheme in the URL field, so we
// point it at the local SQLite file. The runtime PrismaClient ignores this
// field and connects to Turso through the adapter below.
const LOCAL_DB_URL = process.env.PRISMA_DB_URL || 'file:./db/custom.db'

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: LOCAL_DB_URL,
  },
  adapter: new PrismaLibSql({
    url: `libsql://${TURSO_HOST}`,
    authToken: TURSO_TOKEN,
  }),
})
