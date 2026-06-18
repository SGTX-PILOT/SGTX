// 3B.5.12.2 — Stablecoin Status / Depeg Monitor
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stablecoinAction } from "@/lib/sgtx/financing";

export async function GET() {
  const statuses = await db.stablecoinStatus.findMany({ orderBy: { symbol: "asc" } });
  const annotated = statuses.map((s) => ({
    ...s,
    action: stablecoinAction(s.deviationPct),
  }));
  return NextResponse.json({ stablecoins: annotated });
}
