// @ts-nocheck
// SGTX Part 72 — Dwell-Time Optimization Engine (A1/A2 advisory only)
// GET /api/sgtx/dwell-time?ustn=USTN...
import { NextResponse } from "next/server";
import { calculateDwellRisk } from "@/lib/sgtx/dwell-time";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await calculateDwellRisk(ustn);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/sgtx/dwell-time] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
