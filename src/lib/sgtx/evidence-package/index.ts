// @ts-nocheck
/**
 * SGTX Phase 7 — §5 Final Evidence Package Engine
 * ===========================================================================
 *
 * Implements the 26-section sealed evidence package on top of the new
 * `FinalEvidencePackage` Prisma model (schema line 6987). The Final
 * Evidence Package is the IMMUTABLE, sealed bundle of every piece of
 * evidence ever produced for a trade — from the initial RFQ through to
 * the final Loom chain hash — that is created at trade closure to
 * satisfy customs audits, dispute proceedings, and regulatory
 * record-retention requirements.
 *
 * The 26 evidence sections (§5) — each is a JSON array of evidence
 * items loaded from the relevant SGTX model:
 *
 *   rfq                  — RFQ evidence (BuyerSubmission, ShipQuoteRequest)
 *   quotation            — quotation evidence (LogisticsQuote, LogisticsQuoteV2, ServiceQuotation)
 *   purchaseOrder        — PO evidence (Trade itself + masterContractId)
 *   contract             — contract evidence (TradeContract)
 *   invoice              — invoice evidence (Invoice, TradeFinanceDocument)
 *   packingList          — packing list evidence (PackingList, PackingPlan)
 *   licenses             — license evidence (ExportLicense, ProviderValidation[LICENSE])
 *   permits              — permit evidence (GovernmentReference[permits], ProviderValidation[ROUTE_AUTHORIZATION])
 *   certificates         — certificate evidence (CertificateOfOrigin, Certificate, PtiCertificate)
 *   customs              — customs evidence (CustomsOperation, AirCustomsOperation)
 *   transport            — transport evidence (TransportGraph, TransportDocument, Shipment)
 *   gps                  — GPS evidence (Shipment.lat/lng, TradeEvent with GPS-like events)
 *   iot                  — IoT evidence (ReeferTelemetry, ColdChainReading, TradeMemoryEvent)
 *   inspection           — inspection evidence (QcInspection, LabTest, ReInspectionRequest)
 *   qc                   — QC evidence (QcActionPlan, QcOverrideFlag)
 *   governmentReferences — government reference evidence (GovernmentReference)
 *   payment              — payment evidence (GlobalPayment)
 *   bankConfirmation     — bank confirmation evidence (BankSettlementInstruction)
 *   settlement          — settlement evidence (SettlementInstruction, BankSettlementInstruction.settledAt)
 *   accounting           — accounting evidence (AccountingEntry)
 *   delivery             — delivery evidence (DeliveryAcceptance)
 *   claims               — claims evidence (TradeClaim)
 *   disputes             — disputes evidence (Dispute)
 *   communications       — communications evidence (TradeMessage)
 *   governorDecisions    — Governor decision evidence (GovernorDecision)
 *   loomChain            — Loom chain audit evidence (TradeEvent.eventHash chain, GovernorDecision.loomHash chain)
 *
 * Lifecycle (status state machine):
 *
 *   DRAFT ──sealEvidencePackage──▶ SEALED ──archiveEvidencePackage──▶ ARCHIVED
 *                                ──amendEvidencePackage──▶ AMENDED (creates new version)
 *
 * Seal: `sealEvidencePackage` computes the `packageHash` — SHA-256 of all
 * 26 section JSONs concatenated in CANONICAL ORDER (alphabetical by
 * section name). Sets `sealedAt` + `sealedBy` + `completenessScore`.
 * Once SEALED, the package is IMMUTABLE — any change requires
 * `amendEvidencePackage` which creates a NEW version (new packageId).
 *
 * `compileEvidencePackage(packageId)` is the main compiler — it loads
 * every section's evidence from the existing SGTX models for the
 * package's USTN. Each section load is wrapped in try/catch so a
 * failure in one section does NOT break the whole package (that section
 * is left empty + the failure is logged). The `completenessScore` is
 * recomputed as (populated sections / 26).
 *
 * `verifyPackageHash(packageId)` recomputes the hash from the stored
 * section JSONs and compares it with the stored `packageHash` — used to
 * detect tampering or corruption.
 *
 * `computePackageHash(pkg)` is PURE (no DB, no side effects) — it can be
 * unit-tested without a database connection.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ §5 Constants ============

/**
 * The 26 evidence sections (§5) in CANONICAL ORDER (alphabetical).
 *
 * NOTE: the original spec lists 25 sections; the canonical list contains
 * 26 because `bankConfirmation` and `settlement` are tracked separately
 * (bank confirmation is the bank's MT199/MT799 confirmation message,
 * settlement is the SGTX-internal settlement instruction record).
 */
