import { NextResponse } from "next/server";

// Production-safe debug-env endpoint (§21)
// Returns only non-sensitive environment status — never secrets, tokens, or URLs.
export const dynamic = "force-dynamic";

export async function GET() {
  // In production, return only safe status indicators (no secrets)
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    return NextResponse.json({
      environment: "production",
      database: process.env.DATABASE_URL ? "configured" : "missing",
      turso: process.env.TURSO_AUTH_TOKEN ? "configured" : "missing",
      aisStream: process.env.AIS_STREAM_API_KEY ? "configured" : "missing",
      huggingface: process.env.HUGGINGFACE_API_KEY ? "configured" : "missing",
      gemini: process.env.GEMINI_API_KEY ? "configured" : "missing",
      groq: process.env.GROQ_API_KEY ? "configured" : "missing",
      sentry: process.env.SENTRY_DSN ? "configured" : "not-configured",
      note: "Production mode — secrets are not exposed. Only configuration status is returned.",
    });
  }

  // Development: return more details but still no raw secrets
  return NextResponse.json({
    environment: "development",
    database: process.env.DATABASE_URL ? "configured" : "missing",
    turso: process.env.TURSO_AUTH_TOKEN ? "configured" : "missing",
    aisStream: process.env.AIS_STREAM_API_KEY ? "configured" : "missing",
    huggingface: process.env.HUGGINGFACE_API_KEY ? "configured" : "missing",
    gemini: process.env.GEMINI_API_KEY ? "configured" : "missing",
    groq: process.env.GROQ_API_KEY ? "configured" : "missing",
    sentry: process.env.SENTRY_DSN ? "configured" : "not-configured",
  });
}
