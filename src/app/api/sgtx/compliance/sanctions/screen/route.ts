// @ts-nocheck
// SGTX Phase 3 §7 — Sanctions Engine API
//   POST /api/sgtx/compliance/sanctions/screen
//   Body: SanctionsScreeningInput — { screeningType, screenedValue,
//                                      jurisdictionCode?, ownershipPct?, uboChainDepth? }
//   Returns: SanctionsScreeningResult — verdict + match score + evidence.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { screenEntity } from "@/lib/sgtx/sanctions";

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
    if (!body.screeningType || !body.screenedValue) {
      return NextResponse.json(
        { error: "screeningType and screenedValue are required" },
        { status: 400 },
      );
    }
    const result = await screenEntity({
      screeningType: body.screeningType,
      screenedValue: body.screenedValue,
      jurisdictionCode: body.jurisdictionCode,
      ownershipPct:
        typeof body.ownershipPct === "number" ? body.ownershipPct : undefined,
      uboChainDepth:
        typeof body.uboChainDepth === "number" ? body.uboChainDepth : undefined,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sanctions/screen] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
