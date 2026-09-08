// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §10.23-10.24 — Co-financing: financier encrypts a bid (client-side
// simulation).
// POST /api/sgtx/financing/bids/encrypt
//   body: { bid_data, financier_public_key }
//
// In production, this step runs entirely in the financier's browser using
// libsodium `crypto_box_seal(JSON.stringify(bid_data), financierPublicKey)`.
// SGTX never sees the plaintext. Here we expose a server endpoint as a
// placeholder so the financier portal can demonstrate the blind-bidding UX.
//
// The encrypted payload is returned to the financier, who then includes it
// when submitting the bid via /api/sgtx/financing/bid (the bid route stores
// the encryptedPayload on the FinancingBid row).
//
// Returns: { encrypted_payload, encryption_method: "simulated-nacl" }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { encryptBid, deriveFinancierPublicKey, type BidData } from "@/lib/sgtx/financing/co-financing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bidData: BidData | undefined = body?.bid_data || body?.bidData;
    const financierPublicKey: string | undefined =
      body?.financier_public_key || body?.financierPublicKey;
    const financierGtid: string | undefined =
      body?.financier_gtid || body?.financierGtid || req.headers.get("x-tenant-gtid");

    if (!bidData) {
      return NextResponse.json(
        { error: "bid_data is required" },
        { status: 400 },
      );
    }

    // Validate bid_data has the required fields
    const requiredFields = ["amountOffered", "apr", "settlementMethod", "collateralRequired", "isDeFi"];
    for (const f of requiredFields) {
      if (bidData[f] === undefined || bidData[f] === null) {
        return NextResponse.json(
          { error: `bid_data.${f} is required` },
          { status: 400 },
        );
      }
    }
    if (typeof bidData.amountOffered !== "number" || bidData.amountOffered <= 0) {
      return NextResponse.json(
        { error: "bid_data.amountOffered must be a positive number" },
        { status: 400 },
      );
    }
    if (typeof bidData.apr !== "number" || bidData.apr < 0) {
      return NextResponse.json(
        { error: "bid_data.apr must be a non-negative number" },
        { status: 400 },
      );
    }
    if (bidData.isDeFi && !bidData.deFiProtocol) {
      return NextResponse.json(
        { error: "bid_data.deFiProtocol is required when isDeFi is true" },
        { status: 400 },
      );
    }

    // Resolve the public key: explicit > derived from GTID
    const publicKey =
      financierPublicKey ||
      (financierGtid ? deriveFinancierPublicKey(financierGtid) : null);
    if (!publicKey) {
      return NextResponse.json(
        { error: "financier_public_key (or financier_gtid) is required" },
        { status: 400 },
      );
    }

    const result = encryptBid(bidData, publicKey);

    return NextResponse.json({
      ok: true,
      encrypted_payload: result.encryptedPayload,
      encryption_method: result.encryptionMethod,
      financier_public_key_used: publicKey,
      disclaimer:
        "SIMULATED encryption (XOR + base64 keyed by SHA-256(public_key)). NOT real NaCl. In production, this runs in the financier's browser via libsodium crypto_box_seal — SGTX never sees the plaintext.",
    });
  } catch (e: any) {
    logger.error("[financing/bids/encrypt]", { message: e?.message, stack: e?.stack });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
