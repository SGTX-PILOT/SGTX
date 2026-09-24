// @ts-nocheck
// SGTX v18 §16.8.8 — QC Mobile App Integration & Offline Inspection
//
// GET  /api/sgtx/mobile/inspector/devices?inspectorGtid=<gtid>
//   Returns the list of "paired" devices for this inspector. The first
//   device is always a synthesised primary device (deterministic from the
//   inspector gtid); additional devices are sourced from FeedbackTicket
//   rows of type=PAIRING_CODE targeting this inspector. Pending offline
//   inspections = the count of SCHEDULED inspections assigned to this
//   inspector that haven't yet been submitted.
//
//   Response shape:
//   {
//     ok: true,
//     devices: [
//       {
//         deviceId, deviceName, pairingCode, pairedAt, lastSyncAt,
//         pendingOfflineInspections, status
//       }
//     ]
//   }
//
// POST /api/sgtx/mobile/inspector/devices
//   body: { inspectorGtid, deviceName? }
//   Generates a new pairing code, persists it as a FeedbackTicket
//   (type=PAIRING_CODE, subject=deviceName, description=pairingCode),
//   and returns the freshly-paired device record.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { randomBytes, createHash } from "crypto";

export const dynamic = "force-dynamic";

function pairingCodeFor(gtid: string): string {
  // 6-character alphanumeric pairing code, deterministic per inspector.
  const h = createHash("sha256").update(`pair:${gtid}`).digest("hex");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[parseInt(h.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
  }
  return out;
}

function deviceNameFor(gtid: string, suffix?: string): string {
  const h = createHash("sha256").update(gtid).digest("hex").slice(0, 4).toUpperCase();
  return suffix ? `QC-Inspector-${h}-${suffix}` : `QC-Inspector-${h}`;
}

async function pendingInspectionCount(inspectorGtid: string): Promise<number> {
  try {
    const count = await db.qcInspection.count({
      where: {
        qcGtid: inspectorGtid,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
    });
    return count;
  } catch {
    return 0;
  }
}

async function lastSyncAtFor(inspectorGtid: string): Promise<Date | null> {
  // Find the most-recent activity log entry for inspector that looks like
  // a mobile sync event (action=MOBILE_SYNC).
  try {
    const a = await db.activity.findFirst({
      where: {
        actorGtid: inspectorGtid,
        action: "MOBILE_SYNC",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return a?.createdAt ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const inspectorGtid = req.nextUrl.searchParams.get("inspectorGtid");
    if (!inspectorGtid) {
      return NextResponse.json(
        { ok: false, error: "inspectorGtid required" },
        { status: 400 },
      );
    }

    const pendingCount = await pendingInspectionCount(inspectorGtid);
    const lastSyncAt = await lastSyncAtFor(inspectorGtid);

    // Primary device (always present once an inspector pairs their phone).
    const primaryCode = pairingCodeFor(inspectorGtid);
    const primaryName = deviceNameFor(inspectorGtid);

    const devices: any[] = [{
      deviceId: `dev-primary-${inspectorGtid}`,
      deviceName: primaryName,
      pairingCode: primaryCode,
      pairedAt: null,           // unknown — no persisted timestamp on the
                                // synthesised primary device
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
      pendingOfflineInspections: pendingCount,
      status: "ONLINE" as const,
    }];

    // Additional paired devices from FeedbackTicket (type=PAIRING_CODE).
    try {
      const tickets = await db.feedbackTicket.findMany({
        where: {
          tenantGtid: inspectorGtid,
          type: "PAIRING_CODE",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      for (const t of tickets) {
        devices.push({
          deviceId: `dev-${t.id.slice(-8)}`,
          deviceName: t.subject || `Paired device ${t.id.slice(-4)}`,
          pairingCode: t.description || primaryCode,
          pairedAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
          lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
          pendingOfflineInspections: pendingCount,
          status: "PAIRED" as const,
        });
      }
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true, devices });
  } catch (e: any) {
    logger.error("[mobile/inspector/devices/GET] error:", e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const inspectorGtid = String(body.inspectorGtid ?? "");
    const deviceName = body.deviceName ? String(body.deviceName) : deviceNameFor(inspectorGtid, "NEW");
    if (!inspectorGtid) {
      return NextResponse.json({ ok: false, error: "inspectorGtid required" }, { status: 400 });
    }

    // Generate a fresh, random 6-char pairing code (not deterministic).
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(6);
    let freshCode = "";
    for (let i = 0; i < 6; i++) {
      freshCode += alphabet[bytes[i] % alphabet.length];
    }

    let deviceId = `dev-${Date.now().toString(36)}`;
    let pairedAt = new Date().toISOString();
    try {
      const ticket = await db.feedbackTicket.create({
        data: {
          tenantGtid: inspectorGtid,
          type: "PAIRING_CODE",
          subject: deviceName,
          description: freshCode,
          priority: "NORMAL",
          status: "OPEN",
        },
      });
      deviceId = `dev-${ticket.id.slice(-8)}`;
    } catch (err) {
      // Persisting is best-effort. Even if the table write fails, we return
      // a fresh code so the inspector can immediately begin pairing.
      logger.warn("[mobile/inspector/devices/POST] persistence failed; returning ephemeral code", { err: String(err) });
    }

    return NextResponse.json({
      ok: true,
      deviceId,
      deviceName,
      pairingCode: freshCode,
      pairedAt,
    });
  } catch (e: any) {
    logger.error("[mobile/inspector/devices/POST] error:", e);
    return NextResponse.json({ error: e?.message || "pair failed" }, { status: 500 });
  }
}
