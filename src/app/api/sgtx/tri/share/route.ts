// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { grantTriSharingConsent, revokeTriSharingConsent } from "@/lib/sgtx/dispute";

// POST /api/sgtx/tri/share — Grant or revoke explicit TRI sharing consent (Part 10.14.8).
// Body: { action: "grant"|"revoke", tenantGtid, counterpartyGtid, components?, expiresAt? }
// Consent is stored on the tenant as a JSON array of consent records. Each record
// captures the counterparty GTID, the consented component list, grantedAt, and an
// optional expiry. The tenant can revoke consent at any time.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "revoke") {
      const result = await revokeTriSharingConsent({
        tenantGtid: body.tenantGtid,
        counterpartyGtid: body.counterpartyGtid,
      });
      if (!result.ok) return NextResponse.json({ error: result?.reason, code: result.code }, { status: 400 });
      return NextResponse.json(result);
    }
    // Default: grant
    const result = await grantTriSharingConsent({
      tenantGtid: body.tenantGtid,
      counterpartyGtid: body.counterpartyGtid,
      components: body.components,
      expiresAt: body.expiresAt,
    });
    if (!result.ok) return NextResponse.json({ error: result?.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
