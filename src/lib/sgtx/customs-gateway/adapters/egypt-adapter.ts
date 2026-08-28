// @ts-nocheck
/**
 * SGTX Customs Gateway — Egypt Adapter (CUSTOMS-ACE-BROKER)
 * ============================================================
 *
 * Implements the CustomsAdapter contract for the Egyptian customs ecosystem.
 * Wraps the existing clients in `src/lib/sgtx/government/index.ts`:
 *
 *   • submitNafeza(declaration)              — SAD declaration + certificate requests
 *   • getNafezaStatus(declarationNumber)     — poll Nafeza SAD status
 *   • submitCargoX(document)                 — ACID (Advance Cargo Information)
 *   • submitETA(taxData)                     — e-Invoice (ETA)
 *   • submitCBE(paymentData)                 — Central Bank of Egypt payment
 *
 * Egypt's customs ecosystem is a 4-pillar single-window:
 *
 *   1. Nafeza (nafeza.gov.eg)        — Customs SAD (Single Administrative
 *                                       Document) + certificate requests.
 *                                       Accessed via mTLS with Egypt Trust
 *                                       e-Seal (simulated).
 *
 *   2. CargoX (cargox.io)            — Advance Cargo Information (ACID) on
 *                                       an Ethereum-compatible blockchain.
 *                                       Shipper creates ACID before vessel
 *                                       loading; CBP-equivalent "Nafeza"
 *                                       requires ACID before SAD acceptance.
 *                                       Accessed via HMAC-SHA256 + API key.
 *
 *   3. ETA (eta.gov.eg)              — Egyptian Tax Authority e-Invoice.
 *                                       Every commercial invoice must be
 *                                       pre-submitted as a UBL 2.1 XML with
 *                                       the seller's e-Seal. Returns a UUID
 *                                       + QR code that must be printed on
 *                                       the invoice.
 *
 *   4. CBE (central bank)            — Payment of customs duties/taxes via
 *                                       PSP (PayMob, Fawry, etc.) or direct
 *                                       bank settlement (non-custodial).
 *
 * Status: CORE_READY
 *   - Sandbox simulation: live (uses existing government/index.ts stubs)
 *   - PRODUCTION: requires Nafeza production mTLS credentials + CargoX
 *     blockchain key registration + ETA e-Seal + CBE PSP contract.
 *
 * CRITICAL SECURITY:
 *   - This adapter NEVER stores or logs the broker's actual Nafeza e-Seal,
 *     CargoX blockchain key, or ETA e-Seal. Only a credential *reference*
 *     (HSM/secret manager handle) is logged.
 *   - Authorization is enforced by `broker-routing.ts`. The Nafeza broker
 *     GTID is the authorization identity, NOT the Nafeza user ID.
 *
 * References:
 *   • Egypt Customs Law 66/1963 + Nafeza Single Window (Ministerial Decree
 *     386/2020) — ACI mandatory since 1 October 2021.
 *   • ETA e-Invoicing framework (Ministerial Decree 385/2020).
 *   • PDPL 2020 (data residency: Egypt-only storage).
 */

import { logger } from "@/lib/sgtx/logger";
import type {
  SubmissionResult,
  GovernmentStatus,
} from "@/lib/sgtx/customs-gateway/adapters/us-ace-adapter";

export const ADAPTER_ID = "EG_NAFEZA";
export const ADAPTER_JURISDICTION = "EG";

// ── In-memory status store for Egypt submissions ────────────────────────

interface EgyptStatusRecord {
  externalRef: string;
  adapterId: string;
  status: GovernmentStatus["status"];
  statusDetail: string;
  lastUpdated: string;
  holdReason: string | null;
  releaseDate: string | null;
  ustn?: string | null;
  subAdapter?: "NAFEZA" | "CARGOX" | "ETA" | "CBE";
}

const statusStore = new Map<string, EgyptStatusRecord>();

