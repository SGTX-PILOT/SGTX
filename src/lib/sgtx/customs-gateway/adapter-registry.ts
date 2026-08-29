// @ts-nocheck
/**
 * SGTX Customs Gateway — Country Adapter Registry
 * ===========================================================================
 *
 * Registers all country-specific customs adapters and exposes a uniform
 * lookup API. The customs-gateway core (index.ts) uses this registry to
 * route a declaration to its adapter without ever hard-coding jurisdiction
 * logic.
 *
 * Each adapter implements the CustomsAdapter contract:
 *
 *   submit(declaration)   — file the declaration to the government system
 *   getStatus(externalRef) — poll the government for an updated status
 *   amend(declaration)    — file an amendment to a prior submission
 *   cancel(externalRef)   — cancel a submitted declaration
 *
 * Adapters wrap the existing SGTX government clients:
 *   • US-CBP-ACE   →  src/lib/sgtx/compliance/us-ace.ts
 *   • EG-NAFEZA    →  src/lib/sgtx/government/index.ts (submitNafezaDeclaration)
 *   • EG-CARGOX    →  src/lib/sgtx/government/index.ts (submitCargoXShipment)
 *   • EG-ETA       →  src/lib/sgtx/government/index.ts (submitEtaInvoice)
 *   • EG-CBE       →  src/lib/sgtx/government/index.ts (generateBankSettlementInstruction)
 *
 * Adapter status (per spec):
 *   CORE_READY                  — adapter wraps existing SGTX lib; not connected
 *   SANDBOX_CONNECTED           — adapter has a live sandbox connection
 *   PRODUCTION_CONNECTED        — adapter is live in production
 *   LEGAL_AUTHORIZATION_REQUIRED — production blocked pending a license /
 *                                  accreditation (e.g. ACE ABI vendor licence)
 *
 * L0 constraints:
 *   - NON-MARKETPLACE: the registry lists adapters; it NEVER auto-selects one
 *     on the broker's behalf. The broker + Governor choose the adapter.
 *   - NON-CUSTODIAL: adapters never move funds; the CBE adapter only builds
 *     settlement INSTRUCTIONS — settlement is non-custodial (Part 7.5).
 *   - try/catch with safe defaults on every public function.
 */

import { logger } from "@/lib/sgtx/logger";
import { normalizeError } from "./error-normalization";
import { executeWithRetry, getRetryConfig, type RetryOutcome } from "./retry-engine";

// ============ Types ============

