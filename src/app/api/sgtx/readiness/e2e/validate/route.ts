// @ts-nocheck
// §1 E2E Trade Graph Validation — run the 23-step lifecycle validator.
// POST /api/sgtx/readiness/e2e/validate   body: { ustn }
//      → validateE2ETradeGraph(ustn) → persists + returns the E2ETradeGraphValidation row.
import { NextResponse } from "next/server";
import { validateE2ETradeGraph } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const { ustn } = body;
    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        { error: "ustn required" },
        { status: 400 },
      );
    }
    const validation = await validateE2ETradeGraph(ustn);
    if (!validation) {
      return NextResponse.json(
        { error: "validation failed — trade not found or unable to compute" },
        { status: 404 },
      );
    }
    return NextResponse.json({ validation });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/e2e/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
