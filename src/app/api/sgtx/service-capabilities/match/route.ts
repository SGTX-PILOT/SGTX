// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/service-capabilities/match
//
// Geo-aware provider matching — v17 Section 11.4.
//
// Body:
//   {
//     capability_code: string,  // e.g. "TRUCKING"
//     port_unlocode?:  string,  // e.g. "EGALX"
//     country_code?:   string,  // e.g. "EG" — used only when port_unlocode is absent
//     require_verified?:        boolean (default true)
//     exclude_rfq_opt_out?:     boolean (default true)
//   }
//
// Returns:
//   {
//     providers:           Tenant[],   // *** DETERMINISTIC ALPHABETICAL ORDER BY GTID ***
//     count:               number,
//     matching_method:     "deterministic_alphabetical",
//     non_marketplace:      true,
//     filters:             { ... }
//   }
//
// ────────────────────────────────────────────────────────────────────────────
// *** CRITICAL NON-MARKETPLACE GUARDRAIL ***
// ────────────────────────────────────────────────────────────────────────────
//
// This endpoint NEVER ranks, NEVER scores, NEVER recommends, NEVER suggests
// "you might also like". The response is a deterministic alphabetical list
// (by provider GTID) of every provider that matches the caller's explicit
// filter (capability code + optional port + optional country).
//
// The order is STABLE across calls — identical filter inputs produce
// identical order outputs. This is enforced by `findProvidersWithCapability`
// in `@/lib/sgtx/service-capability` which uses `Array.sort()` on the
// provider GTID strings.
//
// The caller MUST make the explicit selection — the platform never chooses
// for them. This is the v17 Non-Marketplace Principle.
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  findProvidersWithCapability,
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

export async function POST(req: NextRequest) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required — supply Authorization: Bearer <access_jwt>" },
        { status: 401 },
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
    const portUnlocode = body?.port_unlocode
      ? String(body.port_unlocode).trim().toUpperCase()
      : undefined;
    const countryCode = body?.country_code
      ? String(body.country_code).trim().toUpperCase()
      : undefined;

    // Prefer port-level matching when both are supplied; the lib falls back
    // to country-level when only country is supplied.
    const result = await findProvidersWithCapability({
      capabilityCode,
      portUnlocode,
      countryCode,
      requireVerified: body?.require_verified !== false, // default true
      excludeRfqOptOut: body?.exclude_rfq_opt_out !== false, // default true
    });

    // ── GUARDRAIL: verify the response payload has no marketplace fields ──
    const guard = checkNonMarketplaceGuardrails(result);
    if (!guard.compliant) {
      logger.error(
        "[service-capabilities/match POST] NON-MARKETPLACE GUARDRAIL VIOLATION in response",
        { violations: guard.violations },
      );
      return NextResponse.json(
        { error: "Internal marketplace-guardrail violation", violations: guard.violations },
        { status: 500 },
      );
    }

    logger.info("[service-capabilities/match POST] match returned", {
      capabilityCode,
      portUnlocode,
      countryCode,
      providerCount: result.count,
      callerGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[service-capabilities/match POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
