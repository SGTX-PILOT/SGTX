// @ts-nocheck
// §10 Loom Traceability — verify the 9-step traceability chain (Trade → USTN_CLOSED).
// POST /api/sgtx/readiness/loom-traceability   body: { ustn? }
//      → verifyLoomTraceability(ustn) → returns LoomVerificationResult.
import { NextResponse } from "next/server";
import { verifyLoomTraceability } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let ustn: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === "object" && typeof body.ustn === "string") {
        ustn = body.ustn;
      }
    } catch {
      ustn = undefined;
    }
    const result = await verifyLoomTraceability(ustn);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/loom-traceability] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
