// POST /api/sgtx/payment/late-fees — body: { feePaymentRequestId } OR { ustn }
//   Returns late fee calculation for one FPR (or all overdue FPRs for a USTN).
// GET /api/sgtx/payment/late-fees?ustn=... — list all FPRs with late fee status for a USTN.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateLateFees, recalculateDueDateOnLoading, computeTotalDueWithLateFees, LATE_FEE_DAILY_RATE_PCT, LATE_FEE_CAP_PCT } from "@/lib/sgtx/payment/late-fees";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { feePaymentRequestId, ustn, action } = body;

    // Special action: recalculate due date on loading confirmation
    if (action === "recalculate_on_loading" && ustn) {
      const result = await recalculateDueDateOnLoading(ustn);
      return NextResponse.json(result);
    }

    if (feePaymentRequestId) {
      const calc = await calculateLateFees(feePaymentRequestId);
      if (!calc) return NextResponse.json({ error: "FeePaymentRequest not found" }, { status: 404 });
      return NextResponse.json({ calculation: calc, dailyRatePct: LATE_FEE_DAILY_RATE_PCT, capPct: LATE_FEE_CAP_PCT });
    }

    if (ustn) {
      const fprs = await db.feePaymentRequest.findMany({
        where: { ustn },
        orderBy: { createdAt: "desc" },
      });
      const calculations = await Promise.all(fprs.map(f => calculateLateFees(f.id)));
      return NextResponse.json({
        ustn,
        dailyRatePct: LATE_FEE_DAILY_RATE_PCT,
        capPct: LATE_FEE_CAP_PCT,
        calculations: calculations.filter(Boolean),
      });
    }

    return NextResponse.json({ error: "feePaymentRequestId or ustn required" }, { status: 400 });
  } catch (e: any) {
    console.error("[payment/late-fees POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const feePaymentRequestId = req.nextUrl.searchParams.get("feePaymentRequestId");
    if (!ustn && !feePaymentRequestId) {
      return NextResponse.json({ error: "ustn or feePaymentRequestId required" }, { status: 400 });
    }

    if (feePaymentRequestId) {
      const calc = await calculateLateFees(feePaymentRequestId);
      if (!calc) return NextResponse.json({ error: "FeePaymentRequest not found" }, { status: 404 });
      return NextResponse.json({ calculation: calc, dailyRatePct: LATE_FEE_DAILY_RATE_PCT, capPct: LATE_FEE_CAP_PCT });
    }

    const fprs = await db.feePaymentRequest.findMany({
      where: { ustn: ustn! },
      orderBy: { createdAt: "desc" },
    });
    const calculations = await Promise.all(fprs.map(f => calculateLateFees(f.id)));
    return NextResponse.json({
      ustn,
      dailyRatePct: LATE_FEE_DAILY_RATE_PCT,
      capPct: LATE_FEE_CAP_PCT,
      calculations: calculations.filter(Boolean),
    });
  } catch (e: any) {
    console.error("[payment/late-fees GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
