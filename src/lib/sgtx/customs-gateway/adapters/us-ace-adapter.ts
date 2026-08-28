// @ts-nocheck
/**
 * SGTX Customs Gateway — US ACE Adapter (CUSTOMS-ACE-BROKER)
 * ============================================================
 *
 * Implements the CustomsAdapter contract for US CBP ACE (Automated Commercial
 * Environment). Wraps the existing document generators in
 * `src/lib/sgtx/compliance/us-ace.ts` (ISF 10+2, CBP 3461, CBP 7501) and adds:
 *
 *   • submitACE(declaration)        — generate + simulated ABI submit
 *   • getACEStatus(entryNumber)     — poll simulated ACE status
 *   • amendACE(declaration)         — submit amendment (CBP 3461-A)
 *   • cancelACE(entryNumber)        — cancel an in-flight entry
 *   • submitISF(isfData)            — ISF 10+2 pre-lading filing
 *   • checkPGARequirements(hs,desc) — PGA routing (FDA / EPA / DOT / FCC / etc.)
 *
 * ACE is accessed via the Automated Broker Interface (ABI) — a CBP-issued
 * mainframe interface requiring an ABI software vendor licence + SCAC. There
 * is NO public REST API. This adapter therefore SIMULATES the ABI protocol:
 * it produces a valid ABI transmission envelope (D records, B records, etc.)
 * and a synthetic CBP acknowledgment. No real CBP credentials are used.
 *
 * Status: CORE_READY
 *   - Document generation: live (real CBP form layouts)
 *   - ABI submission: simulated (CORE_READY)
 *   - PRODUCTION: requires a CBP-issued ABI filer code + SCAC + ACE production
 *     credentials, registered via the Broker BYOC module.
 *
 * References:
 *   • 19 CFR 141 / 142 / 143 / 149
 *   • CBP Form 3461 (10-01-21) instructions
 *   • CBP Form 7501 (10-01-21) instructions
 *   • CBP ISF 10+2 Rule (19 CFR 149)
 *   • ACE ABI Programmer's Guide (CBP)
 *   • Bioterrorism Act (FDA Prior Notice, 21 CFR 1.277-1.285)
 *   • TSCA (EPA, 15 CFR 705)
 *   • DOT FMVSS self-certification (49 CFR 571)
 *   • FCC Equipment Authorization (47 CFR Part 2)
 *
 * CRITICAL SECURITY:
 *   - This adapter NEVER stores or logs the broker's actual ABI filer code or
 *     ACE production credentials. Only a credential *reference* (HSM/secret
 *     manager handle) is logged.
 *   - Filer code is external regulatory metadata; it is NEVER used as the
 *     authorization mechanism. Authorization is enforced by `broker-routing.ts`
 *     using Broker GTID + Authorized Relationship + USTN + Filing Profile +
 *     Credential Reference + Current Credential State + Governor Decision.
 */

import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// ── Adapter contract (shared with egypt-adapter.ts) ─────────────────────
// These types implement the CustomsAdapter interface that the customs-gateway
// core (adapter-registry) expects. They are exported here so sibling adapters
// can re-use the exact same shape.

export interface SubmissionResult {
  ok: boolean;
  adapterId: string;
  externalRef: string; // CBP entry number / Nafeza declaration ID / etc.
  status: "ACCEPTED" | "REJECTED" | "PENDING" | "QUEUED" | "FAILED";
  submittedAt: string;
  processedAt: string | null;
  abiEnvelope?: any; // simulated ABI transmission envelope (US only)
  formData?: any; // generated CBP form payload
  notes?: string;
  error?: string;
  mode: "SIMULATION" | "PRODUCTION";
}

export interface GovernmentStatus {
  externalRef: string;
  adapterId: string;
  status: "SUBMITTED" | "ACCEPTED" | "REVIEW" | "HOLD" | "RELEASED" | "REJECTED" | "CANCELLED" | "UNKNOWN";
  statusDetail: string;
  lastUpdated: string;
  holdReason?: string | null;
  releaseDate?: string | null;
  mode: "SIMULATION" | "PRODUCTION";
}

