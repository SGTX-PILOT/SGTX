// @ts-nocheck
// §2 Multimodal Tests — run all 10 transport-mode combinations.
// POST /api/sgtx/readiness/multimodal-tests
//      → runMultimodalTests() → returns MultimodalTestResult[] (length 10).
import { NextResponse } from "next/server";
import { runMultimodalTests } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await runMultimodalTests();
    return NextResponse.json({ results, count: results.length });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/multimodal-tests] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
