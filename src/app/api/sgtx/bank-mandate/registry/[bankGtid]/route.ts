// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getBankCapability, testBankConnection, verifyGovernmentCollectionAccount } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/bank-mandate/registry/[bankGtid]
// Returns the bank's capability record (tier, endpoints, supported messages,
// health status). Returns 404 if the bank is not registered.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bankGtid: string }> },
) {
  try {
    const { bankGtid } = await params;
    if (!bankGtid) {
      return NextResponse.json({ error: "bankGtid required" }, { status: 400 });
    }
    const capability = await getBankCapability(bankGtid);
    if (!capability) {
      return NextResponse.json({ error: "bank not registered" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, capability });
  } catch (e: any) {
    logger.error("[api/bank-mandate/registry/[bankGtid]] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// POST /api/sgtx/bank-mandate/registry/[bankGtid]
// Body: { action: "test_connection" | "verify_gov_account", accountType? }
// Performs a connection test or a government collection account verification
// for the registered bank. Both flows are simulated — no real ISO 20022 /
// government API is contacted.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bankGtid: string }> },
) {
  try {
    const { bankGtid } = await params;
    if (!bankGtid) {
      return NextResponse.json({ error: "bankGtid required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "test_connection";

    if (action === "test_connection") {
      const result = await testBankConnection(bankGtid);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "verify_gov_account") {
      const accountType = typeof body.accountType === "string" && body.accountType.trim()
        ? body.accountType.trim()
        : "CUSTOMS";
      const result = await verifyGovernmentCollectionAccount(bankGtid, accountType);
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json(
      { error: "action must be 'test_connection' or 'verify_gov_account'" },
      { status: 400 },
    );
  } catch (e: any) {
    logger.error("[api/bank-mandate/registry/[bankGtid]] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
