// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { registerBank, listBanks, BankConfig, CapabilityTier } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/bank-mandate/registry
// Body: { gtid, name, bic, ibanPrefixes, capabilityTier, iso20022Endpoint?, publicKey? }
// Registers a new bank in the capability registry. If the bank GTID already
// exists, this updates the registry row with a new version.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { gtid, name, bic, ibanPrefixes, capabilityTier, iso20022Endpoint, publicKey } = body;

    if (!gtid || typeof gtid !== "string") {
      return NextResponse.json({ error: "gtid required" }, { status: 400 });
    }
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!bic || typeof bic !== "string") {
      return NextResponse.json({ error: "bic required" }, { status: 400 });
    }
    if (!Array.isArray(ibanPrefixes)) {
      return NextResponse.json({ error: "ibanPrefixes[] required" }, { status: 400 });
    }
    if (![1, 2, 3].includes(capabilityTier)) {
      return NextResponse.json(
        { error: "capabilityTier must be 1 (Full ISO 20022), 2 (pain.001-only), or 3 (H2H/SFTP)" },
        { status: 400 },
      );
    }

    const config: BankConfig = {
      gtid,
      name,
      bic,
      ibanPrefixes,
      capabilityTier: capabilityTier as CapabilityTier,
      iso20022Endpoint: iso20022Endpoint ?? null,
      publicKey: publicKey ?? null,
    };
    const result = await registerBank(config);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/bank-mandate/registry] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// GET /api/sgtx/bank-mandate/registry
// Returns the list of all banks registered in the capability registry,
// including their tier, endpoints, supported messages, and health status.
export async function GET() {
  try {
    const banks = await listBanks();
    return NextResponse.json({ ok: true, banks, count: banks.length });
  } catch (e: any) {
    logger.error("[api/bank-mandate/registry] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
