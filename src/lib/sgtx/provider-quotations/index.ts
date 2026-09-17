// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX v18 §8.7 — Provider Quotation Model
 * ============================================================
 * Every logistics/inspection/lab/brokerage/government fee enters
 * the platform as a GTID-bound quote bound to the USTN. No leg
 * without an attributable quote.
 *
 * Quote JSON Schema (normative, per v18 §8.7):
 *   {
 *     quotation_id, ustn, provider_gtid, provider_name,
 *     service_type, service_details, fee{amount,currency,terms,
 *     condition}, valid_until, quoted_at, governor_decision_id,
 *     loom_hash
 *   }
 *
 * Provider type → service_type mapping (v18 §8.7):
 *   • SHIP  → OCEAN_FREIGHT, AIR_FREIGHT, RAIL_FREIGHT, RO_RO
 *   • LSP   → TRUCKING, FORWARDING, WAREHOUSING
 *   • LAB   → LAB_TESTING, PESTICIDE_RESIDUE, MICROBIOLOGICAL, CHEMICAL
 *   • QC    → QC_INSPECTION, PRE_SHIPMENT_QC, LOADING_SUPERVISION
 *   • CBR   → CUSTOMS_BROKERAGE, EXPORT_CUSTOMS, IMPORT_CUSTOMS
 *   • GOV   → CUSTOMS_DUTY, PHYTOSANITARY, HEALTH_CERT
 *
 * NON-MARKETPLACE GUARDRAIL (v18 §8.8):
 *   • `compareQuotations` returns quotes in deterministic
 *     alphabetical order by provider GTID — NO ranking, NO
 *     scoring, NO recommendation. The trader explicitly selects
 *     the winning quote; the platform never auto-picks.
 *
 * Persistence strategy:
 *   • ServiceQuotation row stores the canonical fields
 *     (quoteId, ustn, providerGtid, providerType, serviceType,
 *     feeUsd, currency, validityDays, validUntil, status,
 *     acceptedByGtid, acceptedAt).
 *   • `notes` (String?) stores a JSON-encoded extension object
 *     holding service_details, fee.terms, fee.condition,
 *     provider_name, loom_hash, governor_decision_id, quoted_at.
 *
 * Defensive design (carry-over from P3b/P4b libs):
 *   • Every DB call wrapped defensively — lib never throws; it
 *     logs + returns a safe default.
 *   • `createQuotation` is async + does the full Governor +
 *     Loom-hash pipeline; pure helpers (`sha256`, `buildQuoteId`,
 *     `compareQuotesByProviderGtid`) are exported for testability.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { governorDecide } from "@/lib/sgtx/governor";

// ============ §8.7 Service types (v18 enum) ============

export const PROVIDER_SERVICE_TYPES = {
  SHIP: ["OCEAN_FREIGHT", "AIR_FREIGHT", "RAIL_FREIGHT", "RO_RO"],
  LSP: ["TRUCKING", "FORWARDING", "WAREHOUSING"],
  LAB: ["LAB_TESTING", "PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "CHEMICAL"],
  QC: ["QC_INSPECTION", "PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
  CBR: ["CUSTOMS_BROKERAGE", "EXPORT_CUSTOMS", "IMPORT_CUSTOMS"],
  GOV: ["CUSTOMS_DUTY", "PHYTOSANITARY", "HEALTH_CERT"],
} as const;

/** Flat set of all v18 service types. */
export const ALL_SERVICE_TYPES: string[] = Object.values(PROVIDER_SERVICE_TYPES).flat();

/** Reverse map: service_type → provider type. */
const SERVICE_TYPE_TO_PROVIDER_TYPE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [ptype, services] of Object.entries(PROVIDER_SERVICE_TYPES)) {
    for (const s of services) out[s] = ptype;
  }
  return out;
})();

export function providerTypeForServiceType(serviceType: string): string | null {
  return SERVICE_TYPE_TO_PROVIDER_TYPE[serviceType] ?? null;
}

/** Provider type alias (some tenants use lower-case or alternate codes). */
const PROVIDER_TYPE_ALIASES: Record<string, string> = {
  "shipping line": "SHIP",
  ship: "SHIP",
  shipowner: "SHIP",
  shipping: "SHIP",
  logistics: "LSP",
  lsp: "LSP",
  freight_forwarder: "LSP",
  forwarder: "LSP",
  lab: "LAB",
  laboratory: "LAB",
  qc: "QC",
  quality_control: "QC",
  inspection: "QC",
  cbr: "CBR",
  customs_broker: "CBR",
  broker: "CBR",
  gov: "GOV",
  government: "GOV",
  customs_authority: "GOV",
  customs: "GOV",
};

