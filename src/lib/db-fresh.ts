import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const TURSO_HOST = "sgtx-fortleem.aws-us-east-1.turso.io";
const TURSO_TOKEN_FALLBACK = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";

function resolveTursoConfig(): { url: string; authToken: string } {
  const libsqlUrl = process.env.TURSO_LIBSQL_URL || "";
  if (libsqlUrl && libsqlUrl.startsWith("libsql://")) {
    try {
      const parsed = new URL(libsqlUrl);
      const authToken = parsed.searchParams.get("authToken") || "";
      if (authToken) return { url: `libsql://${parsed.host}`, authToken };
    } catch {}
  }
  const envUrl = process.env.DATABASE_URL || "";
  if (envUrl.startsWith("libsql://")) {
    try {
      const parsed = new URL(envUrl);
      const authToken = parsed.searchParams.get("authToken") || "";
      if (authToken) return { url: `libsql://${parsed.host}`, authToken };
    } catch {}
  }
  const tursoToken = process.env.TURSO_AUTH_TOKEN || "";
  if (tursoToken) return { url: `libsql://${TURSO_HOST}`, authToken: tursoToken };
  return { url: `libsql://${TURSO_HOST}`, authToken: TURSO_TOKEN_FALLBACK };
}

function createFreshPrismaClient(): PrismaClient {
  const config = resolveTursoConfig();
  const adapter = new PrismaLibSql(config);
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
