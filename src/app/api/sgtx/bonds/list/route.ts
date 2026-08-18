// GET /api/sgtx/bonds/list — list bonds for a tenant
//   ?tenantGtid=X         (required) — filter bonds by tenant GTID
//   ?status=ACTIVE        (optional) — filter by status
//   ?jurisdiction=EG      (optional) — filter by jurisdiction
//   ?limit=50             (optional, default 50, max 200)
//   ?offset=0             (optional, default 0)
//
// Tenant-scoped by query param — no session required (same pattern as the
// seller routes). PUBLIC_ROUTES already includes this endpoint.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "DRAFT",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "PARTIALLY_UTILISED",
  "FULLY_UTILISED",
  "EXPIRING",
  "EXPIRED",
  "CANCELLED",
]);

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl ?? new URL(req.url);
    const tenantGtid = url.searchParams.get("tenantGtid");
    if (!tenantGtid) {
      return NextResponse.json(
        { ok: false, error: "tenantGtid query param is required" },
        { status: 400 },
      );
    }
    const status = url.searchParams.get("status") || undefined;
    if (status && !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
        },
        { status: 400 },
      );
    }
    const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
    const limitRaw = parseInt(url.searchParams.get("limit") || "50", 10);
    const offsetRaw = parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: Record<string, unknown> = { tenantGtid };
    if (status) where.status = status;
    if (jurisdiction) where.jurisdiction = jurisdiction.toUpperCase();

    const [bonds, total] = await Promise.all([
      db.customsBond.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          allocations: {
            where: { status: "ACTIVE" },
            select: { id: true, allocatedAmount: true, ustn: true, allocatedAt: true },
          },
        },
      }),
      db.customsBond.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      bonds,
      total,
      limit,
      offset,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/list] error", { msg, raw: String(e) });
    return NextResponse.json(
      { ok: false, error: msg || "list failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/list",
    description: "List bonds for a tenant (tenant-scoped by query param)",
    queryParams: {
      tenantGtid: "required",
      status: "optional — DRAFT|PENDING_VERIFICATION|ACTIVE|PARTIALLY_UTILISED|FULLY_UTILISED|EXPIRING|EXPIRED|CANCELLED",
      jurisdiction: "optional — EG|EU|US|AE|SA|GB",
      limit: "default 50, max 200",
      offset: "default 0",
    },
  });
}
