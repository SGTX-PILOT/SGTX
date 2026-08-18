// POST /api/sgtx/force-majeure/claim — create a force-majeure claim
//
// Body:
//   {
//     ustn?: string,
//     eventId?: string,         // optional — link to a persisted ForceMajeureEvent row
//     claimantGtid: string,     // required — tenant filing the claim
//     reason: string,           // required — short description / clause reference
//     evidence?: string,        // optional — JSON or URL of supporting evidence
//     governorDecisionId?: string
//   }
//
// Status defaults to PENDING. Claims are resolved by the Governor's
// adjudication pipeline (G2U21 force-majeure gate — out of scope for this
// module).
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, eventId, claimantGtid, reason, evidence, governorDecisionId } = body || {};

    const missing: string[] = [];
    if (!claimantGtid) missing.push("claimantGtid");
    if (!reason) missing.push("reason");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // If an eventId is supplied, validate that the referenced event exists
    // in the DB. (In-memory seed event ids are NOT valid FK targets — they
    // must be persisted to a DB row first.)
    if (eventId) {
      const event = await (db as any).forceMajeureEvent.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      });
      if (!event) {
        return NextResponse.json(
          { error: "eventId not found — must reference a persisted ForceMajeureEvent row" },
          { status: 404 },
        );
      }
    }

    const data: any = {
      claimantGtid: String(claimantGtid).trim(),
      reason: String(reason).trim(),
      status: "PENDING",
    };
    if (ustn) data.ustn = ustn;
    if (eventId) data.eventId = eventId;
    if (evidence) data.evidence = evidence;
    if (governorDecisionId) data.governorDecisionId = governorDecisionId;

    const claim = await (db as any).forceMajeureClaim.create({ data });

    logger.info("[force-majeure/claim] created", {
      claimId: claim.id,
      ustn: ustn || null,
      eventId: eventId || null,
      claimantGtid: data.claimantGtid,
    });

    return NextResponse.json({
      ok: true,
      claimId: claim.id,
      status: "PENDING",
    });
  } catch (e: any) {
    logger.error("[force-majeure/claim] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
