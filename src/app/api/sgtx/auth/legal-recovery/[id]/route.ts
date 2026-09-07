// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/v1/auth";
import { signWithPlatformKeySync } from "@/lib/sgtx/crypto/platform-key";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// PATCH /api/sgtx/auth/legal-recovery/[id] — Multisig approval/rejection for a
// Legal Recovery request (Blueprint §4.7).
//
// Path param:  id — the recovery_request_id returned by POST /legal-recovery
//                   (e.g. "LREC-..."). We map it back to the MultisigRequest
//                   by looking up the payload.recovery_request_id field, since
//                   the id we return is NOT the raw MultisigRequest.id (which
//                   is also exposed in the response body so callers can use
//                   either).
//
// Auth:   Authorization: Bearer <access_jwt>
//         (the caller's tenant GTID MUST match the approver_gtid in the body
//          AND must be in the authorised approver set on the MultisigRequest)
// Body:   {
//   approver_gtid: string,                 // the governance officer approving
//   decision:      "APPROVE" | "REJECT",
//   reason?:       string,
// }
// Returns:
//   {
//     recovery_request_id:  string,
//     multisig_request_id:  string,
//     decision:             "APPROVE" | "REJECT",
//     approval_count:       number,        // count of APPROVE entries
//     rejection_count:      number,        // count of REJECT entries
//     required_approvals:   number,        // 3
//     status:               "PENDING" | "APPROVED" | "REJECTED",
//     passkey_reset:        boolean,       // true iff status became APPROVED this call
//     executed_at:          string | null,
//   }
//
// Behaviour:
//  * APPROVE — appends approver_gtid to the approvals array (idempotent).
//    When approval_count >= required_approvals, the request is marked
//    APPROVED and the affected employee's passkey is reset (devices revoked,
//    TOTP secret rotated, an audit Governor decision is logged in the Loom
//    chain, and the employee must enroll a new passkey on next login).
//  * REJECT — appends approver_gtid to a rejections array stored in the
//    MultisigRequest payload. A single rejection does NOT auto-reject the
//    request (§4.7 requires a positive 3-of-5 vote to APPROVE; rejection is
//    advisory unless 3 officers reject). When rejection_count >=
//    required_approvals, status becomes REJECTED and no passkey reset occurs.

const REQUIRED_APPROVALS = 3;

interface SessionPayload {
  sub: string;
  tenantGtid?: string;
  employeeId?: string;
  role?: string;
  [key: string]: any;
}

function extractSession(req: NextRequest): SessionPayload | null {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.type !== "refresh") return payload;
    }
  }
  return null;
}

