// 3B.7.4 — Deferred Government Fees (list + trigger)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { triggerDeferredFees } from "@/lib/sgtx/settlement";

export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const status = req.nextUrl.searchParams.get("status");
  const where: any = {};
  if (tenantGtid) where.OR = [{ payerGtid: tenantGtid }, { payeeGtid: tenantGtid }];
  if (ustn) where.ustn = ustn;
  if (status) where.status = status;
  const fees = await db.deferredFee.findMany({ where, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ fees, total: fees.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, milestoneType } = body;
    if (!ustn || !milestoneType) return NextResponse.json({ error: "ustn and milestoneType required" }, { status: 400 });
    const result = await triggerDeferredFees(ustn, milestoneType);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[settlement/deferred-fees]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
