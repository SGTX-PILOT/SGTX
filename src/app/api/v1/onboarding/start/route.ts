import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { generateGtid, signOnboardingToken, checkRateLimit } from "@/lib/v1/auth";

export async function POST(req: NextRequest) {
  try {
    const { entity_type, country, legal_name } = await req.json();
    if (!entity_type || !country || !legal_name) return NextResponse.json({ error: "entity_type, country, legal_name required" }, { status: 400 });
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`onboarding:${ip}`, 5)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

    const seq = Math.floor(Math.random() * 900000) + 100000;
    const gtid = generateGtid(country, entity_type, seq);
    const tenant = await db.tenant.create({ data: { gtid, legalName: legal_name, type: entity_type, country, lifecycleState: "REGISTERED", kybTier: 0, sanctionsCleared: false, trustScore: 0 } });
    const token = signOnboardingToken(gtid);
    await db.inboxItem.create({ data: { tenantGtid: gtid, category: "GENERAL", priority: 50, title: "Welcome to SGTX", description: `Your GTID ${gtid} has been registered. Complete KYB to unlock trade.`, ctaLabel: "Continue" } }).catch(() => null);
    return NextResponse.json({ gtid: tenant.gtid, legal_name: tenant.legalName, entity_type: tenant.type, country: tenant.country, lifecycle_state: tenant.lifecycleState, onboarding_token: token, step: 1, next_step: "organization_details", steps_total: 4 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
