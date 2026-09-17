// @ts-nocheck
// SGTX Phase 3 §4 — SPS Engine API
//   POST /api/sgtx/compliance/sps/determine
//   Body: SpsInput — { hs6?, commodity?, originCountry, destCountry,
//                     jurisdictionCode, season?, intendedUse?, transportMode? }
//   Returns: SpsDetermination — list of matching SPS requirements + top verdict.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineSpsRequirements } from "@/lib/sgtx/sps";

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
    if (!body.jurisdictionCode || !body.originCountry || !body.destCountry) {
      return NextResponse.json(
        {
          error:
            "jurisdictionCode, originCountry and destCountry are required",
        },
        { status: 400 },
      );
    }
    const result = await determineSpsRequirements({
      hs6: body.hs6,
      commodity: body.commodity,
      originCountry: body.originCountry,
      destCountry: body.destCountry,
      jurisdictionCode: body.jurisdictionCode,
      season: body.season,
      intendedUse: body.intendedUse,
      transportMode: body.transportMode,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sps/determine] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
