// @ts-nocheck
// §13 Final USTN Closure Test — the closure gate (Phase 7 + Phase 10 e2e).
// POST /api/sgtx/readiness/ustn-closure-test   body: { ustn }
//      → runFinalUstnClosureTest(ustn) → returns UstnClosureTestResult
//        ({ ustn, canClose, conditionsMet, failedConditions, e2ePassed, closureState }).
import { NextResponse } from "next/server";
import { runFinalUstnClosureTest } from "@/lib/sgtx/production-readiness";
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
    const result = await runFinalUstnClosureTest(ustn);
    if (!result) {
      return NextResponse.json(
        { error: "closure test failed — trade not found or unable to evaluate" },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/ustn-closure-test] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
