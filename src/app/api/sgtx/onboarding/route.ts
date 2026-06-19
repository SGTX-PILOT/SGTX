import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";

// POST /api/sgtx/onboarding/generate-gtid
// Body: { country, type, legalName, createTenant? } → generates provisional GTID with CRC32 checksum
// If createTenant=true, also creates a Tenant record with lifecycle_state=REGISTERED
export async function POST(req: NextRequest) {
  const { country, type, legalName, createTenant } = await req.json();
  if (!country || !type) return NextResponse.json({ error: "country + type required" }, { status: 400 });

  // Find next sequence for (country, type)
  const existing = await db.tenant.findMany({
    where: { country, type },
    select: { gtid: true },
  });
  // Extract sequences and find max
  let maxSeq = 0;
  for (const t of existing) {
    const match = t.gtid.match(/SGTX-\w{2}-\w{3}-(\d{6})-/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  const sequence = String(maxSeq + 1).padStart(6, "0");

  // CRC32-ISO-HDLC checksum (4 hex digits)
  const checksum = crc32(`${country}${type}${sequence}`).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  const gtid = `SGTX-${country}-${type}-${sequence}-${checksum}`;

  // Create Tenant record if requested (blueprint 2.2.2 Step 1)
  if (createTenant) {
    const existingTenant = await db.tenant.findUnique({ where: { gtid } });
    if (!existingTenant) {
      await db.tenant.create({
        data: {
          gtid,
          legalName: legalName || `New ${type} Tenant`,
          type,
          country,
          trustScore: 50,
          sanctionsCleared: false,
          lifecycleState: "REGISTERED",
          kybTier: 0,
        },
      });

      // Smart Inbox welcome message
      await db.inboxItem.create({
        data: {
          tenantGtid: gtid,
          category: "GENERAL",
          priority: 50,
          title: "Welcome to SGTX — Complete your onboarding",
          description: `Your GTID ${gtid} has been registered. Complete KYB verification to unlock trade execution capabilities.`,
          ctaLabel: "Continue Onboarding",
        },
      });

      // Activity log
      await db.activity.create({
        data: {
          action: "TENANT_REGISTERED",
          type: "SUCCESS",
          description: `Tenant ${gtid} registered (${legalName || type}). Lifecycle state: REGISTERED.`,
        },
      });
    }
  }

  return NextResponse.json({ gtid, country, type, sequence, checksum, legalName, tenantCreated: !!createTenant });
}

// CRC32-ISO-HDLC (polynomial 0xEDB88320, same as ZIP/PNG)
function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
