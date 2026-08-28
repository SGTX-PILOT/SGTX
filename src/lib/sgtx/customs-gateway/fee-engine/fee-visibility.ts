// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Visibility (§12, §26)
 * ===========================================================================
 *
 * Constitutional rule §12: the trader MUST know all charges before accepting
 * a quote. This module guarantees that by:
 *
 *   1. generateFeeDisclosure(ustn, brokerGtid) — returns ALL charges for a
 *      trade, clearly separated into 7 categories:
 *         A. SGTX PLATFORM FEE (1.5%, trader only)
 *         B. BROKER SERVICE FEE
 *         C. GOVERNMENT DUTY
 *         D. GOVERNMENT TAX
 *         E. GOVERNMENT USER / PROCESSING FEE
 *         F. THIRD-PARTY CONNECTIVITY FEE
 *         G. OTHER LEGALLY REQUIRED CHARGE
 *
 *   2. validateNoHiddenFees(disclosure, acceptedQuote) — compares the
 *      disclosure against the accepted quote; any charge NOT represented in
 *      the quote is flagged as a hidden fee. The caller (acceptBrokerQuote
 *      in the fee engine) refuses to create a commitment if any hidden fee
 *      is detected.
 *
 *   3. formatFeeBreakdown(disclosure) — returns the disclosure aggregated
 *      by category for UI display. Each category has a label, total amount,
 *      and the list of items. This is the structure the trader portal
 *      renders.
 *
 * §26 Fee Separation Display — the trader portal must always show:
 *
 *      SGTX TRADE FEE:       1.5%
 *      BROKER SERVICE:       $150
 *      GOVERNMENT CHARGES:   $X
 *      THIRD-PARTY PASS-THROUGH: $Y
 *
 * Never combines these into a single "customs fee" line — that would hide
 * the broker revenue from the trader.
 *
 * L0:
 *   - NON-CUSTODIAL: this module never moves funds; it only computes and
 *     validates disclosure documents.
 *   - All public functions wrapped try/catch with safe defaults — never
 *     throws into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  type BrokerQuote,
  type BrokerFeeCommitment,
  classifyFee,
  computeSgtxPlatformFee,
  listFeeCommitments,
  listAdditionalChargeRequests,
} from "./index";
import { listBrokerQuotes } from "./index";

// ============ §12 Fee Disclosure ============

export interface FeeDisclosure {
  serviceName: string;
  broker: string;
  brokerGtid: string;
  feeAmount: number;
  currency: string;
  taxAmount: number;
  governmentFee: number | null;
  thirdPartyPassThrough: number | null;
  isMandatory: boolean;
  isEstimated: boolean;
  chargeRecipient: string;
  reason: string;
  jurisdiction: string;
  ustn: string;
  /** A. SGTX_FEE | B. BROKER_FEE | C. DUTY | D. TAX | E. GOVERNMENT_FEE | F. THIRD_PARTY_FEE | G. OTHER */
  category: string;
  /** Quote / commitment / schedule reference, if any. */
  sourceReference: string | null;
}

export const FEE_DISCLOSURE_CATEGORIES = [
  { key: "SGTX_FEE", label: "A. SGTX PLATFORM FEE (1.5%)" },
  { key: "BROKER_FEE", label: "B. BROKER SERVICE FEE" },
  { key: "DUTY", label: "C. GOVERNMENT DUTY" },
  { key: "TAX", label: "D. GOVERNMENT TAX" },
  { key: "GOVERNMENT_FEE", label: "E. GOVERNMENT USER / PROCESSING FEE" },
  { key: "THIRD_PARTY_FEE", label: "F. THIRD-PARTY CONNECTIVITY FEE" },
  { key: "PASS_THROUGH", label: "G. PASS-THROUGH COST" },
  { key: "OTHER_REGULATORY_CHARGE", label: "G. OTHER LEGALLY REQUIRED CHARGE" },
] as const;

// ============ §12 §26 generateFeeDisclosure ============

