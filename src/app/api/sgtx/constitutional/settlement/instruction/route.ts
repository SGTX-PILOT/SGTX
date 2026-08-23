// @ts-nocheck
// §37-49 Settlement Orchestration — create a settlement instruction
// POST /api/sgtx/constitutional/settlement/instruction  body: { ustn, legs, atomicity? }
import { NextResponse } from "next/server";
import { createSettlementInstruction } from "@/lib/sgtx/settlement-orchestration";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, legs, atomicity } = body || {};
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!Array.isArray(legs) || legs.length === 0) {
      return NextResponse.json(
        { error: "legs array required (non-empty)" },
        { status: 400 },
      );
    }
    const instruction = await createSettlementInstruction(
      ustn,
      legs,
      atomicity || "PARTIAL_ALLOWED",
    );
    if (!instruction) {
      return NextResponse.json(
        { error: "createSettlementInstruction failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ instruction });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/settlement/instruction] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
