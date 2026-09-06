// POST /api/sgtx/financing/pre-clearance/respond
// v16.1 Patch 2 (M5): Financier responds to a CFR request — issues or rejects
// the Conditional Financing Reference.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { preClearanceId, financierGtid, action, conditionalAmountMax, conditionalApr, conditions } = body;

    if (!preClearanceId || !financierGtid || !action) {
      return NextResponse.json({ error: "preClearanceId, financierGtid, and action required" }, { status: 400 });
    }

    if (!["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "action must be APPROVED or REJECTED" }, { status: 400 });
    }

    // Find the pre-clearance request
    const preClearance = await db.financingPreClearanceRequest.findUnique({
      where: { id: preClearanceId },
    });
    if (!preClearance) {
      return NextResponse.json({ error: "Pre-clearance request not found" }, { status: 404 });
    }
    if (preClearance.financierGtid !== financierGtid) {
      return NextResponse.json({ error: "Not authorized to respond to this request" }, { status: 403 });
    }
    if (preClearance.status !== "REQUESTED" && preClearance.status !== "UNDER_REVIEW") {
      return NextResponse.json({ error: `Request already ${preClearance.status}` }, { status: 400 });
    }

    // Generate CFR reference if approved
    const cfrReference = action === "APPROVED"
      ? `CFR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      : null;

    // Update the pre-clearance request
    const updated = await db.financingPreClearanceRequest.update({
      where: { id: preClearanceId },
      data: {
        status: action,
        cfrReference,
        conditionalAmountMax: action === "APPROVED" ? conditionalAmountMax : null,
        conditionalApr: action === "APPROVED" ? conditionalApr : null,
        conditions: action === "APPROVED" ? conditions : null,
        respondedAt: new Date(),
      },
    });

    // Notify the borrower
    await db.inboxItem.create({
      data: {
        tenantGtid: preClearance.borrowerGtid,
        category: "FINANCING_PRE_CLEARANCE",
        priority: action === "APPROVED" ? "HIGH" : "MEDIUM",
        title: action === "APPROVED"
          ? "Financing pre-clearance APPROVED"
          : "Financing pre-clearance rejected",
        message: action === "APPROVED"
          ? `Your financier has issued CFR ${cfrReference}. Max amount: $${conditionalAmountMax || "—"}. APR: ${conditionalApr || "—"}%.`
          : `Your financier has declined the pre-clearance request.`,
        actionUrl: `/money`,
        dismissed: false,
      },
    }).catch(() => {/* non-fatal */});

    logger.info("financing-pre-clearance-responded", {
      preClearanceId,
      action,
      cfrReference,
    });

    return NextResponse.json({
      ok: true,
      preClearanceId,
      status: action,
      cfrReference,
    });
  } catch (e: any) {
    logger.error("[financing/pre-clearance/respond] error:", e);
    return NextResponse.json({ error: "Response failed", detail: e?.message }, { status: 500 });
  }
}
