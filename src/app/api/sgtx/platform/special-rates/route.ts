import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/platform/special-rates?targetGtid= — list special rates (filterable)
// GET /api/sgtx/platform/special-rates — list all special rates
export async function GET(req: NextRequest) {
  const targetGtid = req.nextUrl.searchParams.get("targetGtid");
  const activeOnly = req.nextUrl.searchParams.get("active") === "true";
  const where: any = {};
  if (targetGtid) where.targetGtid = targetGtid;
  if (activeOnly) where.isActive = true;

  const rates = await _db.specialRate.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ ok: true, rates, total: rates.length });
}

// POST /api/sgtx/platform/special-rates — create a special rate for a GTID
// Body: { targetGtid, rateType, rateValue, originalRate, reason, validUntil?, grantedBy }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { targetGtid, rateType, rateValue, originalRate, reason, validUntil, grantedBy } = body;

  if (!targetGtid || !rateType || rateValue === undefined || !grantedBy) {
    return NextResponse.json({ error: "targetGtid, rateType, rateValue, grantedBy required" }, { status: 400 });
  }

  const validTypes = ["SGTX_FEE", "CUSTOMS_FEE", "PROCESSING_FEE"];
  if (!validTypes.includes(rateType)) {
    return NextResponse.json({ error: `rateType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Validate target tenant exists
  const tenant = await _db.tenant.findUnique({ where: { gtid: targetGtid } });
  if (!tenant) return NextResponse.json({ error: `Tenant ${targetGtid} not found` }, { status: 404 });

  // Check for existing active rate of same type
  const existing = await _db.specialRate.findFirst({
    where: { targetGtid, rateType, isActive: true },
  });
  if (existing) {
    // Deactivate the old one
    await _db.specialRate.update({ where: { id: existing.id }, data: { isActive: false } });
  }

  const rateId = `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const rate = await _db.specialRate.create({
    data: {
      rateId,
      targetGtid,
      rateType,
      rateValue: parseFloat(rateValue),
      originalRate: parseFloat(originalRate || 1.5),
      reason: reason || "Special rate granted",
      validUntil: validUntil ? new Date(validUntil) : null,
      isActive: true,
      grantedBy,
    },
  });

  // Activity log
  await _db.activity.create({
    data: {
      actorGtid: grantedBy,
      action: "SPECIAL_RATE_GRANTED",
      type: "SUCCESS",
      description: `Special ${rateType} rate of ${rateValue}% granted to ${tenant.legalName} (${targetGtid}). Original: ${originalRate || 1.5}%. Reason: ${reason || "N/A"}. Rate ID: ${rateId}.`,
    },
  }).catch(() => null);

  // Smart Inbox to the tenant
  await _db.inboxItem.create({
    data: {
      tenantGtid: targetGtid,
      category: "GENERAL",
      priority: 70,
      title: `Special ${rateType} Rate Granted`,
      description: `You have been granted a special ${rateType} rate of ${rateValue}% (standard: ${originalRate || 1.5}%). Reason: ${reason || "N/A"}. ${validUntil ? `Valid until: ${validUntil}.` : "Valid indefinitely."}`,
      ctaLabel: "View Details",
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, rate, message: `Special ${rateType} rate of ${rateValue}% granted to ${tenant.legalName}.` });
}
