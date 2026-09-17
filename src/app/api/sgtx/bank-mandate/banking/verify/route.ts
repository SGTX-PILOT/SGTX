// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { verifyMicroDeposit } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/bank-mandate/banking/verify
// Body: { tenantGtid, accountType: "egp" | "usd", amounts: [number, number] }
// Verifies the two micro-deposit amounts the user-entered against the
// amounts SGTX seeded when captureBuyerBanking was called. If both
// match (in either order), the account is marked as verified.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantGtid, accountType, amounts } = body;

    if (!tenantGtid || typeof tenantGtid !== "string") {
      return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    }
    if (accountType !== "egp" && accountType !== "usd") {
      return NextResponse.json(
        { error: "accountType must be 'egp' or 'usd'" },
        { status: 400 },
      );
    }
    if (!Array.isArray(amounts) || amounts.length !== 2 ||
        typeof amounts[0] !== "number" || typeof amounts[1] !== "number") {
      return NextResponse.json(
        { error: "amounts must be a two-element numeric array" },
        { status: 400 },
      );
    }

    const result = await verifyMicroDeposit(
      tenantGtid,
      accountType as "egp" | "usd",
      [amounts[0], amounts[1]] as [number, number],
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/bank-mandate/banking/verify] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
