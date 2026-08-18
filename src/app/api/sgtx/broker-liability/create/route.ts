// POST /api/sgtx/broker-liability/create
//
// Create a new broker liability insurance policy record.
//
// Body:
//   {
//     brokerGtid, insurer, policyNumber, coverageAmount,
//     currency? = "EGP",
//     validFrom? (ISO), validTo? (ISO),
//     certificateUrl?, verified? = false, status? = "ACTIVE"
//   }
//
// Response:
//   { ok, policyId }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createPolicy } from "@/lib/sgtx/broker-liability";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brokerGtid, insurer, policyNumber, coverageAmount } = body || {};

    const missing: string[] = [];
    if (!brokerGtid) missing.push("brokerGtid");
    if (!insurer) missing.push("insurer");
    if (!policyNumber) missing.push("policyNumber");
    if (typeof coverageAmount !== "number" || coverageAmount <= 0) missing.push("coverageAmount (must be positive number)");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing or invalid fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await createPolicy({
      brokerGtid,
      insurer,
      policyNumber,
      coverageAmount,
      currency: body.currency,
      validFrom: body.validFrom,
      validTo: body.validTo,
      certificateUrl: body.certificateUrl,
      verified: body.verified,
      status: body.status,
    });

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Persistence failed (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, policyId: result.id });
  } catch (e: any) {
    logger.error("[broker-liability/create] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