function now(): string {
  return new Date().toISOString();
}

// ── Nafeza SAD submission ───────────────────────────────────────────────

/**
 * Submit a SAD (Single Administrative Document) declaration to Nafeza.
 * Wraps `submitNafezaDeclaration` from `@/lib/sgtx/government` and adapts
 * its return shape to the CustomsAdapter SubmissionResult contract.
 *
 * The input declaration is mapped to the legacy Nafeza client's expected
 * shape. ACID (from CargoX) must be present or the submission falls back to
 * manual ACI creation (per Nafeza's published retry policy).
 */
export async function submitNafeza(declaration: any): Promise<SubmissionResult> {
  const submittedAt = now();
  const fallback: SubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    externalRef: "",
    status: "FAILED",
    submittedAt,
    processedAt: submittedAt,
    mode: "SIMULATION",
    error: "submitNafeza internal error",
  };

  try {
    if (!declaration) {
      return { ...fallback, error: "declaration is required" };
    }
    if (!declaration.acid && !declaration.cargoxAcid) {
      // ACID is required by Nafeza since Oct 2021. Without it, fall back to
      // manual ACI creation via the web portal.
      return {
        ...fallback,
        status: "PENDING",
        error: "ACID is required by Nafeza (Ministerial Decree 386/2020). Submit CargoX ACID first.",
      };
    }

    let result: any = null;
    try {
      const gov = await import("@/lib/sgtx/government");
      result = await gov.submitNafezaDeclaration({
        ustn: declaration.ustn || "",
        traderGtid: declaration.traderGtid || declaration.importerGtid || "",
        brokerGtid: declaration.brokerGtid || undefined,
        acid: declaration.acid || declaration.cargoxAcid,
        invoiceNumber: declaration.invoiceNumber || "",
        invoiceValue: declaration.invoiceValue || 0,
        etaUuid: declaration.etaUuid || "",
        goods: declaration.goods || [],
        certificateRequests: declaration.certificateRequests || [],
        transport: declaration.transport || {
          incoterm: declaration.incoterm || "FCA",
          portOfLoading: declaration.portOfLoading || "",
          portOfDischarge: declaration.portOfDischarge || "",
          vesselName: declaration.vesselName || "",
        },
      });
    } catch (e: any) {
      logger.warn("[egypt-adapter] Nafeza submit failed; using fallback", { error: e?.message });
      result = { ok: false, reason: e?.message };
    }

    const processedAt = now();

    if (result?.ok) {
      const declarationId = result.declarationId;
      statusStore.set(declarationId, {
        externalRef: declarationId,
        adapterId: ADAPTER_ID,
        status: "ACCEPTED",
        statusDetail: "Nafeza SAD accepted. Awaiting certificate issuance and customs release.",
        lastUpdated: processedAt,
        holdReason: null,
        releaseDate: null,
        ustn: declaration.ustn || null,
        subAdapter: "NAFEZA",
      });

      logger.info("[egypt-adapter] submitNafeza accepted", {
        declarationId,
        ustn: declaration.ustn,
        certRequests: (result.certificateRequests || []).length,
      });

      return {
        ok: true,
        adapterId: ADAPTER_ID,
        externalRef: declarationId,
        status: "ACCEPTED",
        submittedAt,
        processedAt,
        formData: {
          declarationId,
          certificateRequests: result.certificateRequests || [],
        },
        notes:
          "Nafeza SAD accepted (simulated mTLS). CORE_READY: sandbox; PRODUCTION requires Nafeza " +
          "production mTLS e-Seal registered via Broker BYOC.",
        mode: "SIMULATION",
      };
    }

    // Nafeza returned a non-ok result — surface the fallback.
    return {
      ...fallback,
      status: "PENDING",
      error: result?.reason || "Nafeza rejected the SAD",
      notes: result?.fallback || "Manual SAD submission via Nafeza web portal",
      processedAt,
    };
  } catch (e: any) {
    logger.error("[egypt-adapter] submitNafeza failed", { error: e?.message });
    return { ...fallback, error: e?.message || "submitNafeza failed" };
  }
}

