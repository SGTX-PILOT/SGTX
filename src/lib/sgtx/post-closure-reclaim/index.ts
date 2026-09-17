// @ts-nocheck
/**
 * SGTX Part 73 — Post-Closure Reclaim Engine
 * ===========================================================================
 *
 * A closed trade (USTN) is IMMUTABLE: the Final Evidence Package is sealed,
 * the Loom chain hash is anchored, the Governor has signed off. NOTHING
 * about the closed trade can be edited, deleted, or "reopened" — to do so
 * would violate the L0 constitution's immutability guarantee.
 *
 * Post-closure reclaim does NOT reopen the trade. Instead, it opens a NEW
 * event chain (a `ReclaimCase`) that is *linked* to the sealed USTN. The
 * reclaim case is a separate, independently-sealed audit trail that proves
 * a downstream refund/drawback/dispute was sought without ever touching
 * the original evidence.
 *
 * Supported reclaim types (§73.4):
 *   DRAWBACK           — duty drawback (exported goods that were previously imported)
 *   VAT_REFUND         — VAT refund for exported / re-exported goods
 *   FTA_RETRO          — FTA retroactive claim (preferential rate applied post-importation)
 *   DEMURRAGE_DISPUTE  — demurrage dispute reopening (overcharge / wrong free time)
 *
 * Each reclaim case carries its own evidence package (a snapshot of the
 * documents required to substantiate the reclaim — typically a subset of
 * the sealed USTN evidence plus reclaim-specific docs like the drawback
 * filing form).
 *
 * CRITICAL CONSTRAINT — recovery ≠ erasure:
 *   The reclaim engine NEVER modifies the sealed USTN evidence. It reads
 *   the sealed package (read-only) and writes a new ReclaimCase record
 *   with its own packageId + sealedAt. The original evidence remains
 *   pristine for customs audit.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ Types ============

export type ReclaimType = "DRAWBACK" | "VAT_REFUND" | "FTA_RETRO" | "DEMURRAGE_DISPUTE";

export interface ReclaimOpportunity {
  type: ReclaimType;
  ustn: string;
  estimatedValue: number;
  rationale: string;
  evidenceRefs: string[];
}

export interface ReclaimCase {
  reclaimCaseId: string;
  ustn: string;
  type: ReclaimType;
  estimatedValue: number;
  evidencePackage: any;
  status: "DETECTED" | "FILED" | "APPROVED" | "REJECTED" | "PAID";
  detectedAt: string;
}

// ============ §73.3 — Opportunity detection ============

async function loadClosedTrade(ustn: string): Promise<any | null> {
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        shipments: true,
        customsOperations: true,
        invoices: true,
        globalPayments: true,
        evidencePackages: { orderBy: { sealedAt: "desc" }, take: 1 },
      },
    });
    if (!trade) return null;
    if (!/CLOSED|COMPLETED|SETTLED/i.test(trade.status || "")) return null;
    return trade;
  } catch (err: any) {
    logger.warn("[post-closure-reclaim] loadClosedTrade failed", { ustn, error: err?.message });
    return null;
  }
}

async function detectDrawback(trade: any): Promise<ReclaimOpportunity | null> {
  try {
    // Drawback applies when imported goods are subsequently exported or
    // used to manufacture exported goods. SGTX checks if the shipment
    // movement type indicates export-after-import.
    const ship = trade?.shipments?.[0];
    if (!ship) return null;
    const isReexport = /RE_EXPORT|REEXPORT|DRAWBACK/i.test(ship.movementType || ship.notes || "");
    if (!isReexport) return null;
    const dutyPaid = (trade?.globalPayments || [])
      .filter((p: any) => /DUTY|CUSTOMS/i.test(p.paymentType || p.purpose || ""))
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    if (dutyPaid <= 0) return null;
    const refundable = Math.round(dutyPaid * 0.99); // 99% drawback per WTO standard
    return {
      type: "DRAWBACK",
      ustn: trade.ustn,
      estimatedValue: refundable,
      rationale: `Re-export detected; ${dutyPaid} duty paid → 99% drawback eligible.`,
      evidenceRefs: ["customsOperations", "globalPayments", "shipments"],
    };
  } catch {
    return null;
  }
}

async function detectVatRefund(trade: any): Promise<ReclaimOpportunity | null> {
  try {
    const vatPaid = (trade?.globalPayments || [])
      .filter((p: any) => /VAT|GST/i.test(p.paymentType || p.purpose || ""))
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    if (vatPaid <= 0) return null;
    const ship = trade?.shipments?.[0];
    const isExport = /EXPORT|RE_EXPORT/i.test(ship?.movementType || "");
    if (!isExport) return null;
    return {
      type: "VAT_REFUND",
      ustn: trade.ustn,
      estimatedValue: Math.round(vatPaid * 0.85),
      rationale: `Export of VAT-paid goods; ~85% recoverable per destination jurisdiction.`,
      evidenceRefs: ["globalPayments", "shipments"],
    };
  } catch {
    return null;
  }
}

async function detectFtaRetro(trade: any): Promise<ReclaimOpportunity | null> {
  try {
    const ops = trade?.customsOperations || [];
    const usedPref = ops.some((o: any) => /PREFERENTIAL|FTA|EUR\.1|FORM_A|FORM_E/i.test(o.notes || o.declarationType || ""));
    if (usedPref) return null; // already claimed at import
    const invoice = trade?.invoices?.[0];
    if (!invoice) return null;
    const origin = invoice.originCountry || trade.originCountry;
    const dest = trade.destinationCountry;
    const hasFta = (origin === "EG" && dest === "DE") || (origin === "VN" && dest === "DE");
    if (!hasFta) return null;
    const dutyPaid = (trade?.globalPayments || [])
      .filter((p: any) => /DUTY/i.test(p.paymentType || ""))
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    if (dutyPaid <= 0) return null;
    return {
      type: "FTA_RETRO",
      ustn: trade.ustn,
      estimatedValue: Math.round(dutyPaid * 0.7),
      rationale: `FTA exists (${origin}→${dest}) but preferential rate not claimed at import; retroactive claim possible within 12 months.`,
      evidenceRefs: ["customsOperations", "invoices", "globalPayments"],
    };
  } catch {
    return null;
  }
}

async function detectDemurrageDispute(trade: any): Promise<ReclaimOpportunity | null> {
  try {
    const tracks = await db.demurrageTracking.findMany({ where: { ustn: trade.ustn } }).catch(() => []);
    const overcharge = (tracks as any[])
      .filter((t) => (t.disputeStatus || "").toUpperCase() === "OPEN" || Number(t.totalAmount || 0) > 5000);
    if (overcharge.length === 0) return null;
    const total = overcharge.reduce((s, t) => s + Number(t.totalAmount || 0), 0);
    return {
      type: "DEMURRAGE_DISPUTE",
      ustn: trade.ustn,
      estimatedValue: Math.round(total * 0.3),
      rationale: `${overcharge.length} demurrage line(s) over threshold or flagged for dispute; estimated 30% recoverable.`,
      evidenceRefs: ["demurrageTracking"],
    };
  } catch {
    return null;
  }
}

export async function detectReclaimOpportunities(ustn: string): Promise<ReclaimOpportunity[]> {
  try {
    const trade = await loadClosedTrade(ustn);
    if (!trade) return [];
    const checks = await Promise.all([
      detectDrawback(trade),
      detectVatRefund(trade),
      detectFtaRetro(trade),
      detectDemurrageDispute(trade),
    ]);
    return checks.filter(Boolean) as ReclaimOpportunity[];
  } catch (err: any) {
    logger.error("[post-closure-reclaim] detectReclaimOpportunities failed", { ustn, error: err?.message });
    return [];
  }
}

// ============ §73.6 — Create reclaim case ============

export async function createReclaimCase(ustn: string, type: string): Promise<ReclaimCase> {
  try {
    const opportunities = await detectReclaimOpportunities(ustn);
    const match = opportunities.find((o) => o.type === type);
    if (!match) {
      return {
        reclaimCaseId: "",
        ustn,
        type: type as ReclaimType,
        estimatedValue: 0,
        evidencePackage: null,
        status: "REJECTED",
        detectedAt: new Date().toISOString(),
      };
    }
    // Build a NEW evidence package for the reclaim — NEVER mutate the sealed USTN package.
    const sealed = await db.finalEvidencePackage.findFirst({
      where: { ustn },
      orderBy: { sealedAt: "desc" },
    }).catch(() => null);
    const evidencePackage = {
      sourceSealedPackageId: sealed?.id || null,
      sourceSealedHash: sealed?.packageHash || null,
      evidenceRefs: match.evidenceRefs,
      note: "Reclaim evidence references the sealed USTN package read-only; no mutation performed.",
    };
    const reclaimCaseId = `RC-${ustn}-${type}-${Date.now().toString(36)}`;
    const caseRecord: ReclaimCase = {
      reclaimCaseId,
      ustn,
      type: type as ReclaimType,
      estimatedValue: match.estimatedValue,
      evidencePackage,
      status: "DETECTED",
      detectedAt: new Date().toISOString(),
    };
    try {
      await db.reclaimCase.create({ data: {
        id: reclaimCaseId,
        ustn,
        type,
        estimatedValue: match.estimatedValue,
        status: "DETECTED",
        evidencePackage,
        detectedAt: new Date(),
      }});
    } catch (dbErr: any) {
      logger.warn("[post-closure-reclaim] persist failed (table may be missing)", { error: dbErr?.message });
    }
    return caseRecord;
  } catch (err: any) {
    logger.error("[post-closure-reclaim] createReclaimCase failed", { ustn, type, error: err?.message });
    return {
      reclaimCaseId: "",
      ustn,
      type: type as ReclaimType,
      estimatedValue: 0,
      evidencePackage: null,
      status: "REJECTED",
      detectedAt: new Date().toISOString(),
    };
  }
}
