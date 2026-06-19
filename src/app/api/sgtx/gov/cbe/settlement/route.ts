import { NextRequest, NextResponse } from "next/server";
import { createSettlementInstruction } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/cbe/settlement — create a CBE settlement instruction
// Body: {
//   ustn: string,
//   amount: number,             // positive number
//   currency: string,           // ISO 4217 (USD, EGP, EUR, ...)
//   beneficiaryIban: string     // beneficiary bank account IBAN
// }
// Returns: { ok, instructionId, status, amount, currency, beneficiaryIban, submittedAt }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, amount, currency, beneficiaryIban } = body || {};

    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (amount == null) missing.push("amount");
    if (!currency) missing.push("currency");
    if (!beneficiaryIban) missing.push("beneficiaryIban");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    const result = await createSettlementInstruction(
      ustn,
      numAmount,
      String(currency).toUpperCase(),
      String(beneficiaryIban).replace(/\s+/g, "")
    );

    return NextResponse.json({
      ok: true,
      instructionId: result.instructionId,
      status: result.status,
      amount: numAmount,
      currency: String(currency).toUpperCase(),
      beneficiaryIban,
      submittedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[gov/cbe/settlement] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to create CBE settlement instruction" },
      { status: 500 }
    );
  }
}
