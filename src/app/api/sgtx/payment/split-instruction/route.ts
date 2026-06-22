// 6.1.3 — Split Instruction (preview, no payment)
import { NextRequest, NextResponse } from "next/server";
import { generateStage1Split } from "@/lib/sgtx/payment-orchestration";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const payerGtid = req.nextUrl.searchParams.get("payerGtid");
  const invoiceValueUsd = parseFloat(req.nextUrl.searchParams.get("invoiceValueUsd") || "0");
  if (!ustn || !payerGtid || !invoiceValueUsd) return NextResponse.json({ error: "ustn, payerGtid, invoiceValueUsd required" }, { status: 400 });
  const result = await generateStage1Split({ ustn, payerGtid, invoiceValueUsd });
  return NextResponse.json(result);
}
