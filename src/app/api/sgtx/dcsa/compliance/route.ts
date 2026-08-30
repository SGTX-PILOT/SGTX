// @ts-nocheck
// DCSA Compliance Dashboard API
import { NextRequest, NextResponse } from "next/server";
import { getDcsaComplianceSummary } from "@/lib/sgtx/dcsa";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const carrierGtid = searchParams.get("carrierGtid") || undefined;
    const summary = await getDcsaComplianceSummary(carrierGtid);
    return NextResponse.json({ ok: true, summary });
  } catch (err: any) {
    logger.error("[api/dcsa/compliance] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
