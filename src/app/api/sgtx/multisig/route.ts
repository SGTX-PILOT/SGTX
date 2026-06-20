import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/multisig — List multisig requests (blueprint 12C.11)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const requests = await db.multisigRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ requests });
}

// POST /api/sgtx/multisig — Create a multisig approval request
export async function POST(req: NextRequest) {
  const { requestType, requesterGtid, payload, requiredApprovals } = await req.json();
  if (!requestType || !requesterGtid) return NextResponse.json({ error: "requestType and requesterGtid required" }, { status: 400 });
  const request = await db.multisigRequest.create({
    data: {
      requestType, // POLICY_UPDATE | ADDON_ACTIVATE | SPECIAL_RATE | CONFIG_ROLLBACK | IMPERSONATION
      requesterGtid,
      payload: payload ? JSON.stringify(payload) : "{}",
      requiredApprovals: requiredApprovals || 3,
      status: "PENDING",
    },
  });
  // Smart Inbox to Platform Governance Authority members
  await db.inboxItem.create({
    data: {
      tenantGtid: "SGTX-EG-GOV-000001-9A0B",
      category: "NEEDS_APPROVAL",
      priority: 80,
      title: `Multisig Approval Required: ${requestType}`,
      description: `Request from ${requesterGtid} requires ${requiredApprovals || 3} approvals. Type: ${requestType}.`,
      ctaLabel: "Review & Approve",
    },
  });
  return NextResponse.json({ ok: true, request });
}

// POST /api/sgtx/multisig/approve — Approve a multisig request
export async function POST_approve(req: NextRequest) {
  const { requestId, approverGtid } = await req.json();
  if (!requestId || !approverGtid) return NextResponse.json({ error: "requestId and approverGtid required" }, { status: 400 });
  const request = await db.multisigRequest.findUnique({ where: { id: requestId } });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: "Request no longer pending" }, { status: 409 });

  const approvals = JSON.parse(request.approvals || "[]");
  if (approvals.includes(approverGtid)) {
    return NextResponse.json({ error: "Already approved by this member" }, { status: 409 });
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
  return NextResponse.json({ ok: true, request: updated, approved: isApproved, approvalCount: approvals.length });
}
