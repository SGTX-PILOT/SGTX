import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";

// POST /api/sgtx/release/override — Manual emergency override (Part 8.11)
// Body: { ustn, reason, issuedBy } — creates a 1-hour override token
export async function POST(req: NextRequest) {
  try {
    const { ustn, reason, issuedBy } = await req.json();
    if (!ustn || !reason || !issuedBy) return NextResponse.json({ error: "ustn, reason, issuedBy required" }, { status: 400 });
    if (reason.length < 10) return NextResponse.json({ error: "Reason must be at least 10 characters" }, { status: 400 });

    const token = createHash("sha256").update(ustn + Date.now() + Math.random()).digest("hex").slice(0, 32);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const override = await db.releaseOverride.create({
      data: { ustn, overrideToken: token, reason, issuedBy, expiresAt },
    });

    await db.inboxItem.create({
      data: { tenantGtid: "SGTX-EG-GOV-000001-9A0B", category: "COMPLIANCE", priority: 90, title: `Release Override Issued: ${ustn.slice(0, 20)}...`, description: `Manual override by ${issuedBy}. Reason: ${reason}. Expires: ${expiresAt.toISOString()}. Token: ${token.slice(0, 8)}...` },
    });

    return NextResponse.json({ ok: true, overrideId: override.id, token, expiresAt });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
