// @ts-nocheck
// SGTX Phase 3 §1 — License Engine API
//   POST /api/sgtx/compliance/licenses/determine
//   Body: { hs6?, productName?, jurisdictionCode, originCountry, destCountry,
//           transportMode?, applicantGtid? }
//   Returns: a single LicenseResult describing the dominant license requirement.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineLicenseRequirement } from "@/lib/sgtx/license";

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
    const result = await determineLicenseRequirement({
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
    logger.error("[api/sgtx/compliance/licenses/determine] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
