// @ts-nocheck
/**
 * POST /api/sgtx/settlement/pain001
 *
 * Body: { batchId, ustn, stage, legs, payerGtid, fundingCurrency }
 *
 * Generates an ISO 20022 pain.001.001.09 XML batch (§13.4.5).
 * Returns: { xml, batchId, legCount, totalAmount, currency }
 *
 * The XML is returned as a string (caller may save it or POST to the bank).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  generatePain001Batch,
  type MultiLegSettlementInstruction,
} from "@/lib/sgtx/direct-bank-settlement";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<MultiLegSettlementInstruction> & {
      stage?: 1 | 2;
      fundingCurrency?: "EGP" | "USD";
    };
    if (!body.ustn || !body.legs || !Array.isArray(body.legs)) {
      return NextResponse.json(
        { error: "ustn + legs[] required" },
        { status: 400 },
      );
    }
    const instruction: MultiLegSettlementInstruction = {
      batchId: body.batchId || `BSI-MANUAL-${Date.now()}`,
      ustn: body.ustn,
      stage: body.stage || 1,
      payerGtid: body.payerGtid || "SGTX-SELLER",
      fundingCurrency: body.fundingCurrency || "EGP",
      bankGtid: body.bankGtid,
      bankName: body.bankName,
      legs: body.legs,
      totalAmount: body.totalAmount || body.legs.reduce((s, l) => s + l.amount, 0),
      idempotencyKey: body.idempotencyKey || "",
      bankReference: body.bankReference,
      status: body.status || "DRAFT",
      createdAt: body.createdAt || new Date().toISOString(),
    };
    const result = generatePain001Batch(instruction);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
