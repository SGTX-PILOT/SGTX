// @ts-nocheck
// SGTX v17 §12.5 — Conditional QC: re-inspection route
//
// POST /api/sgtx/qc-inspections/[id]/reinspect
//   Body: { actionPlanId, scheduledAt?, requestedByGtid? }
//   Schedules a re-inspection after the action plan is complete.
//
// PUT  /api/sgtx/qc-inspections/[id]/reinspect
//   Body: { reinspectionId, result: "PASS"|"FAIL", defectCount?, notes?,
//           newDeficiencies?, inspectorGtid }
//   Submits the re-inspection result.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  requestReinspection,
  submitReinspectionResult,
  blockSettlementOnQcFail,
} from "@/lib/sgtx/qc/conditional-qc";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { actionPlanId, scheduledAt, requestedByGtid } = body ?? {};

    let resolvedActionPlanId = actionPlanId;
    if (!resolvedActionPlanId) {
      // Find the most recent COMPLETED_PENDING_VERIFICATION action plan for
      // this inspection.
      const plan = await db.qcActionPlan.findFirst({
        where: { inspectionId: id, status: "COMPLETED_PENDING_VERIFICATION" },
        orderBy: { createdAt: "desc" },
      });
      if (!plan) {
        return NextResponse.json(
          {
            error:
              "No action plan in COMPLETED_PENDING_VERIFICATION status for this inspection. " +
              "Complete all required actions first.",
          },
          { status: 400 },
        );
      }
      resolvedActionPlanId = plan.id;
    }

    const result = await requestReinspection(resolvedActionPlanId, {
      scheduledAt,
      requestedByGtid,
    });

    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.reason, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      reinspection_id: result.reinspectionId,
      scheduled_at: result.scheduledAt,
      ustn: result.ustn,
      inspection_id: result.inspectionId,
      action_plan_id: result.actionPlanId,
      status: result.status,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/reinspect POST]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: _id } = await params;
    const body = await req.json();
    const { reinspectionId, result, defectCount, notes, newDeficiencies, inspectorGtid } = body ?? {};
    if (!reinspectionId) {
      return NextResponse.json({ error: "reinspectionId is required" }, { status: 400 });
    }
    if (result !== "PASS" && result !== "FAIL") {
      return NextResponse.json(
        { error: 'result must be "PASS" or "FAIL"' },
        { status: 400 },
      );
    }
    if (!inspectorGtid) {
      return NextResponse.json(
        { error: "inspectorGtid is required" },
        { status: 400 },
      );
    }

    const submission = await submitReinspectionResult({
      reinspectionId,
      result,
      defectCount,
      notes,
      newDeficiencies,
      inspectorGtid,
    });

    if (!submission.ok) {
      const status = submission.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: submission.reason, code: submission.code },
        { status },
      );
    }

    // If the re-inspection cleared the conditional pass, also report the
    // settlement-block status for the USTN (so the caller knows settlement
    // is unblocked).
    let settlementStatus: any = null;
    if (submission.cleared && submission.originalInspectionId) {
      try {
        const original = await db.qcInspection.findUnique({
          where: { id: submission.originalInspectionId },
          include: { trade: true },
        });
        if (original?.trade?.ustn) {
          const block = await blockSettlementOnQcFail(original.trade.ustn);
          settlementStatus = block;
        }
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      ok: true,
      reinspection_id: submission.reinspectionId,
      cleared: submission.cleared,
      original_inspection_id: submission.originalInspectionId,
      new_action_plan_id: submission.newActionPlanId,
      settlement_status: settlementStatus,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/reinspect PUT]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
