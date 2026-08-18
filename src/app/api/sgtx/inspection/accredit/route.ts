// POST /api/sgtx/inspection/accredit
//
// Create a new inspection agency accreditation record.
//
// Body:
//   {
//     agencyGtid, accreditationStandard, accreditationBody, certificateNumber,
//     validFrom? (ISO), validTo? (ISO),
//     scopeOfAccreditation?: string[] (JSON-serialised before storage),
//     verified? = false, status? = "ACTIVE"
//   }
//
// Response:
//   { ok, accreditationId }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createAccreditation } from "@/lib/sgtx/inspection";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      agencyGtid,
      accreditationStandard,
      accreditationBody,
      certificateNumber,
      validFrom,
      validTo,
      scopeOfAccreditation,
      verified,
      status,
    } = body || {};

    const missing: string[] = [];
    if (!agencyGtid) missing.push("agencyGtid");
    if (!accreditationStandard) missing.push("accreditationStandard");
    if (!accreditationBody) missing.push("accreditationBody");
    if (!certificateNumber) missing.push("certificateNumber");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await createAccreditation({
      agencyGtid,
      accreditationStandard,
      accreditationBody,
      certificateNumber,
      validFrom,
      validTo,
      scopeOfAccreditation,
      verified,
      status,
    });

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Persistence failed (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, accreditationId: result.id });
  } catch (e: any) {
    logger.error("[inspection/accredit] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
