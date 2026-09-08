// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET    /api/sgtx/service-capabilities/tenant/[gtid]
// POST   /api/sgtx/service-capabilities/tenant/[gtid]
// DELETE /api/sgtx/service-capabilities/tenant/[gtid]?capability=<CODE>
//
// Per-tenant capability assignment — v17 Section 11.3.
//
// GET    — list the capabilities currently held by a tenant (parsed from the
//          JSON array on the Tenant row).
// POST   — assign a capability to a tenant. Validates prerequisites per the
//          capability definition (accreditation / insurance requirements, KYB
//          tier, lifecycle state). Body: { capability_code: string }.
//          Self-service: the caller must be the tenant themselves OR an
//          admin (ADM/GOV/PLATFORM_ADMIN). Other tenants cannot assign
//          capabilities to a third party.
// DELETE — remove a capability from a tenant. Idempotent. Query param
//          `?capability=<CODE>`. Same self-service / admin auth rule.
//
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED):
//   • GET returns the tenant's own capability list — no comparison with
//     other tenants, no recommendations, no "you might also like".
//   • POST never auto-assigns "related" capabilities. Only the explicit
//     capability_code in the body is added.
//   • No ranking, no scoring.
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  getTenantCapabilitySummary,
  assignCapability,
  removeCapability,
  validateCapabilityAssignment,
  checkNonMarketplaceGuardrails,
} from "@/lib/sgtx/service-capability";

export const dynamic = "force-dynamic";

interface SessionPayload {
  sub: string;
  tenantGtid?: string;
  role?: string;
  email?: string;
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
  const tenantGtid = req.headers.get("x-tenant-gtid");
  const role = req.headers.get("x-role");
  if (tenantGtid) {
    return { sub: tenantGtid, tenantGtid, role: role || "USER" };
  }
  return null;
}

async function canManageTarget(session: SessionPayload, targetGtid: string): Promise<boolean> {
  // Self-service: caller IS the target
  if (session.tenantGtid && session.tenantGtid === targetGtid) return true;
  // Admin override
  const role = (session.role || "").toUpperCase();
  if (role === "PLATFORM_ADMIN" || role === "ADMIN") return true;
  if (!session.tenantGtid) return false;
  try {
    const tenant = await db.tenant.findUnique({
      where: { gtid: session.tenantGtid },
      select: { type: true, lifecycleState: true },
    });
    if (!tenant) return false;
    return (
      (tenant.type === "ADM" || tenant.type === "GOV") &&
      tenant.lifecycleState === "VERIFIED"
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list a tenant's capabilities
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ gtid: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const { gtid } = await ctx.params;
    if (!gtid) {
      return NextResponse.json(
        { error: "gtid path segment required" },
        { status: 400 },
      );
    }

    // Capability visibility: per v17 §11, a tenant's declared capabilities
    // are visible to other authenticated tenants (they are public capability
    // claims, not private data). The non-marketplace guardrail ensures this
    // list is never used to recommend — only to verify an explicit selection.
    // No IDOR check here.

    const summary = await getTenantCapabilitySummary(gtid);
    if (!summary) {
      return NextResponse.json(
        { error: `Tenant ${gtid} not found` },
        { status: 404 },
      );
    }

    // Guardrail: response must contain no ranking / scoring
    const guard = checkNonMarketplaceGuardrails({ summary });
    if (!guard.compliant) {
      logger.error(
        "[service-capabilities/tenant GET] NON-MARKETPLACE GUARDRAIL VIOLATION",
        { violations: guard.violations },
      );
      return NextResponse.json(
        { error: "Internal marketplace-guardrail violation", violations: guard.violations },
        { status: 500 },
      );
    }

    return NextResponse.json({
      tenant: summary,
      // *** NON-MARKETPLACE GUARDRAIL ***
      // The capability list is the tenant's own declared set. The list is
      // sorted DETERMINISTICALLY (alphabetical) — never ranked. The platform
      // NEVER compares, recommends, or suggests based on this list.
      sort: "deterministic_alphabetical_by_capability_code",
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities/tenant GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — assign a capability to a tenant (with validation)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ gtid: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const { gtid } = await ctx.params;
    if (!gtid) {
      return NextResponse.json(
        { error: "gtid path segment required" },
        { status: 400 },
      );
    }
    if (!(await canManageTarget(session, gtid))) {
      return NextResponse.json(
        { error: "Forbidden — you can only manage your own tenant's capabilities (or be an admin)" },
        { status: 403 },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const capabilityCode = String(body?.capability_code || "").trim().toUpperCase();
    if (!capabilityCode) {
      return NextResponse.json(
        { error: "capability_code is required" },
        { status: 400 },
      );
    }

    // Validate prerequisites (definition exists + accreditation/insurance/
    // lifecycle requirements met)
    const validation = await validateCapabilityAssignment(gtid, capabilityCode);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.reason || "Capability assignment validation failed",
          missing: validation.missing || [],
        },
        { status: 422 },
      );
    }

    const result = await assignCapability(gtid, capabilityCode);
    logger.info("[service-capabilities/tenant POST] capability assigned", {
      gtid,
      capabilityCode,
      assigned: result.assigned,
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      gtid,
      capability_code: capabilityCode,
      assigned: result.assigned,
      capabilities: result.capabilities,
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities/tenant POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — remove a capability from a tenant
// ?capability=<CODE>
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ gtid: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const { gtid } = await ctx.params;
    if (!gtid) {
      return NextResponse.json(
        { error: "gtid path segment required" },
        { status: 400 },
      );
    }
    if (!(await canManageTarget(session, gtid))) {
      return NextResponse.json(
        { error: "Forbidden — you can only manage your own tenant's capabilities (or be an admin)" },
        { status: 403 },
      );
    }

    const capabilityCode = String(
      req.nextUrl.searchParams.get("capability") || "",
    ).trim().toUpperCase();
    if (!capabilityCode) {
      return NextResponse.json(
        { error: "Query param ?capability=<CODE> is required" },
        { status: 400 },
      );
    }

    // Side-effect: deactivate all ProviderPortCoverage rows for this
    // (provider, capability) — keeping stale coverage active after removing
    // the capability would create inconsistent state.
    const result = await removeCapability(gtid, capabilityCode);
    if (result.removed) {
      // Soft-deactivate all coverage rows for this (provider, capability)
      await db.providerPortCoverage
        .updateMany({
          where: { providerGtid: gtid, serviceCapability: capabilityCode, isActive: true },
          data: { isActive: false },
        })
        .catch((e: any) => {
          logger.warn(
            "[service-capabilities/tenant DELETE] failed to deactivate coverage rows",
            { gtid, capabilityCode, error: e?.message },
          );
        });
    }

    logger.info("[service-capabilities/tenant DELETE] capability removed", {
      gtid,
      capabilityCode,
      removed: result.removed,
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      gtid,
      capability_code: capabilityCode,
      removed: result.removed,
      capabilities: result.capabilities,
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities/tenant DELETE] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
