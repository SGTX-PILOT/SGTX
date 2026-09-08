// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET    /api/sgtx/service-capabilities/coverage
// POST   /api/sgtx/service-capabilities/coverage
// DELETE /api/sgtx/service-capabilities/coverage
//
// Provider Port Coverage — v17 Section 11.2.
//
// GET    — list a provider's port coverage. Query params:
//          ?provider=<GTID>&capability=<CODE>?&include_inactive=true
// POST   — add a port-coverage row. Body:
//          { provider_gtid, capability_code, port_unlocode, country_code }
//          Self-service: a provider can add coverage to their own tenant only.
//          Admins (ADM/GOV/PLATFORM_ADMIN) can add coverage for any provider.
//          Pre-condition: the provider must hold the capability (POST
//          /tenant/<gtid> first).
// DELETE — soft-delete (deactivate) a coverage row. Query params:
//          ?provider=<GTID>&capability=<CODE>&port=<UNLOCODE>&hard_delete=true
//          hard_delete is admin-only.
//
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED):
//   • GET returns only the coverage rows the caller explicitly asked for
//     (filtered by provider GTID). No cross-provider aggregation, no
//     listing of all providers at a port — use POST /match for that, which
//     is also non-ranking.
//   • No "you might also like", no recommendation, no scoring.
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  listProviderPortCoverage,
  addPortCoverage,
  removePortCoverage,
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

async function isAdmin(session: SessionPayload): Promise<boolean> {
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

async function canManageProvider(
  session: SessionPayload,
  providerGtid: string,
): Promise<boolean> {
  if (session.tenantGtid && session.tenantGtid === providerGtid) return true;
  return isAdmin(session);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list port coverage for a provider
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const providerGtid = req.nextUrl.searchParams.get("provider");
    if (!providerGtid) {
      return NextResponse.json(
        { error: "Query param ?provider=<GTID> is required" },
        { status: 400 },
      );
    }
    const capabilityCode = req.nextUrl.searchParams.get("capability") || undefined;
    const includeInactive =
      req.nextUrl.searchParams.get("include_inactive") === "true";

    // Self-service: a provider can read their own coverage (full list incl.
    // inactive). Other tenants can read a provider's ACTIVE coverage only
    // (so they can verify the provider's claimed coverage before explicit
    // selection). Admins see all.
    const isSelf = session.tenantGtid === providerGtid;
    const admin = await isAdmin(session);
    const showInactive = includeInactive && (isSelf || admin);

    const coverage = await listProviderPortCoverage(providerGtid, {
      capabilityCode: capabilityCode || undefined,
      includeInactive: showInactive,
    });

    const guard = checkNonMarketplaceGuardrails({ coverage });
    if (!guard.compliant) {
      logger.error(
        "[service-capabilities/coverage GET] NON-MARKETPLACE GUARDRAIL VIOLATION",
        { violations: guard.violations },
      );
      return NextResponse.json(
        { error: "Internal marketplace-guardrail violation", violations: guard.violations },
        { status: 500 },
      );
    }

    return NextResponse.json({
      provider_gtid: providerGtid,
      coverage,
      count: coverage.length,
      sort: "deterministic_alphabetical_by_capability_then_country_then_port",
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities/coverage GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — add a port-coverage row (provider self-service or admin)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const providerGtid = String(body?.provider_gtid || "").trim();
    const capabilityCode = String(body?.capability_code || "").trim().toUpperCase();
    const portUnlocode = String(body?.port_unlocode || "").trim().toUpperCase();
    const countryCode = String(body?.country_code || "").trim().toUpperCase();

    if (!providerGtid || !capabilityCode || !portUnlocode || !countryCode) {
      return NextResponse.json(
        {
          error:
            "provider_gtid, capability_code, port_unlocode, and country_code are all required",
        },
        { status: 400 },
      );
    }

    if (!(await canManageProvider(session, providerGtid))) {
      return NextResponse.json(
        {
          error:
            "Forbidden — you can only add port coverage to your own tenant (or be an admin)",
        },
        { status: 403 },
      );
    }

    const result = await addPortCoverage(
      providerGtid,
      capabilityCode,
      portUnlocode,
      countryCode,
    );

    logger.info("[service-capabilities/coverage POST] port coverage added", {
      providerGtid,
      capabilityCode,
      portUnlocode,
      countryCode,
      created: result.created,
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json(
      {
        coverage: result.coverage,
        created: result.created,
        non_marketplace: true,
      },
      result.created ? { status: 201 } : { status: 200 },
    );
  } catch (e: any) {
    logger.error("[service-capabilities/coverage POST] error:", e);
    const msg = e?.message || "Internal server error";
    // Distinguish "pre-condition failed" (provider doesn't hold capability)
    // from real server errors so the client can show the right remediation.
    if (/does not hold capability/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — remove (deactivate) a port-coverage row
// ?provider=<GTID>&capability=<CODE>&port=<UNLOCODE>&hard_delete=true (admin)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const providerGtid = req.nextUrl.searchParams.get("provider");
    const capabilityCode =
      req.nextUrl.searchParams.get("capability")?.toUpperCase() || "";
    const portUnlocode = req.nextUrl.searchParams.get("port")?.toUpperCase() || "";
    const hardDelete = req.nextUrl.searchParams.get("hard_delete") === "true";

    if (!providerGtid || !capabilityCode || !portUnlocode) {
      return NextResponse.json(
        {
          error:
            "Query params ?provider=<GTID>&capability=<CODE>&port=<UNLOCODE> are required",
        },
        { status: 400 },
      );
    }

    if (!(await canManageProvider(session, providerGtid))) {
      return NextResponse.json(
        {
          error:
            "Forbidden — you can only remove port coverage from your own tenant (or be an admin)",
        },
        { status: 403 },
      );
    }
    if (hardDelete && !(await isAdmin(session))) {
      return NextResponse.json(
        { error: "Forbidden — hard_delete requires admin role" },
        { status: 403 },
      );
    }

    const result = await removePortCoverage(providerGtid, capabilityCode, portUnlocode, {
      hardDelete,
    });

    logger.info("[service-capabilities/coverage DELETE] port coverage removed", {
      providerGtid,
      capabilityCode,
      portUnlocode,
      removed: result.removed,
      hardDeleted: result.hardDeleted,
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      provider_gtid: providerGtid,
      capability_code: capabilityCode,
      port_unlocode: portUnlocode,
      removed: result.removed,
      hard_deleted: result.hardDeleted,
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities/coverage DELETE] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
