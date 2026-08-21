// @ts-nocheck
// POST /api/sgtx/road/seals
// Body: { ustn, corridorId?, sealNumber, sealType?, appliedBy?, appliedLocation?, authority?, photoHash? }
// Applies a new seal (§18).
import { NextRequest, NextResponse } from "next/server";
import { applySeal } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn || !body?.sealNumber) {
      return NextResponse.json(
        { error: "ustn and sealNumber required" },
        { status: 400 },
      );
    }
    const seal = await applySeal(body);
    return NextResponse.json({ seal });
  } catch (err: any) {
    logger.error("[api/road/seals] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
