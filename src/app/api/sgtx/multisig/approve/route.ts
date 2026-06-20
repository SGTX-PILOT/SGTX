import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/multisig/approve — Approve a multisig request (Part 12C.11)
// Body: { requestId: string, approverGtid: string }
export async function POST(req: NextRequest) {
  const { requestId, approverGtid } = await req.json();
  if (!requestId || !approverGtid) {
    return NextResponse.json(
      { error: "requestId and approverGtid are required" },
      { status: 400 },
    );
  }
  try {
    const request = await db.multisigRequest.findUnique({ where: { id: requestId } });
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Request no longer pending" }, { status: 409 });
    }

    const approvals = JSON.parse(request.approvals || "[]");
    if (approvals.includes(approverGtid)) {
      return NextResponse.json(
        { error: "Already approved by this member" },
        { status: 409 },
      );
    }
    approvals.push(approverGtid);
    const isApproved = approvals.length >= request.requiredApprovals;

    const updated = await db.multisigRequest.update({
      where: { id: requestId },
      data: {
        approvals: JSON.stringify(approvals),
        status: isApproved ? "APPROVED" : "PENDING",
        executedAt: isApproved ? new Date() : null,
      },
    });
    return NextResponse.json({
      ok: true,
      request: updated,
      approved: isApproved,
      approvalCount: approvals.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
