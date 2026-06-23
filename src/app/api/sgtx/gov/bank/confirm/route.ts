import { NextRequest, NextResponse } from "next/server";
import { confirmSettlement } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/bank/confirm — bank confirms a settlement was executed (Part 7.5.3)
//
// Body:
//   instructionId        — required, the SGTX-issued instruction ID
//   ustn                 — required, the USTN reference (must match the instruction)
//   amount               — required, the settled amount (must match within 0.01)
//   transactionReference — required, the bank's transaction reference (MT103 / pacs.008)
//   settledAt            — required, ISO 8601 timestamp of settlement
//   bankBic              — required, the bank's BIC code
//
// Returns: { ok, instructionId, status, ustn }
//   status values: SETTLED (success), MANUAL_REVIEW (USTN/amount mismatch — held for reconciliation),
//   NOT_FOUND (instruction ID doesn't exist)
//
// SGTX never touches the funds — it only records the confirmation.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instructionId, ustn, amount, transactionReference, settledAt, bankBic } = body || {};

    const missing: string[] = [];
    if (!instructionId) missing.push("instructionId");
    if (!ustn) missing.push("ustn");
    if (amount == null) missing.push("amount");
    if (!transactionReference) missing.push("transactionReference");
    if (!settledAt) missing.push("settledAt");
    if (!bankBic) missing.push("bankBic");
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

    // Validate settledAt is a parseable ISO date
    const settledDate = new Date(settledAt);
    if (isNaN(settledDate.getTime())) {
      return NextResponse.json(
        { error: "settledAt must be a valid ISO 8601 timestamp" },
        { status: 400 }
      );
    }

    const result = await confirmSettlement({
      instructionId,
      ustn,
      amount: numAmount,
      transactionReference,
      settledAt: settledDate.toISOString(),
      bankBic: String(bankBic).toUpperCase(),
    });

    const httpStatus = result.status === "SETTLED" ? 200
      : result.status === "MANUAL_REVIEW" ? 409
      : 404;

    return NextResponse.json({
      ok: result.ok,
      instructionId: result.instructionId,
      status: result.status,
      ustn: result.ustn,
    }, { status: httpStatus });
  } catch (e: any) {
    console.error("[gov/bank/confirm POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to confirm settlement" },
      { status: 500 }
    );
  }
}
