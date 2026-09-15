// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Anonymous Trade Management (Government Portal)
// -----------------------------------------------------------------------------
// Creates anonymized versions of real trades for transparent trade-flow
// statistics, academic research, and regulatory reporting WITHOUT exposing
// counterparty identities or exact commercial values.
//
// USTN format: SGTX-ANON-{YEAR}-{V1}-{SEQ}  (e.g. SGTX-ANON-2025-V1-00042)
//
// Redaction rules:
//   • Counterparty GTIDs → role-only labels ("BUYER_A", "SELLER_A")
//   • Exact trade value  → bucketed range ("$0–10k", "$10k–50k", "$50k–250k", "$250k+")
//   • Specific ports     → country-level only ("Port of Alexandria" → "EG")
//   • Commodity HS      → chapter-level (HS-2) + generic description
//   • Documents          → redacted titles + redacted type-only (no payload)
//
// Declassification (reverse the redaction): requires 3-of-5 multisig approval
// from the SGTX Governance Authority. Audit-logged permanently.
//
// Storage:
//   • ConfigurationHistory (configKey = `anon_trade:{anonymousUstn}`)
//     — JSON: { originalTradeId, originalUstn, redactedTrade, redactedDocuments, redactionConfig, createdAt, createdBy }
//   • MultisigRequest (requestType = "ANON_DECLASSIFY")
//     — payload: { anonymousUstn, reason, requesterGtid, requestId, requiredApprovals: 3 }
//   • ConfigurationHistory (configKey = `anon_declassification_log:{anonymousUstn}`)
//     — JSON log entries written on completion.
// =============================================================================
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export interface RedactionConfig {
  redactCounterparties: boolean; // default true
  redactExactValues: boolean;    // default true
  redactLocations: boolean;       // default true
  redactHsToChapter: boolean;    // default true
  redactDocuments: boolean;      // default true
  valueBuckets?: string[];       // default ["0-10k","10k-50k","50k-250k","250k+"]
}

export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  redactCounterparties: true,
  redactExactValues: true,
  redactLocations: true,
  redactHsToChapter: true,
  redactDocuments: true,
  valueBuckets: ["0-10k", "10k-50k", "50k-250k", "250k+"],
};

const DEFAULT_AUTHORIZED_APPROVERS = [
  "SGTX-EG-GOV-000001-9A0B", // Egypt Customs
  "SGTX-ADM-000001-C1D2",   // SGTX Platform Admin
  "SGTX-GOV-LEGAL-0001-E3F4", // Legal counsel
  "SGTX-GOV-COMPL-0001-A5B6", // Compliance officer
  "SGTX-GOV-AUDIT-0001-C7D8", // External auditor
];

