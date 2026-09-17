// @ts-nocheck
// SGTX Phase 3 §2 — Permit Engine API
//   POST /api/sgtx/compliance/permits/determine
//   Body: PermitInput — { hs6?, productName?, jurisdictionCode, originCountry,
//                         destCountry, transportMode?, applicantGtid? }
//   Returns: PermitDetermination — all applicable permit types + top verdict.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineAllPermits } from "@/lib/sgtx/permit";

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
    const result = await determineAllPermits({
      hs6: body.hs6,
      productName: body.productName,
      jurisdictionCode: body.jurisdictionCode,
      originCountry: body.originCountry,
      destCountry: body.destCountry,
      transportMode: body.transportMode,
      applicantGtid: body.applicantGtid,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/permits/determine] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
