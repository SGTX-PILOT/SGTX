// POST /api/sgtx/payment/reconcile — body: { ustn, bankStatementData }
// Returns reconciliation report (Part 6.10.1)
import { NextRequest, NextResponse } from "next/server";
import { reconcilePayment, generateReconciliationReport } from "@/lib/sgtx/payment/reconciliation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, bankStatementData } = body;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    // If no bank statement provided, fall back to on-disk report
    if (!bankStatementData || (Array.isArray(bankStatementData) && bankStatementData.length === 0)) {
      const report = await generateReconciliationReport(ustn);
      return NextResponse.json({ report, mode: "on_disk" });
    }

    const report = await reconcilePayment(ustn, bankStatementData);
    return NextResponse.json({ report, mode: "bank_statement" });
  } catch (e: any) {
    console.error("[payment/reconcile]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
