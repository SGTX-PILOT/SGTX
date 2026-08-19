// SGTX Trade Event Hash-Chain Graph — Part XVI (CCL-009)
// ============================================================================
// Append-only event ledger that forms a hash-chained trade provenance graph.
// Every TradeEvent row carries:
//
//   • previousHash  — the eventHash of the immediately preceding event for
//                     the same USTN (null if it's the genesis event)
//   • eventHash     — sha256(previousHash + event payload + createdAt)
//
// This makes the trade event stream tamper-evident: any retroactive edit
// to a row will invalidate all downstream hashes, detectable via `verifyEventChain()`.
//
// The graph is keyed on USTN. Each USTN maintains its own chain; cross-USTN
// events (ustn = null) are linked by their own global chain — the prior
// row in that case is the most recent event with ustn = null.
//
// Event types: see the Prisma enum comment (TRADE_REQUESTED, TRADE_AGREED,
// SGTX_FEE_REQUIRED, SGTX_FEE_PAID, ..., RECONCILED — 30+ types).
//
// All DB calls are defensive (try/catch). The function never throws —
// on failure it logs and returns null.

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TradeEventInput {
  ustn?: string | null;
  eventType: string;
  description?: string | null;
  metadata?: Record<string, any> | null;
  actorGtid?: string | null;
  source?: string | null;
}

export interface TradeEvent {
  id: string;
  ustn: string | null;
  eventType: string;
  eventDescription: string | null;
  eventMetadata: string | null;
  actorGtid: string | null;
  source: string | null;
  previousHash: string | null;
  eventHash: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// recordTradeEvent — append a new event to the chain
// ---------------------------------------------------------------------------
export async function recordTradeEvent(input: TradeEventInput): Promise<TradeEvent | null> {
  try {
    // 1. Fetch the most recent event for this USTN (or null-USTN if input.ustn is null)
    //    to obtain the previousHash.
    const whereUstn = input.ustn ?? null;
    let previousHash: string | null = null;
    try {
      const prior = await db.tradeEvent.findFirst({
        where: { ustn: whereUstn },
        orderBy: { createdAt: "desc" },
        select: { eventHash: true },
      });
      if (prior?.eventHash) previousHash = prior.eventHash;
    } catch (e: any) {
      logger.warn("[trade-events] failed to fetch previousHash; treating as genesis", {
        ustn: input.ustn,
        error: e?.message,
      });
      previousHash = null;
    }

    // 2. Build the canonical event payload (deterministic order for stable hashing)
    const createdAt = new Date();
    const metadataStr = input.metadata ? JSON.stringify(input.metadata) : null;
    const payload = canonicalizePayload({
      ustn: input.ustn ?? null,
      eventType: input.eventType,
      eventDescription: input.description ?? null,
      eventMetadata: metadataStr,
      actorGtid: input.actorGtid ?? null,
      source: input.source ?? null,
      previousHash,
      createdAt: createdAt.toISOString(),
    });
    const eventHash = "sha256:" + createHash("sha256").update(payload).digest("hex");

    // 3. Persist
    const created = await db.tradeEvent.create({
      data: {
        ustn: input.ustn ?? null,
        eventType: input.eventType,
        eventDescription: input.description ?? null,
        eventMetadata: metadataStr,
        actorGtid: input.actorGtid ?? null,
        source: input.source ?? "SYSTEM",
        previousHash,
        eventHash,
        createdAt,
      },
    });

    return {
      id: created.id,
      ustn: created.ustn,
      eventType: created.eventType,
      eventDescription: created.eventDescription,
      eventMetadata: created.eventMetadata,
      actorGtid: created.actorGtid,
      source: created.source,
      previousHash: created.previousHash,
      eventHash: created.eventHash,
      createdAt: created.createdAt,
    };
  } catch (e: any) {
    logger.error("[trade-events] recordTradeEvent failed", {
      ustn: input.ustn,
      eventType: input.eventType,
      error: e?.message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// verifyEventChain — recompute hashes for a USTN and detect tampering
// ---------------------------------------------------------------------------
export interface ChainVerificationResult {
  ustn: string | null;
  total: number;
  verified: number;
  mismatchedHash: number;
  mismatchedPrevious: number;
  failures: { id: string; reason: "hash_mismatch" | "previous_hash_mismatch"; expected?: string; actual?: string }[];
}

export async function verifyEventChain(ustn?: string | null): Promise<ChainVerificationResult> {
  const result: ChainVerificationResult = {
    ustn: ustn ?? null,
    total: 0,
    verified: 0,
    mismatchedHash: 0,
    mismatchedPrevious: 0,
    failures: [],
  };

  try {
    const events = await db.tradeEvent.findMany({
      where: { ustn: ustn ?? null },
      orderBy: { createdAt: "asc" },
    });
    result.total = events.length;

    let expectedPrevious: string | null = null;
    for (const ev of events) {
      // Recompute hash from the stored payload
      const payload = canonicalizePayload({
        ustn: ev.ustn,
        eventType: ev.eventType,
        eventDescription: ev.eventDescription,
        eventMetadata: ev.eventMetadata,
        actorGtid: ev.actorGtid,
        source: ev.source,
        previousHash: ev.previousHash,
        createdAt: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : String(ev.createdAt),
      });
      const recomputed = "sha256:" + createHash("sha256").update(payload).digest("hex");

      if (recomputed !== ev.eventHash) {
        result.mismatchedHash++;
        result.failures.push({
          id: ev.id,
          reason: "hash_mismatch",
          expected: recomputed,
          actual: ev.eventHash ?? "",
        });
      } else if (ev.previousHash !== expectedPrevious) {
        result.mismatchedPrevious++;
        result.failures.push({
          id: ev.id,
          reason: "previous_hash_mismatch",
          expected: expectedPrevious ?? "",
          actual: ev.previousHash ?? "",
        });
      } else {
        result.verified++;
      }
      expectedPrevious = ev.eventHash;
    }
  } catch (e: any) {
    logger.error("[trade-events] verifyEventChain failed", { ustn, error: e?.message });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function canonicalizePayload(payload: Record<string, any>): string {
  // Stable serialization: sort keys alphabetically
  const keys = Object.keys(payload).sort();
  const parts = keys.map((k) => `${k}=${payload[k] === null || payload[k] === undefined ? "" : String(payload[k])}`);
  return parts.join("|");
}
