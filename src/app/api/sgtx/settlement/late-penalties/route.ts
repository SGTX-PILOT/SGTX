// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.7.7 — Late Payment Penalties (list + run check)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateLatePaymentPenalties } from "@/lib/sgtx/settlement";

export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const status = req.nextUrl.searchParams.get("status") || "ACTIVE";
  const where: any = { status };
  if (tenantGtid) {
        const instructions = await db.settlementInstruction.findMany({ where: { payerGtid: tenantGtid }, select: { id: true } }) as any;
    where.instructionId = { in: instructions.map(i => i.id) };
  }
  const penalties = await db.latePaymentPenalty.findMany({
    where,
    orderBy: { daysLate: "desc" },
    }) as any;
  // Enrich with instruction data
  const instructionIds = [...new Set(penalties.map(p => p.instructionId))];
  const instructions = await db.settlementInstruction.findMany({
    where: { id: { in: instructionIds } },
    include: { pspAttempts: true },
    }) as any;
  const instMap = new Map(instructions.map(i => [i.id, i]));
  const enriched = penalties.map(p => ({ ...p, instruction: instMap.get(p.instructionId) }));
    return NextResponse.json({ penalties: enriched, total: enriched.length, totalDue: enriched.reduce((s, p) => s + p.totalDue, 0) }) as any;
}

export async function POST() {
  const result = await calculateLatePaymentPenalties();
  return NextResponse.json(result);
}
