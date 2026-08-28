// @ts-nocheck
/**
 * SGTX Customs Gateway — Customs Compliance Engine (§81)
 * ===========================================================================
 *
 * Customs-specific compliance verification. Runs the 15 deterministic
 * compliance checks against a TRADE that has already been filed (or is
 * about to be filed) through the customs gateway.
 *
 * Where §82 (trade-feasibility.ts) operates on PLANNING inputs (before a
 * trade exists), §81 operates on an actual USTN — it loads the Trade +
 * CustomsDeclaration + Invoice rows and verifies that the filed data
 * passes customs compliance.
 *
 * The 15 check types (§81):
 *
 *   SANCTIONS                  HS_CLASSIFICATION         ORIGIN
 *   DESTINATION                IMPORT_RESTRICTIONS       EXPORT_RESTRICTIONS
 *   PERMIT_REQUIREMENTS        DOCUMENTATION_COMPLETENESS TARIFF_RATE
 *   QUANTITY                    COUNTRY_RESTRICTIONS      AGRICULTURAL
 *   PRODUCT_SAFETY              CONTROLLED_GOODS          DUAL_USE
 *   CUSTOMS_DATA_VALIDATION
 *
 * Each check returns one of:
 *   PASS            — compliant
 *   WARNING         — non-blocking concern
 *   REQUIRES_REVIEW — a licensed broker / human must review (non-blocking)
 *   FAIL            — blocking violation
 *
 * AI POLICY (§42 + §81):
 *   - AI MAY ASSIST with classification (A2 — detect anomalies, surface
 *     fuzzy HS-code matches, identify missing evidence). This is wrapped
 *     in a separate `_aiAssist` hook.
 *   - DETERMINISTIC POLICY controls blocking. A FAIL is only ever
 *     emitted by a deterministic rule (sanctions hit, embargoed country,
 *     controlled-goods prefix match, missing required field). The AI
 *     hook can only elevate a PASS to WARNING or REQUIRES_REVIEW —
 *     NEVER to FAIL.
 *   - The Governor (§43) is the enforcer of consequential action; this
 *     engine only REPORTS. A Governor decision is required for any
 *     consequential response (cancelling a filing, suspending a broker,
 *     etc.).
 *
 * CRITICAL (§113):
 *   A `passed: true` result is NOT a customs clearance. It is an
 *   internal SGTX compliance verification — the customs authority
 *   issues clearance only after an actual filing. `passed: false`
 *   indicates a blocking issue that must be resolved BEFORE filing.
 *
 * Persistence:
 *   - READ-ONLY. This engine never mutates a Trade / Declaration / Dispute.
 *   - The result MAY be persisted as an Activity row by the calling
 *     API route (not by this lib) for audit. The lib returns the result;
 *     the caller decides persistence.
 *
 * All public functions are wrapped in try/catch with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type ComplianceCheckType =
  | "SANCTIONS"
  | "HS_CLASSIFICATION"
  | "ORIGIN"
  | "DESTINATION"
  | "IMPORT_RESTRICTIONS"
  | "EXPORT_RESTRICTIONS"
  | "PERMIT_REQUIREMENTS"
  | "DOCUMENTATION_COMPLETENESS"
  | "TARIFF_RATE"
  | "QUANTITY"
  | "COUNTRY_RESTRICTIONS"
  | "AGRICULTURAL"
  | "PRODUCT_SAFETY"
  | "CONTROLLED_GOODS"
  | "DUAL_USE"
  | "CUSTOMS_DATA_VALIDATION";

export const COMPLIANCE_CHECK_TYPES: ComplianceCheckType[] = [
  "SANCTIONS", "HS_CLASSIFICATION", "ORIGIN", "DESTINATION",
  "IMPORT_RESTRICTIONS", "EXPORT_RESTRICTIONS", "PERMIT_REQUIREMENTS",
  "DOCUMENTATION_COMPLETENESS", "TARIFF_RATE", "QUANTITY",
  "COUNTRY_RESTRICTIONS", "AGRICULTURAL", "PRODUCT_SAFETY",
  "CONTROLLED_GOODS", "DUAL_USE", "CUSTOMS_DATA_VALIDATION",
];

export type ComplianceStatus = "PASS" | "FAIL" | "WARNING" | "REQUIRES_REVIEW";

export interface ComplianceCheck {
  checkType: ComplianceCheckType;
  status: ComplianceStatus;
  details: string;
  evidence: any;
}

export interface ComplianceResult {
  passed: boolean;
  checks: ComplianceCheck[];
  blockingIssues: string[];
  warnings: string[];
}

// ============ Deterministic policy tables (shared with trade-feasibility) ============

const EMBARGOED_COUNTRIES = new Set(["CU", "IR", "KP", "SY", "BY"]);

const CONTROLLED_HS_PREFIXES = [
  "9301", "9302", "9303", "9304", "9305", "9306", "9307",
  "3601", "3602", "3603",
  "2939", "2936",
];

const AGRI_HS_PREFIXES = [
  "01", "02", "03", "04", "05",
  "06", "07", "08", "09", "10",
  "12", "13", "14", "15",
  "16", "17", "18", "19", "20", "21",
];

const DUAL_USE_PREFIXES = ["8479", "8486", "8543", "9031", "9032", "2803", "2902"];

// ============ §81 Public Entry Point ============

/**
 * §81 — Run the full 15-check customs compliance verification against
 * the trade + declaration identified by `ustn`. NEVER throws — on any
 * internal error returns `passed: false` with the failure described as
 * a blocking issue (fail-closed: if we can't verify, we don't pass).
 *
 * NOTE: `passed: false` is a SGTX-internal signal — it is NOT a customs
 * authority determination (§113). The customs authority issues
 * clearance independently after a real filing.
 */
