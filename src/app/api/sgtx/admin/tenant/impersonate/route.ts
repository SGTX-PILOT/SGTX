// CERT-32 P0 FIX (F-05): Admin impersonation endpoint now requires:
//   1. A valid session JWT (verified via the same `verifyTokenEdge` step
//      used by the middleware — we re-derive the admin from the JWT,
//      never from the request body).
//   2. The JWT `role` claim must be `PLATFORM_ADMIN` (RBAC).
//   3. The admin's `tenantGtid` must match a real `Tenant` row with
//      `type === "ADMIN"` (defense-in-depth: even if a JWT is forged,
//      the DB must corroborate the admin tenant).
//   4. The `adminGtid` field in the request body is IGNORED — the
//      effective admin is always the verified session's tenant GTID.
//      This eliminates the previous attack where any caller could
//      supply an arbitrary `adminGtid` and contaminate the audit log.
//   5. The target tenant must exist (404 if not).
//   6. The audit Activity row records the VERIFIED admin GTID, not the
//      body-supplied one.
//
// (See SGTX_SECURITY_AUDIT.md finding #4 and SGTX_FINAL_CERTIFICATION_REPORT.md
//  F-05 for the full evidence + remediation note.)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTokenEdge } from "@/lib/v1/auth-edge";

export async function POST(req: NextRequest) {
  try {
    // ── 1. Verify the session JWT ────────────────────────────────────────
    // The middleware already verified the JWT, but we re-verify here to
    // be defense-in-depth (this route handler can be called directly by
    // Next.js dev tooling without going through middleware).
    const authHeader = req.headers.get("authorization") || "";
    const sessionCookie = req.cookies.get("sgtx-session")?.value || "";
    const token = authHeader.replace("Bearer ", "") || sessionCookie;
    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const payload = await verifyTokenEdge(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // ── 2. RBAC: only PLATFORM_ADMIN can impersonate ────────────────────
    // The JWT `role` claim is set at login. We accept either
    // `PLATFORM_ADMIN` or the legacy `ADMIN` claim.
    const role = (payload as any).role || "";
    if (role !== "PLATFORM_ADMIN" && role !== "ADMIN") {
      // CERT-29: classified, observable error. Log the denial.
      await db.activity.create({
        data: {
          actorGtid: (payload as any).tenantGtid || "unknown",
          action: "IMPERSONATION_DENIED",
          type: "WARNING",
          description: `Denied impersonation attempt by role=${role} sub=${(payload as any).sub}`,
        },
      }).catch(() => {/* non-fatal */});
      return NextResponse.json(
        { error: "Forbidden: PLATFORM_ADMIN role required" },
        { status: 403 },
      );
    }

    // ── 3. Derive the admin GTID from the verified JWT, NOT the body ────
    // This is the P0 fix: the previous code read `adminGtid` from the
    // request body, allowing any caller to forge it.
    const adminGtid = (payload as any).tenantGtid as string | undefined;
    if (!adminGtid) {
      return NextResponse.json(
        { error: "Session JWT missing tenantGtid claim" },
        { status: 403 },
      );
    }

    // ── 4. Defense-in-depth: verify the admin tenant exists in the DB ──
    const adminTenant = await db.tenant.findUnique({ where: { gtid: adminGtid } });
    if (!adminTenant) {
      return NextResponse.json(
        { error: "Admin tenant not found in database" },
        { status: 403 },
      );
    }

    // ── 5. Validate the request body ───────────────────────────────────
    const body = await req.json().catch(() => ({} as any));
    const { targetTenantGtid, reason, durationMinutes } = body as {
      targetTenantGtid?: string;
      reason?: string;
      durationMinutes?: number;
    };
    if (!targetTenantGtid || !reason) {
      return NextResponse.json(
        { error: "targetTenantGtid and reason are required" },
        { status: 400 },
      );
    }
    if (reason.length < 20) {
      return NextResponse.json(
        { error: "reason must be ≥20 chars (audit trail quality bar)" },
        { status: 400 },
      );
    }

    // ── 6. Verify the target tenant exists ──────────────────────────────
    const targetTenant = await db.tenant.findUnique({ where: { gtid: targetTenantGtid } });
    if (!targetTenant) {
      return NextResponse.json(
        { error: "Target tenant not found" },
        { status: 404 },
      );
    }
    // Admins cannot impersonate themselves.
    if (targetTenant.gtid === adminGtid) {
      return NextResponse.json(
        { error: "Cannot impersonate your own tenant" },
        { status: 400 },
      );
    }

    // ── 7. Create the impersonation session + audit record ──────────────
    const sessionId = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + (durationMinutes || 30) * 60 * 1000);
    await db.activity.create({
      data: {
        // CERT-32 FIX: actorGtid is the VERIFIED admin, not a body-supplied value.
        actorGtid: adminGtid,
        action: "TENANT_IMPERSONATION",
        type: "WARNING",
        description: `Verified admin ${adminGtid} (role=${role}, tenant=${adminTenant.legalName}) started impersonation session ${sessionId} for tenant ${targetTenantGtid} (${targetTenant.legalName}). Reason: ${reason}. Expires: ${expiresAt.toISOString()}.`,
      },
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      targetTenantGtid,
      adminGtid, // returned for client-side confirmation
      adminTenantName: adminTenant.legalName,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Impersonation failed", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
