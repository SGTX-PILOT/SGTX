// @ts-nocheck
// DCSA Load List & Bay Plan API
import { NextRequest, NextResponse } from "next/server";
import { createLoadListBayPlan } from "@/lib/sgtx/dcsa";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vesselImo = searchParams.get("vesselImo");
    const where: any = {};
    if (vesselImo) where.vesselImo = vesselImo;
    const plans = await db.dcsaLoadListBayPlan.findMany({ where, orderBy: { planDate: "desc" }, take: 50 });
    return NextResponse.json({ ok: true, plans });
  } catch (err: any) {
    logger.error("[api/dcsa/loadlist] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const plan = await createLoadListBayPlan(body);
    return NextResponse.json({ ok: true, plan });
  } catch (err: any) {
    logger.error("[api/dcsa/loadlist] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
