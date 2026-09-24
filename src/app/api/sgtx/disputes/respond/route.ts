// @ts-nocheck
// SGTX v18 §16.8.8 — Dispute Fast-Track · Respond
//
// POST /api/sgtx/disputes/respond
//   body: {
//     disputeId: string,
//     respondentGtid: string,
//     response: string,            // free-text explanation (>=20 chars)
//     evidence?: string,          // optional evidence URL/hash
//     flagOverride?: boolean      // flag an inspector override for licence review
//   }
//   → 200 { ok, disputeId, status, overrideFlagId? }
//
// Updates the dispute with the respondent's response. If `flagOverride`
// is true, additionally calls the existing flagQcOverrides lib to mark the
// dispute for licence review.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { flagQcOverrides } from "@/lib/sgtx/dispute";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const disputeId = String(body.disputeId ?? "");
    const respondentGtid = String(body.respondentGtid ?? "");
    const responseText = String(body.response ?? body.responseText ?? "").trim();
    const evidence = body.evidence ? String(body.evidence) : null;
    const flagOverride = !!body.flagOverride;

    if (!disputeId) {
      return NextResponse.json({ ok: false, error: "disputeId required" }, { status: 400 });
    }
    if (!respondentGtid) {
      return NextResponse.json({ ok: false, error: "respondentGtid required" }, { status: 400 });
    }
    if (responseText.length < 20) {
      return NextResponse.json(
        { ok: false, error: "response must be at least 20 characters" },
        { status: 400 },
      );
    }

    const dispute = await db.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, type: true, ustn: true, tradeId: true },
    });
    if (!dispute) {
      return NextResponse.json({ ok: false, error: "dispute not found" }, { status: 404 });
    }

    // Append the response to disputeResolution notes (no schema change).
    const existing = (dispute as any).resolutionNotes || "";
    const newLine = `[${new Date().toISOString()}] ${respondentGtid}: ${responseText}${evidence ? ` (evidence: ${evidence})` : ""}`;
    const updatedNotes = existing ? `${existing}\n${newLine}` : newLine;
    const updatedStatus = dispute.status === "FILED" ? "RESPONDED" : dispute.status;

    await db.dispute.update({
      where: { id: disputeId },
      data: {
        status: updatedStatus,
        respondentGtid,
        resolutionNotes: updatedNotes,
      },
    });

    // Audit trail.
    try {
      await db.activity.create({
        data: {
          tradeId: dispute.tradeId,
          actorGtid: respondentGtid,
          action: "DISPUTE_RESPONSE",
          description: `Respondent ${respondentGtid} responded to dispute ${disputeId}: ${responseText.slice(0, 200)}`,
          type: "INFO",
        },
      });
    } catch { /* best-effort */ }

    let overrideFlagId: string | undefined;
    if (flagOverride) {
      const flagResult = await flagQcOverrides(disputeId);
      if (flagResult.ok && Array.isArray((flagResult as any).flags) && (flagResult as any).flags[0]) {
        overrideFlagId = (flagResult as any).flags[0].id;
      }
    }

    return NextResponse.json({
      ok: true,
      disputeId,
      status: updatedStatus,
      overrideFlagId,
    });
  } catch (e: any) {
    logger.error("[disputes/respond/POST] error:", e);
    return NextResponse.json({ error: e?.message || "respond failed" }, { status: 500 });
  }
}
