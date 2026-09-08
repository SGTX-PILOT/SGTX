// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §10.23-10.24 — Co-financing: decrypt bids after bidding window closes.
// POST /api/sgtx/financing/bids/decrypt
//   body: { financing_request_id }
//
// Decrypts every encrypted bid on the financing request using each
// financier's "private key" (derived from their GTID — see lib header).
//
// This endpoint ENFORCES that the bidding window has closed (i.e. now >
// biddingWindowEndsAt). If the window is still open, returns 423 Locked
// (the borrower cannot see the bid terms until the blind-bidding period
// ends, preventing cherry-picking of mid-window information).
//
// Returns: { decrypted_bids: BidData[], total: number, window_closed: boolean }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  decryptBid,
  deriveFinancierPrivateKey,
  type BidData,
} from "@/lib/sgtx/financing/co-financing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const financingRequestId: string | undefined =
      body?.financing_request_id || body?.financingRequestId;

    if (!financingRequestId) {
      return NextResponse.json(
        { error: "financing_request_id is required" },
        { status: 400 },
      );
    }

    const financingRequest = await db.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: { bids: { include: { financier: true } } },
    });
    if (!financingRequest) {
      return NextResponse.json(
        { error: "Financing request not found" },
        { status: 404 },
      );
    }

    // Enforce bidding window closure
    const windowEndsAt = financingRequest.biddingWindowEndsAt;
    const now = new Date();
    const windowClosed = !windowEndsAt || now >= new Date(windowEndsAt);

    if (!windowClosed) {
      return NextResponse.json(
        {
          error: `Bidding window has not closed yet. Closes at ${windowEndsAt?.toISOString()}. Decryption is blocked to preserve blind-bidding integrity.`,
          code: "BID_WINDOW_OPEN",
          window_ends_at: windowEndsAt?.toISOString(),
          now: now.toISOString(),
          window_closed: false,
        },
        { status: 423 }, // 423 Locked
      );
    }

    // Decrypt each bid that has an encryptedPayload. For bids submitted via
    // the legacy /api/sgtx/financing/bid route (lossy encryption stub), the
    // stored columns are returned as a fallback.
    const decryptedBids: (BidData & {
      bidId: string;
      financierGtid: string;
      financierLegalName: string;
      status: string;
      submittedAt: string;
      decryptedFromPayload: boolean;
      decryptError?: string;
    })[] = [];

    for (const bid of financingRequest.bids) {
      const baseInfo = {
        bidId: bid.bidId,
        financierGtid: bid.financierGtid,
        financierLegalName: bid.financier?.legalName || bid.financierGtid,
        status: bid.status,
        submittedAt: bid.createdAt.toISOString(),
      };

      if (!bid.encryptedPayload) {
        // No encrypted payload — return stored columns directly
        decryptedBids.push({
          amountOffered: bid.amountOffered,
          apr: bid.apr,
          settlementMethod: bid.settlementMethod,
          collateralRequired: bid.collateralRequired,
          conditions: bid.conditions,
          noteToBorrower: bid.noteToBorrower,
          isDeFi: bid.isDeFi,
          deFiProtocol: bid.deFiProtocol,
          ...baseInfo,
          decryptedFromPayload: false,
        });
        continue;
      }

      try {
        const priv = deriveFinancierPrivateKey(bid.financierGtid);
        const dec = decryptBid(bid.encryptedPayload, priv);
        decryptedBids.push({
          amountOffered: dec.amountOffered ?? bid.amountOffered,
          apr: dec.apr ?? bid.apr,
          settlementMethod: dec.settlementMethod ?? bid.settlementMethod,
          collateralRequired: dec.collateralRequired ?? bid.collateralRequired,
          conditions: dec.conditions ?? bid.conditions,
          noteToBorrower: dec.noteToBorrower ?? bid.noteToBorrower,
          isDeFi: dec.isDeFi ?? bid.isDeFi,
          deFiProtocol: dec.deFiProtocol ?? bid.deFiProtocol,
          ...baseInfo,
          decryptedFromPayload: true,
        });
      } catch (e: any) {
        // Decryption failed — fall back to stored columns + flag
        decryptedBids.push({
          amountOffered: bid.amountOffered,
          apr: bid.apr,
          settlementMethod: bid.settlementMethod,
          collateralRequired: bid.collateralRequired,
          conditions: bid.conditions,
          noteToBorrower: bid.noteToBorrower,
          isDeFi: bid.isDeFi,
          deFiProtocol: bid.deFiProtocol,
          ...baseInfo,
          decryptedFromPayload: false,
          decryptError: e?.message || "decrypt_failed",
        });
      }
    }

    // Sort by APR ascending (cheapest first) — the natural borrower view
    decryptedBids.sort((a, b) => a.apr - b.apr);

    return NextResponse.json({
      ok: true,
      decrypted_bids: decryptedBids,
      total: decryptedBids.length,
      window_closed: true,
      window_ends_at: windowEndsAt?.toISOString() || null,
      encryption_method: "simulated-nacl",
      disclaimer:
        "SIMULATED decryption (XOR + base64 keyed by SHA-256(private_key) — symmetric with the public key). NOT real NaCl. In production, each financier decrypts their own bid with libsodium crypto_box_seal_open and chooses whether to share the plaintext with SGTX/borrower.",
    });
  } catch (e: any) {
    logger.error("[financing/bids/decrypt]", { message: e?.message, stack: e?.stack });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
