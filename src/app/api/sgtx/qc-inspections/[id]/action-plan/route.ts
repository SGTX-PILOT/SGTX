// @ts-nocheck
// SGTX v17 §12.5 — Conditional QC: action plan route
//
// POST /api/sgtx/qc-inspections/[id]/action-plan
//   Body: { deficiencies: string[], deadlineOverride?, createdByGtid }
//   Creates an action plan for the inspection [id].
//
// GET  /api/sgtx/qc-inspections/[id]/action-plan
//   Returns the action-plan status for inspection [id].
//
// PATCH /api/sgtx/qc-inspections/[id]/action-plan
//   Body: { actionCode, evidence?, verifiedBy }
//   Marks a single required action as complete.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  createActionPlan,
  validateActionPlanComplete,
  markActionComplete,
} from "@/lib/sgtx/qc/conditional-qc";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { deficiencies, deadlineOverride, createdByGtid } = body ?? {};
    if (!Array.isArray(deficiencies) || deficiencies.length === 0) {
      return NextResponse.json(
        { error: "deficiencies (non-empty array) is required" },
        { status: 400 },
      );
    }
    if (!createdByGtid) {
      return NextResponse.json(
        { error: "createdByGtid is required (the QC provider's gtid)" },
        { status: 400 },
      );
    }

    const result = await createActionPlan({
      inspectionId: id,
      deficiencies,
      deadlineOverride,
      createdByGtid,
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
      action_plan_id: result.actionPlanId,
      required_actions: result.requiredActions,
      deadline: result.deadline,
      ustn: result.ustn,
      trade_id: result.tradeId,
      status: result.status,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/action-plan POST]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Find the most recent action plan for this inspection.
    const plan = await db.qcActionPlan.findFirst({
      where: { inspectionId: id },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) {
      return NextResponse.json(
        { ok: false, reason: "No action plan found for this inspection.", inspection_id: id },
        { status: 404 },
      );
    }
    const status = await validateActionPlanComplete(plan.id);
    if (!status.ok) {
      return NextResponse.json(
        { ok: false, reason: status.reason, action_plan_id: plan.id, plan_id: plan.planId },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      action_plan_id: plan.id,
      plan_id: plan.planId,
      inspection_id: id,
      complete: status.complete,
      completed_count: status.completedCount,
      total_count: status.totalCount,
      incomplete_actions: status.incompleteActions,
      deadline: status.deadline,
      overdue: status.overdue,
      verified_by: status.verifiedBy,
      verified_at: status.verifiedAt,
      status: status.status,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/action-plan GET]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { actionCode, evidence, verifiedBy, actionPlanId } = body ?? {};
    if (!actionCode || !verifiedBy) {
      return NextResponse.json(
        { error: "actionCode and verifiedBy are required" },
        { status: 400 },
      );
    }
    // Resolve the action plan: either caller provides actionPlanId, or we
    // find the most recent one for this inspection.
    let planId = actionPlanId;
    if (!planId) {
      const plan = await db.qcActionPlan.findFirst({
        where: { inspectionId: id },
        orderBy: { createdAt: "desc" },
      });
      if (!plan) {
        return NextResponse.json(
          { error: "No action plan found for this inspection." },
          { status: 404 },
        );
      }
      planId = plan.id;
    }
    const result = await markActionComplete({
      actionPlanId: planId,
      actionCode,
      evidence,
      verifiedBy,
    });
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" || result.code === "ACTION_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.reason, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      action_plan_id: result.actionPlanId,
      completed_count: result.completedCount,
      total_count: result.totalCount,
      all_complete: result.allComplete,
      status: result.status,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/action-plan PATCH]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