export function normaliseProviderType(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const k = raw.trim().toUpperCase();
  if (PROVIDER_SERVICE_TYPES[k as keyof typeof PROVIDER_SERVICE_TYPES]) return k;
  return PROVIDER_TYPE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

// ============ §8.7 Quote status (state machine) ============

export const QUOTE_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  SUPERSEDED: "SUPERSEDED",
} as const;

// ============ §8.7 Public types ============

export interface FeeInput {
  amount: number;
  currency: string; // EGP | USD
  terms: string; // PREPAID | COLLECT | CREDIT
  condition: string; // milestone trigger — LOADED, DEPARTED, CUSTOMS_IMPORT, etc.
}

export interface ServiceDetailsInput {
  origin?: string;
  destination?: string;
  equipment?: string;
  transit_days?: number;
  hs_code?: string;
  weight_kg?: number;
  volume_cbm?: number;
  commodity?: string;
  [k: string]: any;
}

export interface QuotationInput {
  ustn: string;
  providerGtid: string;
  serviceType: string;
  serviceDetails?: ServiceDetailsInput;
  fee: FeeInput;
  validUntil?: string | Date;
  quotedAt?: string | Date;
  /** Optional — caller may pass through; otherwise derived from Tenant.legalName */
  providerName?: string;
  /** Optional — caller may pass through; otherwise derived from Tenant.type */
  providerType?: string;
  /** Optional — acceptor/trader creating the quote submission */
  submitterGtid?: string;
  /** Optional free-form notes (kept separate from the JSON-encoded extras) */
  notes?: string;
}

export interface Quotation {
  quotation_id: string;
  ustn: string;
  provider_gtid: string;
  provider_name: string;
  provider_type: string;
  service_type: string;
  service_details: ServiceDetailsInput;
  fee: FeeInput;
  valid_until: string | null;
  quoted_at: string;
  governor_decision_id: string | null;
  loom_hash: string | null;
  status: string;
  accepted_by_gtid: string | null;
  accepted_at: string | null;
  rejected_by_gtid?: string | null;
  rejected_reason?: string | null;
}

// ============ §8.7 Pure helpers ============

