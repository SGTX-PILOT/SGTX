// 3B.7.5 — Reconciliation (webhook / bank statement / manual upload)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reconcileInstruction } from "@/lib/sgtx/settlement";
import { reconciliationExtract } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const status = req.nextUrl.searchParams.get("status"); // auto | manual | all
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });

  const instructions = await db.settlementInstruction.findMany({
    where: { OR: [{ payerGtid: tenantGtid }, { payeeGtid: tenantGtid }] },
    include: { reconciliation: true, pspAttempts: true },
    orderBy: { createdAt: "desc" },
  });

  const filtered = instructions.filter(i => {
    if (!i.reconciliation) return false;
    if (status === "auto") return i.reconciliation.autoReconciled;
    if (status === "manual") return !i.reconciliation.autoReconciled;
    return true;
  });

  return NextResponse.json({ records: filtered, total: filtered.length, autoReconciled: filtered.filter(i => i.reconciliation?.autoReconciled).length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instructionId, statementText, source } = body;
    if (!instructionId || !statementText) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const instruction = await db.settlementInstruction.findUnique({ where: { id: instructionId } });
    if (!instruction) return NextResponse.json({ error: "Instruction not found" }, { status: 404 });

    // AI extraction (A2 HF Donut-style)
    let extracted: any = null;
    try {
      const r = await reconciliationExtract({ statementText, expectedUstn: instruction.ustn, expectedAmount: instruction.amountUsd });
      try { extracted = JSON.parse(r.content); } catch { extracted = { raw: r.content }; }
    } catch { /* ignore */ }

    // If extraction confidence is 0, fallback to deterministic match
    const confidence = extracted?.confidence ?? 0.5;
    const result = await reconcileInstruction(instructionId, {
      matchedAmount: extracted?.amount || instruction.amountUsd,
      matchedReference: extracted?.reference || instruction.ustn,
      matchedDate: extracted?.value_date ? new Date(extracted.value_date) : new Date(),
      source: source || "MANUAL_UPLOAD",
      confidence,
      extractedData: extracted,
    });

    return NextResponse.json({ ok: true, ...result, extracted });
  } catch (e: any) {
    console.error("[settlement/reconcile]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
