// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Fee Commitment API (immutable)
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/fee-engine/commitment
 *   Query: ?ustn=<USTN>&brokerGtid=<GTID>
 *   Returns: { ok, commitment }      — single immutable commitment if both
 *                                       ustn + brokerGtid are supplied
 *
 * GET /api/sgtx/customs-gateway/fee-engine/commitment?ustn=<USTN>
 *   Returns: { ok, count, commitments[] }   — all commitments for the USTN
 *                                              (across all brokers)
 *
 * L0 §15: commitments are IMMUTABLE — this route never writes; it only
 *          returns the immutable record exactly as it was at acceptance time.
 * L0 §28: NON-CUSTODIAL — fee commitment ≠ funds held. The commitment is a
 *          metadata lock; the payment engine is responsible for actual
 *          settlement (and even there FeeLock is non-custodial).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getFeeCommitment,
  listFeeCommitments,
} from "@/lib/sgtx/customs-gateway/fee-engine";
import { verifyFeeLoomChain } from "@/lib/sgtx/customs-gateway/fee-engine/fee-loom";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn") || "";
    const brokerGtid = searchParams.get("brokerGtid") || "";
    const withLoom = searchParams.get("loom") === "1";

    if (!ustn) {
      return NextResponse.json(
        { ok: false, error: "ustn is required" },
        { status: 400 },
      );
    }

    // If brokerGtid is supplied, return the single immutable commitment.
    if (brokerGtid) {
      const commitment = await getFeeCommitment(ustn, brokerGtid);
      if (!commitment) {
        return NextResponse.json(
          { ok: false, error: "No fee commitment found for this USTN + broker" },
          { status: 404 },
        );
      }
      let loom: any = undefined;
      if (withLoom) {
        try {
          loom = await verifyFeeLoomChain(ustn);
        } catch (err: any) {
          logger.warn("[api/fee-engine/commitment] loom verification failed", {
            ustn,
            error: err?.message,
          });
        }
      }
      return NextResponse.json({
        ok: true,
        commitment,
        immutable: true,
        nonCustodial: true,
        note: "§15 immutable commitment — never overwritten. §28 NON-CUSTODIAL — fee commitment ≠ funds held.",
        ...(loom ? { loomChain: loom } : {}),
      });
    }

    // Otherwise, list ALL commitments for the USTN (across all brokers).
    const commitments = await listFeeCommitments(ustn);
    return NextResponse.json({
      ok: true,
      count: commitments.length,
      commitments,
      immutable: true,
      nonCustodial: true,
    });
  } catch (err: any) {
    logger.error("[api/fee-engine/commitment] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