export const EVIDENCE_SECTIONS = [
  "accounting",
  "bankConfirmation",
  "certificates",
  "claims",
  "communications",
  "contract",
  "customs",
  "delivery",
  "disputes",
  "governmentReferences",
  "governorDecisions",
  "gps",
  "inspection",
  "invoice",
  "iot",
  "licenses",
  "loomChain",
  "packingList",
  "payment",
  "permits",
  "purchaseOrder",
  "qc",
  "quotation",
  "rfq",
  "settlement",
  "transport",
] as const;

export const TOTAL_SECTIONS = EVIDENCE_SECTIONS.length; // 26

export const EVIDENCE_PACKAGE_STATUSES = [
  "DRAFT",
  "SEALED",
  "AMENDED",
  "ARCHIVED",
] as const;

// ============ Types ============

export interface CreatePackageInput {
  ustn?: string;
  tradeId?: string;
  notes?: string;
}

export interface FinalEvidencePackage {
  id: string;
  packageId: string;
  ustn?: string | null;
  tradeId?: string | null;
  rfq?: string | null;
  quotation?: string | null;
  purchaseOrder?: string | null;
  contract?: string | null;
  invoice?: string | null;
  packingList?: string | null;
  licenses?: string | null;
  permits?: string | null;
  certificates?: string | null;
  customs?: string | null;
  transport?: string | null;
  gps?: string | null;
  iot?: string | null;
  inspection?: string | null;
  qc?: string | null;
  governmentReferences?: string | null;
  payment?: string | null;
  bankConfirmation?: string | null;
  settlement?: string | null;
  accounting?: string | null;
  delivery?: string | null;
  claims?: string | null;
  disputes?: string | null;
  communications?: string | null;
  governorDecisions?: string | null;
  loomChain?: string | null;
  packageHash?: string | null;
  sealedAt?: Date | null;
  sealedBy?: string | null;
  status: string;
  completenessScore: number;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListPackagesFilter {
  ustn?: string;
  status?: string;
}

export interface CompletenessReport {
  score: number;
  populatedSections: string[];
  missingSections: string[];
}

export interface HashVerification {
  valid: boolean;
  computedHash: string;
  storedHash: string;
  reason: string;
}

// ============ §5.0 Pure helpers ============

/**
 * Pure: generate a `FEP-YYYYMMDD-NNNNN` package id. 5-digit zero-padded
 * random suffix. No DB, no side effects.
 */
export function generatePackageId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `FEP-${ymd}-${n}`;
}

/**
 * Pure: parse a section JSON string into an array. Defensive — returns
 * [] on any parse error or non-array input. No side effects.
 */
function parseSectionArray(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: serialize an array of evidence items into a JSON string. Empty
 * arrays serialize to `null` so the DB column stays null (rather than
 * storing `"[]"`). No side effects.
 */
function serializeSectionArray(arr: any[]): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

/**
 * Pure: compute the SHA-256 hash of all 26 section JSONs concatenated in
 * CANONICAL ORDER (alphabetical by section name).
 *
 * Algorithm:
 *   1. For each section in EVIDENCE_SECTIONS (alphabetical):
 *      - Get the section's stored value (string|null)
 *      - If null/empty: use the empty string
 *      - If a string: use it as-is (already JSON)
 *   2. Concatenate: `<section1>\n<section2>\n... \n<section26>`
 *      (newline-delimited so section boundaries are unambiguous)
 *   3. Return SHA-256 hex of the concatenated string.
 *
 * No DB, no side effects. Used by `sealEvidencePackage` and
 * `verifyPackageHash`.
 */
export function computePackageHash(pkg: FinalEvidencePackage): string {
  if (!pkg) return "";
  const parts: string[] = [];
  for (const section of EVIDENCE_SECTIONS) {
    const val = (pkg as any)[section];
    parts.push(typeof val === "string" ? val : "");
  }
  const payload = parts.join("\n");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Pure: returns the list of section names that have at least one
 * evidence item populated (i.e. the section JSON is non-empty + parses
 * to a non-empty array).
 */
function getPopulatedSections(pkg: FinalEvidencePackage): string[] {
  if (!pkg) return [];
  const populated: string[] = [];
  for (const section of EVIDENCE_SECTIONS) {
    const arr = parseSectionArray((pkg as any)[section]);
    if (arr.length > 0) populated.push(section);
  }
  return populated;
}

/**
 * Pure: returns the list of section names with NO evidence populated.
 */
function getMissingSections(pkg: FinalEvidencePackage): string[] {
  if (!pkg) return [...EVIDENCE_SECTIONS];
  const populated = new Set(getPopulatedSections(pkg));
  return EVIDENCE_SECTIONS.filter((s) => !populated.has(s));
}

/**
 * Pure: returns the fraction (0..1) of sections populated.
 */
function computeCompletenessScore(pkg: FinalEvidencePackage): number {
  if (!pkg) return 0;
  const populated = getPopulatedSections(pkg).length;
  return populated / TOTAL_SECTIONS;
}

// ============ §5 Section loaders ============
//
// Each loader is wrapped in try/catch — a failure in one section does NOT
// break the whole package; the section is left empty + the failure is
// logged. All loaders return `any[]` (the evidence items).

async function loadRfq(ustn: string, tradeId: string | null): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).buyerSubmission?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] rfq: BuyerSubmission load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).shipQuoteRequest?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] rfq: ShipQuoteRequest load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadQuotation(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await db.logisticsQuote.findMany({ where: { ustn } });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] quotation: LogisticsQuote load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).logisticsQuoteV2?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] quotation: LogisticsQuoteV2 load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (tradeId) {
      const rows = await (db as any).serviceQuotation?.findMany({
        where: { tradeId },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] quotation: ServiceQuotation load failed", {
      error: String(err),
      tradeId,
    });
  }
  return out;
}

