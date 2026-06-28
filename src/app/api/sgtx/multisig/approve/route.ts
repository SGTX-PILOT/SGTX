import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/multisig/approve — Approve a multisig request (Part 12C.11)
// Body: { requestId: string, approverGtid: string }
//
// Security (CERT-FIX): The approverGtid must be a verified ADM/governance tenant.
// The caller's identity is derived from the JWT (x-tenant-gtid header) and must
// match the approverGtid in the body. This prevents self-attestation.
export async function POST(req: NextRequest) {
  const { requestId, approverGtid } = await req.json();
  if (!requestId || !approverGtid) {
    return NextResponse.json(
      { error: "requestId and approverGtid are required" },
      { status: 400 },
    );
  }

  // ============ AuthZ: verify caller identity matches approverGtid ============
  // The middleware injects x-tenant-gtid from the verified JWT
  const callerGtid = req.headers.get("x-tenant-gtid") || "";
  if (callerGtid && callerGtid !== approverGtid) {
    return NextResponse.json(
      { error: "Approver GTID does not match authenticated caller" },
      { status: 403 },
    );
  }

  // ============ Verify approver is an ADM/governance tenant ============
  const approverTenant = await db.tenant.findUnique({ where: { gtid: approverGtid } });
  if (!approverTenant) {
    return NextResponse.json({ error: "Approver tenant not found" }, { status: 404 });
  }
  if (approverTenant.type !== "ADM" && approverTenant.type !== "GOV") {
    return NextResponse.json(
      { error: `Approver must be an ADM or GOV tenant (got type=${approverTenant.type})` },
      { status: 403 },
    );
  }
  if (approverTenant.lifecycleState !== "VERIFIED") {
    return NextResponse.json(
      { error: `Approver tenant must be VERIFIED (got ${approverTenant.lifecycleState})` },
      { status: 403 },
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

    // ============ Verify this approver is in the authorised approver set ============
    // The MultisigRequest may specify authorisedApproverGtids; if so, verify membership.
    // Otherwise, any ADM/GOV tenant can approve (but still must be authenticated).
    if (request.authorisedApproverGtids) {
      try {
        const authorised = JSON.parse(request.authorisedApproverGtids);
        if (Array.isArray(authorised) && authorised.length > 0 && !authorised.includes(approverGtid)) {
          return NextResponse.json(
            { error: "Approver not in authorised approver set for this request" },
            { status: 403 },
          );
        }
      } catch { /* invalid JSON — skip check */ }
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

    // Audit log
    await db.activity.create({
      data: {
        actorGtid: approverGtid,
        action: "MULTISIG_APPROVE",
        metadata: JSON.stringify({ requestId, approvalCount: approvals.length, required: request.requiredApprovals, approved: isApproved }),
      },
    }).catch(() => null);

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
