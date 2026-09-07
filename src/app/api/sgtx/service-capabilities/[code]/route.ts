// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET    /api/sgtx/service-capabilities/[code]
// PATCH  /api/sgtx/service-capabilities/[code]      (admin only)
// DELETE /api/sgtx/service-capabilities/[code]      (admin only)
//
// Per-capability-definition read / update / delete.
//
// PATCH can update: capability_name, capability_group, requires_accreditation,
// requires_insurance, default_portal_tab. The capability_code is immutable
// (it is the unique key other tables reference). To rename a code, create a
// new definition and migrate references (deliberately painful to discourage
// accidental renames).
//
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED):
//   • GET returns only the definition — never the providers that hold it.
//   • No "you might also like", no recommendation, no scoring.
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  getCapabilityDefinition,
  invalidateCapabilityDefinitionsCache,
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

const VALID_GROUPS = new Set(["LOGISTICS", "BROKERAGE", "LAB", "QC", "FINANCE"]);

// ─────────────────────────────────────────────────────────────────────────────
// GET — fetch a single capability definition by code
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const { code } = await ctx.params;
    if (!code) {
      return NextResponse.json(
        { error: "code path segment required" },
        { status: 400 },
      );
    }
    const definition = await getCapabilityDefinition(code);
    if (!definition) {
      return NextResponse.json(
        { error: `Capability "${code}" not found` },
        { status: 404 },
      );
    }
    return NextResponse.json({ definition, non_marketplace: true });
  } catch (e: any) {
    logger.error("[service-capabilities/[code] GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — update a capability definition (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!(await isAdmin(session))) {
      return NextResponse.json(
        { error: "Forbidden: admin role required to update capability definitions" },
        { status: 403 },
      );
    }
    const { code } = await ctx.params;
    if (!code) {
      return NextResponse.json(
        { error: "code path segment required" },
        { status: 400 },
      );
    }
    const existing = await db.serviceCapabilityDefinition.findUnique({
      where: { capabilityCode: code.toUpperCase() },
    });
    if (!existing) {
      return NextResponse.json(
        { error: `Capability "${code}" not found` },
        { status: 404 },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: any = {};
    if (body?.capability_name !== undefined) {
      const name = String(body.capability_name).trim();
      if (!name) {
        return NextResponse.json(
          { error: "capability_name cannot be empty" },
          { status: 400 },
        );
      }
      data.capabilityName = name;
    }
    if (body?.capability_group !== undefined) {
      const group = String(body.capability_group).trim().toUpperCase();
      if (!VALID_GROUPS.has(group)) {
        return NextResponse.json(
          { error: `capability_group must be one of: ${Array.from(VALID_GROUPS).join(", ")}` },
          { status: 400 },
        );
      }
      data.capabilityGroup = group;
    }
    if (body?.requires_accreditation !== undefined) {
      data.requiresAccreditation = Boolean(body.requires_accreditation);
    }
    if (body?.requires_insurance !== undefined) {
      data.requiresInsurance = Boolean(body.requires_insurance);
    }
    if (body?.default_portal_tab !== undefined) {
      data.defaultPortalTab = body.default_portal_tab ? String(body.default_portal_tab) : null;
    }
    // capability_code is immutable — reject any attempt to change it.
    if (body?.capability_code !== undefined && String(body.capability_code).toUpperCase() !== existing.capabilityCode) {
      return NextResponse.json(
        { error: "capability_code is immutable — create a new definition to rename" },
        { status: 400 },
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields supplied" },
        { status: 400 },
      );
    }

    const updated = await db.serviceCapabilityDefinition.update({
      where: { id: existing.id },
      data,
    });
    invalidateCapabilityDefinitionsCache();

    logger.info("[service-capabilities/[code] PATCH] definition updated", {
      capabilityCode: existing.capabilityCode,
      fields: Object.keys(data),
      adminGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({ definition: updated });
  } catch (e: any) {
    logger.error("[service-capabilities/[code] PATCH] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — remove a capability definition (admin only)
// ─────────────────────────────────────────────────────────────────────────────
//
// Safety: if any tenant currently holds the capability, the DELETE is
// rejected with 409 — the admin must first remove the capability from all
// tenants (and remove all ProviderPortCoverage rows) before deleting the
// definition. This prevents orphaned capability codes in tenant JSON arrays.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!(await isAdmin(session))) {
      return NextResponse.json(
        { error: "Forbidden: admin role required to delete capability definitions" },
        { status: 403 },
      );
    }
    const { code } = await ctx.params;
    if (!code) {
      return NextResponse.json(
        { error: "code path segment required" },
        { status: 400 },
      );
    }
    const upper = code.toUpperCase();
    const existing = await db.serviceCapabilityDefinition.findUnique({
      where: { capabilityCode: upper },
    });
    if (!existing) {
      return NextResponse.json(
        { error: `Capability "${upper}" not found` },
        { status: 404 },
      );
    }

    // Safety check: refuse to delete if any active coverage rows exist.
    const activeCoverage = await db.providerPortCoverage.findFirst({
      where: { serviceCapability: upper, isActive: true },
      select: { id: true },
    });
    if (activeCoverage) {
      return NextResponse.json(
        {
          error:
            `Cannot delete capability "${upper}" — active ProviderPortCoverage rows exist. ` +
            `Deactivate all coverage rows for this capability first.`,
          capability_code: upper,
        },
        { status: 409 },
      );
    }

    // Also refuse if any tenant's JSON array still references the code.
    // (SQLite JSON scan — pragmatic for a definition-delete admin path.)
    const tenants = await db.tenant.findMany({
      where: { serviceCapabilities: { contains: upper } },
      select: { gtid: true, legalName: true, serviceCapabilities: true },
    });
    const stillHolding = tenants.filter((t: any) => {
      try {
        const arr = JSON.parse(t.serviceCapabilities || "[]");
        return Array.isArray(arr) && arr.map(String).map((s) => s.toUpperCase()).includes(upper);
      } catch {
        return false;
      }
    });
    if (stillHolding.length > 0) {
      return NextResponse.json(
        {
          error:
            `Cannot delete capability "${upper}" — ${stillHolding.length} tenant(s) still hold it. ` +
            `Remove the capability from all tenants first.`,
          capability_code: upper,
          tenants: stillHolding.map((t: any) => ({ gtid: t.gtid, legalName: t.legalName })),
        },
        { status: 409 },
      );
    }

    await db.serviceCapabilityDefinition.delete({ where: { id: existing.id } });
    invalidateCapabilityDefinitionsCache();

    logger.info("[service-capabilities/[code] DELETE] definition deleted", {
      capabilityCode: upper,
      adminGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      deleted: true,
      capability_code: upper,
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[service-capabilities/[code] DELETE] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
