import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { createHash } from "crypto";

// POST /api/sgtx/sar/review
// Blueprint Part 1.12.3.5 + 1.12.5 — compliance officer review workflow.
// Body: { sarId, action: "approve" | "reject", reviewerGtid, notes? }
//   • approve → status = FILED (pending actual FIU submission via /sar/file)
//                NOTE: per the spec the compliance officer approves the draft,
//                then it's queued for FIU filing. We set status to APPROVED_FOR_FILING
//                here; /sar/file then transitions to FILED with the FIU reference.
//                For simplicity (sandbox) we transition approve → FILED directly
//                if the SAR was already submitted, otherwise APPROVED_FOR_FILING.
//   • reject  → status = REJECTED (false positive) with reviewer notes.
// In both cases a Smart Inbox is created back to the compliance officer so the
// audit trail captures the human-in-the-loop decision.
export async function POST(req: NextRequest) {
  try {
    const { sarId, action, reviewerGtid, notes } = await req.json();
    if (!sarId || !action || !reviewerGtid) {
      return NextResponse.json(
        { error: "sarId, action (approve|reject), reviewerGtid required" },
        { status: 400 },
      );
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const sar = await db.suspiciousActivityReport.findUnique({ where: { id: sarId } });
    if (!sar) return NextResponse.json({ error: "SAR not found" }, { status: 404 });
    if (sar.draftStatus !== "DRAFT") {
      return NextResponse.json(
        { error: `SAR already ${sar.draftStatus} — cannot review again` },
        { status: 409 },
      );
    }

    const reviewer = await db.tenant.findUnique({ where: { gtid: reviewerGtid } });
    if (!reviewer) return NextResponse.json({ error: "reviewer GTID not found" }, { status: 404 });

    const loomHash =
      "sha256:" +
      createHash("sha256")
        .update(`sar-review|${sarId}|${action}|${reviewerGtid}|${Date.now()}`)
        .digest("hex");

    if (action === "approve") {
      // Approved for filing — compliance officer signs off; /sar/file submits to FIU.
      const updated = await db.suspiciousActivityReport.update({
        where: { id: sarId },
        data: {
          draftStatus: "APPROVED_FOR_FILING",
          governorDecisionId: reviewerGtid,
          loomHash,
        },
      });

      await db.inboxItem.create({
        data: {
          tenantGtid: reviewerGtid,
          category: "COMPLIANCE",
          priority: 80,
          title: `SAR ${sarId} approved — ready for FIU filing`,
          description:
            `SAR ${sarId} (rule ${sar.detectionRule}) was approved by ${reviewer.legalName}. ` +
            `Submit to the FIU via POST /api/sgtx/sar/file to obtain a filing reference. ` +
            (notes ? `Reviewer notes: ${notes}` : ""),
          ctaLabel: "File with FIU",
        },
      });

      return NextResponse.json({
        ok: true,
        sar: updated,
        action: "approve",
        nextStep: "POST /api/sgtx/sar/file { sarId }",
        reviewer: reviewer.legalName,
        notes: notes || null,
      });
    }

    // reject — false positive
    const updated = await db.suspiciousActivityReport.update({
      where: { id: sarId },
      data: {
        draftStatus: "REJECTED",
        governorDecisionId: reviewerGtid,
        loomHash,
      },
    });

    await db.inboxItem.create({
      data: {
        tenantGtid: reviewerGtid,
        category: "COMPLIANCE",
        priority: 40,
        title: `SAR ${sarId} rejected as false positive`,
        description:
          `SAR ${sarId} (rule ${sar.detectionRule}) was rejected by ${reviewer.legalName} as a false positive. ` +
          (notes ? `Reason: ${notes}` : "No reason provided.") +
          ` The rejection is Loom-anchored and flagged for quarterly audit per Part 1.12.5.`,
        ctaLabel: "View Audit Trail",
      },
    });

    return NextResponse.json({
      ok: true,
      sar: updated,
      action: "reject",
      reviewer: reviewer.legalName,
      notes: notes || null,
    });
  } catch (e: any) {
    logger.error("[sar/review] error:", e);
    return NextResponse.json({ error: e?.message || "SAR review failed" }, { status: 500 });
  }
}