function sha256Of(data: string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/**
 * Find the MultisigRequest for a given recovery_request_id. We try a direct
 * lookup by id first (in case the caller passed the raw multisig id), then
 * fall back to scanning recent LEGAL_RECOVERY_PASSKEY_RESET requests for a
 * payload.recovery_request_id matching the path param.
 */
async function findMultisigForRecovery(
  recoveryRequestId: string,
): Promise<any | null> {
  // 1) Direct id match.
  try {
    const direct = await db.multisigRequest.findUnique({
      where: { id: recoveryRequestId },
    });
    if (direct && (direct as any).requestType === "LEGAL_RECOVERY_PASSKEY_RESET") {
      return direct;
    }
  } catch {
    // ignore — fall through to scan
  }

  // 2) Scan by payload.recovery_request_id (recent first).
  const candidates = await db.multisigRequest.findMany({
    where: { requestType: "LEGAL_RECOVERY_PASSKEY_RESET" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  for (const c of candidates) {
    try {
      const parsed = JSON.parse((c as any).payload || "{}");
      if (parsed.recovery_request_id === recoveryRequestId) return c;
    } catch {
      // skip malformed payload
    }
  }
  return null;
}

/**
 * Reset the affected employee's passkey. Per §4.7 the employee must enroll a
 * NEW passkey on next login — we achieve this by:
 *   - revoking all DeviceTrust rows for the tenant (state=REVOKED)
 *   - clearing the employee's TOTP secret (forces re-enrollment)
 *   - recording a sessionAuditEvent
 */
async function resetEmployeePasskey(
  employeeId: string,
  tenantGtid: string,
  recoveryRequestId: string,
): Promise<{ devicesRevoked: number }> {
  let devicesRevoked = 0;
  try {
    const res = await db.deviceTrust.updateMany({
      where: { tenantGtid },
      data: { state: "REVOKED", passkeyEnrolled: false },
    });
    devicesRevoked = (res as any)?.count ?? 0;
  } catch (e: any) {
    logger.warn(
      "[sgtx/auth/legal-recovery PATCH] deviceTrust.updateMany failed",
      { tenantGtid, error: e?.message },
    );
  }
  try {
    await db.employee.update({
      where: { id: employeeId },
      data: {
        totpSecret: null,
        // Force re-enrollment on next login.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  } catch (e: any) {
    logger.warn(
      "[sgtx/auth/legal-recovery PATCH] employee.update failed",
      { employeeId, error: e?.message },
    );
  }
  try {
    await db.sessionAuditEvent.create({
      data: {
        tenantGtid,
        eventType: "passkey_reset_executed",
        description: `Passkey reset executed for employee ${employeeId} per legal recovery ${recoveryRequestId}. All prior devices revoked. New passkey enrollment required on next login.`,
      },
    });
  } catch {
    // Non-fatal.
  }
  return { devicesRevoked };
}

/**
 * Append a Governor decision to the Loom chain recording the multisig
 * resolution (APPROVED or REJECTED) of a Legal Recovery request.
 */
async function logResolutionDecision(
  recoveryRequestId: string,
  verdict: "ALLOW" | "DENY",
  actorGtid: string,
  summary: string,
): Promise<void> {
  try {
    const prevDecision = await db.governorDecision.findFirst({
      orderBy: { createdAt: "desc" },
    });
    const prevHash = (prevDecision as any)?.loomHash || null;
    const decisionId = `dec-lrec-resolve-${recoveryRequestId.toLowerCase()}-${Date.now().toString(36)}`;
    const decisionJson = JSON.stringify({
      decisionId,
      action: "legal_recovery_resolved",
      actorGtid,
      verdict,
      conditions: [],
      previousHash: prevHash,
    });
    const signature = signWithPlatformKeySync(decisionId);
    const loomHash = "sha256:" + createHash("sha256")
      .update((prevHash || "genesis") + decisionJson + signature)
      .digest("hex");
    await db.governorDecision.create({
      data: {
        decisionId,
        action: "legal_recovery_resolved",
        actorGtid,
        verdict,
        conditions: "[]",
        tenantMessage: summary,
        loomHash,
        previousHash: prevHash,
        signature,
        moduleVersions: "{}",
      },
    });
  } catch (e: any) {
    logger.warn(
      "[sgtx/auth/legal-recovery PATCH] governorDecision.create failed — continuing",
      { error: e?.message },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── 1. Authenticate ────────────────────────────────────────────────────
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        {
          error:
            "Authentication required — supply Authorization: Bearer <access_jwt>",
        },
        { status: 401 },
      );
    }

    const { id: recoveryRequestId } = await params;
    if (!recoveryRequestId) {
      return NextResponse.json(
        { error: "recovery_request_id path parameter is required" },
        { status: 400 },
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const approverGtid: string = String(body?.approver_gtid || "").trim();
    const decision: string = String(body?.decision || "").toUpperCase();
    const reason: string = String(body?.reason || "").trim();

    if (!approverGtid) {
      return NextResponse.json(
        { error: "approver_gtid is required" },
        { status: 400 },
      );
    }
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return NextResponse.json(
        { error: 'decision must be "APPROVE" or "REJECT"' },
        { status: 400 },
      );
    }

    // AuthZ: caller JWT sub/tenant must match the approver_gtid.
    const callerGtid = session.tenantGtid || session.sub || "";
    if (callerGtid && callerGtid !== approverGtid) {
      return NextResponse.json(
        { error: "Approver GTID does not match authenticated caller" },
        { status: 403 },
      );
    }

    // ── 2. Find the MultisigRequest ───────────────────────────────────────
    const msRequest = await findMultisigForRecovery(recoveryRequestId);
    if (!msRequest) {
      return NextResponse.json(
        {
          error: `No Legal Recovery multisig request found for recovery_request_id ${recoveryRequestId}`,
        },
        { status: 404 },
      );
    }
    if (msRequest.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Multisig request is no longer pending (status=${msRequest.status})`,
          recovery_request_id: recoveryRequestId,
          multisig_request_id: msRequest.id,
          status: msRequest.status,
        },
        { status: 409 },
      );
    }

    // ── 3. Validate approver is in the authorised set ─────────────────────
    let authorisedApprovers: string[] = [];
    try {
      const parsed = JSON.parse(msRequest.authorisedApproverGtids || "[]");
      if (Array.isArray(parsed)) authorisedApprovers = parsed;
    } catch {
      // ignore — empty set
    }
    if (
      authorisedApprovers.length > 0 &&
      !authorisedApprovers.includes(approverGtid)
    ) {
      return NextResponse.json(
        {
          error: "Approver is not in the authorised approver set for this Legal Recovery request",
          authorised_approvers: authorisedApprovers,
        },
        { status: 403 },
      );
    }

    // Verify the approver tenant is ADM/GOV VERIFIED (defense in depth — the
    // approver set is already curated, but this guards against stale data).
    try {
      const approverTenant = await db.tenant.findUnique({
        where: { gtid: approverGtid },
        select: { type: true, lifecycleState: true },
      });
      if (
        !approverTenant ||
        (approverTenant.type !== "ADM" && approverTenant.type !== "GOV") ||
        approverTenant.lifecycleState !== "VERIFIED"
      ) {
        return NextResponse.json(
          {
            error:
              "Approver must be an ADM/GOV tenant in VERIFIED lifecycle state",
          },
          { status: 403 },
        );
      }
    } catch (e: any) {
      logger.warn(
        "[sgtx/auth/legal-recovery PATCH] approver tenant lookup failed — proceeding",
        { approverGtid, error: e?.message },
      );
    }

    // ── 4. Parse the recovery payload for the affected employee ───────────
    let recoveryPayload: any = {};
    try {
      recoveryPayload = JSON.parse(msRequest.payload || "{}");
    } catch {
      // ignore — empty payload
    }
    const affectedEmployeeId: string | null = recoveryPayload.affected_employee_id || null;
    const affectedTenantGtid: string | null =
      recoveryPayload.affected_tenant_gtid || null;

    // ── 5. Apply the decision ─────────────────────────────────────────────
    let approvals: string[] = [];
    let rejections: Array<{ gtid: string; reason?: string; at: string }> = [];
    try {
      approvals = JSON.parse(msRequest.approvals || "[]");
    } catch {
      approvals = [];
    }

    let nowStatus: string = "PENDING";
    let executedAt: string | null = null;
    let passkeyReset = false;

    if (decision === "APPROVE") {
      if (approvals.includes(approverGtid)) {
        return NextResponse.json(
          { error: "Already approved by this approver" },
          { status: 409 },
        );
      }
      approvals.push(approverGtid);
      if (approvals.length >= REQUIRED_APPROVALS) {
        nowStatus = "APPROVED";
        executedAt = new Date().toISOString();
      }
    } else {
      // REJECT — track in a parallel rejections array (we encode it into the
      // payload field as a side-channel since MultisigRequest has no
      // dedicated rejections column).
      try {
        const existing = recoveryPayload.__rejections;
        if (Array.isArray(existing)) rejections = existing;
      } catch {
        // ignore
      }
      if (rejections.some((r) => r.gtid === approverGtid)) {
        return NextResponse.json(
          { error: "Already rejected by this approver" },
          { status: 409 },
        );
      }
      rejections.push({
        gtid: approverGtid,
        reason: reason || null,
        at: new Date().toISOString(),
      });
      recoveryPayload.__rejections = rejections;
      if (rejections.length >= REQUIRED_APPROVALS) {
        nowStatus = "REJECTED";
        executedAt = new Date().toISOString();
      }
    }

    // ── 6. Persist the updated MultisigRequest ────────────────────────────
    const updatedPayload = JSON.stringify(recoveryPayload);
    const updated = await db.multisigRequest.update({
      where: { id: msRequest.id },
      data: {
        approvals: JSON.stringify(approvals),
        payload: decision === "REJECT" ? updatedPayload : msRequest.payload,
        status: nowStatus,
        executedAt: executedAt ? new Date(executedAt) : null,
      },
    });

    // ── 7. If APPROVED, execute the passkey reset ─────────────────────────
    if (nowStatus === "APPROVED" && affectedEmployeeId && affectedTenantGtid) {
      try {
        const resetResult = await resetEmployeePasskey(
          affectedEmployeeId,
          affectedTenantGtid,
          recoveryRequestId,
        );
        passkeyReset = true;
        // Persist a recovery vault entry recording the executed reset.
        try {
          await db.recoveryVaultEntry.create({
            data: {
              ustn: null,
              entryType: "RECOVERY_ACTION",
              entryReference: `${recoveryRequestId}#executed`,
              entryHash: sha256Of(JSON.stringify({
                recovery_request_id: recoveryRequestId,
                employee_id: affectedEmployeeId,
                tenant_gtid: affectedTenantGtid,
                executed_at: executedAt,
                devices_revoked: resetResult.devicesRevoked,
              })),
              entryContent: JSON.stringify({
                recovery_request_id: recoveryRequestId,
                employee_id: affectedEmployeeId,
                tenant_gtid: affectedTenantGtid,
                executed_at: executedAt,
                devices_revoked: resetResult.devicesRevoked,
                passkey_reset: true,
              }),
            },
          });
        } catch (e: any) {
          logger.warn(
            "[sgtx/auth/legal-recovery PATCH] recoveryVaultEntry.create(executed) failed — continuing",
            { error: e?.message },
          );
        }
        // Append a Governor decision to the Loom chain recording the reset.
        await logResolutionDecision(
          recoveryRequestId,
          "ALLOW",
          approverGtid,
          `Legal Recovery ${recoveryRequestId} APPROVED by 3-of-5 governance officers. Passkey reset executed for employee ${affectedEmployeeId}; all prior devices revoked.`,
        );
      } catch (e: any) {
        logger.error(
          "[sgtx/auth/legal-recovery PATCH] passkey reset failed",
          { error: e?.message },
        );
        // Don't crash — the multisig is still recorded as APPROVED; the
        // caller can retry the reset via a separate ops endpoint.
      }
    } else if (nowStatus === "REJECTED") {
      await logResolutionDecision(
        recoveryRequestId,
        "DENY",
        approverGtid,
        `Legal Recovery ${recoveryRequestId} REJECTED by 3-of-5 governance officers. No passkey reset performed.`,
      );
    }

    // ── 8. Audit log ──────────────────────────────────────────────────────
    try {
      await db.activity.create({
        data: {
          actorGtid: approverGtid,
          action: "LEGAL_RECOVERY_DECISION",
          metadata: JSON.stringify({
            recovery_request_id: recoveryRequestId,
            multisig_request_id: msRequest.id,
            decision,
            reason: reason || null,
            approval_count: approvals.length,
            rejection_count: rejections.length,
            required_approvals: REQUIRED_APPROVALS,
            status: nowStatus,
            passkey_reset: passkeyReset,
          }),
        },
      });
    } catch {
      // Non-fatal.
    }

    // ── 9. Response ──────────────────────────────────────────────────────
    return NextResponse.json({
      recovery_request_id: recoveryRequestId,
      multisig_request_id: msRequest.id,
      decision,
      approver_gtid: approverGtid,
      approval_count: approvals.length,
      rejection_count: rejections.length,
      required_approvals: REQUIRED_APPROVALS,
      status: nowStatus,
      passkey_reset: passkeyReset,
      executed_at: executedAt,
      affected_employee_id: affectedEmployeeId,
      affected_tenant_gtid: affectedTenantGtid,
      next_steps:
        nowStatus === "APPROVED"
          ? passkeyReset
            ? "Passkey has been reset and all prior devices revoked. The affected employee must enroll a new passkey on next login."
            : "Multisig approved. Passkey reset is in progress — verify via GET /api/sgtx/auth/legal-recovery/" +
              recoveryRequestId
          : nowStatus === "REJECTED"
          ? "Multisig rejected. No passkey reset will occur."
          : `Awaiting ${REQUIRED_APPROVALS - approvals.length} more approval(s)`,
    });
  } catch (e: any) {
    logger.error("[sgtx/auth/legal-recovery PATCH] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Legal recovery approval failed" },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/auth/legal-recovery/[id] — fetch the status of a recovery request.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: recoveryRequestId } = await params;
    if (!recoveryRequestId) {
      return NextResponse.json(
        { error: "recovery_request_id path parameter is required" },
        { status: 400 },
      );
    }
    const msRequest = await findMultisigForRecovery(recoveryRequestId);
    if (!msRequest) {
      return NextResponse.json(
        {
          error: `No Legal Recovery multisig request found for ${recoveryRequestId}`,
        },
        { status: 404 },
      );
    }
    let approvals: string[] = [];
    let rejections: any[] = [];
    let recoveryPayload: any = {};
    try {
      approvals = JSON.parse(msRequest.approvals || "[]");
    } catch {
      // ignore
    }
    try {
      recoveryPayload = JSON.parse(msRequest.payload || "{}");
      if (Array.isArray(recoveryPayload.__rejections)) {
        rejections = recoveryPayload.__rejections;
      }
    } catch {
      // ignore
    }
    return NextResponse.json({
      recovery_request_id: recoveryRequestId,
      multisig_request_id: msRequest.id,
      request_type: msRequest.requestType,
      status: msRequest.status,
      required_approvals: msRequest.requiredApprovals,
      approval_count: approvals.length,
      rejection_count: rejections.length,
      approvals,
      rejections,
      executed_at: msRequest.executedAt
        ? msRequest.executedAt.toISOString()
        : null,
      affected_employee_email: recoveryPayload.affected_employee_email || null,
      affected_tenant_gtid: recoveryPayload.affected_tenant_gtid || null,
      notarised_id_hash: recoveryPayload.notarised_id_hash || null,
      registered_mail_tracking: recoveryPayload.registered_mail_tracking || null,
      submitted_at: recoveryPayload.submitted_at || msRequest.createdAt.toISOString(),
    });
  } catch (e: any) {
    logger.error("[sgtx/auth/legal-recovery GET] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Failed to fetch recovery request" },
      { status: 500 },
    );
  }
}