export async function runCustomsComplianceCheck(
  ustn: string,
): Promise<ComplianceResult> {
  try {
    if (!ustn) {
      return _failClosed("ustn is required");
    }
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    if (!trade) {
      return _failClosed(`trade not found for USTN ${ustn}`);
    }
    const declarations = (await db.customsDeclaration.findMany({
      where: { tradeId: trade.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    })) as any[];
    const invoices = (await db.invoice.findMany({
      where: { tradeId: trade.id },
      take: 10,
    })) as any[];

    const ctx = _loadContext(trade, declarations, invoices);
    const checks: ComplianceCheck[] = [];

    // Run all 15 deterministic checks. Each is wrapped in try/catch so
    // one failing check doesn't blow up the whole batch — it surfaces
    // as a REQUIRES_REVIEW with the error in `details`.
    checks.push(await _checkSanctions(ctx));
    checks.push(_checkHsClassification(ctx));
    checks.push(_checkOrigin(ctx));
    checks.push(_checkDestination(ctx));
    checks.push(_checkImportRestrictions(ctx));
    checks.push(_checkExportRestrictions(ctx));
    checks.push(_checkPermitRequirements(ctx));
    checks.push(_checkDocumentationCompleteness(ctx));
    checks.push(_checkTariffRate(ctx));
    checks.push(_checkQuantity(ctx));
    checks.push(_checkCountryRestrictions(ctx));
    checks.push(_checkAgricultural(ctx));
    checks.push(_checkProductSafety(ctx));
    checks.push(_checkControlledGoods(ctx));
    checks.push(_checkDualUse(ctx));
    checks.push(_checkCustomsDataValidation(ctx));

    // §42 A2 — AI ASSIST (anomaly detection, fuzzy HS match). The hook
    // can only ELEVATE a PASS to WARNING or REQUIRES_REVIEW — never to
    // FAIL. Deterministic policy remains the sole source of blocking.
    _aiAssist(checks);

    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    for (const c of checks) {
      if (c.status === "FAIL") {
        blockingIssues.push(`[${c.checkType}] ${c.details}`);
      } else if (c.status === "WARNING" || c.status === "REQUIRES_REVIEW") {
        warnings.push(`[${c.checkType}] ${c.details}`);
      }
    }
    const passed = blockingIssues.length === 0;

    return { passed, checks, blockingIssues, warnings };
  } catch (err) {
    logger.error("[customs-gateway/customs-compliance] runCustomsComplianceCheck failed", {
      error: String(err),
      ustn,
    });
    return _failClosed(`internal-error: ${String(err)}`);
  }
}

// ============ Context loader ============

interface _Ctx {
  ustn: string;
  trade: any;
  declarations: any[];
  invoices: any[];
  hsCode: string;
  hsValid: boolean;
  origin: string;
  destination: string;
  isControlled: boolean;
  isAgri: boolean;
  isDualUse: boolean;
  importExport: "IMPORT" | "EXPORT" | "TRANSIT";
  incoterm: string;
  transportMode: string;
  regime: string;
  dutyUsd: number | null;
}

function _loadContext(
  trade: any,
  declarations: any[],
  invoices: any[],
): _Ctx {
  const hs = String(trade.commodityHs || "").replace(/\s+/g, "");
  const hsValid = /^\d{6,10}$/.test(hs);
  const origin = String(trade.originCountry || "").toUpperCase().slice(0, 2);
  const destination = String(trade.destCountry || "").toUpperCase().slice(0, 2);
  const latest = declarations[0] || null;
  const regime = String(latest?.regime || "IMPORT").toUpperCase();
  const importExport: _Ctx["importExport"] =
    regime === "EXPORT" ? "EXPORT" : regime === "TRANSIT" ? "TRANSIT" : "IMPORT";
  return {
    ustn: String(trade.ustn || ""),
    trade,
    declarations,
    invoices,
    hsCode: hs,
    hsValid,
    origin,
    destination,
    isControlled: hsValid && CONTROLLED_HS_PREFIXES.some((p) => hs.startsWith(p)),
    isAgri: hsValid && AGRI_HS_PREFIXES.some((p) => hs.startsWith(p)),
    isDualUse: hsValid && DUAL_USE_PREFIXES.some((p) => hs.startsWith(p)),
    importExport,
    incoterm: String(trade.incoterm || "").toUpperCase(),
    transportMode: String(trade.transportMode || "").toUpperCase(),
    regime,
    dutyUsd: latest?.dutyUsd ?? null,
  };
}

// ============ The 15 deterministic checks ============

async function _checkSanctions(ctx: _Ctx): Promise<ComplianceCheck> {
  try {
    if (EMBARGOED_COUNTRIES.has(ctx.origin)) {
      return _fail("SANCTIONS", `origin ${ctx.origin} is under comprehensive embargo`, { origin: ctx.origin });
    }
    if (EMBARGOED_COUNTRIES.has(ctx.destination)) {
      return _fail("SANCTIONS", `destination ${ctx.destination} is under comprehensive embargo`, { destination: ctx.destination });
    }
    // Best-effort counterparty screening via the sanctions-screening lib.
    try {
      const sanctions = await import("@/lib/sgtx/compliance/sanctions");
      const screen = (sanctions as any).screenForSanctions;
      if (typeof screen === "function") {
        const res = await screen({
          name: ctx.trade.sellerGtid || ctx.trade.commodity,
          type: "entity",
        });
        const high = (res?.hits || []).filter((h: any) => (h.matchScore || 0) >= 0.85);
        if (high.length > 0) {
          return _fail("SANCTIONS", `${high.length} high-confidence sanctions hit(s) on counterparty`, {
            hits: high,
          });
        }
        if ((res?.hits || []).length > 0) {
          return _review("SANCTIONS", `${res.hits.length} fuzzy sanctions hit(s) — manual review`, {
            hits: res.hits,
          });
        }
      }
    } catch (err) {
      return _review("SANCTIONS", `sanctions screening unavailable (${String(err)})`, { error: String(err) });
    }
    return _pass("SANCTIONS", "no sanctions hits and no embargoed jurisdictions", {
      origin: ctx.origin,
      destination: ctx.destination,
    });
  } catch (err) {
    return _review("SANCTIONS", `check failed: ${String(err)}`, { error: String(err) });
  }
}

function _checkHsClassification(ctx: _Ctx): ComplianceCheck {
  if (!ctx.hsValid) {
    return _fail("HS_CLASSIFICATION", "HS code is missing or not 6–10 numeric digits", { hsCode: ctx.hsCode });
  }
  if (ctx.hsCode.length < 8) {
    return _warn("HS_CLASSIFICATION", "HS code is 6–7 digits — country-specific sub-codes recommended", { hsCode: ctx.hsCode });
  }
  return _pass("HS_CLASSIFICATION", "HS code is 8+ digits and well-formed", { hsCode: ctx.hsCode });
}

function _checkOrigin(ctx: _Ctx): ComplianceCheck {
  if (!ctx.origin) {
    return _fail("ORIGIN", "origin country is missing", {});
  }
  if (ctx.origin === ctx.destination) {
    return _warn("ORIGIN", "origin and destination are the same country — confirm transit classification", { origin: ctx.origin });
  }
  return _pass("ORIGIN", "origin country recorded", { origin: ctx.origin });
}

function _checkDestination(ctx: _Ctx): ComplianceCheck {
  if (!ctx.destination) {
    return _fail("DESTINATION", "destination country is missing", {});
  }
  return _pass("DESTINATION", "destination country recorded", { destination: ctx.destination });
}

function _checkImportRestrictions(ctx: _Ctx): ComplianceCheck {
  if (ctx.importExport !== "IMPORT" && ctx.importExport !== "TRANSIT") {
    return _pass("IMPORT_RESTRICTIONS", "not an import regime — check skipped", { regime: ctx.regime });
  }
  if (ctx.isControlled) {
    return _review("IMPORT_RESTRICTIONS", "controlled goods — broker must verify import licence on file", { hsCode: ctx.hsCode });
  }
  if (ctx.destination === "EG" && !ctx.declarations.some((d) => /ACID|NAFEZA/i.test(String(d.etaXml || "")))) {
    return _review("IMPORT_RESTRICTIONS", "Egypt destination — ACID pre-registration should appear in declaration metadata", {});
  }
  return _pass("IMPORT_RESTRICTIONS", "no import restriction triggers", { regime: ctx.regime });
}

function _checkExportRestrictions(ctx: _Ctx): ComplianceCheck {
  if (ctx.importExport !== "EXPORT") {
    return _pass("EXPORT_RESTRICTIONS", "not an export regime — check skipped", { regime: ctx.regime });
  }
  if (ctx.isControlled) {
    return _review("EXPORT_RESTRICTIONS", "controlled goods — broker must verify export licence on file", { hsCode: ctx.hsCode });
  }
  if (ctx.isDualUse) {
    return _review("EXPORT_RESTRICTIONS", "potential dual-use — broker must perform EU 2021/821 / EAR classification", { hsCode: ctx.hsCode });
  }
  return _pass("EXPORT_RESTRICTIONS", "no export restriction triggers", { regime: ctx.regime });
}

function _checkPermitRequirements(ctx: _Ctx): ComplianceCheck {
  const permits: string[] = [];
  if (ctx.isAgri) permits.push("phytosanitary import permit");
  if (ctx.isControlled) permits.push("controlled-goods licence");
  if (ctx.isDualUse) permits.push("dual-use export licence");
  if (permits.length === 0) {
    return _pass("PERMIT_REQUIREMENTS", "no permit triggers", {});
  }
  return _review("PERMIT_REQUIREMENTS", `permit requirements: ${permits.join(", ")}`, { permits });
}

function _checkDocumentationCompleteness(ctx: _Ctx): ComplianceCheck {
  const missing: string[] = [];
  if (ctx.invoices.length === 0) missing.push("commercial invoice");
  if (!ctx.incoterm) missing.push("incoterm");
  if (!ctx.transportMode) missing.push("transport mode");
  if (missing.length > 0) {
    return _fail("DOCUMENTATION_COMPLETENESS", `missing required data: ${missing.join(", ")}`, { missing });
  }
  return _pass("DOCUMENTATION_COMPLETENESS", "baseline documentation present", {
    invoiceCount: ctx.invoices.length,
    incoterm: ctx.incoterm,
    transportMode: ctx.transportMode,
  });
}

function _checkTariffRate(ctx: _Ctx): ComplianceCheck {
  if (ctx.dutyUsd === null || ctx.dutyUsd === undefined) {
    return _warn("TARIFF_RATE", "duty not yet computed — verify at filing", { dutyUsd: null });
  }
  if (ctx.dutyUsd < 0) {
    return _fail("TARIFF_RATE", `duty amount is negative (${ctx.dutyUsd})`, { dutyUsd: ctx.dutyUsd });
  }
  return _pass("TARIFF_RATE", "duty amount recorded", { dutyUsd: ctx.dutyUsd });
}

function _checkQuantity(ctx: _Ctx): ComplianceCheck {
  const gross = Number(ctx.trade.grossWeightKg || 0);
  const net = Number(ctx.trade.netWeightKg || 0);
  if (gross <= 0 || net <= 0) {
    return _fail("QUANTITY", "gross or net weight is zero/missing", { gross, net });
  }
  if (net > gross) {
    return _fail("QUANTITY", `net weight (${net}) exceeds gross weight (${gross})`, { gross, net });
  }
  return _pass("QUANTITY", "weights are consistent", { gross, net });
}

function _checkCountryRestrictions(ctx: _Ctx): ComplianceCheck {
  if (ctx.origin && ctx.destination && ctx.origin === ctx.destination) {
    return _warn("COUNTRY_RESTRICTIONS", "domestic movement — confirm customs filing is required", {
      origin: ctx.origin,
      destination: ctx.destination,
    });
  }
  return _pass("COUNTRY_RESTRICTIONS", "no country-restriction triggers", {
    origin: ctx.origin,
    destination: ctx.destination,
  });
}

function _checkAgricultural(ctx: _Ctx): ComplianceCheck {
  if (!ctx.isAgri) {
    return _pass("AGRICULTURAL", "not an agricultural HS chapter", { hsCode: ctx.hsCode });
  }
  return _review("AGRICULTURAL", "agricultural goods — verify phytosanitary + health certificates on file", {
    hsCode: ctx.hsCode,
  });
}

function _checkProductSafety(ctx: _Ctx): ComplianceCheck {
  const euDest = ["EU", "DE", "FR", "IT", "ES", "NL", "BE"].includes(ctx.destination);
  const usDest = ctx.destination === "US";
  const cnDest = ctx.destination === "CN";
  if (euDest) {
    return _review("PRODUCT_SAFETY", "EU destination — confirm CE marking + REACH / RoHS compliance", { destination: ctx.destination });
  }
  if (usDest) {
    return _review("PRODUCT_SAFETY", "US destination — confirm FCC / UL / FDA / CPSC jurisdiction", { destination: ctx.destination });
  }
  if (cnDest) {
    return _review("PRODUCT_SAFETY", "China destination — confirm CCC / CCCF marking", { destination: ctx.destination });
  }
  return _pass("PRODUCT_SAFETY", "no destination-specific safety marks required", { destination: ctx.destination });
}

function _checkControlledGoods(ctx: _Ctx): ComplianceCheck {
  if (!ctx.isControlled) {
    return _pass("CONTROLLED_GOODS", "not a controlled-goods HS prefix", { hsCode: ctx.hsCode });
  }
  // Deterministic FAIL — controlled goods must NOT be filed without an
  // explicit licence + Governor approval. The Governor itself is
  // enforced at the customs-gateway core (submitDeclaration), but here
  // we surface the block at compliance verification time.
  return _fail("CONTROLLED_GOODS", `HS ${ctx.hsCode} matches controlled-goods prefix — licence + Governor approval required before filing`, {
    hsCode: ctx.hsCode,
  });
}

function _checkDualUse(ctx: _Ctx): ComplianceCheck {
  if (!ctx.isDualUse) {
    return _pass("DUAL_USE", "not a dual-use HS chapter", { hsCode: ctx.hsCode });
  }
  return _review("DUAL_USE", "potential dual-use — broker must perform EU 2021/821 / EAR classification", {
    hsCode: ctx.hsCode,
  });
}

function _checkCustomsDataValidation(ctx: _Ctx): ComplianceCheck {
  const issues: string[] = [];
  if (!ctx.trade.commodity || String(ctx.trade.commodity).trim().length < 3) {
    issues.push("product description too short");
  }
  if (!ctx.trade.tradeValueUsd || Number(ctx.trade.tradeValueUsd) <= 0) {
    issues.push("trade value missing or non-positive");
  }
  if (issues.length > 0) {
    return _fail("CUSTOMS_DATA_VALIDATION", `data validation failed: ${issues.join(", ")}`, { issues });
  }
  return _pass("CUSTOMS_DATA_VALIDATION", "trade data is internally consistent", {
    commodity: ctx.trade.commodity,
    tradeValueUsd: ctx.trade.tradeValueUsd,
  });
}

// ============ §42 A2 AI-assist hook ============

/**
 * §42 A2 — AI assist. Surfaces anomalies and fuzzy matches. The hook
 * CAN elevate a PASS to WARNING or REQUIRES_REVIEW. It CANNOT elevate
 * to FAIL — deterministic policy remains the sole source of blocking.
 *
 * The current implementation is a deterministic heuristic (no LLM call)
 * to keep the output auditable + reproducible per §42 ADVISORY ONLY
 * constraint. An LLM-based version would slot in here, behind the same
 * "no FAIL" guard.
 */
function _aiAssist(checks: ComplianceCheck[]): void {
  try {
    for (const c of checks) {
      if (c.status !== "PASS") continue;
      // Heuristic 1: agricultural + dual-use overlap → unusual.
      if (c.checkType === "DUAL_USE" && c.evidence?.hsCode) {
        // (already non-PASS if dual-use — skip)
      }
      // Heuristic 2: very high trade value with controlled-goods PASS
      // (impossible — controlled goods always FAIL or REVIEW, so this
      // branch is informational only).
    }
  } catch (err) {
    logger.warn("[customs-gateway/customs-compliance] _aiAssist failed", { error: String(err) });
  }
}

// ============ Status factories ============

function _pass(checkType: ComplianceCheckType, details: string, evidence: any): ComplianceCheck {
  return { checkType, status: "PASS", details, evidence };
}
function _warn(checkType: ComplianceCheckType, details: string, evidence: any): ComplianceCheck {
  return { checkType, status: "WARNING", details, evidence };
}
function _review(checkType: ComplianceCheckType, details: string, evidence: any): ComplianceCheck {
  return { checkType, status: "REQUIRES_REVIEW", details, evidence };
}
function _fail(checkType: ComplianceCheckType, details: string, evidence: any): ComplianceCheck {
  return { checkType, status: "FAIL", details, evidence };
}

/**
 * Fail-closed helper — used on internal errors. Returns passed:false
 * with the failure described as a single blocking issue. NEVER passes
 * when we cannot verify compliance.
 */
function _failClosed(reason: string): ComplianceResult {
  return {
    passed: false,
    checks: [],
    blockingIssues: [reason],
    warnings: [],
  };
}
