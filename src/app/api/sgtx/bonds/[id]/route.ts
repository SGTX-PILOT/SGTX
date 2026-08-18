// GET /api/sgtx/bonds/[id] — Get bond details by id
//   Returns the bond record with active allocations and utilisation summary.
//
// PATCH /api/sgtx/bonds/[id] — Update mutable fields on a bond
//   Allowed: status, bondReference, issuerName, issuerGtid, coveragePercentage,
//            validFrom, validTo, issuedDate, certificateUrl, currency, amount.
//   Note: verification (verified/verifiedAt) is set by /verify, not PATCH.

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

const PATCHABLE_FIELDS = new Set([
  "status",
  "bondReference",
  "issuerName",
  "issuerGtid",
  "coveragePercentage",
  "validFrom",
  "validTo",
  "issuedDate",
  "certificateUrl",
  "currency",
  "amount",
]);

function toIsoDate(v: unknown): Date | undefined {
  if (!v || typeof v !== "string") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const bond = await db.customsBond.findUnique({
      where: { id },
      include: {
        allocations: {
          orderBy: { allocatedAt: "desc" },
          take: 100,
        },
        utilizations: {
          orderBy: { utilisedAt: "desc" },
          take: 100,
        },
      },
    });
    if (!bond) {
      return NextResponse.json({ error: `Bond ${id} not found` }, { status: 404 });
    }
    // Computed summary
    const allocatedActive = bond.allocations
      .filter((a) => a.status === "ACTIVE")
      .reduce((s, a) => s + (a.allocatedAmount || 0), 0);
    const utilised = bond.utilizations.reduce(
      (s, u) => s + (u.utilisedAmount || 0) - (u.releasedAmount || 0),
      0,
    );
    return NextResponse.json({
      ok: true,
      bond,
      summary: {
        faceAmount: bond.amount,
        allocatedActive,
        utilised,
        available: Math.max(0, bond.amount - allocatedActive),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/[id]/GET] error", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!PATCHABLE_FIELDS.has(k)) continue;
      if (k === "status" && typeof v === "string" && !ALLOWED_STATUSES.has(v)) {
        return NextResponse.json(
          {
            error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
          },
          { status: 400 },
        );
      }
      if (
        (k === "validFrom" || k === "validTo" || k === "issuedDate") &&
        typeof v === "string"
      ) {
        updates[k] = toIsoDate(v);
      } else if (k === "amount" || k === "coveragePercentage") {
        const n = typeof v === "string" ? parseFloat(v) : Number(v);
        if (!Number.isFinite(n)) {
          return NextResponse.json(
            { error: `${k} must be a number` },
            { status: 400 },
          );
        }
        updates[k] = n;
      } else {
        updates[k] = v;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No patchable fields supplied" },
        { status: 400 },
      );
    }

    const updated = await db.customsBond.update({ where: { id }, data: updates as never });
    logger.info("Bond updated", { bondId: id, fields: Object.keys(updates) });
    return NextResponse.json({ ok: true, bond: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/[id]/PATCH] error", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
