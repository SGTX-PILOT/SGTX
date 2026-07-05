// 3B.7.1 — Milestone Payment Schedule (get + preapprove)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { preapproveMilestoneSchedule } from "@/lib/sgtx/settlement";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const schedule = await db.milestonePaymentSchedule.findUnique({ where: { ustn } });
  if (!schedule) return NextResponse.json({ schedule: null });
  return NextResponse.json({
    schedule: {
      ...schedule,
      scheduleJson: JSON.parse(schedule.scheduleJson),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, schedule, totalAmount, buyerGtid } = body;
    if (!ustn || !Array.isArray(schedule) || !totalAmount || !buyerGtid) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await preapproveMilestoneSchedule({ ustn, tradeId, schedule, totalAmount, buyerGtid });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[settlement/milestone-schedule]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