async function loadPurchaseOrder(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const row = await db.trade.findUnique({ where: { ustn } });
      if (row) out.push(row);
    }
  } catch (err) {
    logger.warn("[evidence-package] purchaseOrder: Trade load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadContract(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).tradeContract?.findMany({
      where: { ustn },
      orderBy: { contractVersion: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] contract load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadInvoice(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (tradeId) {
      const rows = await (db as any).invoice?.findMany({
        where: { tradeId },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] invoice: Invoice load failed", {
      error: String(err),
      tradeId,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).tradeFinanceDocument?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] invoice: TradeFinanceDocument load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadPackingList(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).packingList?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] packingList: PackingList load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).packingPlan?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] packingList: PackingPlan load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadLicenses(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).exportLicense?.findMany({});
      // ExportLicense has no ustn field — load ALL + filter by tenant
      // via the Trade's buyerGtid/sellerGtid. For now, include all + tag.
      if (Array.isArray(rows)) {
        const trade = await db.trade.findUnique({ where: { ustn } });
        if (trade) {
          const filtered = rows.filter(
            (r: any) =>
              r.tenantGtid === trade.buyerGtid ||
              r.tenantGtid === trade.sellerGtid,
          );
          out.push(...filtered);
        }
      }
    }
  } catch (err) {
    logger.warn("[evidence-package] licenses: ExportLicense load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const trade = await db.trade.findUnique({ where: { ustn } });
      if (trade) {
        const rows = await (db as any).providerValidation?.findMany({
          where: {
            validationType: "LICENSE",
            providerGtid: { in: [trade.buyerGtid, trade.sellerGtid] },
          },
        });
        if (Array.isArray(rows)) out.push(...rows);
      }
    }
  } catch (err) {
    logger.warn("[evidence-package] licenses: ProviderValidation load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadPermits(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).governmentReference?.findMany({
        where: { ustn, referenceType: { in: ["TRANSIT_DECLARATION", "TIR"] } },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] permits: GovernmentReference load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const trade = await db.trade.findUnique({ where: { ustn } });
      if (trade) {
        const rows = await (db as any).providerValidation?.findMany({
          where: {
            validationType: "ROUTE_AUTHORIZATION",
            providerGtid: { in: [trade.buyerGtid, trade.sellerGtid] },
          },
        });
        if (Array.isArray(rows)) out.push(...rows);
      }
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] permits: ProviderValidation[ROUTE_AUTHORIZATION] load failed",
      { error: String(err), ustn },
    );
  }
  return out;
}

async function loadCertificates(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).certificateOfOrigin?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] certificates: CertificateOfOrigin load failed",
      { error: String(err), ustn },
    );
  }
  try {
    if (ustn) {
      const rows = await (db as any).certificate?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] certificates: Certificate load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).ptiCertificate?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] certificates: PtiCertificate load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadCustoms(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).customsOperation?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] customs: CustomsOperation load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).airCustomsOperation?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] customs: AirCustomsOperation load failed",
      { error: String(err), ustn },
    );
  }
  return out;
}

