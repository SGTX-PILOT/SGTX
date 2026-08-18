// POST /api/sgtx/cold-chain/pti
//
// Create a Pre-Trip Inspection (PTI) certificate for a reefer container.
//
// Body:
//   {
//     containerNumber, carrierGtid?, inspectionDate (ISO), validUntil (ISO),
//     temperatureSetPoint, actualTemperature,
//     ptiResult ("PASS" | "FAIL" | "CONDITIONAL"),
//     ptiReference?, certificateUrl?, inspectorName?, verified? = false
//   }
//
// Response:
//   { ok, ptiId }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createPtiCertificate, PTI_RESULT } from "@/lib/sgtx/cold-chain";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      containerNumber,
      carrierGtid,
      inspectionDate,
      validUntil,
      temperatureSetPoint,
      actualTemperature,
      ptiResult,
      ptiReference,
      certificateUrl,
      inspectorName,
      verified,
    } = body || {};

    const missing: string[] = [];
    if (!containerNumber) missing.push("containerNumber");
    if (!inspectionDate) missing.push("inspectionDate");
    if (!validUntil) missing.push("validUntil");
    if (typeof temperatureSetPoint !== "number") missing.push("temperatureSetPoint");
    if (typeof actualTemperature !== "number") missing.push("actualTemperature");
    if (!ptiResult) missing.push("ptiResult");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const validResults = Object.values(PTI_RESULT);
    if (!validResults.includes(ptiResult)) {
      return NextResponse.json(
        { error: `ptiResult must be one of: ${validResults.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await createPtiCertificate({
      containerNumber,
      carrierGtid,
      inspectionDate,
      validUntil,
      temperatureSetPoint,
      actualTemperature,
      ptiResult,
      ptiReference,
      certificateUrl,
      inspectorName,
      verified,
    });

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Persistence failed (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, ptiId: result.id });
  } catch (e: any) {
    logger.error("[cold-chain/pti] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