export interface CancelResult {
  ok: boolean;
  externalRef: string;
  cancelledAt: string;
  reason: string;
}

export interface ISFResult {
  ok: boolean;
  isfNumber: string;
  formData: any;
  abiEnvelope?: any;
  status: "ACCEPTED" | "PENDING" | "REJECTED";
  filingDeadline: string;
  generatedAt: string;
  mode: "SIMULATION" | "PRODUCTION";
}

export interface PGARequirement {
  agency: string; // FDA | EPA | DOT | FCC | USDA | APHIS | ATF | NMFS | FWS
  program: string; // PRIOR_NOTICE | TSCA | FMVSS | EQUIPMENT_AUTH | ...
  required: boolean;
  endpoint: string; // simulated PGA endpoint label
  notes: string;
}

export const ADAPTER_ID = "US_ACE";
export const ADAPTER_JURISDICTION = "US";

// ── In-memory status store (simulated ACE status feed) ──────────────────
// Survives within a single dev-server process. Real ACE status is polled via
// ABI SO (status output) records; here we keep an in-process Map keyed on
// entry number. All write paths are wrapped in try/catch.

interface ACEStatusRecord {
  externalRef: string;
  status: GovernmentStatus["status"];
  statusDetail: string;
  lastUpdated: string;
  holdReason: string | null;
  releaseDate: string | null;
  ustn?: string | null;
}

const statusStore = new Map<string, ACEStatusRecord>();

// ── Helpers ─────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function abiEnvelope(action: string, entryNumber: string, filerRef: string | null): any {
  // Simulated ACE ABI transmission envelope.
  // Real ABI uses fixed-length records prefixed by record-type codes
  // (D = data, B = bill, H = header, etc.). Here we expose a structured
  // JSON envelope for inspection — production ABI would re-encode as EBCDIC.
  return {
    abiVersion: "C0800",
    transmissionId: `ABI-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`,
    action,
    entryNumber,
    filerReference: filerRef ? `[REDACTED:${filerRef.slice(0, 4)}***]` : null,
    // CRITICAL: never embed the actual filer code in the envelope metadata
    // that is logged. The actual code is pulled at send time from the HSM.
    recordCount: 1,
    mode: "SIMULATION",
  };
}

function persistLog(input: {
  apiName: string;
  endpoint: string;
  ustn?: string | null;
  requestBody: any;
  idempotencyKey: string;
}): Promise<string | null> {
  // Defensive DB audit log — never throws into the adapter.
  return (async () => {
    try {
      const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      await db.integrationConnectorLog.create({
        data: {
          logId,
          apiName: input.apiName,
          endpoint: input.endpoint,
          ustn: input.ustn || null,
          idempotencyKey: input.idempotencyKey,
          requestBody: JSON.stringify(input.requestBody).slice(0, 2000),
          status: "PENDING",
        },
      });
      return logId;
    } catch (e: any) {
      logger.warn("[us-ace-adapter] audit log failed", { error: e?.message });
      return null;
    }
  })();
}

async function updateLog(logId: string | null, update: any): Promise<void> {
  if (!logId) return;
  try {
    await db.integrationConnectorLog.update({
      where: { logId },
      data: {
        responseBody: update.responseBody ? JSON.stringify(update.responseBody).slice(0, 2000) : undefined,
        statusCode: update.statusCode ?? undefined,
        status: update.status ?? "SUCCESS",
        errorMessage: update.errorMessage ?? undefined,
        attemptCount: { increment: 1 },
      },
    });
  } catch (e: any) {
    logger.warn("[us-ace-adapter] audit log update failed", { error: e?.message });
  }
}

// ── PGA routing ─────────────────────────────────────────────────────────

