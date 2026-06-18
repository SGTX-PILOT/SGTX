import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/gtid/resolve?gtid=SGTX-EG-TRD-002139-7F3A  (Part 2.1)
// Returns ONLY consented public info — no private trade data, no emails, no bank details
export async function GET(req: NextRequest) {
  const gtid = req.nextUrl.searchParams.get("gtid");
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });

  const tenant = await db.tenant.findUnique({ where: { gtid } });
  if (!tenant) return NextResponse.json({ error: "GTID not found" }, { status: 404 });

  // Only return consented public fields (Part 2.1)
  return NextResponse.json({
    legal_name: tenant.legalName,
    type: tenant.type,
    jurisdiction: tenant.country,
    trust_score: tenant.trustScore,
    kyb_tier: tenant.kybTier,
    sanctions_cleared: tenant.sanctionsCleared,
    lifecycle_state: tenant.lifecycleState,
  });
}
