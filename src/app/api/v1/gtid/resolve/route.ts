import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";

// POST /api/v1/gtid/resolve — public GTID resolution (consented public info only).
// Body: { gtid: string }
// Returns ONLY consented public info: legal_name, type, jurisdiction, trust_score, kyb_tier,
// sanctions_cleared, lifecycle_state. NO private data (email, address, bank, etc.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gtid } = body;
    if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });

    const tenant = await db.tenant.findUnique({
      where: { gtid },
      select: {
        gtid: true,
        legalName: true,
        type: true,
        country: true,
        trustScore: true,
        kybTier: true,
        sanctionsCleared: true,
        lifecycleState: true,
        traderMode: true,
        defiAllowed: true,
      },
    });

    // Not-found is a soft 200 — frontend handles `found: false` gracefully without a
    // red network error in the browser DevTools (FIX-1 UX hardening).
    if (!tenant) {
      return NextResponse.json({
        found: false,
        gtid,
        message: "GTID not found in SGTX registry",
      }, { status: 200 });
    }
    if (tenant.lifecycleState === "SUSPENDED") {
      return NextResponse.json({
        found: false,
        error: "GTID is suspended — enhanced due diligence required",
        gtid: tenant.gtid,
        lifecycle_state: tenant.lifecycleState,
      }, { status: 403 });
    }

    return NextResponse.json({
      found: true,
      gtid: tenant.gtid,
      legal_name: tenant.legalName,
      type: tenant.type,
      jurisdiction: tenant.country,
      trust_score: tenant.trustScore,
      kyb_tier: tenant.kybTier,
      sanctions_cleared: tenant.sanctionsCleared,
      lifecycle_state: tenant.lifecycleState,
      trader_mode: tenant.traderMode,
      defi_allowed: tenant.defiAllowed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/v1/gtid/resolve?gtid=... — same as POST but via query param for browser-friendly access
export async function GET(req: NextRequest) {
  const gtid = req.nextUrl.searchParams.get("gtid");
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });
  return POST(new NextRequest(new URL(`/api/v1/gtid/resolve`, req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gtid }),
  }));
}