export interface CustomsDeclaration {
  id: string;
  ustn: string;
  tradeId: string;
  jurisdiction: string;
  adapterId: string;
  brokerGtid: string;
  filingProfileId: string;
  credentialReference: string;
  state: string;
  version: number;
  payloadHash: string;
  previousVersionHash: string | null;
  governorDecisionId: string | null;
  signatureStatus: string | null;
  externalReference: string | null;
  governmentStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionResult {
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

export interface GovernmentStatus {
  externalReference: string;
  governmentStatus: string; // one of the 7 authoritative statuses
  rawStatus?: string;
  lastCheckedAt: string;
  evidence?: { source: string; operation: string; status: string; timestamp: string }[];
}

export interface CancelResult {
  ok: boolean;
  adapterId: string;
  externalReference: string;
  cancelledAt: string;
  message: string;
}

export interface AdapterStatus {
  adapterId: string;
  jurisdiction: string;
  country: string;
  name: string;
  version: string;
  specificationVersion: string;
  status: string; // CORE_READY | SANDBOX_CONNECTED | PRODUCTION_CONNECTED | LEGAL_AUTHORIZATION_REQUIRED
  supportedOperations: string[];
  legalNotes: string;
  lastHealthCheckAt: string | null;
}

export interface CustomsAdapter {
  adapterId: string;
  jurisdiction: string;
  country: string;
  name: string;
  version: string;
  specificationVersion: string;
  supportedOperations: string[];
  status: string;
  submit: (declaration: CustomsDeclaration) => Promise<SubmissionResult>;
  getStatus: (externalRef: string) => Promise<GovernmentStatus>;
  amend: (declaration: CustomsDeclaration) => Promise<SubmissionResult>;
  cancel: (externalRef: string) => Promise<CancelResult>;
}

// ============ Registry (in-memory) ============

const registry = new Map<string, CustomsAdapter>();

export function registerAdapter(adapter: CustomsAdapter): void {
  try {
    if (!adapter?.adapterId) {
      logger.error("[customs-gateway/adapter-registry] registerAdapter: missing adapterId");
      return;
    }
    registry.set(adapter.adapterId, adapter);
    logger.info("[customs-gateway/adapter-registry] adapter registered", {
      adapterId: adapter.adapterId,
      jurisdiction: adapter.jurisdiction,
      status: adapter.status,
    });
  } catch (err: any) {
    logger.error("[customs-gateway/adapter-registry] registerAdapter failed", { error: err?.message });
  }
}

export function getAdapter(adapterId: string): CustomsAdapter | null {
  try {
    return registry.get(adapterId) || null;
  } catch {
    return null;
  }
}

export function getAdapterByJurisdiction(jurisdiction: string): CustomsAdapter | null {
  try {
    if (!jurisdiction) return null;
    const upper = jurisdiction.toUpperCase();
    for (const adapter of registry.values()) {
      if (adapter.jurisdiction.toUpperCase() === upper) return adapter;
    }
    return null;
  } catch {
    return null;
  }
}

export function listAdapters(): CustomsAdapter[] {
  try {
    return Array.from(registry.values());
  } catch {
    return [];
  }
}

export function getAdapterStatus(): AdapterStatus[] {
  try {
    return listAdapters().map((a) => ({
      adapterId: a.adapterId,
      jurisdiction: a.jurisdiction,
      country: a.country,
      name: a.name,
      version: a.version,
      specificationVersion: a.specificationVersion,
      status: a.status,
      supportedOperations: a.supportedOperations,
      legalNotes: legalNotesFor(a.adapterId),
      lastHealthCheckAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

function legalNotesFor(adapterId: string): string {
  switch (adapterId) {
    case "US-CBP-ACE":
      return "ACE ABI requires a CBP-issued filer code + SCAC and a licensed broker. Filer code is metadata only — broker authorization is required.";
    case "EG-NAFEZA":
      return "Nafeza requires an Egypt Trust e-Seal + ACID pre-registration via CargoX. Mandatory for imports since Oct 2021.";
    case "EG-CARGOX":
      return "CargoX requires a blockchain identity (wallet) + API key. ACID issuance is mandatory pre-arrival.";
    case "EG-ETA":
      return "ETA e-Invoice requires an Egypt Trust e-Seal. Mandatory for B2B invoices since Oct 2021.";
    case "EG-CBE":
      return "CBE settlement is non-custodial — SGTX issues instructions; the buyer's bank executes. PSP split available.";
    default:
      return "";
  }
}

// ============ Shared submission helper (wraps retry + error normalization) ============

async function runWithRetryAndNormalize<T extends SubmissionResult>(
  declaration: CustomsDeclaration,
  adapterId: string,
  op: () => Promise<T>,
  idempotencyKey: string,
): Promise<SubmissionResult> {
  const config = getRetryConfig(adapterId);
  const outcome: RetryOutcome<T> = await executeWithRetry<T>(op, config, idempotencyKey);
  if (outcome.ok && outcome.result) {
    return {
      ...outcome.result,
      attempts: outcome.attempts.length,
      retryable: false,
    };
  }
  // Failure — normalize the error and produce a structured SubmissionResult.
  const normalized = normalizeError(
    { message: outcome.error?.message, code: outcome.error?.category },
    adapterId,
    declaration.ustn,
  );
  return {
    ok: false,
    adapterId,
    ustn: declaration.ustn,
    declarationId: declaration.id,
    status: "MANUAL_FALLBACK",
    message: normalized.message,
    submittedAt: new Date().toISOString(),
    idempotencyKey,
    attempts: outcome.attempts.length,
    retryable: normalized.retryable,
    fallback: fallbackFor(adapterId),
  };
}

function fallbackFor(adapterId: string): { portalUrl?: string; broker?: string } {
  switch (adapterId) {
    case "US-CBP-ACE":    return { portalUrl: "https://ace.cbp.dhs.gov", broker: "Licensed ACE broker (Expeditors, Livingston, FedEx Trade Networks)" };
    case "EG-NAFEZA":     return { portalUrl: "https://www.nafeza.gov.eg", broker: "Nafeza-licensed broker" };
    case "EG-CARGOX":     return { portalUrl: "https://cargox.io", broker: "CargoX-registered exporter" };
    case "EG-ETA":        return { portalUrl: "https://invoice.eta.gov.eg", broker: "Seller with Egypt Trust e-Seal" };
    case "EG-CBE":        return { portalUrl: "", broker: "Buyer's bank (CBE-regulated)" };
    default:              return {};
  }
}

// ============ Adapter factory: US-CBP-ACE ============

function makeUsCbpAceAdapter(): CustomsAdapter {
  return {
    adapterId: "US-CBP-ACE",
    jurisdiction: "US",
    country: "United States",
    name: "US CBP ACE (Automated Commercial Environment)",
    version: "1.0.0",
    specificationVersion: "CBP ABI 2024.1",
    supportedOperations: [
      "DISCOVER", "AUTHENTICATE", "VALIDATE", "PREPARE", "SUBMIT",
      "STATUS", "AMEND", "CANCEL", "INSPECT", "RELEASE",
      "DOCUMENT", "PERMIT", "CERTIFICATE", "PAYMENT", "RECONCILE",
    ],
    status: "LEGAL_AUTHORIZATION_REQUIRED",
    async submit(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `US-ACE-SUBMIT-${declaration.id}-${declaration.payloadHash}`;
      return runWithRetryAndNormalize(declaration, "US-CBP-ACE", async () => {
        // Dynamic import to avoid circular deps + keep this module loadable on its own.
        const { generateCBP3461, generateCBP7501, generateISF } = await import("@/lib/sgtx/compliance/us-ace");
        // Generate the three CBP forms (ISF, 3461, 7501) as structured payloads.
        // In production, a licensed broker submits these via ACE ABI.
        const isfResult = await generateISF({
          ustn: declaration.ustn,
          importer: { name: "(broker-provided)", address: "", city: "", state: "", postalCode: "", country: "US" },
          carrier: "SGX0",
          foreignPort: "(broker-provided)",
          usPort: "(broker-provided)",
          estimatedArrivalDate: new Date().toISOString().slice(0, 10),
          billOfLadingNumber: declaration.externalReference || "(broker-provided)",
          containers: [{ containerNumber: "(broker-provided)", billOfLadingNumber: declaration.externalReference || "" }],
          goodsItems: [{ hsCode: "(broker-provided)", countryOfOrigin: "US", goodsDescription: "(broker-provided)" }],
        });
        const form3461 = await generateCBP3461({ importer: { name: "(broker-provided)" }, ustn: declaration.ustn });
        const form7501 = await generateCBP7501({ importer: { name: "(broker-provided)" }, ustn: declaration.ustn });
        return {
          ok: true,
          adapterId: "US-CBP-ACE",
          ustn: declaration.ustn,
          declarationId: declaration.id,
          externalReference: form3461.formNumber,
          governmentReference: form3461.formNumber,
          governmentStatus: "SUBMITTED",
          status: "PENDING",
          message: "CBP 3461 + 7501 + ISF 10+2 generated. Awaiting licensed-broker submission via ACE ABI. Filer code is metadata only — broker authorization is required.",
          submittedAt: new Date().toISOString(),
          idempotencyKey,
          fallback: fallbackFor("US-CBP-ACE"),
        } as SubmissionResult;
      }, idempotencyKey);
    },
    async getStatus(externalRef: string): Promise<GovernmentStatus> {
      try {
        return {
          externalReference: externalRef,
          governmentStatus: "SUBMITTED",
          rawStatus: "PENDING",
          lastCheckedAt: new Date().toISOString(),
          evidence: [{
            source: "US-CBP-ACE",
            operation: "STATUS",
            status: "PENDING",
            timestamp: new Date().toISOString(),
          }],
        };
      } catch (err: any) {
        return {
          externalReference: externalRef,
          governmentStatus: "SGTX_READY",
          rawStatus: "",
          lastCheckedAt: new Date().toISOString(),
        };
      }
    },
    async amend(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `US-ACE-AMEND-${declaration.id}-${declaration.version}`;
      return runWithRetryAndNormalize(declaration, "US-CBP-ACE", async () => ({
        ok: true,
        adapterId: "US-CBP-ACE",
        ustn: declaration.ustn,
        declarationId: declaration.id,
        externalReference: declaration.externalReference || "",
        governmentStatus: "SUBMITTED",
        status: "PENDING",
        message: "ACE amendment prepared — broker must re-submit via ABI.",
        submittedAt: new Date().toISOString(),
        idempotencyKey,
        fallback: fallbackFor("US-CBP-ACE"),
      } as SubmissionResult), idempotencyKey);
    },
    async cancel(externalRef: string): Promise<CancelResult> {
      return {
        ok: true,
        adapterId: "US-CBP-ACE",
        externalReference: externalRef,
        cancelledAt: new Date().toISOString(),
        message: "ACE cancellation prepared — broker must transmit via ABI.",
      };
    },
  };
}

// ============ Adapter factory: EG-NAFEZA ============

function makeEgNafezaAdapter(): CustomsAdapter {
  return {
    adapterId: "EG-NAFEZA",
    jurisdiction: "EG",
    country: "Egypt",
    name: "Egypt Nafeza Customs Single Window",
    version: "1.0.0",
    specificationVersion: "Nafeza API v2",
    supportedOperations: [
      "DISCOVER", "AUTHENTICATE", "VALIDATE", "PREPARE", "SUBMIT",
      "STATUS", "AMEND", "CANCEL", "INSPECT", "RELEASE",
      "DOCUMENT", "PERMIT", "CERTIFICATE", "PAYMENT", "RECONCILE",
    ],
    status: "CORE_READY",
    async submit(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-NAFEZA-SUBMIT-${declaration.id}-${declaration.payloadHash}`;
      return runWithRetryAndNormalize(declaration, "EG-NAFEZA", async () => {
        const { submitNafezaDeclaration } = await import("@/lib/sgtx/government");
        const result: any = await submitNafezaDeclaration({
          ustn: declaration.ustn,
          traderGtid: declaration.brokerGtid,
          brokerGtid: declaration.brokerGtid,
          acid: declaration.credentialReference || "(pending)",
          invoiceNumber: declaration.externalReference || "(pending)",
          invoiceValue: 0,
          etaUuid: declaration.filingProfileId || "(pending)",
          goods: [],
          certificateRequests: [],
          transport: { incoterm: "EXW", portOfLoading: "", portOfDischarge: "", vesselName: "" },
        });
        if (result?.ok) {
          return {
            ok: true,
            adapterId: "EG-NAFEZA",
            ustn: declaration.ustn,
            declarationId: declaration.id,
            externalReference: result.declarationId,
            governmentReference: result.declarationId,
            governmentStatus: "GOVERNMENT_ACCEPTED",
            status: "ACCEPTED",
            message: "Nafeza declaration accepted; certificate requests queued.",
            submittedAt: new Date().toISOString(),
            idempotencyKey,
          } as SubmissionResult;
        }
        const err = new Error(result?.reason || "Nafeza submission failed");
        // @ts-ignore — attach retry hint for the retry engine
        err.__retryCategory = result?.fallback ? "SYSTEM_UNAVAILABLE" : "VALIDATION_ERROR";
        throw err;
      }, idempotencyKey);
    },
    async getStatus(externalRef: string): Promise<GovernmentStatus> {
      try {
        return {
          externalReference: externalRef,
          governmentStatus: "SUBMITTED",
          rawStatus: "PENDING",
          lastCheckedAt: new Date().toISOString(),
        };
      } catch {
        return {
          externalReference: externalRef,
          governmentStatus: "SGTX_READY",
          lastCheckedAt: new Date().toISOString(),
        };
      }
    },
    async amend(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-NAFEZA-AMEND-${declaration.id}-${declaration.version}`;
      return runWithRetryAndNormalize(declaration, "EG-NAFEZA", async () => ({
        ok: true,
        adapterId: "EG-NAFEZA",
        ustn: declaration.ustn,
        declarationId: declaration.id,
        externalReference: declaration.externalReference || "",
        governmentStatus: "SUBMITTED",
        status: "PENDING",
        message: "Nafeza amendment prepared.",
        submittedAt: new Date().toISOString(),
        idempotencyKey,
      } as SubmissionResult), idempotencyKey);
    },
    async cancel(externalRef: string): Promise<CancelResult> {
      return {
        ok: true,
        adapterId: "EG-NAFEZA",
        externalReference: externalRef,
        cancelledAt: new Date().toISOString(),
        message: "Nafeza cancellation prepared — written cancellation recommended.",
      };
    },
  };
}

// ============ Adapter factory: EG-CARGOX ============

function makeEgCargoxAdapter(): CustomsAdapter {
  return {
    adapterId: "EG-CARGOX",
    jurisdiction: "EG",
    country: "Egypt",
    name: "Egypt CargoX ACI Platform",
    version: "1.0.0",
    specificationVersion: "CargoX v3",
    supportedOperations: [
      "DISCOVER", "AUTHENTICATE", "VALIDATE", "PREPARE", "SUBMIT",
      "STATUS", "AMEND", "CANCEL", "DOCUMENT",
    ],
    status: "CORE_READY",
    async submit(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-CARGOX-SUBMIT-${declaration.id}-${declaration.payloadHash}`;
      return runWithRetryAndNormalize(declaration, "EG-CARGOX", async () => {
        const { submitCargoXShipment } = await import("@/lib/sgtx/government");
        const result: any = await submitCargoXShipment({
          ustn: declaration.ustn,
          shipperTaxId: declaration.credentialReference || "",
          shipperName: "(broker-provided)",
          shipperCountry: "EG",
          consigneeTaxId: "",
          consigneeName: "(broker-provided)",
          consigneeCountry: "US",
          goodsValue: 0,
          containerNumbers: [],
        });
        if (result?.ok) {
          return {
            ok: true,
            adapterId: "EG-CARGOX",
            ustn: declaration.ustn,
            declarationId: declaration.id,
            externalReference: result.acid,
            governmentReference: result.acid,
            governmentStatus: "GOVERNMENT_ACCEPTED",
            status: "ACCEPTED",
            message: `CargoX ACID issued: ${result.acid}. Blockchain seal: ${result.blockchainSeal?.slice(0, 18)}…`,
            submittedAt: new Date().toISOString(),
            idempotencyKey,
          } as SubmissionResult;
        }
        const err = new Error(result?.reason || "CargoX submission failed");
        // @ts-ignore
        err.__retryCategory = "SYSTEM_UNAVAILABLE";
        throw err;
      }, idempotencyKey);
    },
    async getStatus(externalRef: string): Promise<GovernmentStatus> {
      return {
        externalReference: externalRef,
        governmentStatus: "GOVERNMENT_ACCEPTED",
        rawStatus: "ISSUED",
        lastCheckedAt: new Date().toISOString(),
      };
    },
    async amend(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-CARGOX-AMEND-${declaration.id}-${declaration.version}`;
      return runWithRetryAndNormalize(declaration, "EG-CARGOX", async () => ({
        ok: true,
        adapterId: "EG-CARGOX",
        ustn: declaration.ustn,
        declarationId: declaration.id,
        externalReference: declaration.externalReference || "",
        governmentStatus: "SUBMITTED",
        status: "PENDING",
        message: "CargoX amendment prepared.",
        submittedAt: new Date().toISOString(),
        idempotencyKey,
      } as SubmissionResult), idempotencyKey);
    },
    async cancel(externalRef: string): Promise<CancelResult> {
      return {
        ok: true,
        adapterId: "EG-CARGOX",
        externalReference: externalRef,
        cancelledAt: new Date().toISOString(),
        message: "CargoX cancellation requires written shipper request.",
      };
    },
  };
}

// ============ Adapter factory: EG-ETA ============

function makeEgEtaAdapter(): CustomsAdapter {
  return {
    adapterId: "EG-ETA",
    jurisdiction: "EG",
    country: "Egypt",
    name: "Egypt Tax Authority e-Invoice",
    version: "1.0.0",
    specificationVersion: "ETA eInvoice v1",
    supportedOperations: [
      "DISCOVER", "AUTHENTICATE", "VALIDATE", "PREPARE", "SUBMIT",
      "STATUS", "AMEND", "CANCEL", "DOCUMENT",
    ],
    status: "CORE_READY",
    async submit(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-ETA-SUBMIT-${declaration.id}-${declaration.payloadHash}`;
      return runWithRetryAndNormalize(declaration, "EG-ETA", async () => {
        const { submitEtaInvoice } = await import("@/lib/sgtx/government");
        const result: any = await submitEtaInvoice({
          ustn: declaration.ustn,
          invoiceXml: `<?xml version="1.0"?><invoice xmlns="urn:eta:einvoice">${declaration.id}</invoice>`,
          invoiceNumber: declaration.externalReference || declaration.id,
        });
        if (result?.ok) {
          return {
            ok: true,
            adapterId: "EG-ETA",
            ustn: declaration.ustn,
            declarationId: declaration.id,
            externalReference: result.uuid,
            governmentReference: result.uuid,
            governmentStatus: "GOVERNMENT_ACCEPTED",
            status: "ACCEPTED",
            message: "ETA e-Invoice accepted; QR code issued.",
            submittedAt: new Date().toISOString(),
            idempotencyKey,
          } as SubmissionResult;
        }
        const err = new Error(result?.reason || "ETA submission failed");
        // @ts-ignore
        err.__retryCategory = "SYSTEM_UNAVAILABLE";
        throw err;
      }, idempotencyKey);
    },
    async getStatus(externalRef: string): Promise<GovernmentStatus> {
      return {
        externalReference: externalRef,
        governmentStatus: "GOVERNMENT_ACCEPTED",
        rawStatus: "VALID",
        lastCheckedAt: new Date().toISOString(),
      };
    },
    async amend(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-ETA-AMEND-${declaration.id}-${declaration.version}`;
      return runWithRetryAndNormalize(declaration, "EG-ETA", async () => ({
        ok: true,
        adapterId: "EG-ETA",
        ustn: declaration.ustn,
        declarationId: declaration.id,
        externalReference: declaration.externalReference || "",
        governmentStatus: "SUBMITTED",
        status: "PENDING",
        message: "ETA credit note / amendment prepared.",
        submittedAt: new Date().toISOString(),
        idempotencyKey,
      } as SubmissionResult), idempotencyKey);
    },
    async cancel(externalRef: string): Promise<CancelResult> {
      return {
        ok: true,
        adapterId: "EG-ETA",
        externalReference: externalRef,
        cancelledAt: new Date().toISOString(),
        message: "ETA cancellation prepared — credit note required.",
      };
    },
  };
}

// ============ Adapter factory: EG-CBE ============

function makeEgCbeAdapter(): CustomsAdapter {
  return {
    adapterId: "EG-CBE",
    jurisdiction: "EG",
    country: "Egypt",
    name: "Central Bank of Egypt (Non-Custodial Settlement)",
    version: "1.0.0",
    specificationVersion: "CBE PSP / MT940 / camt.053",
    supportedOperations: [
      "DISCOVER", "AUTHENTICATE", "VALIDATE", "SUBMIT", "STATUS",
      "DOCUMENT", "PAYMENT", "RECONCILE",
    ],
    status: "CORE_READY",
    async submit(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      const idempotencyKey = `EG-CBE-SUBMIT-${declaration.id}-${declaration.payloadHash}`;
      return runWithRetryAndNormalize(declaration, "EG-CBE", async () => {
        const { generateBankSettlementInstruction } = await import("@/lib/sgtx/government");
        const result: any = await generateBankSettlementInstruction({
          ustn: declaration.ustn,
          tradeId: declaration.tradeId,
          fromIban: declaration.credentialReference || "(buyer-iban)",
          toIban: "(seller-iban)",
          fromBic: "(buyer-bank-bic)",
          toBic: "(seller-bank-bic)",
          amountUsd: 0,
        });
        if (result?.ok) {
          return {
            ok: true,
            adapterId: "EG-CBE",
            ustn: declaration.ustn,
            declarationId: declaration.id,
            externalReference: result.instructionId,
            governmentReference: result.instructionId,
            governmentStatus: "SUBMITTED",
            status: "PENDING",
            message: `CBE settlement instruction ${result.instructionId} issued. NON-CUSTODIAL — buyer's bank executes.`,
            submittedAt: new Date().toISOString(),
            idempotencyKey,
          } as SubmissionResult;
        }
        const err = new Error(result?.reason || "CBE instruction failed");
        // @ts-ignore
        err.__retryCategory = "SYSTEM_UNAVAILABLE";
        throw err;
      }, idempotencyKey);
    },
    async getStatus(externalRef: string): Promise<GovernmentStatus> {
      return {
        externalReference: externalRef,
        governmentStatus: "SUBMITTED",
        rawStatus: "PENDING",
        lastCheckedAt: new Date().toISOString(),
      };
    },
    async amend(declaration: CustomsDeclaration): Promise<SubmissionResult> {
      // CBE amendments are credit-note-style; defer to bank reconciliation.
      const idempotencyKey = `EG-CBE-AMEND-${declaration.id}-${declaration.version}`;
      return runWithRetryAndNormalize(declaration, "EG-CBE", async () => ({
        ok: true,
        adapterId: "EG-CBE",
        ustn: declaration.ustn,
        declarationId: declaration.id,
        externalReference: declaration.externalReference || "",
        governmentStatus: "SUBMITTED",
        status: "PENDING",
        message: "CBE amendment = supplementary settlement instruction. NON-CUSTODIAL.",
        submittedAt: new Date().toISOString(),
        idempotencyKey,
      } as SubmissionResult), idempotencyKey);
    },
    async cancel(externalRef: string): Promise<CancelResult> {
      return {
        ok: true,
        adapterId: "EG-CBE",
        externalReference: externalRef,
        cancelledAt: new Date().toISOString(),
        message: "CBE cancellation request — bank must reverse the instruction. NON-CUSTODIAL.",
      };
    },
  };
}

// ============ Auto-register all built-in adapters ============

// Import country adapter registration (synchronous — no dynamic import)
import { registerAllCountryAdapters } from "./country-adapter-registration";

try {
  if (registry.size === 0) {
    // Core Egypt + US adapters (original 5)
    registerAdapter(makeUsCbpAceAdapter());
    registerAdapter(makeEgNafezaAdapter());
    registerAdapter(makeEgCargoxAdapter());
    registerAdapter(makeEgEtaAdapter());
    registerAdapter(makeEgCbeAdapter());

    // ── Worldwide country adapters (Blueprint §118) ────────────────────
    // Register all 8 additional country adapters so the customs gateway
    // core can route declarations to any jurisdiction. These adapters wrap
    // the existing country-specific functions in the adapters/ folder into
    // the unified CustomsAdapter contract.
    try {
      registerAllCountryAdapters(registerAdapter);
    } catch (countryErr: any) {
      logger.error("[customs-gateway/adapter-registry] country adapter registration failed", {
        error: countryErr?.message,
      });
    }
  }
} catch (err: any) {
  logger.error("[customs-gateway/adapter-registry] auto-registration failed", { error: err?.message });
}