const PGA_RULES: Array<{
  agency: string;
  program: string;
  endpoint: string;
  hsPrefixes: string[];
  keywords: string[];
  notes: string;
}> = [
  {
    agency: "FDA",
    program: "PRIOR_NOTICE",
    endpoint: "ACE_PGA_FDA_PRIOR_NOTICE",
    hsPrefixes: ["01", "02", "03", "04", "05", "07", "08", "09", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "33", "34", "35"],
    keywords: ["food", "beverage", "dietary", "supplement", "cosmetic", "drug", "pharma", "medical device", "tobacco", "infant formula", "bottled water", "canned", "frozen", "snack", "dairy", "meat", "poultry", "seafood", "fruit", "vegetable", "spice", "tea", "coffee", "wine", "beer", "spirit"],
    notes: "FDA Prior Notice required under Bioterrorism Act (21 CFR 1.277-1.285). Must be filed via ACE before cargo arrival at US port.",
  },
  {
    agency: "EPA",
    program: "TSCA",
    endpoint: "ACE_PGA_EPA_TSCA",
    hsPrefixes: ["28", "29", "32", "38", "39", "40", "48"],
    keywords: ["chemical", "substance", "mixture", "pesticide", "intermediate", "solvent", "polymer", "monomer", "catalyst", "additive", "resin", "plastic", "rubber synthetic"],
    notes: "EPA TSCA (15 USC 53) — Toxic Substances Control Act. Positive certification required for chemical substances; negative certification for articles.",
  },
  {
    agency: "EPA",
    program: "FIFRA",
    endpoint: "ACE_PGA_EPA_FIFRA",
    hsPrefixes: ["3808"],
    keywords: ["pesticide", "insecticide", "herbicide", "fungicide", "rodenticide", "disinfectant"],
    notes: "EPA FIFRA (7 USC 136) — pesticide registration. Notice of Arrival (NOA) required.",
  },
  {
    agency: "DOT",
    program: "FMVSS",
    endpoint: "ACE_PGA_DOT_FMVSS",
    hsPrefixes: ["8702", "8703", "8704", "8705", "8706", "8707", "8708", "8711", "8712", "8713", "8714", "8715", "8716", "8717"],
    keywords: ["vehicle", "motor vehicle", "automobile", "car", "truck", "motorcycle", "trailer", "bus", "chassis", "engine"],
    notes: "DOT FMVSS self-certification (49 CFR 571). Importers of motor vehicles must file HS-7 declaration and conform to FMVSS.",
  },
  {
    agency: "FCC",
    program: "EQUIPMENT_AUTHORIZATION",
    endpoint: "ACE_PGA_FCC_EQUIP_AUTH",
    hsPrefixes: ["8517", "8525", "8526", "8527", "8528", "8529", "8530", "8531", "8532", "8533", "8534", "8535", "8536", "8541", "8542", "8543", "8544"],
    keywords: ["radio", "wireless", "bluetooth", "wifi", "wi-fi", "rf", "transmitter", "receiver", "smartphone", "router", "modem", "iot device", "television", "tv", "antenna", "radar"],
    notes: "FCC Equipment Authorization (47 CFR Part 2). RF-emitting devices require FCC ID or Supplier's Declaration of Conformity.",
  },
  {
    agency: "USDA_APIS",
    program: "PPQ_PERMIT",
    endpoint: "ACE_PGA_USDA_PPQ",
    hsPrefixes: ["0601", "0602", "0603", "0604", "0605", "0609", "0701", "0702", "0703", "0704", "0705", "0706", "0707", "0708", "0709", "0710", "0711", "0712", "0713", "0714"],
    keywords: ["plant", "seed", "tree", "nursery stock", "cut flower", "bulb", "tuber", "fruit plant", "vegetable plant", "live plant", "soil", "wood packaging"],
    notes: "USDA APHIS PPQ permit (7 CFR 319). Plants and plant products require phytosanitary certificate + PPQ permit.",
  },
  {
    agency: "FWS",
    program: "WILDLIFE_IMPORT",
    endpoint: "ACE_PGA_FWS_LEMIS",
    hsPrefixes: ["0106", "0501", "0502", "0503", "0504", "0505", "0506", "0507", "0508", "0509", "0510", "0511", "0512", "0513", "0514", "0515", "4101", "4102", "4103", "4304"],
    keywords: ["ivory", "wildlife", "exotic leather", "reptile skin", "caviar", "coral", "feather", "down", "exotic pet", "tortoise shell", "rhino", "tiger", "pangolin"],
    notes: "USFWS LEMIS (50 CFR 14). Wildlife and wildlife products require CITES import permit + FWS declaration (Form 3-177).",
  },
  {
    agency: "ATF",
    program: "ALCOHOL_TOBACCO",
    endpoint: "ACE_PGA_ATF_PERMIT",
    hsPrefixes: ["2203", "2204", "2205", "2206", "2207", "2208", "2401", "2402", "2403"],
    keywords: ["alcohol", "beer", "wine", "spirit", "whiskey", "vodka", "rum", "cigarette", "cigar", "tobacco", "e-liquid", "vaping"],
    notes: "ATF permit (27 CFR 1, 6, 17, 19). Importers of alcohol and tobacco products require TTB basic permit.",
  },
  {
    agency: "NMFS",
    program: "SEAFOOD_IMPORT",
    endpoint: "ACE_PGA_NMFS_SIMP",
    hsPrefixes: ["0301", "0302", "0303", "0304", "0305", "0306", "0307", "0308", "0309", "1603", "1604", "1605"],
    keywords: ["seafood", "fish", "shrimp", "tuna", "salmon", "lobster", "crab", "caviar", "aquaculture", "marine product"],
    notes: "NOAA NMFS Seafood Import Monitoring Program (SIMP) (50 CFR 300). Certain seafood requires harvest event data at entry.",
  },
];

