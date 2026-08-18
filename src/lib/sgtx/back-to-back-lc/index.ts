// SGTX Add-On 21 — Back-to-Back Letter of Credit Management
// ===========================================================================
//
// A back-to-back LC is a credit instrument where a single primary LC (issued
// by the ultimate buyer's bank in favour of the seller/trader) is used as
// collateral to issue a secondary LC (issued by the seller/trader's bank in
// favour of the supplier). This structure lets an intermediary trader who
// does not have working capital of their own to fulfil a trade.
//
// Lifecycle (status):
//   PENDING     → secondary LC requested, awaiting bank confirmation
//   ISSUED      → secondary LC issued by trader's bank in favour of supplier
//   CONFIRMED   → both primary + secondary LCs confirmed + amounts reconciled
//   DRAWN       → supplier has drawn against the secondary LC
//   SETTLED     → primary LC drawn, trade cycle closed
//   CANCELLED   → either LC cancelled / expired / refused
//
// The `confirm` operation here is the lightweight platform-side
// confirmation: it transitions PENDING → CONFIRMED once the bank has
// confirmed both legs (the actual SWIFT MT700/MT710 message processing is
// performed by the financing module's adapter layer when wired).
//
// Models:
//   db.backToBackLc — single table

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type BackToBackLcStatus =
  | "PENDING"
  | "ISSUED"
  | "CONFIRMED"
  | "DRAWN"
  | "SETTLED"
  | "CANCELLED";

export interface CreateBackToBackLcInput {
  primaryLcId?: string | null;
  secondaryLcId?: string | null;
  buyerGtid: string;
  sellerGtid: string;
  supplierGtid: string;
  amount: number;
  currency: string;
  status?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Create a back-to-back LC record. Throws on validation / DB failure. */
export async function createBackToBackLc(input: CreateBackToBackLcInput) {
  const missing: string[] = [];
  if (!input.buyerGtid?.trim()) missing.push("buyerGtid");
  if (!input.sellerGtid?.trim()) missing.push("sellerGtid");
  if (!input.supplierGtid?.trim()) missing.push("supplierGtid");
  if (!input.currency?.trim()) missing.push("currency");
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
  const amount = Number(input.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  const data: any = {
    buyerGtid: input.buyerGtid.trim(),
    sellerGtid: input.sellerGtid.trim(),
    supplierGtid: input.supplierGtid.trim(),
    amount: +amount.toFixed(2),
    currency: input.currency.trim(),
    status: input.status || "PENDING",
  };
  if (input.primaryLcId) data.primaryLcId = input.primaryLcId;
  if (input.secondaryLcId) data.secondaryLcId = input.secondaryLcId;

  const lc = await (db as any).backToBackLc.create({ data });
  logger.info("[back-to-back-lc] created", {
    lcId: lc.id,
    buyerGtid: data.buyerGtid,
    sellerGtid: data.sellerGtid,
    supplierGtid: data.supplierGtid,
    amount: data.amount,
    currency: data.currency,
  });
  return lc;
}

/** List back-to-back LCs by buyer GTID. */
export async function listBackToBackLcs(buyerGtid: string) {
  if (!buyerGtid) return [];
  const rows = await (db as any).backToBackLc.findMany({
    where: { buyerGtid },
    orderBy: { createdAt: "desc" },
  });
  return rows || [];
}

/** Confirm a back-to-back LC (PENDING → CONFIRMED).
 *  - If already CONFIRMED, returns idempotently.
 *  - If already in DRAWN/SETTLED/CANCELLED, throws (cannot re-confirm).
 *  - If in PENDING/ISSUED, transitions to CONFIRMED.
 */
export async function confirmBackToBackLc(lcId: string) {
  if (!lcId) {
    throw new Error("lcId is required");
  }

  const existing = await (db as any).backToBackLc.findUnique({ where: { id: lcId } });
  if (!existing) {
    throw new Error(`back-to-back LC not found: ${lcId}`);
  }

  if (existing.status === "CONFIRMED") {
    return { ...existing, idempotent: true };
  }

  const terminalStatuses = new Set(["DRAWN", "SETTLED", "CANCELLED"]);
  if (terminalStatuses.has(existing.status)) {
    throw new Error(
      `cannot confirm LC in terminal status '${existing.status}' (id=${lcId})`,
    );
  }

  const updated = await (db as any).backToBackLc.update({
    where: { id: lcId },
    data: { status: "CONFIRMED" },
  });

  logger.info("[back-to-back-lc] confirmed", { lcId });
  return updated;
}