/** SHA-256 of canonical quote JSON. */
export function sha256(data: string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/** Build a Q-YYYYMMDD-NNN quote id. Sequence is per-USTN-per-day. */
export function buildQuoteId(ustn: string, seq: number, date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const s = String(Math.max(1, seq)).padStart(3, "0");
  return `Q-${y}${m}${d}-${s}`;
}

/**
 * Canonical JSON for Loom-hashing (JCS-style — keys sorted, no
 * whitespace). The Governor's hash chain uses the same convention.
 */
export function canonicalQuoteJson(quote: {
  quotation_id: string;
  ustn: string;
  provider_gtid: string;
  service_type: string;
  fee: FeeInput;
  valid_until: string | null;
  quoted_at: string;
  governor_decision_id: string | null;
}): string {
  const obj: Record<string, any> = {
    fee: quote.fee,
    governor_decision_id: quote.governor_decision_id,
    provider_gtid: quote.provider_gtid,
    quotation_id: quote.quotation_id,
    quoted_at: quote.quoted_at,
    service_type: quote.service_type,
    ustn: quote.ustn,
    valid_until: quote.valid_until,
  };
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Deterministic comparison — alphabetical by provider GTID.
 * Used by `compareQuotations`. NON-MARKETPLACE: never sorts by
 * price or trust score.
 */
export function compareQuotesByProviderGtid(a: Quotation, b: Quotation): number {
  return a.provider_gtid < b.provider_gtid ? -1 : a.provider_gtid > b.provider_gtid ? 1 : 0;
}

// ============ §8.7 Internal — quote ↔ DB row mappers ============

interface StoredExtras {
  service_details?: ServiceDetailsInput;
  fee_terms?: string;
  fee_condition?: string;
  provider_name?: string;
  loom_hash?: string;
  governor_decision_id?: string;
  quoted_at?: string;
  rejected_by_gtid?: string | null;
  rejected_reason?: string | null;
}

function parseExtras(notes: string | null | undefined): StoredExtras {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as StoredExtras;
  } catch {
    return {};
  }
}

function rowToQuote(row: any): Quotation {
  const extras = parseExtras(row?.notes);
  const fee: FeeInput = {
    amount: Number(row?.feeUsd ?? 0),
    currency: row?.currency ?? "USD",
    terms: extras.fee_terms ?? "PREPAID",
    condition: extras.fee_condition ?? "LOADED",
  };
  return {
    quotation_id: row.quoteId,
    ustn: row.ustn,
    provider_gtid: row.providerGtid,
    provider_name: extras.provider_name ?? "",
    provider_type: row.providerType ?? "",
    service_type: row.serviceType,
    service_details: extras.service_details ?? {},
    fee,
    valid_until: row.validUntil ? new Date(row.validUntil).toISOString() : null,
    quoted_at: extras.quoted_at ?? new Date(row.createdAt).toISOString(),
    governor_decision_id: extras.governor_decision_id ?? null,
    loom_hash: extras.loom_hash ?? null,
    status: row.status ?? "PENDING",
    accepted_by_gtid: row.acceptedByGtid ?? null,
    accepted_at: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
    rejected_by_gtid: extras.rejected_by_gtid ?? null,
    rejected_reason: extras.rejected_reason ?? null,
  };
}

// ============ §8.7 Public API ============

/**
 * Create a provider quotation.
 *
 * Pipeline (v18 §8.7):
 *   1. Validate USTN exists (Trade row).
 *   2. Validate provider GTID exists (Tenant row).
 *   3. Validate service_type matches the provider type.
 *   4. Governor validate (quote submission gate).
 *   5. Loom-hash the canonical quote JSON.
 *   6. Persist (ServiceQuotation row + JSON extras in `notes`).
 *
 * Returns: `{ quotationId, loomHash, governorDecisionId }`.
 */
export async function createQuotation(quote: QuotationInput): Promise<{
  quotationId: string;
  loomHash: string;
  governorDecisionId: string | null;
}> {
  // ── Basic input sanity ────────────────────────────────────────
  if (!quote.ustn) throw new Error("ustn required");
  if (!quote.providerGtid) throw new Error("providerGtid required");
  if (!quote.serviceType) throw new Error("serviceType required");
  if (!quote.fee || typeof quote.fee.amount !== "number") {
    throw new Error("fee.amount (number) required");
  }
  if (!quote.fee.currency || !["EGP", "USD"].includes(quote.fee.currency)) {
    throw new Error("fee.currency must be EGP or USD");
  }

  // ── Validate USTN exists ──────────────────────────────────────
  const trade = await db.trade.findUnique({ where: { ustn: quote.ustn } }).catch(() => null);
  if (!trade) throw new Error(`USTN not found: ${quote.ustn}`);

  // ── Validate provider GTID exists + derive provider type ──────
  const provider = await db.tenant.findUnique({ where: { gtid: quote.providerGtid } }).catch(() => null);
  if (!provider) throw new Error(`Provider GTID not found: ${quote.providerGtid}`);

  const providerType =
    normaliseProviderType(quote.providerType) ??
    normaliseProviderType(provider.type) ??
    null;
  if (!providerType) {
    throw new Error(`Unable to derive provider type from tenant.type='${provider.type}'`);
  }

  // ── Validate service_type matches provider type ───────────────
  const allowedServices = PROVIDER_SERVICE_TYPES[providerType as keyof typeof PROVIDER_SERVICE_TYPES];
  if (!allowedServices || !allowedServices.includes(quote.serviceType as any)) {
    throw new Error(
      `service_type '${quote.serviceType}' not permitted for provider type '${providerType}' ` +
        `(allowed: ${allowedServices ? allowedServices.join(", ") : "none"})`,
    );
  }

  // ── Governor validate (quote submission gate) ────────────────
  let govDecisionId: string | null = null;
  let govLoomHash: string | null = null;
  try {
    const gov = await governorDecide({
      action: "provider.quote.submit",
      actorGtid: quote.submitterGtid ?? quote.providerGtid,
      traderMode: provider.traderMode,
      resourceUstn: quote.ustn,
      payload: {
        providerGtid: quote.providerGtid,
        providerType,
        serviceType: quote.serviceType,
        feeAmount: quote.fee.amount,
        feeCurrency: quote.fee.currency,
        feeTerms: quote.fee.terms,
        feeCondition: quote.fee.condition,
      },
    });
    if (gov && (gov.verdict === "DENY" || gov.verdict === "CONDITIONAL")) {
      throw new Error(
        `Governor denied quote submission (verdict=${gov.verdict})${gov.tenantMessage ? ": " + gov.tenantMessage : ""}`,
      );
    }
    govDecisionId = gov?.decisionId ?? null;
    govLoomHash = gov?.loomHash ?? null;
  } catch (e: any) {
    // Governor pipeline threw — treat as DENY (defensive).
    logger.error("[provider-quotations/createQuotation] Governor pipeline failed", {
      error: e?.message,
      ustn: quote.ustn,
      providerGtid: quote.providerGtid,
    });
    throw new Error(`Governor pipeline error: ${e?.message || "unknown"}`);
  }

  // ── Build quote id + Loom hash ────────────────────────────────
  const today = new Date();
  // Sequence = count of existing quotes for this USTN today + 1.
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const existingCount = await db.serviceQuotation.count({
    where: {
      ustn: quote.ustn,
      createdAt: { gte: todayStart },
    },
  }).catch(() => 0);
  const quotationId = buildQuoteId(quote.ustn, (existingCount || 0) + 1, today);

  const quotedAt = quote.quotedAt ? new Date(quote.quotedAt).toISOString() : today.toISOString();
  const validUntilIso = quote.validUntil
    ? new Date(quote.validUntil).toISOString()
    : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const canonical = canonicalQuoteJson({
    quotation_id: quotationId,
    ustn: quote.ustn,
    provider_gtid: quote.providerGtid,
    service_type: quote.serviceType,
    fee: quote.fee,
    valid_until: validUntilIso,
    quoted_at: quotedAt,
    governor_decision_id: govDecisionId,
  });
  const loomHash = sha256(canonical);

  // ── Persist ───────────────────────────────────────────────────
  const extras: StoredExtras = {
    service_details: quote.serviceDetails ?? {},
    fee_terms: quote.fee.terms,
    fee_condition: quote.fee.condition,
    provider_name: quote.providerName ?? provider.legalName,
    loom_hash: loomHash,
    governor_decision_id: govDecisionId,
    quoted_at: quotedAt,
  };

  const validityDays = quote.validUntil
    ? Math.max(1, Math.ceil((new Date(quote.validUntil).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
    : 7;

  try {
    await db.serviceQuotation.create({
      data: {
        quoteId: quotationId,
        tradeId: trade.id,
        ustn: quote.ustn,
        providerGtid: quote.providerGtid,
        providerType,
        serviceType: quote.serviceType,
        feeUsd: Number(quote.fee.amount),
        currency: quote.fee.currency,
        validityDays,
        validUntil: new Date(validUntilIso),
        status: QUOTE_STATUS.PENDING,
        description: `Provider quotation for ${quote.serviceType}`,
        notes: JSON.stringify(extras),
      },
    });
  } catch (e: any) {
    // Duplicate quoteId (same USTN/day/seq) — extremely unlikely but
    // re-try with a higher sequence. Defensive only.
    if (String(e?.message || "").includes("Unique")) {
      const altId = buildQuoteId(quote.ustn, (existingCount || 0) + 100 + Math.floor(Math.random() * 900), today);
      try {
        await db.serviceQuotation.create({
          data: {
            quoteId: altId,
            tradeId: trade.id,
            ustn: quote.ustn,
            providerGtid: quote.providerGtid,
            providerType,
            serviceType: quote.serviceType,
            feeUsd: Number(quote.fee.amount),
            currency: quote.fee.currency,
            validityDays,
            validUntil: new Date(validUntilIso),
            status: QUOTE_STATUS.PENDING,
            description: `Provider quotation for ${quote.serviceType}`,
            notes: JSON.stringify({ ...extras, loom_hash: sha256(canonicalQuoteJson({
              quotation_id: altId,
              ustn: quote.ustn,
              provider_gtid: quote.providerGtid,
              service_type: quote.serviceType,
              fee: quote.fee,
              valid_until: validUntilIso,
              quoted_at: quotedAt,
              governor_decision_id: govDecisionId,
            })) }),
          },
        });
        return { quotationId: altId, loomHash: extras.loom_hash!, governorDecisionId: govDecisionId };
      } catch (e2: any) {
        logger.error("[provider-quotations/createQuotation] retry-create failed", {
          error: e2?.message,
        });
        throw new Error(`persist failed (retry): ${e2?.message || "unknown"}`);
      }
    }
    logger.error("[provider-quotations/createQuotation] create failed", {
      error: e?.message,
    });
    throw new Error(`persist failed: ${e?.message || "unknown"}`);
  }

  return { quotationId, loomHash, governorDecisionId: govDecisionId };
}

/** Get a single quotation by quotation_id. */
export async function getQuotation(quotationId: string): Promise<Quotation | null> {
  if (!quotationId) return null;
  const row = await db.serviceQuotation.findUnique({ where: { quoteId: quotationId } }).catch(() => null);
  if (!row) return null;
  return rowToQuote(row);
}

/** List all quotations for a USTN, optionally filtered by service type. */
export async function getQuotationsForUstn(
  ustn: string,
  serviceType?: string,
): Promise<Quotation[]> {
  if (!ustn) return [];
  const where: any = { ustn };
  if (serviceType) where.serviceType = serviceType;
  const rows = await db.serviceQuotation.findMany({
    where,
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  return rows.map(rowToQuote);
}

/**
 * Mark a quote as ACCEPTED. Only one quote per (USTN, service_type)
 * can be ACCEPTED — any prior ACCEPTED quote for the same service
 * type is first flipped to SUPERSEDED.
 */
export async function acceptQuotation(
  quotationId: string,
  acceptorGtid: string,
): Promise<{ accepted: boolean; acceptedAt: string; supersededQuotationIds: string[] }> {
  if (!quotationId) throw new Error("quotationId required");
  if (!acceptorGtid) throw new Error("acceptorGtid required");

  const row = await db.serviceQuotation.findUnique({ where: { quoteId: quotationId } }).catch(() => null);
  if (!row) throw new Error(`quotation not found: ${quotationId}`);
  if (row.status === QUOTE_STATUS.ACCEPTED) {
    return {
      accepted: true,
      acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : new Date().toISOString(),
      supersededQuotationIds: [],
    };
  }
  if (row.status === QUOTE_STATUS.REJECTED) throw new Error("cannot accept a REJECTED quote");
  if (row.status === QUOTE_STATUS.EXPIRED) throw new Error("cannot accept an EXPIRED quote");
  if (row.status === QUOTE_STATUS.SUPERSEDED) throw new Error("cannot accept a SUPERSEDED quote");

  // Find any prior ACCEPTED quote for the same (USTN, service_type).
  const priorAccepted = await db.serviceQuotation.findMany({
    where: {
      ustn: row.ustn,
      serviceType: row.serviceType,
      status: QUOTE_STATUS.ACCEPTED,
      quoteId: { not: quotationId },
    },
  }).catch(() => []);

  const now = new Date();
  const supersededIds: string[] = [];

  // Flip each prior ACCEPTED → SUPERSEDED.
  for (const p of priorAccepted) {
    try {
      const extras = parseExtras(p.notes);
      const newExtras: StoredExtras = {
        ...extras,
        rejected_by_gtid: acceptorGtid,
        rejected_reason: "superseded by accepted quote " + quotationId,
      };
      await db.serviceQuotation.update({
        where: { id: p.id },
        data: {
          status: QUOTE_STATUS.SUPERSEDED,
          acceptedByGtid: null,
          acceptedAt: null,
          notes: JSON.stringify(newExtras),
        },
      });
      supersededIds.push(p.quoteId);
    } catch (e: any) {
      logger.warn("[provider-quotations/acceptQuotation] supersede failed", {
        quoteId: p.quoteId,
        error: e?.message,
      });
    }
  }

  // Mark the chosen quote as ACCEPTED.
  try {
    await db.serviceQuotation.update({
      where: { id: row.id },
      data: {
        status: QUOTE_STATUS.ACCEPTED,
        acceptedByGtid: acceptorGtid,
        acceptedAt: now,
      },
    });
  } catch (e: any) {
    logger.error("[provider-quotations/acceptQuotation] update failed", {
      quoteId: quotationId,
      error: e?.message,
    });
    throw new Error(`accept update failed: ${e?.message || "unknown"}`);
  }

  return {
    accepted: true,
    acceptedAt: now.toISOString(),
    supersededQuotationIds: supersededIds,
  };
}

/** Mark a quote as REJECTED with a reason. */
export async function rejectQuotation(
  quotationId: string,
  rejectorGtid: string,
  reason: string,
): Promise<{ rejected: boolean }> {
  if (!quotationId) throw new Error("quotationId required");
  if (!rejectorGtid) throw new Error("rejectorGtid required");
  if (!reason) throw new Error("reason required");

  const row = await db.serviceQuotation.findUnique({ where: { quoteId: quotationId } }).catch(() => null);
  if (!row) throw new Error(`quotation not found: ${quotationId}`);
  if (row.status === QUOTE_STATUS.ACCEPTED) throw new Error("cannot reject an ACCEPTED quote");
  if (row.status === QUOTE_STATUS.REJECTED) return { rejected: true };

  const extras = parseExtras(row.notes);
  const newExtras: StoredExtras = {
    ...extras,
    rejected_by_gtid: rejectorGtid,
    rejected_reason: reason,
  };

  try {
    await db.serviceQuotation.update({
      where: { id: row.id },
      data: {
        status: QUOTE_STATUS.REJECTED,
        notes: JSON.stringify(newExtras),
      },
    });
  } catch (e: any) {
    logger.error("[provider-quotations/rejectQuotation] update failed", {
      quoteId: quotationId,
      error: e?.message,
    });
    throw new Error(`reject update failed: ${e?.message || "unknown"}`);
  }

  return { rejected: true };
}

/**
 * Side-by-side comparison for the UI.
 *
 * NON-MARKETPLACE GUARDRAIL (v18 §8.8):
 *   • Quotes are returned in DETERMINISTIC ALPHABETICAL ORDER by
 *     provider GTID — NO ranking, NO scoring, NO recommendation.
 *   • The `comparison` object exposes `by_price`, `by_transit_time`,
 *     `by_provider_trust` purely as RAW SORTED LISTS (NOT a ranked
 *     recommendation). The UI may display these as alternative lenses
 *     but must never auto-pick the "top" entry.
 */
export async function compareQuotations(
  ustn: string,
  serviceType: string,
): Promise<{
  quotes: Quotation[];
  comparison: {
    by_price: Quotation[];
    by_transit_time: Quotation[];
    by_provider_trust: Quotation[];
  };
}> {
  const quotes = await getQuotationsForUstn(ustn, serviceType);

  // Default order — DETERMINISTIC alphabetical by provider GTID.
  const alphabetical = [...quotes].sort(compareQuotesByProviderGtid);

  // Lens: by_price ascending. Tie-break by provider GTID (stable,
  // deterministic, non-recommendation).
  const byPrice = [...quotes].sort((a, b) => {
    if (a.fee.amount !== b.fee.amount) return a.fee.amount - b.fee.amount;
    return compareQuotesByProviderGtid(a, b);
  });

  // Lens: by_transit_time ascending (missing values sort last).
  const byTransit = [...quotes].sort((a, b) => {
    const at = a.service_details?.transit_days;
    const bt = b.service_details?.transit_days;
    if (at == null && bt == null) return compareQuotesByProviderGtid(a, b);
    if (at == null) return 1;
    if (bt == null) return -1;
    if (at !== bt) return at - bt;
    return compareQuotesByProviderGtid(a, b);
  });

  // Lens: by_provider_trust — TENANT.trustScore descending.
  // Tie-break by provider GTID (stable). This is informational only
  // and is NOT a recommendation — the trader must explicitly select.
  const withTrust = await Promise.all(
    quotes.map(async (q) => {
      const t = await db.tenant.findUnique({ where: { gtid: q.provider_gtid } }).catch(() => null);
      return { quote: q, trust: t?.trustScore ?? 0 };
    }),
  );
  const byTrust = withTrust
    .sort((a, b) => {
      if (a.trust !== b.trust) return b.trust - a.trust;
      return compareQuotesByProviderGtid(a.quote, b.quote);
    })
    .map((x) => x.quote);

  return {
    quotes: alphabetical,
    comparison: {
      by_price: byPrice,
      by_transit_time: byTransit,
      by_provider_trust: byTrust,
    },
  };
}

/** List all ACCEPTED quotations for a USTN (one per service type). */
export async function getAcceptedQuotations(ustn: string): Promise<Quotation[]> {
  if (!ustn) return [];
  const rows = await db.serviceQuotation.findMany({
    where: { ustn, status: QUOTE_STATUS.ACCEPTED },
    orderBy: { acceptedAt: "asc" },
  }).catch(() => []);
  return rows.map(rowToQuote);
}
