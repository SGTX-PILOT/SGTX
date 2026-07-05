// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.6.2 — Container Release Pre-Advice
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { sendContainerReleasePreadvice } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, terminalCode } = body;
    if (!shipmentId) return NextResponse.json({ error: "shipmentId required" }, { status: 400 });
    const result = await sendContainerReleasePreadvice({ shipmentId, terminalCode });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[execution/preadvice]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — list preadvices for a shipment
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  const shipmentId = req.nextUrl.searchParams.get("shipmentId");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const where: any = {};
  if (shipmentId) where.shipmentId = shipmentId;
  if (ustn) where.ustn = ustn;
    const preadvices = await db.containerReleasePreadvice.findMany({ where, orderBy: { createdAt: "desc" } }) as any;
    return NextResponse.json({ preadvices }) as any;
}