/**
 * Generate the full fee disclosure for a trade. Returns ALL charges for the
 * given USTN, clearly separated by category. The trader portal renders this
 * list verbatim — never aggregated into a single "customs fee" line.
 *
 * Sources (in priority order):
 *   1. The trade's SGTX platform fee (1.5%, trader only).
 *   2. All accepted broker fee commitments for this USTN.
 *   3. All accepted additional-charge requests for this USTN.
 *
 * Never throws — returns an empty array on failure (caller can still render
 * an empty disclosure rather than crash).
 */
export async function generateFeeDisclosure(
  ustn: string,
  brokerGtid?: string,
): Promise<FeeDisclosure[]> {
  try {
    if (!ustn) return [];
    const out: FeeDisclosure[] = [];

    // §A SGTX platform fee (1.5% trader only — §9).
    try {
      const trade = await db.trade.findUnique({
        where: { ustn },
        select: {
          tradeValueUsd: true,
          currency: true,
          originCountry: true,
          destCountry: true,
          buyerGtid: true,
          sellerGtid: true,
        },
      });
      if (trade) {
        const sgtxFee = computeSgtxPlatformFee(Number(trade.tradeValueUsd || 0));
        out.push({
          serviceName: "SGTX Platform Fee",
          broker: "SGTX",
          brokerGtid: "SGTX-PLATFORM",
          feeAmount: sgtxFee.feeAmount,
          currency: trade.currency || "USD",
          taxAmount: 0,
          governmentFee: null,
          thirdPartyPassThrough: null,
          isMandatory: true,
          isEstimated: false,
          chargeRecipient: "SGTX Platform (paid by TRADER only)",
          reason: `§9 SGTX fee = 1.5% to TRADERS only. Rate ${sgtxFee.rate * 100}%.`,
          jurisdiction: String(trade.originCountry || "").toUpperCase(),
          ustn,
          category: "SGTX_FEE",
          sourceReference: null,
        });
      }
    } catch (err: any) {
      logger.warn("[fee-visibility/generateFeeDisclosure] trade lookup failed", {
        ustn,
        error: err?.message,
      });
    }

    // §B-§G: walk all accepted broker fee commitments for this USTN.
    let commitments: BrokerFeeCommitment[] = [];
    try {
      commitments = await listFeeCommitments(ustn);
      if (brokerGtid) commitments = commitments.filter((c) => c.brokerGtid === brokerGtid);
    } catch (err: any) {
      logger.warn("[fee-visibility/generateFeeDisclosure] commitments lookup failed", {
        ustn,
        error: err?.message,
      });
    }

    // Look up broker tenant display names (best-effort).
    const brokerNames: Record<string, string> = {};
    try {
      const gids = Array.from(new Set(commitments.map((c) => c.brokerGtid)));
      if (gids.length > 0) {
        const tenants = await db.tenant.findMany({
          where: { gtid: { in: gids } },
          select: { gtid: true, legalName: true },
        });
        for (const t of tenants || []) brokerNames[t.gtid] = t.legalName || t.gtid;
      }
    } catch (err: any) {
      logger.warn("[fee-visibility/generateFeeDisclosure] tenant names lookup failed", {
        error: err?.message,
      });
    }

    for (const c of commitments) {
      // The broker fee commitment itself is BROKER_FEE.
      out.push({
        serviceName: c.service || "Broker Service Fee",
        broker: brokerNames[c.brokerGtid] || c.brokerGtid,
        brokerGtid: c.brokerGtid,
        feeAmount: Number(c.amount || 0),
        currency: c.currency || "USD",
        taxAmount: Number(c.taxes || 0),
        governmentFee: null,
        thirdPartyPassThrough: Number(c.passThroughAmount || 0) > 0 ? Number(c.passThroughAmount) : null,
        isMandatory: true,
        isEstimated: false,
        chargeRecipient: brokerNames[c.brokerGtid] || c.brokerGtid,
        reason: "Accepted broker quote — immutable fee commitment (§15).",
        jurisdiction: "",
        ustn,
        category: "BROKER_FEE",
        sourceReference: c.id,
      });

      // If the commitment carried pass-through, surface it as a separate
      // PASS_THROUGH line (§26 — never combined with the broker fee).
      if (Number(c.passThroughAmount || 0) > 0) {
        out.push({
          serviceName: "Pass-through cost",
          broker: brokerNames[c.brokerGtid] || c.brokerGtid,
          brokerGtid: c.brokerGtid,
          feeAmount: Number(c.passThroughAmount),
          currency: c.currency || "USD",
          taxAmount: 0,
          governmentFee: null,
          thirdPartyPassThrough: Number(c.passThroughAmount),
          isMandatory: true,
          isEstimated: false,
          chargeRecipient: "Third party (pass-through)",
          reason: "Pass-through cost — not broker revenue (§11).",
          jurisdiction: "",
          ustn,
          category: "PASS_THROUGH",
          sourceReference: c.id,
        });
      }

      // If the commitment carried taxes, surface as a separate TAX line.
      if (Number(c.taxes || 0) > 0) {
        out.push({
          serviceName: "Tax on broker service",
          broker: brokerNames[c.brokerGtid] || c.brokerGtid,
          brokerGtid: c.brokerGtid,
          feeAmount: Number(c.taxes),
          currency: c.currency || "USD",
          taxAmount: Number(c.taxes),
          governmentFee: null,
          thirdPartyPassThrough: null,
          isMandatory: true,
          isEstimated: false,
          chargeRecipient: "Government (tax authority)",
          reason: "VAT / GST / sales tax on broker service — government, not broker revenue (§11).",
          jurisdiction: "",
          ustn,
          category: "TAX",
          sourceReference: c.id,
        });
      }
    }

    // §G: walk all approved / accepted additional-charge requests.
    try {
      const requests = await listAdditionalChargeRequests({ ustn });
      for (const r of requests || []) {
        if (r.status !== "TRADER_ACCEPTED" && r.status !== "GOVERNOR_APPROVED" && r.status !== "LOOM_RECORDED") {
          continue; // Skip pending / disputed / denied — not yet binding.
        }
        // Classify each additional charge by its chargeType to assign the
        // correct category (government vs third-party vs other).
        const classification = classifyFee({
          name: r.reason,
          chargeType: r.chargeType,
          chargeRecipient: r.governmentReference ? "Government" : "Broker",
        });
        const category =
          r.chargeType === "GOVERNMENT_MANDATED"
            ? (classification.category === "DUTY" || classification.category === "TAX"
                ? classification.category
                : "GOVERNMENT_FEE")
            : r.chargeType === "THIRD_PARTY_PASS_THROUGH"
              ? "THIRD_PARTY_FEE"
              : classification.category || "OTHER_REGULATORY_CHARGE";
        out.push({
          serviceName: `Additional charge: ${r.reason.slice(0, 60)}`,
          broker: brokerNames[r.brokerGtid] || r.brokerGtid,
          brokerGtid: r.brokerGtid,
          feeAmount: Number(r.amount || 0),
          currency: r.currency || "USD",
          taxAmount: 0,
          governmentFee: r.chargeType === "GOVERNMENT_MANDATED" ? Number(r.amount) : null,
          thirdPartyPassThrough: r.chargeType === "THIRD_PARTY_PASS_THROUGH" ? Number(r.amount) : null,
          isMandatory: true,
          isEstimated: false,
          chargeRecipient: r.chargeType === "GOVERNMENT_MANDATED" ? "Government" : "Third party",
          reason: `§16 additional charge — approved via ${r.status}. Reason: ${r.reason}`,
          jurisdiction: "",
          ustn,
          category,
          sourceReference: r.id,
        });
      }
    } catch (err: any) {
      logger.warn("[fee-visibility/generateFeeDisclosure] additional charges lookup failed", {
        ustn,
        error: err?.message,
      });
    }

    return out;
  } catch (err: any) {
    logger.error("[fee-visibility/generateFeeDisclosure] failed", { ustn, error: err?.message });
    return [];
  }
}

