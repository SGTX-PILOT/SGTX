import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/platform/special-rates/[rateId] — get single rate
export async function GET(req: NextRequest, { params }: { params: Promise<{ rateId: string }> }) {
  const { rateId } = await params;
  const rate = await _db.specialRate.findUnique({ where: { rateId } });
  if (!rate) return NextResponse.json({ error: "Rate not found" }, { status: 404 });
  return NextResponse.json({ ok: true, rate });
}

// DELETE /api/sgtx/platform/special-rates/[rateId] — deactivate a rate
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ rateId: string }> }) {
  const { rateId } = await params;
  const body = await req.json().catch(() => ({}));
  const revokedBy = body.revokedBy || "SGTX-ZZ-ADM-000001-A1B2";

  const rate = await _db.specialRate.findUnique({ where: { rateId } });
  if (!rate) return NextResponse.json({ error: "Rate not found" }, { status: 404 });

  await _db.specialRate.update({ where: { rateId }, data: { isActive: false } });

  await _db.activity.create({
    data: {
      actorGtid: revokedBy,
      action: "SPECIAL_RATE_REVOKED",
      type: "WARNING",
      description: `Special ${rate.rateType} rate ${rateId} for ${rate.targetGtid} revoked by ${revokedBy}.`,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, message: `Special rate ${rateId} deactivated.` });
}
