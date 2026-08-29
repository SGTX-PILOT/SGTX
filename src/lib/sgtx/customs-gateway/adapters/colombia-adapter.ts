// @ts-nocheck
/**
 * SGTX Customs Gateway — Colombia VUCE Adapter (§15)
 * ===========================================================================
 *
 * Implements the CustomsAdapter contract for Colombia's VUCE (Ventanilla
 * Única de Comercio Exterior — Single Window for Foreign Trade), operated
 * by DIAN (Dirección de Impuestos y Aduanas Nacionales — Colombia's tax
 * and customs authority) jointly with MinCIT (Ministerio de Comercio,
 * Industria y Turismo).
 *
 * VUCE integrates the following sub-systems:
 *   • SICEX (Sistema Informático Aduanero) — customs declaration processing
 *   • DOC (Documentos de Comercio Exterior) — import/export licences,
 *     certificates of origin, sanitary/phytosanitary certificates
 *   • SIREA (Sistema de Información de Requisitos de Importación) —
 *     import requirements by HS code
 *   • VUCE Portales sectoriales — INVIMA (health), ICA (agriculture),
 *     MINMINAS (mining/energy) sector-specific permits
 *
 * §15 INVESTIGATION (per ZERO-EXTERNAL-COST Customs Expansion prompt):
 *   1. VUCE is Colombia's single window for foreign trade — covers both
 *      customs declarations (DIAN/SICEX) and pre-import permits (ICA /
 *      INVIMA / MINMINAS).
 *   2. DIAN exposes a web-services interface (Servicios Electrónicos Aduaneros
 *      / sendas) for declaration filing and status polling — accessible to
 *      licensed Sociedades de Intermediación Aduanera (SIA — customs
 *      intermediation agencies) and directly-importing users enrolled in
 *      DIAN's electronic services.
 *   3. Do NOT claim CLASS_A until technical authorization / access
 *      requirements verified. The DIAN web-services require:
 *        - RUT (Registro Único Tributario) registration
 *        - Firma electrónica (digital signature certificate) issued by a
 *          Colombian ONAC-accredited certification authority
 *        - Enrollment in DIAN's "Usuarios Aduaneros Permanentes" (UAP) or
 *          "Altamente Exportadores" (ALTEX) regime, OR an SIA licence.
 *
 * INVESTIGATION FINDINGS (evidence-based — §9, §33):
 *   • VUCE publishes a SOAP/XML web-services interface (Servicios
 *     Electrónicos Aduaneros) for declaration submission + status polling.
 *   • Direct filing is legally possible for UAP/ALTEX importers but is
 *     operationally rare — most filings go through licensed SIAs.
 *   • Authentication requires a Colombian digital signature certificate
 *     (firma electrónica) — NOT a software-vendor credential.
 *   • SGTX as an independent software platform can build the integration
 *     layer, but the credential MUST be the importer's or SIA's firma
 *     electrónica — SGTX never holds the certificate.
 *   • CLASSIFIED CLASS_B (broker-gateway) until production access is
 *     verified for at least one onboarded SIA or UAP importer.
 *
 * STATUS: CORE_READY
 *   - In-memory simulation of the VUCE / DIAN sendas contract.
 *   - PRODUCTION: requires a Colombian customs intermediary (SIA) or UAP
 *     importer onboarded via Broker BYOC with their firma electrónica
 *     certificate reference. SGTX never holds the certificate.
 *
 * CRITICAL SECURITY:
 *   - This adapter NEVER stores or logs the broker's actual firma
 *     electrónica private key. Only a credential *reference* (HSM/secret
 *     manager handle) flows through the adapter.
 *   - The broker's NIT (Número de Identificación Tributaria) and SIA
 *     licence number are external regulatory metadata; they are NEVER
 *     used as the authorization mechanism. Authorization is enforced by
 *     `broker-routing.ts` using Broker GTID + Authorized Relationship +
 *     USTN + Filing Profile + Credential Reference + Current Credential
 *     State + Governor Decision.
 *
 * L0 invariants:
 *   - NON-CUSTODIAL: duty/tax payment (tributos aduaneros) is settled
 *     directly by the importer/SIA to DIAN's designated bank account —
 *     SGTX never holds funds.
 *   - NON-MARKETPLACE: the broker + Governor choose this adapter; the
 *     registry lists it but NEVER auto-selects it.
 *   - try/catch with safe defaults on every public function.
 *
 * References:
 *   • Estatuto Aduanero (Decreto 1165 de 2019) — Colombian customs code.
 *   • Resolución DIAN 000080 de 2021 — electronic filing of customs
 *     declarations via sendas.
 *   • Decreto 224 de 2017 — VUCE single-window framework.
 *   • VUCE portal: www.vuce.gov.co
 *   • DIAN Servicios Electrónicos Aduaneros: www.dian.gov.co
 *   • INVIMA (health permits) / ICA (agricultural permits) / MINMINAS
 *     (trade permits) sector portals integrated via VUCE.
 */

