import { NextRequest, NextResponse } from "next/server";
import { selectOptimalPsp } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/cbe/psp-select — PSP Router optimal PSP selection (Blueprint 7.6)
//
// Body:
//   payerCountry: string           — required, ISO 3166 alpha-2 (e.g. "EG", "DE")
//   amount: number                 — required, positive
//   currency: string               — required, ISO 4217 (e.g. "USD", "EGP")
//   preferredPsp?: string          — optional, "FAWRY" | "PAYMOB" | "CBE_IPN"
//   requireSplit?: boolean         — optional, exclude PSPs that can't split (default false)
//
// Returns: { ok, selectedPsp, rationale, health, confidence, fallbackChain[] }
//   selectedPsp is the highest-scoring CBE-licensed PSP
//   fallbackChain is the remaining PSPs in priority order so the caller can
//   implement automatic fallback if the chosen PSP rejects the payment
//
// Production would call the LightGBM model + Groq LLM for the rationale text;
// the stub uses a deterministic scoring function so the router behaviour is
// stable across runs.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { payerCountry, amount, currency, preferredPsp, requireSplit } = body || {};

    const missing: string[] = [];
    if (!payerCountry) missing.push("payerCountry");
    if (amount == null) missing.push("amount");
    if (!currency) missing.push("currency");
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

    // Validate preferredPsp if supplied.
    if (preferredPsp && !["FAWRY", "PAYMOB", "CBE_IPN"].includes(preferredPsp)) {
      return NextResponse.json(
        { error: "preferredPsp must be one of: FAWRY, PAYMOB, CBE_IPN" },
        { status: 400 }
      );
    }

    const result = await selectOptimalPsp({
      payerCountry: String(payerCountry).toUpperCase(),
      amount: numAmount,
      currency: String(currency).toUpperCase(),
      preferredPsp: preferredPsp as "FAWRY" | "PAYMOB" | "CBE_IPN" | undefined,
      requireSplit: requireSplit === true,
    });

    return NextResponse.json({
      ok: true,
      selectedPsp: result.selectedPsp,
      rationale: result.rationale,
      health: result.health,
      confidence: result.confidence,
      fallbackChain: result.fallbackChain,
    });
  } catch (e: any) {
    console.error("[gov/cbe/psp-select POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to select optimal PSP" },
      { status: 500 }
    );
  }
}