// ============ §12 validateNoHiddenFees ============

/**
 * Validate that the accepted quote covers every disclosure item.
 *
 * A disclosure item is "hidden" if:
 *   - It is a BROKER_FEE / PASS_THROUGH / TAX line, AND
 *   - The accepted quote does NOT include the same line item, AND
 *   - The disclosure line is NOT a §16-approved additional charge (those
 *     are explicitly post-acceptance additions).
 *
 * SGTX_FEE is always allowed (it's the platform fee, not a broker charge).
 *
 * Returns { hasHiddenFees, hiddenCharges[] } — never throws.
 */
export function validateNoHiddenFees(
  disclosure: FeeDisclosure[],
  acceptedQuote: BrokerQuote,
): { hasHiddenFees: boolean; hiddenCharges: string[] } {
  try {
    if (!Array.isArray(disclosure) || !acceptedQuote) {
      return { hasHiddenFees: false, hiddenCharges: [] };
    }
    const hiddenCharges: string[] = [];

    // Build a set of disclosure-item signatures already covered by the quote.
    // The quote covers: fee + tax + passThrough (its own broker fee) plus any
    // potentialGovernmentFees it disclosed.
    const quoteCovered = new Set<string>();
    quoteCovered.add(`BROKER_FEE:${acceptedQuote.fee}`);
    if (Number(acceptedQuote.tax || 0) > 0) quoteCovered.add(`TAX:${acceptedQuote.tax}`);
    if (Number(acceptedQuote.passThrough || 0) > 0) quoteCovered.add(`PASS_THROUGH:${acceptedQuote.passThrough}`);

    // Surface potential government fees the quote itself disclosed (those are
    // not hidden — the trader was warned about them).
    if (acceptedQuote.potentialGovernmentFees) {
      try {
        const pgf = acceptedQuote.potentialGovernmentFees;
        const items = Array.isArray(pgf) ? pgf : (pgf?.items || []);
        for (const item of items) {
          const amt = Number(item?.amount || item?.fee || 0);
          if (amt > 0) quoteCovered.add(`GOVERNMENT_FEE:${amt}`);
        }
      } catch {}
    }

    for (const d of disclosure) {
      // SGTX_FEE is always allowed (platform fee, not broker).
      if (d.category === "SGTX_FEE") continue;

      // §16 additional charges are explicitly allowed post-acceptance.
      if (d.sourceReference && String(d.sourceReference).startsWith("ACR-")) continue;

      // Check if this disclosure item is covered by the quote.
      const signature = `${d.category}:${d.feeAmount}`;
      if (quoteCovered.has(signature)) continue;

      // If the disclosure line is a TAX / DUTY / GOVERNMENT_FEE that the
      // quote explicitly listed under potentialGovernmentFees, allow it.
      if (
        (d.category === "TAX" || d.category === "DUTY" || d.category === "GOVERNMENT_FEE") &&
        Array.isArray(acceptedQuote.potentialGovernmentFees?.items || acceptedQuote.potentialGovernmentFees)
      ) {
        const pgfItems = Array.isArray(acceptedQuote.potentialGovernmentFees)
          ? acceptedQuote.potentialGovernmentFees
          : (acceptedQuote.potentialGovernmentFees?.items || []);
        const match = pgfItems.some(
          (item: any) => Number(item?.amount || item?.fee || 0) === d.feeAmount,
        );
        if (match) continue;
      }

      // Hidden fee detected.
      hiddenCharges.push(
        `${d.category} | ${d.serviceName} | ${d.feeAmount} ${d.currency} | recipient=${d.chargeRecipient}`,
      );
    }

    return {
      hasHiddenFees: hiddenCharges.length > 0,
      hiddenCharges,
    };
  } catch (err: any) {
    logger.error("[fee-visibility/validateNoHiddenFees] failed", { error: err?.message });
    return { hasHiddenFees: false, hiddenCharges: [] };
  }
}