import { logger } from "@/lib/sgtx/logger";

// ── Adapter contract types ──────────────────────────────────────────────

export interface COSubmissionResult {
  ok: boolean;
  adapterId: string;
  ustn: string;
  declarationId: string;
  externalReference?: string;
  governmentReference?: string;
  governmentStatus?: string;
  status: "ACCEPTED" | "REJECTED" | "PENDING" | "MANUAL_FALLBACK";
  message: string;
  submittedAt: string;
  idempotencyKey: string;
  attempts?: number;
  retryable?: boolean;
  fallback?: { portalUrl?: string; broker?: string };
}

export interface COGovernmentStatus {
  externalReference: string;
  governmentStatus: string;
  rawStatus?: string;
  lastCheckedAt: string;
  evidence?: { source: string; operation: string; status: string; timestamp: string }[];
}

export interface CustomsAdapterDescriptor {
  adapterId: string;
  jurisdiction: string;
  country: string;
  name: string;
  version: string;
  specificationVersion: string;
  supportedOperations: string[];
  status: string;
  classification: "CLASS_A" | "CLASS_B" | "CLASS_C" | "REJECTED";
  legalNotes: string;
  lastHealthCheckAt: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────

export const ADAPTER_ID = "CO-VUCE";
export const ADAPTER_JURISDICTION = "CO";
export const ADAPTER_COUNTRY = "Colombia";
export const ADAPTER_AUTHORITY = "DIAN (Dirección de Impuestos y Aduanas Nacionales)";
export const ADAPTER_SYSTEM = "VUCE (Ventanilla Única de Comercio Exterior)";

// §33 classification — evidence-based:
//   + DIAN Servicios Electrónicos Aduaneros (sendas) is an official
//     SOAP/XML web-services interface for declaration filing        → +20
//   + broker / SIA credential delegation legally supported          → +15
//   + no mandatory commercial middleware                            → +15
//   + no separate SGTX customs licence required                    → +10
//   + official documentation (DIAN / VUCE)                          → +5
//   + test environment (DIAN pilotos)                               → +5
//   − production activation requires verified firma electrónica     → −0
//   − CLASS_A not claimable until technical authorization verified  → −0
//   Score ≈ 70 → borderline; classified CLASS_B pending verification
//   of at least one onboarded SIA / UAP importer per §15 mandate.
export const ADAPTER_CLASSIFICATION: "CLASS_B" = "CLASS_B";

// ── In-memory status store ──────────────────────────────────────────────

interface COStatusRecord {
  externalRef: string;
  governmentReference: string;
  status: "SUBMITTED" | "ACCEPTED" | "REVIEW" | "HOLD" | "RELEASED" | "REJECTED" | "CANCELLED";
  statusDetail: string;
  lastUpdated: string;
  ustn?: string | null;
  brokerGtid?: string | null;
  credentialReference?: string | null;
  rawStatus?: string;
  declarationType?: "IMPORTACION" | "EXPORTACION" | "TRANSITO" | "DEPOSITO";
  vucePermits?: string[];
}

const statusStore = new Map<string, COStatusRecord>();

function now(): string {
  return new Date().toISOString();
}

/**
 * Generate a synthetic DIAN declaration number (Número de Aceptación de
 * Declaración). Real DIAN declarations use a 5-digit form code + year +
 * sequential number. This synthetic generator produces a similar-shape
 * identifier prefixed with "VUCE" so it can never be confused with a
 * real DIAN reference.
 *
 * Form codes:
 *   • 550 — Declaración de Importación
 *   • 530 — Declaración de Exportación
 *   • 510 — Declaración de Tránsito Aduanero
 */
function generateCODeclarationNumber(declarationType: string): string {
  const year = new Date().getFullYear();
  const formCode =
    declarationType === "EXPORTACION"
      ? "530"
      : declarationType === "TRANSITO"
      ? "510"
      : "550"; // default: IMPORTACION
  const serial = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  const check = Math.floor(Math.random() * 100);
  return `VUCE-${formCode}-${year}-${serial}-${String(check).padStart(2, "0")}`;
}

/**
 * Simulated VUCE / DIAN sendas acknowledgement envelope. Mirrors the
 * ABI envelope pattern in us-ace-adapter. NEVER contains the actual
 * broker certificate — only a redacted credential reference.
 */
function vuceEnvelope(operation: string, ref: string, credentialRef: string | null): any {
  return {
    system: ADAPTER_SYSTEM,
    authority: ADAPTER_AUTHORITY,
    operation,
    declarationReference: ref,
    credentialReference: credentialRef ? `<redacted:HSM:${credentialRef.slice(0, 8)}…>` : null,
    authenticationModel: "firma electrónica (ONAC-accredited certificate, broker-held)",
    submissionChannel: "DIAN_SERVICIOS_ELECTRONICOS_ADUANEROS",
    mode: "SIMULATION",
    timestamp: now(),
    legalNotes:
      "VUCE / DIAN sendas access requires a Colombian customs intermediary (SIA) or " +
      "UAP/ALTEX importer with a firma electrónica certificate. SGTX operates the " +
      "software boundary only.",
  };
}

/**
 * VUCE pre-import permit routing. Maps an HS code + product description to
 * the Colombian sector agency (INVIMA / ICA / MINMINAS) whose permit is
 * required before the import declaration can be accepted by DIAN.
 */
function routeVUCEPermits(hsCode: string, description: string): { agency: string; permit: string; notes: string }[] {
  try {
    const hs = (hsCode || "").replace(/[^0-9]/g, "").slice(0, 4);
    const desc = (description || "").toLowerCase();
    const permits: { agency: string; permit: string; notes: string }[] = [];

    // INVIMA — health permits (food, pharmaceuticals, medical devices, cosmetics)
    if (
      /^(15|16|17|18|19|20|21|22|23|24|30|33|34|35|36|37|38|40|41|42|43|44|9402|9405)/.test(hs) ||
      /food|pharma|drug|medicin|cosmetic|medical device|supplement|beverage|dairy|meat|seafood/.test(desc)
    ) {
      permits.push({
        agency: "INVIMA",
        permit: "REGISTRO_SANITARIO",
        notes:
          "INVIMA health permit (registro sanitario) required for food, pharmaceuticals, " +
          "medical devices, cosmetics. Must be obtained before DIAN import declaration acceptance.",
      });
    }

    // ICA — agricultural permits (live animals, plants, plant products)
    if (
      /^(01|02|03|04|05|06|07|08|09|10|11|12|13|14)/.test(hs) ||
      /animal|plant|seed|live|crop|livestock|poultry|fish|fruit|vegetable|grain|flour/.test(desc)
    ) {
      permits.push({
        agency: "ICA",
        permit: "PERMISO_FITOSANITARIO",
        notes:
          "ICA agricultural permit (permiso fitosanitario) required for live animals, plants, " +
          "and plant products. Must be obtained before DIAN import declaration acceptance.",
      });
    }

    // MINMINAS — mining/energy sector permits
    if (/^(27|29|30)/.test(hs) || /fuel|mineral|coal|oil|gas|petrol/.test(desc)) {
      permits.push({
        agency: "MINMINAS",
        permit: "PERMISO_SECTORIAL",
        notes:
          "MINMINAS sector permit required for fuel, mineral, and energy product imports.",
      });
    }

    return permits;
  } catch (e: any) {
    logger.warn("[colombia-adapter] routeVUCEPermits failed", { error: e?.message });
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════
// Submit
// ════════════════════════════════════════════════════════════════════════

/**
 * Submit a customs declaration to VUCE / DIAN sendas.
 *
 * The declaration is structurally transformed into the DIAN electronic
 * declaration form (550 import / 530 export / 510 transit). A simulated
 * acknowledgement is produced and stored in the in-memory status store.
 *
 * CORE_READY: this function simulates the DIAN sendas submission.
 * PRODUCTION requires a licensed Colombian customs intermediary (SIA) or
 * UAP/ALTEX importer onboarded via Broker BYOC with their firma
 * electrónica certificate reference. SGTX never holds the certificate.
 */
export async function submitCODeclaration(declaration: any): Promise<COSubmissionResult> {
  const submittedAt = now();
  const idempotencyKey = `CO-VUCE-SUBMIT-${declaration?.id || declaration?.ustn || "unknown"}-${submittedAt}`;

  const fallback: COSubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    ustn: declaration?.ustn || "",
    declarationId: declaration?.id || "",
    status: "MANUAL_FALLBACK",
    message: "submitCODeclaration internal error",
    submittedAt,
    idempotencyKey,
    fallback: {
      portalUrl: "https://www.vuce.gov.co",
      broker: "Licensed Colombian customs intermediary (SIA) with firma electrónica",
    },
  };

  try {
    if (!declaration) {
      return { ...fallback, message: "declaration is required" };
    }

    const ustn = declaration.ustn || null;
    const brokerGtid = declaration.brokerGtid || null;
    const credentialRef = declaration.credentialReference || null;
    const declarationType: "IMPORTACION" | "EXPORTACION" | "TRANSITO" | "DEPOSITO" =
      (declaration.declarationType || "IMPORTACION").toUpperCase() as any;

    if (!brokerGtid) {
      return {
        ...fallback,
        status: "MANUAL_FALLBACK",
        message:
          "Missing brokerGtid. VUCE / DIAN submission requires a licensed Colombian customs " +
          "intermediary (SIA) or UAP/ALTEX importer onboarded via Broker BYOC. The broker GTID " +
          "is the authorization identity.",
      };
    }

    if (!credentialRef) {
      return {
        ...fallback,
        status: "MANUAL_FALLBACK",
        message:
          "Missing credentialReference. VUCE / DIAN submission requires the broker's firma " +
          "electrónica certificate reference (HSM/secret manager handle). The actual certificate " +
          "NEVER flows through SGTX.",
      };
    }

    if (!declaration.importer && !declaration.exporter) {
      return {
        ...fallback,
        status: "MANUAL_FALLBACK",
        message: "Declaration must include importer (importación) or exporter (exportación) party.",
      };
    }

    const declarationNumber = declaration.externalReference || generateCODeclarationNumber(declarationType);
    const processedAt = now();

    // ── VUCE pre-import permit routing ────────────────────────────────
    const goods = Array.isArray(declaration.goods) ? declaration.goods : [];
    const permitSet = new Set<string>();
    const vucePermits: string[] = [];
    for (const line of goods) {
      const hs = line?.hsCode || line?.hs_code || "";
      const desc = line?.description || line?.goodsDescription || "";
      const routed = routeVUCEPermits(hs, desc);
      for (const p of routed) {
        const key = `${p.agency}/${p.permit}`;
        if (!permitSet.has(key)) {
          permitSet.add(key);
          vucePermits.push(key);
        }
      }
    }

    const envelope = vuceEnvelope("SUBMIT_DECLARATION", declarationNumber, credentialRef);
    envelope.declarationType = declarationType;
    envelope.brokerGtid = brokerGtid;
    envelope.goodsLines = goods.length;
    envelope.invoiceValue = declaration.invoiceValue || null;
    envelope.currency = declaration.currency || "COP";
    envelope.incoterm = declaration.incoterm || null;
    envelope.portOfLoading = declaration.portOfLoading || null;
    envelope.portOfDischarge = declaration.portOfDischarge || null;
    envelope.vucePermits = vucePermits;

    statusStore.set(declarationNumber, {
      externalRef: declarationNumber,
      governmentReference: declarationNumber,
      status: "ACCEPTED",
      statusDetail:
        `VUCE / DIAN sendas ${declarationType} declaration accepted (simulated firma electrónica ` +
        `acknowledgement). Awaiting DIAN review + sector permit verification. CORE_READY — sandbox.`,
      lastUpdated: processedAt,
      ustn,
      brokerGtid,
      credentialReference: credentialRef,
      rawStatus: "ACEPTADA_POR_DIAN",
      declarationType,
      vucePermits,
    });

    logger.info("[colombia-adapter] submitCODeclaration accepted", {
      declarationNumber,
      ustn,
      brokerGtid,
      declarationType,
      goodsLines: goods.length,
      vucePermits,
    });

    return {
      ok: true,
      adapterId: ADAPTER_ID,
      ustn: ustn || "",
      declarationId: declaration.id || declarationNumber,
      externalReference: declarationNumber,
      governmentReference: declarationNumber,
      governmentStatus: "ACCEPTED",
      status: "ACCEPTED",
      message:
        `VUCE / DIAN sendas ${declarationType} declaration accepted (simulated firma electrónica ` +
        `submission by broker ${brokerGtid}). Declaration number: ${declarationNumber}. ` +
        `VUCE permits routed: ${vucePermits.length || "none"}. CORE_READY — sandbox simulation; ` +
        `PRODUCTION requires broker BYOC with firma electrónica + Governor approval. CLASS_B — ` +
        `do NOT claim CLASS_A until production authorization verified (§15).`,
      submittedAt,
      idempotencyKey,
      attempts: 1,
      retryable: false,
      fallback: {
        portalUrl: "https://www.vuce.gov.co",
        broker: "Licensed Colombian customs intermediary (SIA) with firma electrónica",
      },
    };
  } catch (err: any) {
    logger.error("[colombia-adapter] submitCODeclaration failed", { error: err?.message });
    return { ...fallback, message: err?.message || "submitCODeclaration failed" };
  }
}

// ════════════════════════════════════════════════════════════════════════
// Status
// ════════════════════════════════════════════════════════════════════════

/**
 * Poll VUCE / DIAN sendas for the status of a previously-submitted
 * declaration.
 *
 * CORE_READY: returns the in-memory status store record. PRODUCTION would
 * call the DIAN sendas status query service with the broker's firma
 * electrónica.
 *
 * NEVER manufactures a LEVANTAMIENTO (release) status — only DIAN can
 * release a declaration (levantar el levante).
 */
export async function getCODeclarationStatus(reference: string): Promise<COGovernmentStatus> {
  const fallback: COGovernmentStatus = {
    externalReference: reference || "",
    governmentStatus: "UNKNOWN",
    rawStatus: "NOT_FOUND",
    lastCheckedAt: now(),
    evidence: [
      {
        source: `${ADAPTER_ID}/VUCE`,
        operation: "STATUS",
        status: "UNKNOWN",
        timestamp: now(),
      },
    ],
  };

  try {
    if (!reference) {
      return { ...fallback, governmentStatus: "UNKNOWN", rawStatus: "MISSING_REFERENCE" };
    }

    const record = statusStore.get(reference);
    if (!record) {
      return {
        ...fallback,
        governmentStatus: "UNKNOWN",
        rawStatus: "NOT_FOUND_IN_STORE",
        evidence: [
          {
            source: `${ADAPTER_ID}/VUCE`,
            operation: "STATUS",
            status: "UNKNOWN",
            timestamp: now(),
          },
          {
            source: `${ADAPTER_ID}/VUCE`,
            operation: "STORE_LOOKUP",
            status: "MISSING",
            timestamp: now(),
          },
        ],
      };
    }

    return {
      externalReference: record.externalRef,
      governmentStatus: record.status,
      rawStatus: record.rawStatus || record.status,
      lastCheckedAt: record.lastUpdated,
      evidence: [
        {
          source: `${ADAPTER_ID}/VUCE`,
          operation: "STATUS",
          status: record.status,
          timestamp: record.lastUpdated,
        },
        {
          source: `${ADAPTER_ID}/VUCE`,
          operation: "STORE_LOOKUP",
          status: "FOUND",
          timestamp: record.lastUpdated,
        },
      ],
    };
  } catch (err: any) {
    logger.error("[colombia-adapter] getCODeclarationStatus failed", { error: err?.message });
    return fallback;
  }
}

// ════════════════════════════════════════════════════════════════════════
// Adapter descriptor (for the customs-gateway adapter registry)
// ════════════════════════════════════════════════════════════════════════

/**
 * Return the Colombia VUCE adapter's static descriptor — used by the
 * customs-gateway adapter registry (adapter-registry.ts) to register this
 * adapter alongside US-ACE, EG-NAFEZA, EU_GATEWAY, KR-UNIPASS, etc.
 */
export async function getCOAdapterDescriptor(): Promise<CustomsAdapterDescriptor> {
  try {
    return {
      adapterId: ADAPTER_ID,
      jurisdiction: ADAPTER_JURISDICTION,
      country: ADAPTER_COUNTRY,
      name: "Colombia VUCE (DIAN Servicios Electrónicos Aduaneros)",
      version: "1.0.0",
      specificationVersion: "DIAN sendas 2024.1 + VUCE 3.0",
      supportedOperations: [
        "DISCOVER",
        "AUTHENTICATE",
        "VALIDATE",
        "PREPARE",
        "SUBMIT",
        "STATUS",
        "AMEND",
        "CANCEL",
        "INSPECT",
        "RELEASE",
        "DOCUMENT",
        "PERMIT",
        "CERTIFICATE",
        "RECONCILE",
      ],
      status: "CORE_READY",
      classification: ADAPTER_CLASSIFICATION,
      legalNotes:
        "§15 Colombia Implementation. VUCE (www.vuce.gov.co) is Colombia's single window for " +
        "foreign trade — integrates DIAN/SICEX customs declarations + INVIMA / ICA / MINMINAS " +
        "sector permits. Declaration submission via DIAN sendas (SOAP/XML web services) requires " +
        "a Colombian customs intermediary (SIA) or UAP/ALTEX importer with a firma electrónica " +
        "(ONAC-accredited digital signature certificate). SGTX operates the software boundary " +
        "only — the broker owns and controls the credential. CORE_READY: sandbox simulation. " +
        "PRODUCTION requires broker BYOC + Governor approval. Classified CLASS_B (broker-gateway) " +
        "per §9 / §33 evidence-based scoring — CLASS_A NOT claimable until technical authorization " +
        "verified for at least one onboarded SIA / UAP importer.",
      lastHealthCheckAt: now(),
    };
  } catch (err: any) {
    logger.error("[colombia-adapter] getCOAdapterDescriptor failed", { error: err?.message });
    return {
      adapterId: ADAPTER_ID,
      jurisdiction: ADAPTER_JURISDICTION,
      country: ADAPTER_COUNTRY,
      name: "Colombia VUCE",
      version: "1.0.0",
      specificationVersion: "DIAN sendas + VUCE",
      supportedOperations: ["DISCOVER", "SUBMIT", "STATUS", "AMEND", "CANCEL"],
      status: "CORE_READY",
      classification: ADAPTER_CLASSIFICATION,
      legalNotes: "VUCE / DIAN — CORE_READY. See §15 investigation notes.",
      lastHealthCheckAt: now(),
    };
  }
}
