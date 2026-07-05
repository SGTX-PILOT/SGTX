// GET /api/sgtx/payment/idempotency-key?body=...
// POST /api/sgtx/payment/idempotency-key — body: { body }
// Verifies the Idempotency Key Standard format (Part 6.12):
//   SHA256(canonical_body + utc_second_truncated)
// Returns the canonical body, timestamp, and SHA-256 hex digest.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyIdempotencyKeyFormat } from "@/lib/sgtx/payment/retry";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { body: payload } = body;
    if (payload === undefined || payload === null) {
      return NextResponse.json({ error: "body required" }, { status: 400 });
    }
    const result = verifyIdempotencyKeyFormat(payload);
    return NextResponse.json({
      ok: true,
      ...result,
      format: "SHA256(canonical_body + utc_second)",
      headerName: "X-Idempotency-Key",
      standard: "Part 6.12 — Idempotency Key Standard for External Calls",
    });
  } catch (e: any) {
    logger.error("[payment/idempotency-key POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    // Provide a sample demo with the canonical example from Part 6.12.2
    const sampleBody = {
      ustn: "SGTX-1397F3A-456ABC-20260415120000-A1B2C3D4",
      container: "MEDU1234567",
    };
    const result = verifyIdempotencyKeyFormat(sampleBody);
    return NextResponse.json({
      ok: true,
      sampleBody,
      ...result,
      format: "SHA256(canonical_body + utc_second)",
      headerName: "X-Idempotency-Key",
      standard: "Part 6.12 — Idempotency Key Standard for External Calls",
      note: "Sample demo with the canonical example from Part 6.12.2. POST your own body to generate a key.",
    });
  } catch (e: any) {
    logger.error("[payment/idempotency-key GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
