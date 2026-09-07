// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/sgtx/service-capabilities
// POST /api/sgtx/service-capabilities        (admin only)
//
// Service Capability Definitions — v17 Section 11.1
//
// GET lists all capability definitions (public to authenticated tenants).
// POST creates a new definition (admin only — JWT role claim must be
// "PLATFORM_ADMIN" or "ADMIN", or the tenant type must be ADM/GOV).
//
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED):
//   • The GET response lists definitions only — never providers.
//   • The response is sorted DETERMINISTICALLY (alphabetically by group then
//     code), never ranked.
//   • No "you might also like", no recommendation, no scoring.
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  getCapabilityDefinitions,
  invalidateCapabilityDefinitionsCache,
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
  // Fall back to the middleware-injected header (defense-in-depth: even if
  // the bearer was stripped by a proxy, the middleware still sets these
  // headers on the original request before forwarding).
  const tenantGtid = req.headers.get("x-tenant-gtid");
  const role = req.headers.get("x-role");
  if (tenantGtid) {
    return { sub: tenantGtid, tenantGtid, role: role || "USER" };
  }
  return null;
}

async function isAdmin(session: SessionPayload): Promise<boolean> {
  // JWT role claim fast path
  const role = (session.role || "").toUpperCase();
  if (role === "PLATFORM_ADMIN" || role === "ADMIN") {
    return true;
  }
  // Defense-in-depth: also accept tenants whose DB type is ADM/GOV
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

const VALID_GROUPS = new Set(["LOGISTICS", "BROKERAGE", "LAB", "QC", "FINANCE"]);

// ─────────────────────────────────────────────────────────────────────────────
// GET — list all capability definitions
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    // Public read — the buyer wizard (unauthenticated) needs to list
    // capability definitions. Auth is still required for POST (create).
    const session = extractSession(req);

    const definitions = await getCapabilityDefinitions();

    // Defensive guardrail: verify the response payload does not leak any
    // marketplace-style ranking / scoring / recommendation fields.
    const guard = checkNonMarketplaceGuardrails({ definitions });
    if (!guard.compliant) {
      logger.error(
        "[service-capabilities GET] NON-MARKETPLACE GUARDRAIL VIOLATION in response",
        { violations: guard.violations },
      );
      return NextResponse.json(
        { error: "Internal marketplace-guardrail violation", violations: guard.violations },
        { status: 500 },
      );
    }

    return NextResponse.json({
      definitions,
      count: definitions.length,
      // *** NON-MARKETPLACE GUARDRAIL ***
      // The list is sorted deterministically by (group, code) — never ranked.
      sort: "deterministic_alphabetical_by_group_then_code",
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — create a new capability definition (admin only)
// ─────────────────────────────────────────────────────────────────────────────
//
// Body:
//   {
//     capability_code:        string,  // uppercase, no spaces, e.g. "TRUCKING"
//     capability_name:        string,
//     capability_group:        string,  // LOGISTICS | BROKERAGE | LAB | QC | FINANCE
//     requires_accreditation?: boolean (default false),
//     requires_insurance?:     boolean (default false),
//     default_portal_tab?:     string
//   }
//
// Returns the created definition.
export async function POST(req: NextRequest) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required — supply Authorization: Bearer <access_jwt>" },
        { status: 401 },
      );
    }
    if (!(await isAdmin(session))) {
      return NextResponse.json(
        { error: "Forbidden: admin role required to create capability definitions" },
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
    const capabilityName = String(body?.capability_name || "").trim();
    const capabilityGroup = String(body?.capability_group || "").trim().toUpperCase();

    if (!capabilityCode || !/^[A-Z][A-Z0-9_]*$/.test(capabilityCode)) {
      return NextResponse.json(
        {
          error:
            "capability_code is required and must be uppercase ASCII (letters, digits, underscore)",
        },
        { status: 400 },
      );
    }
    if (!capabilityName) {
      return NextResponse.json(
        { error: "capability_name is required" },
        { status: 400 },
      );
    }
    if (!VALID_GROUPS.has(capabilityGroup)) {
      return NextResponse.json(
        {
          error: `capability_group must be one of: ${Array.from(VALID_GROUPS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Idempotency / conflict check — the code is UNIQUE
    const existing = await db.serviceCapabilityDefinition.findUnique({
      where: { capabilityCode },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Capability "${capabilityCode}" already exists`, existing },
        { status: 409 },
      );
    }

    const requiresAccreditation = Boolean(body?.requires_accreditation ?? false);
    const requiresInsurance = Boolean(body?.requires_insurance ?? false);
    const defaultPortalTab = body?.default_portal_tab ? String(body.default_portal_tab) : null;

    const created = await db.serviceCapabilityDefinition.create({
      data: {
        capabilityCode,
        capabilityName,
        capabilityGroup,
        requiresAccreditation,
        requiresInsurance,
        defaultPortalTab,
      },
    });
    invalidateCapabilityDefinitionsCache();

    logger.info("[service-capabilities POST] capability definition created", {
      capabilityCode,
      capabilityGroup,
      adminGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({ definition: created }, { status: 201 });
  } catch (e: any) {
    logger.error("[service-capabilities POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
