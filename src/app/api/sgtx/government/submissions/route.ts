// @ts-nocheck
// SGTX Phase 4 §4 — Government Submissions API
//   GET /api/sgtx/government/submissions — list GovernmentSubmission rows
//   Query: ?ustn=&workflowStepId=&connectorId=&status=&submissionType=
//   The GovernmentSubmission table is the §4 authoritative audit log: every
//   gateway call that mutated state (submission, amendment, release, …)
//   writes a row here. This endpoint is read-only (writes go through the
//   customs-operations / gateway endpoints which call the engines).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    const workflowStepId = url.searchParams.get("workflowStepId") || undefined;
    const connectorId = url.searchParams.get("connectorId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const submissionType = url.searchParams.get("submissionType") || undefined;

    const where: Record<string, unknown> = {};
    if (ustn) where.ustn = ustn;
    if (workflowStepId) where.workflowStepId = workflowStepId;
    if (connectorId) where.connectorId = connectorId;
    if (status) where.status = status;
    if (submissionType) where.submissionType = submissionType;

    const submissions = await db.governmentSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({
      submissions,
      count: submissions.length,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/government/submissions] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
