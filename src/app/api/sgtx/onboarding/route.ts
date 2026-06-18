import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";

// POST /api/sgtx/onboarding/generate-gtid
// Body: { country, type } → generates provisional GTID with CRC32 checksum
export async function POST(req: NextRequest) {
  const { country, type, legalName } = await req.json();
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

  return NextResponse.json({ gtid, country, type, sequence, checksum, legalName });
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