// =============================================================================
// createAnonymousTrade
// =============================================================================
export async function createAnonymousTrade(
  realTradeId: string,
  redactionConfig: Partial<RedactionConfig> = {},
  createdBy: string = "system",
): Promise<{
  anonymousUstn: string;
  redactedTrade: any;
  redactedDocuments: any[];
  declassificationLogId: string;
}> {
  const trade = await db.trade.findUnique({
    where: { id: realTradeId },
    include: {
      documents: true,
      invoices: true,
      quotations: true,
    },
  });
  if (!trade) throw new Error("trade not found");
  if (trade.ustn?.startsWith("SGTX-ANON-")) {
    throw new Error("cannot create an anonymous version of an already-anonymous trade");
  }

  const cfg = { ...DEFAULT_REDACTION_CONFIG, ...redactionConfig };
  const year = new Date().getFullYear();
  const seq = await nextAnonSequence(year);
  const anonymousUstn = `SGTX-ANON-${year}-V1-${String(seq).padStart(5, "0")}`;

  // ----- Redact the trade fields -----
  const redactedTrade: any = {
    anonymousUstn,
    originalTradeIdRef: "REDACTED",
    originalUstnRef: "REDACTED",
    commodity: trade.commodity,
    commodityHs: cfg.redactHsToChapter ? (trade.commodityHs?.slice(0, 2) || "00") + "00" : (trade.commodityHs || null),
    incoterm: trade.incoterm,
    grossWeightKg: cfg.redactExactValues ? bucketWeight(trade.grossWeightKg) : trade.grossWeightKg,
    netWeightKg: cfg.redactExactValues ? bucketWeight(trade.netWeightKg) : trade.netWeightKg,
    tradeValueUsd: cfg.redactExactValues ? bucketValue(trade.tradeValueUsd, cfg.valueBuckets!) : trade.tradeValueUsd,
    currency: trade.currency,
    originCountry: trade.originCountry,
    destCountry: trade.destCountry,
    originPort: cfg.redactLocations ? trade.originCountry : trade.originPort,
    destPort: cfg.redactLocations ? trade.destCountry : trade.destPort,
    buyerGtid: cfg.redactCounterparties ? "BUYER_A" : trade.buyerGtid,
    sellerGtid: cfg.redactCounterparties ? "SELLER_A" : trade.sellerGtid,
    transportMode: trade.transportMode,
    containerCount: trade.containerCount,
    coldChain: trade.coldChain,
    status: trade.status,
    phase: trade.phase,
    createdAt: trade.createdAt.toISOString(),
    redactionConfig: cfg,
  };

  // ----- Redact documents -----
  const redactedDocuments = (trade.documents || []).map((d: any, idx: number) => ({
    docId: d.id,
    index: idx,
    type: d.type,
    title: cfg.redactDocuments ? `[REDACTED ${d.type}]` : d.title,
    status: d.status,
    uploadedBy: cfg.redactCounterparties ? "REDACTED" : (d.uploadedBy || "REDACTED"),
    payloadRef: "REDACTED", // No payload URL — never expose original document body.
  }));

  // ----- Persist in ConfigurationHistory -----
  const declassificationLogId = `ANON-LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await db.configurationHistory.create({
    data: {
      configKey: `anon_trade:${anonymousUstn}`,
      oldValue: null,
      newValue: JSON.stringify({
        anonymousUstn,
        originalTradeId: realTradeId,
        originalUstn: trade.ustn,
        redactedTrade,
        redactedDocuments,
        redactionConfig: cfg,
        createdBy,
        createdAt: new Date().toISOString(),
        declassificationLogId,
      }),
      changedByGtid: createdBy,
      changeReason: `Anonymous trade created from ${trade.ustn}`,
      version: 1,
    },
  });

  // ----- Audit log -----
  await db.activity.create({
    data: {
      tradeId: realTradeId,
      actorGtid: createdBy,
      action: "ANON_TRADE_CREATED",
      description: `Anonymous trade ${anonymousUstn} created from ${trade.ustn}`,
      type: "INFO",
      metadata: JSON.stringify({ anonymousUstn, originalUstn: trade.ustn, redactionConfig: cfg }),
    },
  }).catch((e: any) => logger.error("[anon-trade] activity create failed:", e?.message));

  return { anonymousUstn, redactedTrade, redactedDocuments, declassificationLogId };
}

// =============================================================================
// getAnonymousTrade
// =============================================================================
export async function getAnonymousTrade(anonymousUstn: string): Promise<{
  redactedTrade: any;
  originalRef: { tradeId: string; ustn: string; declassified: boolean };
}> {
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `anon_trade:${anonymousUstn}` },
    orderBy: { createdAt: "desc" },
  });
  if (!row?.newValue) throw new Error("anonymous trade not found");
  const parsed = JSON.parse(row.newValue);
  const declassified = await isDeclassified(anonymousUstn);
  return {
    redactedTrade: declassified ? revealOriginal(parsed) : parsed.redactedTrade,
    originalRef: {
      tradeId: declassified ? parsed.originalTradeId : "REDACTED",
      ustn: declassified ? parsed.originalUstn : "REDACTED",
      declassified,
    },
  };
}

// =============================================================================
// listAnonymousTrades
// =============================================================================
export async function listAnonymousTrades(limit: number = 50): Promise<{
  anonymousTrades: any[];
  count: number;
}> {
  const rows = await db.configurationHistory.findMany({
    where: { configKey: { startsWith: "anon_trade:" } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  }).catch(() => []);

  const anonymousTrades = rows.map((r: any) => {
    try {
      const p = JSON.parse(r.newValue);
      return {
        anonymousUstn: p.anonymousUstn,
        originalUstnRedacted: "REDACTED",
        commodity: p.redactedTrade?.commodity,
        commodityHs: p.redactedTrade?.commodityHs,
        originCountry: p.redactedTrade?.originCountry,
        destCountry: p.redactedTrade?.destCountry,
        tradeValueUsd: p.redactedTrade?.tradeValueUsd,
        createdAt: p.createdAt,
        createdBy: p.createdBy,
        redactedDocumentsCount: (p.redactedDocuments || []).length,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return { anonymousTrades, count: anonymousTrades.length };
}

// =============================================================================
// requestDeclassification — 3-of-5 multisig
// =============================================================================
export async function requestDeclassification(
  anonymousUstn: string,
  reason: string,
  requesterGtid: string,
): Promise<{
  declassificationRequestId: string;
  requiredApprovals: number;
  authorizedApproverGtids: string[];
}> {
  // Verify the anonymous trade exists.
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `anon_trade:${anonymousUstn}` },
    orderBy: { createdAt: "desc" },
  });
  if (!row?.newValue) throw new Error("anonymous trade not found");

  const declassificationRequestId = `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const requiredApprovals = 3;
  const payload = {
    anonymousUstn,
    reason,
    requesterGtid,
    requestId: declassificationRequestId,
    requiredApprovals,
    authorizedApproverGtids: DEFAULT_AUTHORIZED_APPROVERS,
  };

  await db.multisigRequest.create({
    data: {
      requestType: "ANON_DECLASSIFY",
      requesterGtid,
      payload: JSON.stringify(payload),
      requiredApprovals,
      authorisedApproverGtids: JSON.stringify(DEFAULT_AUTHORIZED_APPROVERS),
      status: "PENDING",
    },
  });

  // Inbox the governance authority members.
  for (const approverGtid of DEFAULT_AUTHORIZED_APPROVERS) {
    await db.inboxItem.create({
      data: {
        tenantGtid: approverGtid,
        category: "APPROVAL",
        priority: 95,
        title: `Declassification request: ${anonymousUstn}`,
        description: `Declassification of anonymous trade ${anonymousUstn} requested by ${requesterGtid}. Reason: ${reason}. ${requiredApprovals}-of-${DEFAULT_AUTHORIZED_APPROVERS.length} approvals required.`,
        ctaLabel: "Review & Approve",
      },
    }).catch((e: any) => logger.error("[anon-trade] inbox failed:", e?.message));
  }

  await db.activity.create({
    data: {
      actorGtid: requesterGtid,
      action: "ANON_DECLASSIFY_REQUESTED",
      description: `Declassification requested for ${anonymousUstn}`,
      type: "WARN",
      metadata: JSON.stringify(payload),
    },
  }).catch((e: any) => logger.error("[anon-trade] activity failed:", e?.message));

  return {
    declassificationRequestId,
    requiredApprovals,
    authorizedApproverGtids: DEFAULT_AUTHORIZED_APPROVERS,
  };
}

