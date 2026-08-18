// GET /api/sgtx/inspection/accreditations?agencyGtid=X
//
// Returns all inspection agency accreditations for an agency, with computed
// `effectiveStatus` and parsed `scopeOfAccreditation` array.
//
// Query params:
//   ?agencyGtid=GTID-AGENCY-...    (required)
//
// Response:
//   { agencyGtid, accreditations: [...], count, accreditationGap: {...} }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listAccreditations, detectAccreditationGap } from "@/lib/sgtx/inspection";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agencyGtid = url.searchParams.get("agencyGtid");
    if (!agencyGtid) {
      return NextResponse.json({ error: "Missing required query param: agencyGtid" }, { status: 400 });
    }

    const accreditations = await listAccreditations(agencyGtid);
    const accreditationGap = detectAccreditationGap(accreditations);

    return NextResponse.json({
      agencyGtid,
      accreditations,
      count: accreditations.length,
      accreditationGap,
    });
  } catch (e: any) {
    logger.error("[inspection/accreditations] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
