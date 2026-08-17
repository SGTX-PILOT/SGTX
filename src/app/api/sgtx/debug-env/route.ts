import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DATABASE_URL_prefix: (process.env.DATABASE_URL || "").slice(0, 20),
    DATABASE_URL_is_undefined: process.env.DATABASE_URL === "undefined",
    TURSO_AUTH_TOKEN_set: !!process.env.TURSO_AUTH_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    instrumentation_ran: typeof (globalThis as any).__sgtxInstrumentationRan === "boolean" ? (globalThis as any).__sgtxInstrumentationRan : "not_set",
  });
}
