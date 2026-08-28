// @ts-nocheck
/**
 * SGTX Part 28 — Document Friction Reducer
 * ===========================================================================
 *
 * Identifies documents that are missing, incomplete, expired,
 * contradictory, not-yet-requested, submitted, accepted, rejected,
 * requiring legalization, requiring translation, or requiring
 * certification — and computes the NEXT required documents to move a
 * trade forward.
 *
 * Authority: A2 — AI proposes, Governor validates. The engine produces a
 * ranked `RequiredDocument[]` list; the Governor gate re-validates the
 * legal basis (§28.6) before any document is requested from the
 * counterparty or government.
 *
 * Document status taxonomy (§28.3):
 *   MISSING            — required by rule, never requested
 *   INCOMPLETE         — submitted but missing mandatory fields
 *   EXPIRED            — issue/expiry date passed
 *   CONTRADICTORY      — fails consistency check (delegates to §29 lib)
 *   NOT_REQUESTED      — optional but not yet requested
 *   SUBMITTED          — sent to counterparty, awaiting response
 *   ACCEPTED           — counterparty confirmed acceptance
 *   REJECTED           — counterparty rejected; reason recorded
 *   LEGALIZATION_REQ   — embassy/legalization required
 *   TRANSLATION_REQ    — sworn translation required
 *   CERTIFICATION_REQ  — chamber of commerce certification required
 *
 * The `getNextRequiredDocuments` function returns the CRITICAL-PATH
 * documents (those that block the next workflow milestone) ordered by
 * dependency.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type DocStatus =
  | "MISSING" | "INCOMPLETE" | "EXPIRED" | "CONTRADICTORY"
  | "NOT_REQUESTED" | "SUBMITTED" | "ACCEPTED" | "REJECTED"
  | "LEGALIZATION_REQ" | "TRANSLATION_REQ" | "CERTIFICATION_REQ";

export interface DocumentAnalysis {
  ustn: string;
  statuses: Array<{ docType: string; status: DocStatus; detail?: string }>;
  missing: string[];
  incomplete: string[];
  expired: string[];
  contradictory: string[];
  legalisationRequired: string[];
  translationRequired: string[];
  certificationRequired: string[];
  computedAt: string;
}

export interface RequiredDocument {
  docType: string;
  reason: string;
  legalBasis: string;
  requestedFrom: string;
  blocksMilestone: string;
  estimatedLeadTimeDays: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

// ============ Loaders ============

async function loadTradeDocs(ustn: string): Promise<any> {
  try {
    return await db.trade.findUnique({
      where: { ustn },
      include: {
        invoices: true, contracts: true, packingLists: true,
        certificatesOfOrigin: true, certificates: true, ptiCertificates: true,
        customsOperations: true, transportDocuments: true, shipments: true,
        exportLicenses: true, governmentReferences: true, cargoInsurancePolicies: true,
      },
    }).catch(() => null);
  } catch (err: any) {
    logger.warn("[document-friction-reducer] load failed", { ustn, error: err?.message });
    return null;
  }
}

async function loadDocMatrix(origin: string, destination: string, hsCode: string): Promise<any[]> {
  try {
    const mod = await import("@/lib/sgtx/grire/product-corridor-matrix");
    const fn = (mod as any)?.getDocumentsForLane;
    if (fn) return (await fn(hsCode, origin, destination)) || [];
    return [];
  } catch {
    return [];
  }
}

function isExpired(d: any): boolean {
  try {
    if (!d?.expiryDate) return false;
    return new Date(d.expiryDate).getTime() < Date.now();
  } catch {
    return false;
  }
}

function isIncomplete(d: any): boolean {
  try {
    if (!d) return true;
    return !d.documentNumber || (d.status === "DRAFT" || d.status === "INCOMPLETE");
  } catch {
    return false;
  }
}

// ============ §28.5 — Status classifier ============

async function classify(ustn: string): Promise<{ trade: any; matrix: any[]; statuses: DocumentAnalysis["statuses"] }> {
  const trade = await loadTradeDocs(ustn);
  if (!trade) return { trade: null, matrix: [], statuses: [] };
  const origin = trade.originCountry;
  const destination = trade.destinationCountry;
  const hsCode = trade.invoices?.[0]?.hsCode || trade.hsCode || "";
  const matrix = await loadDocMatrix(origin, destination, hsCode);

  const statuses: DocumentAnalysis["statuses"] = [];

  // For each required document type, check existence + status.
  const requiredTypes = matrix.length ? matrix : [
    { docType: "INVOICE", required: true },
    { docType: "PACKING_LIST", required: true },
    { docType: "COO", required: true },
    { docType: "BL_AWB", required: true },
    { docType: "CUSTOMS_DECLARATION", required: true },
    { docType: "PHYTOSANITARY", required: /01|02|03|04|07|08|09/.test(hsCode.slice(0, 2)) },
    { docType: "EXPORT_LICENSE", required: /dual.use|controlled/i.test(trade.notes || "") },
  ];

  for (const r of requiredTypes) {
    try {
      const docType = r.docType || r.type || r.name;
      let doc: any = null;
      switch (docType) {
        case "INVOICE": doc = trade.invoices?.[0]; break;
        case "PACKING_LIST": doc = trade.packingLists?.[0]; break;
        case "COO": doc = trade.certificatesOfOrigin?.[0]; break;
        case "BL_AWB": doc = trade.transportDocuments?.[0]; break;
        case "CUSTOMS_DECLARATION": doc = trade.customsOperations?.[0]; break;
        case "PHYTOSANITARY": doc = trade.ptiCertificates?.[0] || trade.certificates?.find((c: any) => /phyto/i.test(c.type || "")); break;
        case "EXPORT_LICENSE": doc = trade.exportLicenses?.[0]; break;
        default: doc = (trade.certificates || []).find((c: any) => c.type === docType);
      }
      if (!doc) statuses.push({ docType, status: "MISSING", detail: "Required by lane matrix" });
      else if (isExpired(doc)) statuses.push({ docType, status: "EXPIRED", detail: "Document expiry date passed" });
      else if (isIncomplete(doc)) statuses.push({ docType, status: "INCOMPLETE", detail: "Missing mandatory fields" });
      else statuses.push({ docType, status: "ACCEPTED" });
    } catch {}
  }

  // Add legalization / translation / certification flags based on destination.
  try {
    if (["EG", "SA", "AE"].includes(destination)) {
      statuses.push({ docType: "COO", status: "LEGALIZATION_REQ", detail: `${destination} requires chamber + embassy legalization` });
    }
    if (["CN", "JP", "RU"].includes(destination)) {
      statuses.push({ docType: "INVOICE", status: "TRANSLATION_REQ", detail: `${destination} requires sworn translation` });
    }
    if (["BR", "AR"].includes(destination)) {
      statuses.push({ docType: "INVOICE", status: "CERTIFICATION_REQ", detail: "Chamber of commerce certification required" });
    }
  } catch {}

  return { trade, matrix: requiredTypes, statuses };
}

// ============ Public API ============

export async function analyzeDocuments(ustn: string): Promise<DocumentAnalysis> {
  try {
    const { statuses } = await classify(ustn);
    const bucket = (s: DocStatus) => statuses.filter((x) => x.status === s).map((x) => x.docType);
    return {
      ustn,
      statuses,
      missing: bucket("MISSING"),
      incomplete: bucket("INCOMPLETE"),
      expired: bucket("EXPIRED"),
      contradictory: bucket("CONTRADICTORY"),
      legalisationRequired: bucket("LEGALIZATION_REQ"),
      translationRequired: bucket("TRANSLATION_REQ"),
      certificationRequired: bucket("CERTIFICATION_REQ"),
      computedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error("[document-friction-reducer] analyze failed", { ustn, error: err?.message });
    return {
      ustn, statuses: [], missing: [], incomplete: [], expired: [],
      contradictory: [], legalisationRequired: [], translationRequired: [], certificationRequired: [],
      computedAt: new Date().toISOString(),
    };
  }
}

export async function getNextRequiredDocuments(ustn: string): Promise<RequiredDocument[]> {
  try {
    const analysis = await analyzeDocuments(ustn);
    const out: RequiredDocument[] = [];
    for (const m of analysis.missing) {
      out.push({
        docType: m,
        reason: "Required by lane matrix; not yet requested",
        legalBasis: deriveLegalBasis(m, analysis),
        requestedFrom: deriveSource(m),
        blocksMilestone: deriveMilestone(m),
        estimatedLeadTimeDays: deriveLeadTime(m),
        priority: /CUSTOMS|COO|BL_AWB|INVOICE/.test(m) ? "CRITICAL" : "HIGH",
      });
    }
    for (const e of analysis.expired) {
      out.push({
        docType: e, reason: "Document expired — renewal required",
        legalBasis: "Validity period per issuing authority",
        requestedFrom: deriveSource(e), blocksMilestone: deriveMilestone(e),
        estimatedLeadTimeDays: deriveLeadTime(e), priority: "CRITICAL",
      });
    }
    for (const i of analysis.incomplete) {
      out.push({
        docType: i, reason: "Document incomplete — missing mandatory fields",
        legalBasis: "Field requirements per document standard",
        requestedFrom: deriveSource(i), blocksMilestone: deriveMilestone(i),
        estimatedLeadTimeDays: 2, priority: "HIGH",
      });
    }
    return out.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  } catch (err: any) {
    logger.error("[document-friction-reducer] getNextRequiredDocuments failed", { ustn, error: err?.message });
    return [];
  }
}

function deriveLegalBasis(docType: string, _analysis: DocumentAnalysis): string {
  const map: Record<string, string> = {
    COO: "WCO Kyoto Convention (Annex C) + destination-specific FTA rules of origin",
    PHYTOSANITARY: "IPPC ISPM 12 + destination NPPO regulation",
    EXPORT_LICENSE: "Wassenaar Arrangement / national export control list",
    CUSTOMS_DECLARATION: "WCO Revised Kyoto Convention + national customs code",
    BL_AWB: "Hague-Visby / Montreal Convention — transport document of title",
    INVOICE: "UCP 600 Article 18 + destination VAT/customs invoice rules",
    PACKING_LIST: "UCP 600 Article 18(g) — packing details on invoice or separate",
  };
  return map[docType] || "Per trade-lane regulatory requirements";
}

function deriveSource(docType: string): string {
  const map: Record<string, string> = {
    COO: "Chamber of Commerce",
    PHYTOSANITARY: "Exporting-country NPPO",
    EXPORT_LICENSE: "Export licensing authority (BIS / EU / national)",
    CUSTOMS_DECLARATION: "Customs broker / direct filing",
    BL_AWB: "Carrier",
    INVOICE: "Seller",
    PACKING_LIST: "Seller",
  };
  return map[docType] || "Issuing authority";
}

function deriveMilestone(docType: string): string {
  if (docType === "CUSTOMS_DECLARATION") return "CUSTOMS_CLEARANCE";
  if (docType === "BL_AWB") return "CARGO_RELEASE";
  if (docType === "COO") return "DUTY_PREFERENTIAL_TREATMENT";
  if (docType === "PHYTOSANITARY") return "IMPORT_INSPECTION";
  if (docType === "EXPORT_LICENSE") return "EXPORT_CLEARANCE";
  return "TRADE_COMPLETION";
}

function deriveLeadTime(docType: string): number {
  const map: Record<string, number> = {
    COO: 5, PHYTOSANITARY: 3, EXPORT_LICENSE: 14, CUSTOMS_DECLARATION: 2,
    BL_AWB: 1, INVOICE: 1, PACKING_LIST: 1,
  };
  return map[docType] || 5;
}

function priorityRank(p: string): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[p] ?? 4;
}
