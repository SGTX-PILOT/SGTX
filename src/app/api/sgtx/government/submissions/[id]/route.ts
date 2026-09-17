// @ts-nocheck
// SGTX Phase 4 §4 — Government Submissions API
//   GET /api/sgtx/government/submissions/[id] — fetch a single GovernmentSubmission
//   Read-only — writes go through the customs-operations / gateway endpoints
//   which call the engines; the engine writes the row here as an audit trail.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const submission = await db.governmentSubmission.findUnique({
      where: { id },
    });
    if (!submission) {
      return NextResponse.json(
        { error: "government submission not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ submission });
  } catch (err: any) {
    logger.error("[api/sgtx/government/submissions/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