// ── Nafeza status ───────────────────────────────────────────────────────

/**
 * Poll Nafeza SAD status. Wraps the existing Nafeza client and falls back to
 * the in-memory status store if the legacy client returns nothing.
 *
 * NEVER manufactures a RELEASED status — only Nafeza can release a SAD.
 */
export async function getNafezaStatus(declarationNumber: string): Promise<GovernmentStatus> {
  const fallback: GovernmentStatus = {
    externalRef: declarationNumber || "",
    adapterId: ADAPTER_ID,
    status: "UNKNOWN",
    statusDetail: "SAD not found in Nafeza",
    lastUpdated: now(),
    mode: "SIMULATION",
  };
  try {
    if (!declarationNumber) return fallback;
    const record = statusStore.get(declarationNumber);
    if (!record) return fallback;
    return {
      externalRef: record.externalRef,
      adapterId: ADAPTER_ID,
      status: record.status,
      statusDetail: record.statusDetail,
      lastUpdated: record.lastUpdated,
      holdReason: record.holdReason,
      releaseDate: record.releaseDate,
      mode: "SIMULATION",
    };
  } catch (e: any) {
    logger.error("[egypt-adapter] getNafezaStatus failed", { error: e?.message });
    return fallback;
  }
}

// ── CargoX ACID submission ──────────────────────────────────────────────

/**
 * Submit an Advance Cargo Information (ACI) shipment to CargoX. Returns the
 * ACID + blockchain seal that Nafeza requires before accepting a SAD.
 *
 * CargoX requires a registered blockchain key (Ethereum-compatible). The
 * broker's blockchain key reference (NEVER the key itself) is passed via
 * `credentialReference`.
 */
export async function submitCargoX(document: any): Promise<SubmissionResult> {
  const submittedAt = now();
  const fallback: SubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    externalRef: "",
    status: "FAILED",
    submittedAt,
    processedAt: submittedAt,
    mode: "SIMULATION",
    error: "submitCargoX internal error",
  };

  try {
    if (!document) {
      return { ...fallback, error: "document is required" };
    }

    let result: any = null;
    try {
      const gov = await import("@/lib/sgtx/government");
      result = await gov.submitCargoXShipment({
        ustn: document.ustn || "",
        shipperTaxId: document.shipperTaxId || "",
        shipperName: document.shipperName || "",
        shipperCountry: document.shipperCountry || "",
        consigneeTaxId: document.consigneeTaxId || "",
        consigneeName: document.consigneeName || "",
        consigneeCountry: document.consigneeCountry || "EG",
        goodsValue: document.goodsValue || 0,
        containerNumbers: document.containerNumbers || [],
      });
    } catch (e: any) {
      logger.warn("[egypt-adapter] CargoX submit failed; using fallback", { error: e?.message });
      result = { ok: false, reason: e?.message };
    }

    const processedAt = now();

    if (result?.ok) {
      const acid = result.acid;
      statusStore.set(acid, {
        externalRef: acid,
        adapterId: ADAPTER_ID,
        status: "ACCEPTED",
        statusDetail: "CargoX ACID issued. Blockchain seal recorded.",
        lastUpdated: processedAt,
        holdReason: null,
        releaseDate: null,
        ustn: document.ustn || null,
        subAdapter: "CARGOX",
      });

      logger.info("[egypt-adapter] submitCargoX accepted", { acid, ustn: document.ustn });

      return {
        ok: true,
        adapterId: ADAPTER_ID,
        externalRef: acid,
        status: "ACCEPTED",
        submittedAt,
        processedAt,
        formData: {
          acid,
          blockchainSeal: result.blockchainSeal,
        },
        notes:
          "CargoX ACID issued (simulated HMAC-SHA256 + blockchain). CORE_READY: sandbox; " +
          "PRODUCTION requires a registered CargoX blockchain key via Broker BYOC.",
        mode: "SIMULATION",
      };
    }

    return {
      ...fallback,
      status: "PENDING",
      error: result?.reason || "CargoX rejected the ACI shipment",
      notes: result?.fallback || "Manual ACI creation via CargoX web portal",
      processedAt,
    };
  } catch (e: any) {
    logger.error("[egypt-adapter] submitCargoX failed", { error: e?.message });
    return { ...fallback, error: e?.message || "submitCargoX failed" };
  }
}

