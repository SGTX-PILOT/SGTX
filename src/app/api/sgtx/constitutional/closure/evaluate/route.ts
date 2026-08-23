// @ts-nocheck
// §11 Closure Policy — evaluate closure readiness (7-condition checklist)
// POST /api/sgtx/constitutional/closure/evaluate?ustn=X
import { NextResponse } from "next/server";
import { evaluateClosure } from "@/lib/sgtx/closure-policy";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const evaluation = await evaluateClosure(ustn);
    if (!evaluation) {
      return NextResponse.json(
        { error: "evaluateClosure failed — no active policy or see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ evaluation });
  } catch (err: any) {
    logger.error("[api/constitutional/closure/evaluate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
