// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { getCBRDashboard } = await import("@/lib/sgtx/customs-gateway/cbr-portal-extension");
    const brokerGtid = req.nextUrl.searchParams.get("brokerGtid") || "";
    const data = await getCBRDashboard(brokerGtid);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) { logger.error("[cbr-dashboard] error:", e); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