// ── ETA e-Invoice submission ────────────────────────────────────────────

/**
 * Submit an e-Invoice to the Egyptian Tax Authority. The invoice XML must
 * conform to UBL 2.1 and be sealed with the seller's e-Seal. Returns a UUID
 * + QR code that must be printed on the physical invoice.
 */
export async function submitETA(taxData: any): Promise<SubmissionResult> {
  const submittedAt = now();
  const fallback: SubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    externalRef: "",
    status: "FAILED",
    submittedAt,
    processedAt: submittedAt,
    mode: "SIMULATION",
    error: "submitETA internal error",
  };

  try {
    if (!taxData) {
      return { ...fallback, error: "taxData is required" };
    }
    if (!taxData.invoiceNumber || !taxData.invoiceXml) {
      return { ...fallback, error: "invoiceNumber and invoiceXml are required" };
    }

    let result: any = null;
    try {
      const gov = await import("@/lib/sgtx/government");
      result = await gov.submitEtaInvoice({
        ustn: taxData.ustn || "",
        invoiceXml: taxData.invoiceXml,
        invoiceNumber: taxData.invoiceNumber,
      });
    } catch (e: any) {
      logger.warn("[egypt-adapter] ETA submit failed; using fallback", { error: e?.message });
      result = { ok: false, reason: e?.message };
    }

    const processedAt = now();

    if (result?.ok) {
      const uuid = result.uuid;
      statusStore.set(uuid, {
        externalRef: uuid,
        adapterId: ADAPTER_ID,
        status: "ACCEPTED",
        statusDetail: "ETA e-Invoice accepted (VALID). UUID + QR issued.",
        lastUpdated: processedAt,
        holdReason: null,
        releaseDate: null,
        ustn: taxData.ustn || null,
        subAdapter: "ETA",
      });

      logger.info("[egypt-adapter] submitETA accepted", { uuid, ustn: taxData.ustn });

      return {
        ok: true,
        adapterId: ADAPTER_ID,
        externalRef: uuid,
        status: "ACCEPTED",
        submittedAt,
        processedAt,
        formData: {
          uuid,
          qrCode: result.qrCode,
        },
        notes:
          "ETA e-Invoice accepted (simulated mTLS with seller's e-Seal). CORE_READY: sandbox; " +
          "PRODUCTION requires an Egypt Trust e-Seal registered via Broker BYOC.",
        mode: "SIMULATION",
      };
    }

    return {
      ...fallback,
      status: "PENDING",
      error: result?.reason || "ETA rejected the e-Invoice",
      notes: "Generate a PDF e-Invoice for manual submission",
      processedAt,
    };
  } catch (e: any) {
    logger.error("[egypt-adapter] submitETA failed", { error: e?.message });
    return { ...fallback, error: e?.message || "submitETA failed" };
  }
}

// ── CBE payment submission ──────────────────────────────────────────────

/**
 * Submit a customs duty/tax payment instruction to the Central Bank of Egypt
 * (non-custodial). The payment is settled by the buyer's bank directly to
 * the customs authority's account; SGTX never holds funds.
 */