// ============ §26 formatFeeBreakdown ============

export interface FeeBreakdownCategory {
  category: string;
  label: string;
  totalAmount: number;
  currency: string;
  items: FeeDisclosure[];
}

/**
 * Aggregate a disclosure into the §26 separated categories for UI display.
 * The trader portal renders each category as a separate line — never
 * combined into a single "customs fee" line.
 *
 * Output order (matches §26 spec):
 *   A. SGTX TRADE FEE (1.5%)
 *   B. BROKER SERVICE
 *   C. GOVERNMENT CHARGES (DUTY + TAX + GOVERNMENT_FEE combined)
 *   D. THIRD-PARTY PASS-THROUGH
 *   E. OTHER REGULATORY CHARGES
 *
 * Returns an array of { category, label, totalAmount, currency, items[] }.
 * Never throws — returns an empty array on failure.
 */
export function formatFeeBreakdown(disclosure: FeeDisclosure[]): FeeBreakdownCategory[] {
  try {
    if (!Array.isArray(disclosure)) return [];

    // Group by raw category first.
    const byCategory = new Map<string, FeeDisclosure[]>();
    for (const d of disclosure) {
      const k = d.category || "OTHER";
      if (!byCategory.has(k)) byCategory.set(k, []);
      byCategory.get(k)!.push(d);
    }

    // Build the §26 display order.
    const display: FeeBreakdownCategory[] = [];
    const seen = new Set<string>();

    // A. SGTX TRADE FEE (1.5%)
    if (byCategory.has("SGTX_FEE")) {
      const items = byCategory.get("SGTX_FEE")!;
      display.push({
        category: "SGTX_FEE",
        label: "A. SGTX TRADE FEE (1.5%)",
        totalAmount: items.reduce((s, i) => s + Number(i.feeAmount || 0), 0),
        currency: items[0]?.currency || "USD",
        items,
      });
      seen.add("SGTX_FEE");
    }

    // B. BROKER SERVICE
    if (byCategory.has("BROKER_FEE")) {
      const items = byCategory.get("BROKER_FEE")!;
      display.push({
        category: "BROKER_FEE",
        label: "B. BROKER SERVICE",
        totalAmount: items.reduce((s, i) => s + Number(i.feeAmount || 0), 0),
        currency: items[0]?.currency || "USD",
        items,
      });
      seen.add("BROKER_FEE");
    }

    // C. GOVERNMENT CHARGES — combine DUTY + TAX + GOVERNMENT_FEE.
    const govItems: FeeDisclosure[] = [];
    for (const k of ["DUTY", "TAX", "GOVERNMENT_FEE"]) {
      if (byCategory.has(k)) {
        govItems.push(...byCategory.get(k)!);
        seen.add(k);
      }
    }
    if (govItems.length > 0) {
      display.push({
        category: "GOVERNMENT_CHARGES",
        label: "C. GOVERNMENT CHARGES",
        totalAmount: govItems.reduce((s, i) => s + Number(i.feeAmount || 0), 0),
        currency: govItems[0]?.currency || "USD",
        items: govItems,
      });
    }

    // D. THIRD-PARTY PASS-THROUGH — combine THIRD_PARTY_FEE + PASS_THROUGH.
    const passItems: FeeDisclosure[] = [];
    for (const k of ["THIRD_PARTY_FEE", "PASS_THROUGH"]) {
      if (byCategory.has(k)) {
        passItems.push(...byCategory.get(k)!);
        seen.add(k);
      }
    }
    if (passItems.length > 0) {
      display.push({
        category: "THIRD_PARTY_PASS_THROUGH",
        label: "D. THIRD-PARTY PASS-THROUGH",
        totalAmount: passItems.reduce((s, i) => s + Number(i.feeAmount || 0), 0),
        currency: passItems[0]?.currency || "USD",
        items: passItems,
      });
    }

    // E. OTHER REGULATORY CHARGES (catch-all for anything left).
    const otherItems: FeeDisclosure[] = [];
    for (const [k, items] of byCategory.entries()) {
      if (!seen.has(k)) otherItems.push(...items);
    }
    if (otherItems.length > 0) {
      display.push({
        category: "OTHER_REGULATORY_CHARGE",
        label: "E. OTHER REGULATORY CHARGES",
        totalAmount: otherItems.reduce((s, i) => s + Number(i.feeAmount || 0), 0),
        currency: otherItems[0]?.currency || "USD",
        items: otherItems,
      });
    }

    return display;
  } catch (err: any) {
    logger.error("[fee-visibility/formatFeeBreakdown] failed", { error: err?.message });
    return [];
  }
}

// ============ Helper: list quotes for a USTN ============

/**
 * Convenience helper for the visibility route — returns all quotes for a
 * USTN so the trader portal can show "pending quotes awaiting your
 * acceptance". Never throws.
 */
export async function listQuotesForUstn(ustn: string): Promise<BrokerQuote[]> {
  try {
    if (!ustn) return [];
    return await listBrokerQuotes({ ustn, limit: 50 });
  } catch (err: any) {
    logger.error("[fee-visibility/listQuotesForUstn] failed", { ustn, error: err?.message });
    return [];
  }
}
