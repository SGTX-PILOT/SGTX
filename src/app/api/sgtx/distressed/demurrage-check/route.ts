// 3B.8.1 — Proactive Demurrage Check (cron-style)
import { NextRequest, NextResponse } from "next/server";
import { checkDemurrageRisk } from "@/lib/sgtx/distressed";

export async function POST() {
  const result = await checkDemurrageRisk();
  return NextResponse.json(result);
}
