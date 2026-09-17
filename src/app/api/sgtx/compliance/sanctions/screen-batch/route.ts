// @ts-nocheck
// SGTX Phase 3 §7 — Sanctions Engine API
//   POST /api/sgtx/compliance/sanctions/screen-batch
//   Body: { inputs: SanctionsScreeningInput[] }
//   Returns: { results: SanctionsScreeningResult[], aggregate: {...} } —
//   batch-screened results + aggregate verdict.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { screenMultiple, aggregateScreeningResults } from "@/lib/sgtx/sanctions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.inputs)) {
      return NextResponse.json(
        { error: "body.inputs must be an array" },
        { status: 400 },
      );
    }
    const results = await screenMultiple(body.inputs);
    const aggregate = aggregateScreeningResults(results);
    return NextResponse.json({ results, aggregate });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sanctions/screen-batch] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
