// SGTX Platform — Part 18: Egyptian PDPL Compliance — Consent Management
// GET  /api/sgtx/pdpl/consent?tenantGtid=...        → list consent records
// POST /api/sgtx/pdpl/consent                        → upsert consent for a purpose
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { isValidPurpose, nextVersion } from "@/lib/sgtx/pdpl";

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) {
      return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    }

    const consents = await db.consentRecord.findMany({
      where: { tenantGtid },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ consents });
  } catch (e: any) {
    logger.error("[pdpl/consent GET]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list consent records" },
      { status: 500 },
    );
  }
}

// ── POST ───────────────────────────────────────────────────────────────────
// Body: { tenantGtid, purpose, consentGiven, ipAddress?, userAgent?, deviceId? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantGtid, purpose, consentGiven, ipAddress, userAgent, deviceId } = body;

    if (!tenantGtid || !purpose) {
      return NextResponse.json({ error: "tenantGtid and purpose are required" }, { status: 400 });
    }
    if (!isValidPurpose(purpose)) {
      return NextResponse.json(
        { error: "Invalid purpose. Must be one of: marketing, analytics, govt_sharing, cross_border, voice_biometric, trade_memory" },
        { status: 400 },
      );
    }

    const consentGivenBool = !!consentGiven;
    const now = new Date();
    const timestamp = now.toISOString();

    // Loom hash — sha256(tenantGtid + purpose + consentGiven + timestamp)
    const loomHash = createHash("sha256")
      .update(`${tenantGtid}|${purpose}|${consentGivenBool ? "true" : "false"}|${timestamp}`)
      .digest("hex");

    // ConsentRecord is unique per (tenantGtid, purpose). The Prisma schema does
    // not declare a composite unique constraint, so resolve manually then
    // update or create.
    const existing = await db.consentRecord.findFirst({
      where: { tenantGtid, purpose },
    });

    const version = existing ? nextVersion(existing.version) : "1.0";

    const data = {
      tenantGtid,
      purpose,
      consentGiven: consentGivenBool,
      version,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      deviceId: deviceId || null,
      loomHash,
      // Clear withdrawnAt when consent is re-given; set when withdrawn.
      withdrawnAt: consentGivenBool ? null : now,
    };

    let consent;
    if (existing) {
      consent = await db.consentRecord.update({ where: { id: existing.id }, data });
    } else {
      consent = await db.consentRecord.create({ data });
    }

    return NextResponse.json({ ok: true, consent });
  } catch (e: any) {
    logger.error("[pdpl/consent POST]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to set consent" },
      { status: 500 },
    );
  }
}