async function loadTransport(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).transportGraph?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] transport: TransportGraph load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).transportDocument?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] transport: TransportDocument load failed",
      { error: String(err), ustn },
    );
  }
  try {
    if (ustn) {
      const rows = await (db as any).shipment?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] transport: Shipment load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadGps(ustn: string, tradeId: string | null): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).shipment?.findMany({
        where: { ustn, lat: { not: null }, lng: { not: null } },
        select: {
          id: true,
          ustn: true,
          vesselName: true,
          lat: true,
          lng: true,
          status: true,
          departedAt: true,
          arrivedAt: true,
        },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] gps: Shipment.lat/lng load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).roadCorridorLeg?.findMany({
        where: { ustn },
        select: {
          id: true,
          ustn: true,
          country: true,
          origin: true,
          destination: true,
          actualDeparture: true,
          actualArrival: true,
          routeGeometry: true,
        },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] gps: RoadCorridorLeg load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadIot(ustn: string, tradeId: string | null): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).reeferTelemetry?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] iot: ReeferTelemetry load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).coldChainReading?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] iot: ColdChainReading load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).tradeMemoryEvent?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] iot: TradeMemoryEvent load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadInspection(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (tradeId) {
      const rows = await (db as any).qcInspection?.findMany({
        where: { tradeId },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] inspection: QcInspection load failed", {
      error: String(err),
      tradeId,
    });
  }
  try {
    if (tradeId) {
      const rows = await (db as any).labTest?.findMany({
        where: { tradeId },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] inspection: LabTest load failed", {
      error: String(err),
      tradeId,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).reInspectionRequest?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] inspection: ReInspectionRequest load failed",
      { error: String(err), ustn },
    );
  }
  return out;
}

async function loadQc(ustn: string, tradeId: string | null): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).qcActionPlan?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] qc: QcActionPlan load failed", {
      error: String(err),
      ustn,
    });
  }
  try {
    if (ustn) {
      const rows = await (db as any).qcOverrideFlag?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] qc: QcOverrideFlag load failed", {
      error: String(err),
      ustn,
    });
  }
  return out;
}

async function loadGovernmentReferences(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).governmentReference?.findMany({
      where: { ustn },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] governmentReferences load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadPayment(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).globalPayment?.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] payment: GlobalPayment load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadBankConfirmation(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).bankSettlementInstruction?.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn(
      "[evidence-package] bankConfirmation: BankSettlementInstruction load failed",
      { error: String(err), ustn },
    );
    return [];
  }
}