// =============================================================================
// approveDeclassification — record one approval against the multisig request
// =============================================================================
export async function approveDeclassification(
  requestId: string,
  approverGtid: string,
  decision: "APPROVE" | "REJECT" = "APPROVE",
): Promise<{
  approved: boolean;
  approvalsCount: number;
  declassified: boolean;
  request: any;
}> {
  // MultisigRequest ids are cuid, but requestId from requestDeclassification is `DEC-...`.
  // Look up by payload to find the actual multisig row.
  const requests = await db.multisigRequest.findMany({
    where: { requestType: "ANON_DECLASSIFY", status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const target = requests.find((r: any) => {
    try {
      const p = JSON.parse(r.payload || "{}");
      return p.requestId === requestId;
    } catch { return false; }
  });
  if (!target) throw new Error("declassification request not found (or already resolved)");

  // Authorised approver check.
  if (target.authorisedApproverGtids) {
    try {
      const authorised = JSON.parse(target.authorisedApproverGtids);
      if (Array.isArray(authorised) && authorised.length > 0 && !authorised.includes(approverGtid)) {
        throw new Error("approver not in the authorised set");
      }
    } catch (e: any) {
      if (e.message.includes("authorised")) throw e;
    }
  }

  const approvals = JSON.parse(target.approvals || "[]");
  if (decision === "REJECT") {
    await db.multisigRequest.update({
      where: { id: target.id },
      data: { status: "REJECTED" },
    });
    return { approved: false, approvalsCount: approvals.length, declassified: false, request: target };
  }

  if (approvals.includes(approverGtid)) {
    return { approved: false, approvalsCount: approvals.length, declassified: false, request: target };
  }
  approvals.push(approverGtid);
  const isApproved = approvals.length >= target.requiredApprovals;

  await db.multisigRequest.update({
    where: { id: target.id },
    data: {
      approvals: JSON.stringify(approvals),
      status: isApproved ? "APPROVED" : "PENDING",
      executedAt: isApproved ? new Date() : null,
    },
  });

  let declassified = false;
  if (isApproved) {
    // Execute declassification — write the declassification log entry.
    const payload = JSON.parse(target.payload || "{}");
    declassified = await executeDeclassification(payload.anonymousUstn, approverGtid, payload.reason, approvals);
  }

  return { approved: isApproved, approvalsCount: approvals.length, declassified, request: target };
}

// =============================================================================
// executeDeclassification — write a log entry, flip the isDeclassified flag
// =============================================================================
async function executeDeclassification(
  anonymousUstn: string,
  approvedBy: string,
  reason: string,
  approverGtids: string[],
): Promise<boolean> {
  // Find the anon_trade row.
  const tradeRow = await db.configurationHistory.findFirst({
    where: { configKey: `anon_trade:${anonymousUstn}` },
    orderBy: { createdAt: "desc" },
  });
  if (!tradeRow) return false;
  const tradeData = JSON.parse(tradeRow.newValue);
  if (tradeData.declassified) return true; // Already done.

  tradeData.declassified = true;
  tradeData.declassifiedAt = new Date().toISOString();
  tradeData.declassificationReason = reason;
  tradeData.declassificationApprovedBy = approverGtids;

  await db.configurationHistory.create({
    data: {
      configKey: `anon_trade:${anonymousUstn}`,
      oldValue: tradeRow.newValue,
      newValue: JSON.stringify(tradeData),
      changedByGtid: approvedBy,
      changeReason: `Declassified: ${reason}`,
      version: (tradeRow.version || 1) + 1,
    },
  });

  // Log entry in the declassification log.
  await db.configurationHistory.create({
    data: {
      configKey: `anon_declassification_log:${anonymousUstn}`,
      newValue: JSON.stringify({
        anonymousUstn,
        originalTradeId: tradeData.originalTradeId,
        originalUstn: tradeData.originalUstn,
        declassifiedAt: tradeData.declassifiedAt,
        reason,
        approvedBy: approverGtids,
      }),
      changedByGtid: approvedBy,
      changeReason: `Declassification executed`,
      version: 1,
    },
  });

  // Audit.
  await db.activity.create({
    data: {
      actorGtid: approvedBy,
      action: "ANON_DECLASSIFY_EXECUTED",
      description: `Anonymous trade ${anonymousUstn} declassified. Original: ${tradeData.originalUstn}.`,
      type: "WARN",
      metadata: JSON.stringify({ anonymousUstn, originalUstn: tradeData.originalUstn, reason, approvedBy: approverGtids }),
    },
  }).catch((e: any) => logger.error("[anon-trade] activity failed:", e?.message));

  return true;
}

// =============================================================================
// getDeclassificationLog
// =============================================================================
export async function getDeclassificationLog(limit: number = 50): Promise<{
  log: any[];
  count: number;
}> {
  const rows = await db.configurationHistory.findMany({
    where: { configKey: { startsWith: "anon_declassification_log:" } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  }).catch(() => []);

  const log = rows.map((r: any) => {
    try { return JSON.parse(r.newValue); } catch { return null; }
  }).filter(Boolean);

  return { log, count: log.length };
}

// =============================================================================
// helpers
// =============================================================================
async function isDeclassified(anonymousUstn: string): Promise<boolean> {
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `anon_trade:${anonymousUstn}` },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!row?.newValue) return false;
  try {
    const p = JSON.parse(row.newValue);
    return !!p.declassified;
  } catch {
    return false;
  }
}

function revealOriginal(parsed: any): any {
  return {
    ...parsed.redactedTrade,
    originalTradeIdRef: parsed.originalTradeId,
    originalUstnRef: parsed.originalUstn,
    buyerGtid: parsed.originalBuyerGtid || parsed.redactedTrade?.buyerGtid,
    sellerGtid: parsed.originalSellerGtid || parsed.redactedTrade?.sellerGtid,
    declassified: true,
    declassifiedAt: parsed.declassifiedAt,
    declassificationReason: parsed.declassificationReason,
  };
}

function bucketValue(value: number, buckets: string[]): string {
  if (value <= 10000) return buckets[0] || "0-10k";
  if (value <= 50000) return buckets[1] || "10k-50k";
  if (value <= 250000) return buckets[2] || "50k-250k";
  return buckets[3] || "250k+";
}

function bucketWeight(kg: number): string {
  if (kg <= 1000) return "0-1t";
  if (kg <= 10000) return "1-10t";
  if (kg <= 50000) return "10-50t";
  return "50t+";
}

async function nextAnonSequence(year: number): Promise<number> {
  const count = await db.configurationHistory.count({
    where: {
      configKey: { startsWith: "anon_trade:SGTX-ANON-" },
      createdAt: { gte: new Date(year, 0, 1) },
    },
  }).catch(() => 0);
  return count + 1;
}