/**
 * Determine which PGA (Participating Government Agency) filings are required
 * for the given HS code + product description. Returns a list of required
 * PGA filings. Empty list = PGA-clear (no government agency beyond CBP).
 *
 * Defensive: never throws — returns [] on internal error.
 */
export async function checkPGARequirements(
  hsCode: string,
  productDescription: string,
): Promise<PGARequirement[]> {
  try {
    if (!hsCode && !productDescription) return [];
    const hs = (hsCode || "").replace(/[^0-9]/g, "").slice(0, 4);
    const desc = (productDescription || "").toLowerCase();
    const matched: PGARequirement[] = [];
    const seen = new Set<string>();

    for (const rule of PGA_RULES) {
      const hsMatch = hs && rule.hsPrefixes.some((p) => hs.startsWith(p));
      const kwMatch = rule.keywords.some((k) => desc.includes(k));
      if (hsMatch || kwMatch) {
        const key = `${rule.agency}/${rule.program}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matched.push({
          agency: rule.agency,
          program: rule.program,
          required: true,
          endpoint: rule.endpoint,
          notes: rule.notes,
        });
      }
    }
    return matched;
  } catch (e: any) {
    logger.error("[us-ace-adapter] checkPGARequirements failed", { error: e?.message });
    return [];
  }
}

// ── Submit (full declaration: ISF + 3461 + 7501 + PGA routing) ──────────

/**
 * Submit a full declaration to ACE. Generates the ISF (if requested), CBP
 * 3461 (Entry/Immediate Delivery) and CBP 7501 (Entry Summary) payloads via
 * the existing us-ace.ts document generators, then wraps them in a simulated
 * ABI transmission envelope.
 *
 * CRITICAL: the broker credential *reference* is the only credential value
 * that flows through this function — never the actual filer code, ABI
 * password, or SCAC token.
 */
export async function submitACE(declaration: any): Promise<SubmissionResult> {
  const submittedAt = now();
  const fallback: SubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    externalRef: "",
    status: "FAILED",
    submittedAt,
    processedAt: submittedAt,
    mode: "SIMULATION",
    error: "submitACE internal error",
  };

  try {
    if (!declaration) {
      return { ...fallback, error: "declaration is required" };
    }

    // Dynamic import of the existing document generator. Wrapped so a load
    // failure does not crash the adapter.
    let generators: any = null;
    try {
      generators = await import("@/lib/sgtx/compliance/us-ace");
    } catch (e: any) {
      logger.warn("[us-ace-adapter] us-ace generator import failed; using inline fallback", {
        error: e?.message,
      });
      generators = null;
    }

    const ustn = declaration.ustn || null;
    const filerRef = declaration.credentialReference || null;
    const pgaReqs = await checkPGARequirements(
      declaration.hsCode || declaration.hs_code || "",
      declaration.productDescription || declaration.goodsDescription || "",
    );

    // Generate CBP 3461 (release) + CBP 7501 (entry summary).
    let form3461: any = null;
    let form7501: any = null;
    if (generators) {
      try {
        form3461 = await generators.generateCBP3461(declaration);
      } catch (e: any) {
        logger.warn("[us-ace-adapter] CBP 3461 generation failed", { error: e?.message });
      }
      try {
        form7501 = await generators.generateCBP7501(declaration);
      } catch (e: any) {
        logger.warn("[us-ace-adapter] CBP 7501 generation failed", { error: e?.message });
      }
    }

    const entryNumber = form3461?.formNumber || declaration.entryNumber || generateEntryNumberInline();
    const processedAt = now();

    // Simulated ABI envelope (no real CBP call).
    const envelope = abiEnvelope("SUBMIT_ENTRY", entryNumber, filerRef);
    envelope.pgaFilings = pgaReqs.map((p) => ({ agency: p.agency, program: p.program, endpoint: p.endpoint }));
    envelope.formsAttached = [
      form3461 ? { type: "CBP_3461", ref: form3461.formNumber } : null,
      form7501 ? { type: "CBP_7501", ref: form7501.formNumber } : null,
    ].filter(Boolean);

    // Persist audit log (defensive — never blocks submit).
    const idempotencyKey = `ACE-SUBMIT-${entryNumber}-${submittedAt}`;
    const logId = await persistLog({
      apiName: "US_ACE",
      endpoint: "ACE_ABI:SUBMIT_ENTRY",
      ustn,
      requestBody: { entryNumber, ustn, pgaCount: pgaReqs.length, hasFilerRef: !!filerRef },
      idempotencyKey,
    });

    // Update status store (in-memory).
    statusStore.set(entryNumber, {
      externalRef: entryNumber,
      status: "ACCEPTED",
      statusDetail: "Entry accepted by CBP (simulated). Awaiting PGA clearance and physical arrival.",
      lastUpdated: processedAt,
      holdReason: null,
      releaseDate: null,
      ustn,
    });

    await updateLog(logId, {
      responseBody: { entry_number: entryNumber, status: "ACCEPTED", pga_count: pgaReqs.length },
      statusCode: 202,
      status: "SUCCESS",
    });

    logger.info("[us-ace-adapter] submitACE accepted", {
      entryNumber,
      ustn,
      pgaCount: pgaReqs.length,
      hasFilerRef: !!filerRef,
    });

    return {
      ok: true,
      adapterId: ADAPTER_ID,
      externalRef: entryNumber,
      status: "ACCEPTED",
      submittedAt,
      processedAt,
      abiEnvelope: envelope,
      formData: {
        cbp3461: form3461,
        cbp7501: form7501,
        pgaRequirements: pgaReqs,
      },
      notes:
        "Simulated ACE ABI submission. CORE_READY: document generation + ABI envelope construction are live; " +
        "the actual ABI transmission to CBP requires production ACE credentials registered via Broker BYOC. " +
        (pgaReqs.length > 0
          ? `PGA routing required: ${pgaReqs.map((p) => p.agency).join(", ")}.`
          : "No PGA filings required."),
      mode: "SIMULATION",
    };
  } catch (e: any) {
    logger.error("[us-ace-adapter] submitACE failed", { error: e?.message });
    return { ...fallback, error: e?.message || "submitACE failed" };
  }
}

// ── Status ──────────────────────────────────────────────────────────────

/**
 * Poll simulated ACE status for an entry number. Returns the current status
 * from the in-memory status store. If unknown, returns UNKNOWN (NEVER
 * manufactures a RELEASED status — only CBP can release an entry).
 */
export async function getACEStatus(entryNumber: string): Promise<GovernmentStatus> {
  const fallback: GovernmentStatus = {
    externalRef: entryNumber || "",
    adapterId: ADAPTER_ID,
    status: "UNKNOWN",
    statusDetail: "Entry not found in ACE status feed",
    lastUpdated: now(),
    mode: "SIMULATION",
  };
  try {
    if (!entryNumber) return fallback;
    const record = statusStore.get(entryNumber);
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
    logger.error("[us-ace-adapter] getACEStatus failed", { error: e?.message });
    return fallback;
  }
}

// ── Amend ───────────────────────────────────────────────────────────────

/**
 * Submit a CBP 3461-A (Post-Correction Amendment) to an existing entry.
 * Generates a fresh CBP 3461 with the corrected fields and a simulated ABI
 * amendment envelope. Does NOT modify the original entry number.
 */
export async function amendACE(declaration: any): Promise<SubmissionResult> {
  const submittedAt = now();
  const fallback: SubmissionResult = {
    ok: false,
    adapterId: ADAPTER_ID,
    externalRef: declaration?.entryNumber || "",
    status: "FAILED",
    submittedAt,
    processedAt: submittedAt,
    mode: "SIMULATION",
    error: "amendACE internal error",
  };
  try {
    if (!declaration?.entryNumber) {
      return { ...fallback, error: "declaration.entryNumber is required for amendment" };
    }
    const entryNumber = declaration.entryNumber;
    const filerRef = declaration.credentialReference || null;
    const processedAt = now();

    // Generate a corrected CBP 3461 (best-effort).
    let form3461A: any = null;
    try {
      const generators = await import("@/lib/sgtx/compliance/us-ace");
      form3461A = await generators.generateCBP3461({ ...declaration, entryType: "03 (Amendment)" });
    } catch (e: any) {
      logger.warn("[us-ace-adapter] amendment 3461 generation failed", { error: e?.message });
    }

    const envelope = abiEnvelope("AMEND_ENTRY", entryNumber, filerRef);
    envelope.amendmentRef = `AMD-${Date.now()}`;
    envelope.formType = "CBP_3461_A";

    const idempotencyKey = `ACE-AMD-${entryNumber}-${submittedAt}`;
    const logId = await persistLog({
      apiName: "US_ACE",
      endpoint: "ACE_ABI:AMEND_ENTRY",
      ustn: declaration.ustn || null,
      requestBody: { entryNumber, amendmentRef: envelope.amendmentRef },
      idempotencyKey,
    });

    // Update in-memory status to REVIEW.
    const existing = statusStore.get(entryNumber);
    statusStore.set(entryNumber, {
      externalRef: entryNumber,
      status: "REVIEW",
      statusDetail: "Amendment submitted (CBP 3461-A). Entry under CBP review.",
      lastUpdated: processedAt,
      holdReason: null,
      releaseDate: null,
      ustn: existing?.ustn || declaration.ustn || null,
    });

    await updateLog(logId, {
      responseBody: { entry_number: entryNumber, amendment_ref: envelope.amendmentRef, status: "REVIEW" },
      statusCode: 202,
      status: "SUCCESS",
    });

    return {
      ok: true,
      adapterId: ADAPTER_ID,
      externalRef: entryNumber,
      status: "ACCEPTED",
      submittedAt,
      processedAt,
      abiEnvelope: envelope,
      formData: { cbp3461A: form3461A },
      notes: "Simulated ACE ABI amendment. CBP 3461-A post-correction generated.",
      mode: "SIMULATION",
    };
  } catch (e: any) {
    logger.error("[us-ace-adapter] amendACE failed", { error: e?.message });
    return { ...fallback, error: e?.message || "amendACE failed" };
  }
}

// ── Cancel ──────────────────────────────────────────────────────────────

/**
 * Cancel an in-flight entry via simulated ABI cancellation. Only entries that
 * have not yet been released can be cancelled.
 */
export async function cancelACE(entryNumber: string): Promise<CancelResult> {
  const cancelledAt = now();
  try {
    if (!entryNumber) {
      return { ok: false, externalRef: "", cancelledAt, reason: "entryNumber is required" };
    }
    const existing = statusStore.get(entryNumber);
    if (existing && existing.status === "RELEASED") {
      return {
        ok: false,
        externalRef: entryNumber,
        cancelledAt,
        reason: "Cannot cancel an entry that has already been released by CBP",
      };
    }

    const envelope = abiEnvelope("CANCEL_ENTRY", entryNumber, null);
    await persistLog({
      apiName: "US_ACE",
      endpoint: "ACE_ABI:CANCEL_ENTRY",
      ustn: existing?.ustn || null,
      requestBody: { entryNumber, action: "CANCEL" },
      idempotencyKey: `ACE-CANCEL-${entryNumber}-${cancelledAt}`,
    });

    statusStore.set(entryNumber, {
      externalRef: entryNumber,
      status: "CANCELLED",
      statusDetail: "Entry cancelled by filer (simulated ABI cancellation).",
      lastUpdated: cancelledAt,
      holdReason: null,
      releaseDate: null,
      ustn: existing?.ustn || null,
    });

    logger.info("[us-ace-adapter] cancelACE accepted", { entryNumber });
    return {
      ok: true,
      externalRef: entryNumber,
      cancelledAt,
      reason: "Entry cancellation accepted by CBP (simulated)",
    };
  } catch (e: any) {
    logger.error("[us-ace-adapter] cancelACE failed", { error: e?.message });
    return {
      ok: false,
      externalRef: entryNumber || "",
      cancelledAt,
      reason: e?.message || "cancelACE failed",
    };
  }
}

// ── ISF (10+2) ──────────────────────────────────────────────────────────

/**
 * Submit an Importer Security Filing (ISF, "10+2"). Must be filed no later
 * than 24 hours before cargo is laden on the vessel at the foreign port.
 * Wraps the existing ISF generator in `us-ace.ts`.
 */
export async function submitISF(isfData: any): Promise<ISFResult> {
  const generatedAt = now();
  const fallback: ISFResult = {
    ok: false,
    isfNumber: "",
    formData: null,
    status: "REJECTED",
    filingDeadline: "",
    generatedAt,
    mode: "SIMULATION",
  };
  try {
    if (!isfData?.importer?.name) {
      return { ...fallback, status: "REJECTED" };
    }
    let form: any = null;
    try {
      const generators = await import("@/lib/sgtx/compliance/us-ace");
      form = await generators.generateISF(isfData);
    } catch (e: any) {
      logger.warn("[us-ace-adapter] ISF generator failed; using inline fallback", { error: e?.message });
      form = {
        isfNumber: generateIsfNumberInline(),
        formData: { ...isfData, generatedAt },
        status: "GENERATED",
        notes: "Inline fallback (no generator available)",
        filingDeadline: "24 hours before cargo is laden on the vessel at the foreign port (19 CFR 149.5).",
        generatedAt,
      };
    }

    const isfNumber = form.isfNumber || generateIsfNumberInline();
    const envelope = abiEnvelope("SUBMIT_ISF", isfNumber, isfData.credentialReference || null);

    await persistLog({
      apiName: "US_ACE",
      endpoint: "ACE_ABI:SUBMIT_ISF",
      ustn: isfData.ustn || null,
      requestBody: { isfNumber, importer: isfData.importer.name, carrier: isfData.carrier },
      idempotencyKey: `ACE-ISF-${isfNumber}-${generatedAt}`,
    });

    logger.info("[us-ace-adapter] submitISF accepted", { isfNumber });

    return {
      ok: true,
      isfNumber,
      formData: form.formData,
      abiEnvelope: envelope,
      status: "ACCEPTED",
      filingDeadline: form.filingDeadline ||
        "No later than 24 hours before cargo is laden on the vessel at the foreign port (19 CFR 149.5).",
      generatedAt,
      mode: "SIMULATION",
    };
  } catch (e: any) {
    logger.error("[us-ace-adapter] submitISF failed", { error: e?.message });
    return { ...fallback };
  }
}

// ── Inline fallback ID generators (mirror us-ace.ts) ────────────────────

function generateEntryNumberInline(): string {
  const filer = "SGX";
  const num = Math.floor(1000000 + Math.random() * 9000000);
  const check = Math.floor(Math.random() * 10);
  return `${filer}-${num}-${check}`;
}

function generateIsfNumberInline(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000000000 + Math.random() * 9000000000);
  return `ISF-${year}-${rand}`;
}
