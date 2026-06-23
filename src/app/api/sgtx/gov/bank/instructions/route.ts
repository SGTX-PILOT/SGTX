import { NextRequest, NextResponse } from "next/server";
import { listPendingInstructions } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/bank/instructions — banks pull PENDING settlement instructions (Part 7.5.2)
//
// Query params:
//   bank_bic  — required, the bank's BIC code (e.g. "CIBEEGCX")
//   status    — optional, default "PENDING". Other values: "SETTLED", "MANUAL_REVIEW"
//
// Auth: mTLS with bank's certificate (enforced at gateway level in production).
//
// Returns: { ok, instructions: [...], count }
//
// Each instruction contains: instruction_id, ustn, from_iban, to_iban, amount,
// currency, value_date, reference, status, bank_bic. The bank uses this to
// prefill a payment order for the buyer — the buyer still authorises the
// payment through their normal banking channel (no SGTX involvement).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bankBic = (searchParams.get("bank_bic") || "").toUpperCase();
    const status = searchParams.get("status") || "PENDING";

    if (!bankBic) {
      return NextResponse.json(
        { error: "Missing required query parameter: bank_bic" },
        { status: 400 }
      );
    }

    // Validate BIC format (8 or 11 chars, uppercase alphanumeric)
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bankBic)) {
      return NextResponse.json(
        { error: "bank_bic must be a valid BIC (8 or 11 chars, e.g. CIBEEGCX)" },
        { status: 400 }
      );
    }

    const validStatuses = ["PENDING", "SETTLED", "MANUAL_REVIEW", "FAILED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await listPendingInstructions(bankBic, status);

    return NextResponse.json({
      ok: true,
      bank_bic: bankBic,
      status,
      ...result,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[gov/bank/instructions GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list pending settlement instructions" },
      { status: 500 }
    );
  }
}
