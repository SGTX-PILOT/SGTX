import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "";
  const tursoLibsqlUrl = process.env.TURSO_LIBSQL_URL || "";
  const tursoToken = process.env.TURSO_AUTH_TOKEN || "";
  
  // Resolve the URL the same way db.ts does
  let resolvedUrl = "";
  if (tursoLibsqlUrl && (tursoLibsqlUrl.startsWith("libsql://") || tursoLibsqlUrl.startsWith("http"))) {
    resolvedUrl = tursoLibsqlUrl;
  } else if (dbUrl.startsWith("libsql://") || dbUrl.startsWith("http://") || dbUrl.startsWith("https://")) {
    resolvedUrl = dbUrl;
  } else if (tursoToken) {
    resolvedUrl = `libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=${tursoToken.slice(0,20)}...`;
  } else {
    resolvedUrl = "fallback-hardcoded";
  }
  
  return NextResponse.json({
    DATABASE_URL_set: !!dbUrl,
    DATABASE_URL_value: dbUrl,
    DATABASE_URL_is_undefined: dbUrl === "undefined",
    TURSO_LIBSQL_URL_set: !!tursoLibsqlUrl,
    TURSO_LIBSQL_URL_prefix: tursoLibsqlUrl.slice(0, 30),
    TURSO_AUTH_TOKEN_set: !!tursoToken,
    TURSO_AUTH_TOKEN_prefix: tursoToken.slice(0, 20),
    resolvedUrl_prefix: resolvedUrl.slice(0, 40),
    NODE_ENV: process.env.NODE_ENV,
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    instrumentation_ran: typeof (globalThis as any).__sgtxInstrumentationRan === "boolean" ? (globalThis as any).__sgtxInstrumentationRan : "not_set",
  });
}