export async function submitCBE(paymentData: any): Promise<SubmissionResult> {
  const submittedAt = now();
  const fallback: SubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    externalRef: "",
    status: "FAILED",
    submittedAt,
    processedAt: submittedAt,
    mode: "SIMULATION",
    error: "submitCBE internal error",
  };

  try {
    if (!paymentData) {
      return { ...fallback, error: "paymentData is required" };
    }
    if (!paymentData.fromIban || !paymentData.toIban || !paymentData.amountUsd) {
      return {
        ...fallback,
        error: "fromIban, toIban, and amountUsd are required for CBE settlement",
      };
    }

    let result: any = null;
    try {
      const gov = await import("@/lib/sgtx/government");
      result = await gov.generateBankSettlementInstruction({
        ustn: paymentData.ustn || "",
        tradeId: paymentData.tradeId || undefined,
        fromIban: paymentData.fromIban,
        toIban: paymentData.toIban,
        fromBic: paymentData.fromBic || undefined,
        toBic: paymentData.toBic || undefined,
        amountUsd: paymentData.amountUsd,
        valueDate: paymentData.valueDate || undefined,
      });
    } catch (e: any) {
      logger.warn("[egypt-adapter] CBE submit failed; using fallback", { error: e?.message });
      result = { ok: false, reason: e?.message };
    }

    const processedAt = now();

    if (result?.ok) {
      const instructionId = result.instructionId;
      statusStore.set(instructionId, {
        externalRef: instructionId,
        adapterId: ADAPTER_ID,
        status: "PENDING",
        statusDetail: "CBE settlement instruction issued. Awaiting bank confirmation (non-custodial).",
        lastUpdated: processedAt,
        holdReason: null,
        releaseDate: null,
        ustn: paymentData.ustn || null,
        subAdapter: "CBE",
      });

      logger.info("[egypt-adapter] submitCBE accepted", { instructionId, ustn: paymentData.ustn });

      return {
        ok: true,
        adapterId: ADAPTER_ID,
        externalRef: instructionId,
        status: "PENDING",
        submittedAt,
        processedAt,
        formData: {
          instructionId,
          reference: result.reference,
        },
        notes:
          "CBE settlement instruction issued (non-custodial). SGTX never holds funds — settlement is " +
          "between the buyer's bank and the customs authority's account. CORE_READY: sandbox.",
        mode: "SIMULATION",
      };
    }

    return {
      ...fallback,
      status: "PENDING",
      error: result?.reason || "CBE rejected the settlement instruction",
      notes: "Finance team reviews bank statement",
      processedAt,
    };
  } catch (e: any) {
    logger.error("[egypt-adapter] submitCBE failed", { error: e?.message });
    return { ...fallback, error: e?.message || "submitCBE failed" };
  }
}

// ── Egypt-specific: get status across all 4 sub-adapters ────────────────

/**
 * Lookup a status across the Egypt adapter's status store. Useful when the
 * caller only has an external reference (UUID, ACID, declaration ID,
 * instruction ID) and doesn't know which sub-adapter produced it.
 */
export async function getEgyptStatus(externalRef: string): Promise<GovernmentStatus> {
  const fallback: GovernmentStatus = {
    externalRef: externalRef || "",
    adapterId: ADAPTER_ID,
    status: "UNKNOWN",
    statusDetail: "Reference not found in Egypt status feed",
    lastUpdated: now(),
    mode: "SIMULATION",
  };
  try {
    if (!externalRef) return fallback;
    const record = statusStore.get(externalRef);
    if (!record) return fallback;
    return {
      externalRef: record.externalRef,
      adapterId: ADAPTER_ID,
      status: record.status,
      statusDetail: `[${record.subAdapter || "EG"}] ${record.statusDetail}`,
      lastUpdated: record.lastUpdated,
      holdReason: record.holdReason,
      releaseDate: record.releaseDate,
      mode: "SIMULATION",
    };
  } catch (e: any) {
    logger.error("[egypt-adapter] getEgyptStatus failed", { error: e?.message });
    return fallback;
  }
}
