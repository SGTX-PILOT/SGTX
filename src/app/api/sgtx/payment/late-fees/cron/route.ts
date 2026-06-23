// POST /api/sgtx/payment/late-fees/cron
// Daily late-fee calculator cron (Part 6.9.2).
// Checks fee_payment_requests where status='PENDING' and due_date < NOW().
// Accrues 0.1%/day late fee (capped at 100%), persists LateFeeEvent, sends Smart Inbox reminders.
import { NextRequest, NextResponse } from "next/server";
import { runLateFeeCron } from "@/lib/sgtx/payment/late-fees";

export async function POST() {
  try {
    const result = await runLateFeeCron();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (e: any) {
    console.error("[payment/late-fees/cron]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await runLateFeeCron();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (e: any) {
    console.error("[payment/late-fees/cron GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
