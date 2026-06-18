import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerDevice } from "@/lib/sgtx/governor/constitutional-addons";

// POST /api/sgtx/device/register  { tenantGtid, deviceFingerprint, deviceName, platform, lastSeenIp?, lastSeenCountry? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.tenantGtid || !body.deviceFingerprint) return NextResponse.json({ error: "tenantGtid + deviceFingerprint required" }, { status: 400 });
  // Check if device already exists
  const existing = await db.deviceTrust.findUnique({ where: { deviceFingerprint: body.deviceFingerprint } });
  if (existing) {
    return NextResponse.json({ id: existing.id, state: existing.state, riskScore: existing.riskScore, message: "Device already registered" });
  }
  const result = await registerDevice(body);
  return NextResponse.json(result);
}