async function loadSettlement(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  try {
    if (ustn) {
      const rows = await (db as any).settlementInstruction?.findMany({
        where: { ustn },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] settlement: SettlementInstruction load failed",
      { error: String(err), ustn },
    );
  }
  // Also include settled BankSettlementInstructions (settledAt set)
  try {
    if (ustn) {
      const rows = await (db as any).bankSettlementInstruction?.findMany({
        where: { ustn, settledAt: { not: null } },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] settlement: BankSettlementInstruction.settledAt load failed",
      { error: String(err), ustn },
    );
  }
  return out;
}

async function loadAccounting(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).accountingEntry?.findMany({
      where: { ustn },
      orderBy: { accountingDate: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] accounting: AccountingEntry load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadDelivery(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).deliveryAcceptance?.findMany({
      where: { ustn },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] delivery: DeliveryAcceptance load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadClaims(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).tradeClaim?.findMany({
      where: { OR: [{ ustn }, { parentUstn: ustn }] },
      orderBy: { filedAt: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] claims: TradeClaim load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadDisputes(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).dispute?.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] disputes: Dispute load failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

async function loadCommunications(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!tradeId) return [];
    const rows = await (db as any).tradeMessage?.findMany({
      where: { tradeId },
      orderBy: { createdAt: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn("[evidence-package] communications: TradeMessage load failed", {
      error: String(err),
      tradeId,
    });
    return [];
  }
}

async function loadGovernorDecisions(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  try {
    if (!ustn) return [];
    const rows = await (db as any).governorDecision?.findMany({
      where: { resourceUstn: ustn },
      orderBy: { createdAt: "asc" },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn(
      "[evidence-package] governorDecisions: GovernorDecision load failed",
      { error: String(err), ustn },
    );
    return [];
  }
}

async function loadLoomChain(
  ustn: string,
  tradeId: string | null,
): Promise<any[]> {
  const out: any[] = [];
  // TradeEvent hash chain (previousHash + eventHash)
  try {
    if (ustn) {
      const rows = await (db as any).tradeEvent?.findMany({
        where: { ustn },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          ustn: true,
          eventType: true,
          eventHash: true,
          previousHash: true,
          createdAt: true,
        },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn("[evidence-package] loomChain: TradeEvent chain load failed", {
      error: String(err),
      ustn,
    });
  }
  // GovernorDecision loom hash chain (loomHash + previousHash + signature)
  try {
    if (ustn) {
      const rows = await (db as any).governorDecision?.findMany({
        where: { resourceUstn: ustn },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          decisionId: true,
          action: true,
          verdict: true,
          loomHash: true,
          previousHash: true,
          signature: true,
          pqcSignature: true,
          createdAt: true,
        },
      });
      if (Array.isArray(rows)) out.push(...rows);
    }
  } catch (err) {
    logger.warn(
      "[evidence-package] loomChain: GovernorDecision chain load failed",
      { error: String(err), ustn },
    );
  }
  return out;
}

/**
 * Lookup table: section name → loader function.
 */
const SECTION_LOADERS: Record<
  string,
  (ustn: string, tradeId: string | null) => Promise<any[]>
> = {
  rfq: loadRfq,
  quotation: loadQuotation,
  purchaseOrder: loadPurchaseOrder,
  contract: loadContract,
  invoice: loadInvoice,
  packingList: loadPackingList,
  licenses: loadLicenses,
  permits: loadPermits,
  certificates: loadCertificates,
  customs: loadCustoms,
  transport: loadTransport,
  gps: loadGps,
  iot: loadIot,
  inspection: loadInspection,
  qc: loadQc,
  governmentReferences: loadGovernmentReferences,
  payment: loadPayment,
  bankConfirmation: loadBankConfirmation,
  settlement: loadSettlement,
  accounting: loadAccounting,
  delivery: loadDelivery,
  claims: loadClaims,
  disputes: loadDisputes,
  communications: loadCommunications,
  governorDecisions: loadGovernorDecisions,
  loomChain: loadLoomChain,
};

// ============ §5.1 createEvidencePackage ============

/**
 * Create a new DRAFT evidence package. Generates `packageId`
 * (FEP-YYYYMMDD-NNNNN), sets `status=DRAFT`. Links to `ustn` and
 * `tradeId` (if provided). All 26 section columns are left null
 * (empty) — use `compileEvidencePackage` to populate them.
 *
 * Retries the insert up to 3 times on `packageId` collision (unique
 * constraint violation) before giving up.
 */
export async function createEvidencePackage(
  input: CreatePackageInput,
): Promise<FinalEvidencePackage> {
  if (!input) {
    throw new Error("input is required");
  }
  // Resolve tradeId from ustn if ustn is provided but tradeId is not
  let tradeId = input.tradeId || null;
  if (!tradeId && input.ustn) {
    try {
      const trade = await db.trade.findUnique({
        where: { ustn: input.ustn },
        select: { id: true },
      });
      if (trade) tradeId = trade.id;
    } catch (err) {
      logger.warn("[evidence-package] could not resolve tradeId from ustn", {
        error: String(err),
        ustn: input.ustn,
      });
    }
  }

  const data: any = {
    packageId: generatePackageId(),
    ustn: input.ustn || null,
    tradeId: tradeId,
    status: "DRAFT",
    completenessScore: 0,
    notes: input.notes || null,
  };

  // Retry on packageId collision (unique constraint)
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db.finalEvidencePackage.create({ data });
      logger.info("[evidence-package] package created (DRAFT)", {
        id: row.id,
        packageId: row.packageId,
        ustn: input.ustn,
      });
      return row as FinalEvidencePackage;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (/unique|constraint|packageId/i.test(msg) && attempt < 2) {
        logger.warn("[evidence-package] packageId collision — retrying", {
          packageId: data.packageId,
          attempt: attempt + 1,
        });
        data.packageId = generatePackageId();
        continue;
      }
      break;
    }
  }
  logger.error("[evidence-package] createEvidencePackage failed", {
    error: String(lastErr),
    ustn: input.ustn,
  });
  throw lastErr || new Error("createEvidencePackage failed");
}

// ============ §5.2 compileEvidencePackage ============

/**
 * THE MAIN FUNCTION — compile (populate) all 26 evidence sections for a
 * DRAFT evidence package by loading from the existing SGTX models for
 * the package's USTN.
 *
 * Each section load is wrapped in try/catch — a failure in one section
 * does NOT break the whole package (that section is left empty + the
 * failure is logged).
 *
 * Recomputes `completenessScore` = (populated sections / 26).
 *
 * Only DRAFT packages can be compiled (a SEALED / AMENDED / ARCHIVED
 * package is immutable). Throws if the package is not in DRAFT state.
 */
export async function compileEvidencePackage(
  packageId: string,
): Promise<FinalEvidencePackage> {
  if (!packageId) throw new Error("packageId is required");
  try {
    const existing = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!existing) {
      throw new Error(`FinalEvidencePackage ${packageId} not found`);
    }
    if ((existing as any).status !== "DRAFT") {
      throw new Error(
        `Cannot compile package in status ${(existing as any).status} (expected DRAFT)`,
      );
    }
    const ustn = (existing as any).ustn || "";
    const tradeId = (existing as any).tradeId || null;

    // Load every section via its loader
    const updates: any = {};
    for (const section of EVIDENCE_SECTIONS) {
      const loader = SECTION_LOADERS[section];
      if (!loader) continue;
      let items: any[] = [];
      try {
        items = await loader(ustn, tradeId);
      } catch (err) {
        // Defensive — even if the loader itself throws, keep going
        logger.warn("[evidence-package] section loader threw", {
          section,
          error: String(err),
          ustn,
        });
        items = [];
      }
      updates[section] = serializeSectionArray(items);
    }

    // Recompute completeness score
    const draftPkg = { ...(existing as any), ...updates } as FinalEvidencePackage;
    const score = computeCompletenessScore(draftPkg);
    updates.completenessScore = score;

    const updated = await db.finalEvidencePackage.update({
      where: { id: (existing as any).id },
      data: updates,
    });
    logger.info("[evidence-package] package compiled", {
      packageId,
      ustn,
      completenessScore: score,
      populatedSections: getPopulatedSections(draftPkg).length,
    });
    return updated as FinalEvidencePackage;
  } catch (err) {
    logger.error("[evidence-package] compileEvidencePackage failed", {
      error: String(err),
      packageId,
    });
    throw err;
  }
}

// ============ §5.3 sealEvidencePackage ============

/**
 * Seal a DRAFT evidence package. Computes `packageHash` (SHA-256 of all
 * 26 section JSONs concatenated in canonical alphabetical order). Sets
 * `sealedAt` + `sealedBy` + status=SEALED.
 *
 * Once sealed, the package is IMMUTABLE — any change requires
 * `amendEvidencePackage` which creates a NEW version (new packageId).
 *
 * Throws if the package is not in DRAFT state.
 */
export async function sealEvidencePackage(
  packageId: string,
  sealedBy: string,
): Promise<FinalEvidencePackage> {
  if (!packageId) throw new Error("packageId is required");
  try {
    const existing = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!existing) {
      throw new Error(`FinalEvidencePackage ${packageId} not found`);
    }
    if ((existing as any).status !== "DRAFT") {
      throw new Error(
        `Cannot seal package in status ${(existing as any).status} (expected DRAFT)`,
      );
    }
    const hash = computePackageHash(existing as FinalEvidencePackage);
    const score = computeCompletenessScore(existing as FinalEvidencePackage);
    const updated = await db.finalEvidencePackage.update({
      where: { id: (existing as any).id },
      data: {
        status: "SEALED",
        packageHash: hash,
        sealedAt: new Date(),
        sealedBy: sealedBy || null,
        completenessScore: score,
      },
    });
    logger.info("[evidence-package] package sealed", {
      packageId,
      hash,
      sealedBy,
      completenessScore: score,
    });
    return updated as FinalEvidencePackage;
  } catch (err) {
    logger.error("[evidence-package] sealEvidencePackage failed", {
      error: String(err),
      packageId,
    });
    throw err;
  }
}

// ============ §5.4 amendEvidencePackage ============

/**
 * Amend a SEALED evidence package. Creates a NEW version (new packageId,
 * new DB row) with the amended section's evidence replaced. The original
 * sealed package is PRESERVED unchanged.
 *
 * The new package's status is set to AMENDED (NOT DRAFT — it is an
 * amendment of a sealed package). The `completenessScore` is recomputed.
 * The new package inherits `sealedAt` + `sealedBy` from the original
 * (the seal is preserved across the amendment).
 *
 * The new package's `notes` field records the original packageId + the
 * amended section name for traceability.
 *
 * `newEvidence` can be:
 *   - An array of evidence items (replaces the section entirely)
 *   - A string (assumed to be a JSON-encoded array)
 *
 * Throws if the original package is not in SEALED state.
 */
export async function amendEvidencePackage(
  packageId: string,
  section: string,
  newEvidence: any,
  amendedBy: string,
): Promise<FinalEvidencePackage> {
  if (!packageId) throw new Error("packageId is required");
  if (!section) throw new Error("section is required");
  if (!(EVIDENCE_SECTIONS as readonly string[]).includes(section)) {
    throw new Error(`Invalid section: ${section}`);
  }
  try {
    const existing = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!existing) {
      throw new Error(`FinalEvidencePackage ${packageId} not found`);
    }
    if ((existing as any).status !== "SEALED") {
      throw new Error(
        `Cannot amend package in status ${(existing as any).status} (expected SEALED)`,
      );
    }

    // Serialize new evidence
    let serializedSection: string | null;
    if (Array.isArray(newEvidence)) {
      serializedSection = serializeSectionArray(newEvidence);
    } else if (typeof newEvidence === "string" && newEvidence.trim()) {
      // Validate it parses as JSON array
      try {
        const parsed = JSON.parse(newEvidence);
        serializedSection = Array.isArray(parsed)
          ? serializeSectionArray(parsed)
          : null;
      } catch {
        serializedSection = newEvidence; // store as raw string
      }
    } else {
      serializedSection = null;
    }

    // Build the new version's data — copy all sections from the original
    const newData: any = {
      packageId: generatePackageId(),
      ustn: (existing as any).ustn,
      tradeId: (existing as any).tradeId,
      status: "AMENDED",
      completenessScore: 0,
      sealedAt: (existing as any).sealedAt,
      sealedBy: (existing as any).sealedBy,
      notes: `Amended by ${amendedBy || "(unknown)"} | section: ${section} | originalPackageId: ${packageId}`,
    };
    for (const sec of EVIDENCE_SECTIONS) {
      newData[sec] = (existing as any)[sec] || null;
    }
    newData[section] = serializedSection;

    // Recompute hash + completeness
    const newPkg = newData as FinalEvidencePackage;
    newData.packageHash = computePackageHash(newPkg);
    newData.completenessScore = computeCompletenessScore(newPkg);

    // Retry on packageId collision (unique constraint)
    let created: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        created = await db.finalEvidencePackage.create({ data: newData });
        break;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err);
        if (/unique|constraint|packageId/i.test(msg) && attempt < 2) {
          newData.packageId = generatePackageId();
          continue;
        }
        break;
      }
    }
    if (!created) {
      throw lastErr || new Error("amendEvidencePackage insert failed");
    }
    logger.info("[evidence-package] package amended (new version)", {
      originalPackageId: packageId,
      newPackageId: created.packageId,
      section,
      amendedBy,
    });
    return created as FinalEvidencePackage;
  } catch (err) {
    logger.error("[evidence-package] amendEvidencePackage failed", {
      error: String(err),
      packageId,
      section,
    });
    throw err;
  }
}

// ============ §5.5 getEvidencePackage ============

/**
 * Fetch a single FinalEvidencePackage by its primary `id`. Returns null
 * on error or if not found.
 */
export async function getEvidencePackage(
  id: string,
): Promise<FinalEvidencePackage | null> {
  if (!id) return null;
  try {
    const row = await db.finalEvidencePackage.findUnique({ where: { id } });
    return (row as FinalEvidencePackage) || null;
  } catch (err) {
    logger.error("[evidence-package] getEvidencePackage failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §5.6 getEvidencePackageByPackageId ============

/**
 * Fetch a single FinalEvidencePackage by its business `packageId`
 * (FEP-YYYYMMDD-NNNNN). Returns null on error or if not found.
 */
export async function getEvidencePackageByPackageId(
  packageId: string,
): Promise<FinalEvidencePackage | null> {
  if (!packageId) return null;
  try {
    const row = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    return (row as FinalEvidencePackage) || null;
  } catch (err) {
    logger.error("[evidence-package] getEvidencePackageByPackageId failed", {
      error: String(err),
      packageId,
    });
    return null;
  }
}

// ============ §5.7 getEvidencePackageByUstn ============

/**
 * Fetch the LATEST evidence package for a trade USTN. Returns null on
 * error or if no packages exist. "Latest" = highest `createdAt` (most
 * recently created — typically the AMENDED version if one exists).
 */
export async function getEvidencePackageByUstn(
  ustn: string,
): Promise<FinalEvidencePackage | null> {
  if (!ustn) return null;
  try {
    const rows = await db.finalEvidencePackage.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] as FinalEvidencePackage;
  } catch (err) {
    logger.error("[evidence-package] getEvidencePackageByUstn failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §5.8 listEvidencePackages ============

/**
 * List FinalEvidencePackages with optional filters (ustn, status).
 * Returns an empty array on error. Ordered by `createdAt DESC`
 * (newest first).
 */
export async function listEvidencePackages(
  filters?: ListPackagesFilter,
): Promise<FinalEvidencePackage[]> {
  try {
    const where: any = {};
    if (filters?.ustn) where.ustn = filters.ustn;
    if (filters?.status) where.status = filters.status;
    const rows = await db.finalEvidencePackage.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as FinalEvidencePackage[]) || [];
  } catch (err) {
    logger.error("[evidence-package] listEvidencePackages failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §5.9 archiveEvidencePackage ============

/**
 * Transition a SEALED evidence package to ARCHIVED. Archived packages
 * are read-only + retained for regulatory record-retention. The
 * `sealedAt` / `sealedBy` / `packageHash` / `completenessScore` are
 * preserved.
 *
 * Throws if the package is not in SEALED state.
 */
export async function archiveEvidencePackage(
  packageId: string,
): Promise<FinalEvidencePackage> {
  if (!packageId) throw new Error("packageId is required");
  try {
    const existing = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!existing) {
      throw new Error(`FinalEvidencePackage ${packageId} not found`);
    }
    if ((existing as any).status !== "SEALED") {
      throw new Error(
        `Cannot archive package in status ${(existing as any).status} (expected SEALED)`,
      );
    }
    const updated = await db.finalEvidencePackage.update({
      where: { id: (existing as any).id },
      data: { status: "ARCHIVED" },
    });
    logger.info("[evidence-package] package archived", {
      packageId,
    });
    return updated as FinalEvidencePackage;
  } catch (err) {
    logger.error("[evidence-package] archiveEvidencePackage failed", {
      error: String(err),
      packageId,
    });
    throw err;
  }
}

// ============ §5.10 getCompletenessScore ============

/**
 * Returns the detailed completeness report for an evidence package:
 *   - score: 0..1 (fraction of populated sections)
 *   - populatedSections: section names with at least one evidence item
 *   - missingSections: section names with no evidence
 *
 * Returns score=0 + all sections missing on error or if package not found.
 */
export async function getCompletenessScore(
  packageId: string,
): Promise<CompletenessReport> {
  if (!packageId) {
    return {
      score: 0,
      populatedSections: [],
      missingSections: [...EVIDENCE_SECTIONS],
    };
  }
  try {
    const pkg = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!pkg) {
      return {
        score: 0,
        populatedSections: [],
        missingSections: [...EVIDENCE_SECTIONS],
      };
    }
    const populated = getPopulatedSections(pkg as FinalEvidencePackage);
    const missing = EVIDENCE_SECTIONS.filter(
      (s) => !populated.includes(s),
    );
    return {
      score: populated.length / TOTAL_SECTIONS,
      populatedSections: populated,
      missingSections: missing,
    };
  } catch (err) {
    logger.error("[evidence-package] getCompletenessScore failed", {
      error: String(err),
      packageId,
    });
    return {
      score: 0,
      populatedSections: [],
      missingSections: [...EVIDENCE_SECTIONS],
    };
  }
}

// ============ §5.11 getSectionEvidence ============

/**
 * Get the evidence items for a specific section of an evidence package.
 * Returns an empty array on error, if the package is not found, or if
 * the section has no evidence.
 *
 * Throws if the section name is invalid.
 */
export async function getSectionEvidence(
  packageId: string,
  section: string,
): Promise<any[]> {
  if (!packageId) return [];
  if (!section) return [];
  if (!(EVIDENCE_SECTIONS as readonly string[]).includes(section)) {
    throw new Error(`Invalid section: ${section}`);
  }
  try {
    const pkg = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!pkg) return [];
    return parseSectionArray((pkg as any)[section]);
  } catch (err) {
    logger.error("[evidence-package] getSectionEvidence failed", {
      error: String(err),
      packageId,
      section,
    });
    return [];
  }
}

// ============ §5.12 verifyPackageHash ============

/**
 * Recompute the package hash from the stored section JSONs and compare
 * it with the stored `packageHash`. Used to detect tampering or
 * corruption of a sealed package.
 *
 * Returns:
 *   - valid: true if the computed hash matches the stored hash
 *   - computedHash: the freshly-computed SHA-256
 *   - storedHash: the hash stored on the package at seal time
 *   - reason: human-readable explanation
 *
 * A package with no stored hash (e.g. DRAFT) is reported as invalid
 * with reason "package_not_sealed".
 */
export async function verifyPackageHash(
  packageId: string,
): Promise<HashVerification> {
  if (!packageId) {
    return {
      valid: false,
      computedHash: "",
      storedHash: "",
      reason: "packageId is required",
    };
  }
  try {
    const pkg = await db.finalEvidencePackage.findUnique({
      where: { packageId },
    });
    if (!pkg) {
      return {
        valid: false,
        computedHash: "",
        storedHash: "",
        reason: `package ${packageId} not found`,
      };
    }
    const stored = (pkg as any).packageHash;
    if (!stored) {
      const computed = computePackageHash(pkg as FinalEvidencePackage);
      return {
        valid: false,
        computedHash: computed,
        storedHash: "",
        reason: "package_not_sealed (no stored hash)",
      };
    }
    const computed = computePackageHash(pkg as FinalEvidencePackage);
    const valid = computed === stored;
    return {
      valid,
      computedHash: computed,
      storedHash: stored,
      reason: valid
        ? "hash_matches"
        : "hash_mismatch (package may have been tampered with)",
    };
  } catch (err) {
    logger.error("[evidence-package] verifyPackageHash failed", {
      error: String(err),
      packageId,
    });
    return {
      valid: false,
      computedHash: "",
      storedHash: "",
      reason: `verification_error: ${String(err)}`,
    };
  }
}
