// 3B.6.4.2 — QC Conditional Pass with Action Plan
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submitConditionalQcPass } from "@/lib/sgtx/execution";
import { defectDetection } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { inspectionId, ustn, shipmentId, actionPlan, deadlineHours, escalationTerms, inspectorGtid, commodity, inspectionType, photoCount, inspectorNotes } = body;
    if (!inspectionId || !ustn || !shipmentId || !actionPlan || !deadlineHours || !inspectorGtid) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Optional: run AI defect detection (A2) for context
    let aiDefects: any = null;
    if (commodity && inspectorNotes) {
      try {
        const r = await defectDetection({ commodity, inspectionType: inspectionType || "PRE_SHIPMENT", photoCount: photoCount || 0, inspectorNotes });
        try { aiDefects = JSON.parse(r.content); } catch { /* ignore */ }
      } catch { /* ignore */ }
    }

    const result = await submitConditionalQcPass({ inspectionId, ustn, shipmentId, actionPlan, deadlineHours, escalationTerms, inspectorGtid });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // Update inspection to CONDITIONAL_PASS
    await db.qcInspection.update({ where: { id: inspectionId }, data: { result: "CONDITIONAL_PASS", status: "COMPLETED" } });

    return NextResponse.json({
      ok: true,
      actionPlanId: result.actionPlanId,
      holdId: result.holdId,
      aiDefects,
    });
  } catch (e: any) {
    console.error("[execution/qc/conditional-pass]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
