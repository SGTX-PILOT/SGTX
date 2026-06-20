// POST /api/sgtx/tri/cron — recalculate TRI for every TRD tenant.
// Returns { processed, errors }.
// Intended to be invoked by a daily scheduler (e.g. system cron, Vercel Cron,
// or the Admin "Recalculate TRI" button). Safe to call repeatedly — each call
// appends a fresh TriHistory row per tenant.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateTri } from "@/lib/sgtx/dispute";

export async function POST() {
  const tenants = await db.tenant.findMany({
    where: { type: "TRD" },
    select: { gtid: true },
  });
  let processed = 0;
  const errors: { gtid: string; error: string }[] = [];
  for (const t of tenants) {
    try {
      await calculateTri(t.gtid);
      processed++;
    } catch (e: any) {
      errors.push({ gtid: t.gtid, error: e?.message || String(e) });
    }
  }
  return NextResponse.json({ processed, errors, total: tenants.length });
}
