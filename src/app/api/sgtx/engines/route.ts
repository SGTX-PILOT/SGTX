// @ts-nocheck
/**
 * SGTX v17 §20 — Unified Engines API
 * ===========================================================================
 *
 * GET /api/sgtx/engines
 *   Returns a list of all available SGTX engines with their capabilities.
 *
 * GET /api/sgtx/engines?engine=X&action=Y&...
 *   Invokes a specific engine's action with query-string parameters. This is
 *   a convenience wrapper — the canonical per-engine routes (e.g.
 *   /api/sgtx/engines/classification) should be preferred for production
 *   integrations.
 *
 * POST /api/sgtx/engines
 *   Runs a complex engine query (e.g. true-landed-cost needs full trade
 *   context). Body: { engine, action, params: {...} }.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

// Engine libs
import * as classificationEngine from "@/lib/sgtx/engines/classification-engine";
import * as originEngine from "@/lib/sgtx/engines/origin-engine";
import * as tradeAgreementEngine from "@/lib/sgtx/engines/trade-agreement-engine";
import * as licenseEngine from "@/lib/sgtx/engines/license-engine";
import * as permitEngine from "@/lib/sgtx/engines/permit-engine";
import * as certificateEngine from "@/lib/sgtx/engines/certificate-engine";
import * as spsEngine from "@/lib/sgtx/engines/sps-engine";
import * as tbtEngine from "@/lib/sgtx/engines/tbt-engine";
import * as controlledGoodsEngine from "@/lib/sgtx/engines/controlled-goods-engine";
import * as customsValuationEngine from "@/lib/sgtx/engines/customs-valuation-engine";
import * as trueLandedCostEngine from "@/lib/sgtx/engines/true-landed-cost-engine";
import * as documentConsistencyEngine from "@/lib/sgtx/engines/document-consistency-engine";

export const dynamic = "force-dynamic";

// ── Engine registry ──────────────────────────────────────────────────────

interface EngineCapability {
  code: string; // short code for use in ?engine= parameter
  name: string;
  description: string;
  actions: string[];
  routePath: string; // canonical per-engine route
}

const ENGINES: EngineCapability[] = [
  {
    code: "classification",
    name: "HS Code Classification Engine",
    description: "Classifies products by keyword matching against HS chapter reference. Returns most likely HS-6 code + alternatives.",
    actions: ["classify", "getInfo", "validate"],
    routePath: "/api/sgtx/engines/classification",
  },
  {
    code: "origin",
    name: "Rules of Origin Engine",
    description: "Determines country of origin (wholly obtained / substantial transformation / insufficient) + validates origin certificates + checks preferential origin.",
    actions: ["determine", "validateCertificate", "getPreferential"],
    routePath: "/api/sgtx/engines/origin",
  },
  {
    code: "trade-agreement",
    name: "Trade Agreement Engine",
    description: "Lists FTAs between two countries + checks preferential eligibility + agreement coverage.",
    actions: ["list", "coverage", "eligibility"],
    routePath: "/api/sgtx/engines/trade-agreement",
  },
  {
    code: "license",
    name: "License Engine",
    description: "Checks whether an import/export license is required + validates license numbers + lists license types per country.",
    actions: ["checkRequired", "validate", "getTypes"],
    routePath: "/api/sgtx/engines/license",
  },
  {
    code: "permit",
    name: "Permit Engine",
    description: "Checks whether a government permit (SPS, CITES, hazmat) is required + validates permit numbers + lists permit types per country.",
    actions: ["checkRequired", "validate", "getTypes"],
    routePath: "/api/sgtx/engines/permit",
  },
  {
    code: "certificate",
    name: "Certificate Engine",
    description: "Returns required certificates (COO, phytosanitary, halal, CE, GMP, etc.) per (HS, origin, dest, transport mode). Validates certificate numbers.",
    actions: ["getRequired", "validate", "getTypes"],
    routePath: "/api/sgtx/engines/certificate",
  },
  {
    code: "sps",
    name: "SPS Engine (Sanitary and Phytosanitary)",
    description: "Returns mandatory SPS measures (pest risk analysis, cold treatment, MRL testing, quarantine, etc.) per (HS, origin, dest).",
    actions: ["getRequirements", "validate"],
    routePath: "/api/sgtx/engines/sps",
  },
  {
    code: "tbt",
    name: "TBT Engine (Technical Barriers to Trade)",
    description: "Returns mandatory technical regulations + standards + labeling + conformity assessment requirements per (HS, dest).",
    actions: ["getRequirements", "validate"],
    routePath: "/api/sgtx/engines/tbt",
  },
  {
    code: "controlled-goods",
    name: "Controlled Goods Engine",
    description: "Identifies dual-use / military / nuclear / chemical / biological controlled goods per (HS, origin, dest). Validates controlled-goods licenses.",
    actions: ["check", "validateLicense"],
    routePath: "/api/sgtx/engines/controlled-goods",
  },
  {
    code: "customs-valuation",
    name: "Customs Valuation Engine",
    description: "Calculates the customs value per WTO Valuation Agreement (6-method cascade). Validates declared vs calculated value.",
    actions: ["calculate", "getMethod", "validate"],
    routePath: "/api/sgtx/engines/customs-valuation",
  },
  {
    code: "true-landed-cost",
    name: "True Landed Cost Engine",
    description: "Aggregates ALL import costs (EXW + freight + insurance + duty + VAT + port handling + broker + other) for a USTN. Chains tariff + tax engines.",
    actions: ["calculate", "breakdown"],
    routePath: "/api/sgtx/engines/true-landed-cost",
  },
  {
    code: "document-consistency",
    name: "Document Consistency Engine",
    description: "Cross-validates all trade documents (invoice, packing list, BL, COO, phytosanitary, SPS, controlled-goods license) + checks USTN present on all docs.",
    actions: ["validate", "checkSet"],
    routePath: "/api/sgtx/engines/document-consistency",
  },
];

// ── GET /api/sgtx/engines ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engine = (searchParams.get("engine") || "").trim().toLowerCase();
    const action = (searchParams.get("action") || "").trim();

    // No engine specified → list all engines
    if (!engine) {
      return NextResponse.json({
        ok: true,
        totalEngines: ENGINES.length,
        engines: ENGINES,
        note: "Invoke a specific engine with ?engine=<code>&action=<action>. See each engine's `actions` array for supported actions.",
      });
    }

    const cap = ENGINES.find((e) => e.code === engine);
    if (!cap) {
      return NextResponse.json(
        { ok: false, error: `Unknown engine "${engine}". Available: ${ENGINES.map((e) => e.code).join(", ")}` },
        { status: 400 },
      );
    }

    if (!action) {
      // Return engine metadata
      return NextResponse.json({ ok: true, engine: cap, note: `Use ?action=<action> to invoke. Supported actions: ${cap.actions.join(", ")}` });
    }

    // Dispatch the action
    return await dispatchGet(engine, action, searchParams);
  } catch (err: any) {
    logger.error("[api/sgtx/engines] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// ── POST /api/sgtx/engines ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const engine = (body.engine || "").trim().toLowerCase();
    const action = (body.action || "").trim();
    const params = body.params ?? {};

    if (!engine) {
      return NextResponse.json(
        { ok: false, error: "engine is required. Available: " + ENGINES.map((e) => e.code).join(", ") },
        { status: 400 },
      );
    }
    if (!action) {
      return NextResponse.json(
        { ok: false, error: "action is required." },
        { status: 400 },
      );
    }

    return await dispatchPost(engine, action, params);
  } catch (err: any) {
    logger.error("[api/sgtx/engines] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// ── GET dispatcher ────────────────────────────────────────────────────────

async function dispatchGet(engine: string, action: string, q: URLSearchParams): Promise<NextResponse> {
  switch (engine) {
    case "classification": {
      if (action === "classify") {
        const r = classificationEngine.classifyProduct(q.get("product") || "", q.get("origin") || "");
        return NextResponse.json({ ok: true, result: r });
      }
      if (action === "getInfo") {
        return NextResponse.json({ ok: true, result: classificationEngine.getHsCodeInfo(q.get("hsCode") || "") });
      }
      if (action === "validate") {
        return NextResponse.json({ ok: true, result: classificationEngine.validateHsCode(q.get("hsCode") || "") });
      }
      if (action === "listChapters") {
        return NextResponse.json({ ok: true, result: classificationEngine.listHsChapters() });
      }
      break;
    }
    case "origin": {
      if (action === "validateCertificate") {
        return NextResponse.json({ ok: true, result: originEngine.validateOriginCertificate(q.get("certificateId") || "") });
      }
      if (action === "getPreferential") {
        return NextResponse.json({ ok: true, result: originEngine.getPreferentialOrigin(q.get("ftaCode") || "", q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "") });
      }
      if (action === "listFtaRules") {
        return NextResponse.json({ ok: true, result: originEngine.listFtaRules() });
      }
      break;
    }
    case "trade-agreement": {
      if (action === "list") {
        return NextResponse.json({ ok: true, result: tradeAgreementEngine.listTradeAgreements(q.get("countryA") || "", q.get("countryB") || "") });
      }
      if (action === "coverage") {
        const r = tradeAgreementEngine.getAgreementCoverage(q.get("ftaCode") || "");
        return NextResponse.json({ ok: !!r, ...(r ? { result: r } : { error: "Unknown FTA code" }), ...(!r ? {} : {}) }, { status: r ? 200 : 400 });
      }
      if (action === "eligibility") {
        return NextResponse.json({ ok: true, result: tradeAgreementEngine.checkAgreementEligibility(q.get("ftaCode") || "", q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "") });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: tradeAgreementEngine.listAllAgreements() });
      }
      break;
    }
    case "license": {
      if (action === "checkRequired") {
        return NextResponse.json({ ok: true, result: licenseEngine.checkLicenseRequired(q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "", (q.get("txType") || "IMPORT") as any) });
      }
      if (action === "validate") {
        return NextResponse.json({ ok: true, result: licenseEngine.validateLicense(q.get("licenseNumber") || "", q.get("hsCode") || "", q.get("country") || "") });
      }
      if (action === "getTypes") {
        return NextResponse.json({ ok: true, result: licenseEngine.getLicenseTypes(q.get("hsCode") || "", q.get("country") || "") });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: licenseEngine.listAllLicenseRules() });
      }
      break;
    }
    case "permit": {
      if (action === "checkRequired") {
        return NextResponse.json({ ok: true, result: permitEngine.checkPermitRequired(q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "") });
      }
      if (action === "validate") {
        return NextResponse.json({ ok: true, result: permitEngine.validatePermit(q.get("permitNumber") || "", q.get("hsCode") || "", q.get("country") || "") });
      }
      if (action === "getTypes") {
        return NextResponse.json({ ok: true, result: permitEngine.getPermitTypes(q.get("hsCode") || "", q.get("country") || "") });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: permitEngine.listAllPermitRules() });
      }
      break;
    }
    case "certificate": {
      if (action === "getRequired") {
        return NextResponse.json({ ok: true, result: certificateEngine.getRequiredCertificates(q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "", (q.get("transportMode") || "SEA") as any) });
      }
      if (action === "validate") {
        return NextResponse.json({ ok: true, result: certificateEngine.validateCertificate(q.get("certificateNumber") || "", q.get("type") || "") });
      }
      if (action === "getTypes") {
        return NextResponse.json({ ok: true, result: certificateEngine.getCertificateTypes(q.get("hsCode") || "", q.get("country") || "") });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: certificateEngine.listAllCertificateRules() });
      }
      break;
    }
    case "sps": {
      if (action === "getRequirements") {
        return NextResponse.json({ ok: true, result: spsEngine.getSpsRequirements(q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "") });
      }
      if (action === "validate") {
        // documents must be passed as comma-separated query string
        const docs = (q.get("documents") || "").split(",").map((s) => s.trim()).filter(Boolean);
        return NextResponse.json({ ok: true, result: spsEngine.validateSpsCompliance(q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "", docs) });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: spsEngine.listAllSpsRules() });
      }
      break;
    }
    case "tbt": {
      if (action === "getRequirements") {
        return NextResponse.json({ ok: true, result: tbtEngine.getTbtRequirements(q.get("hsCode") || "", q.get("dest") || "") });
      }
      if (action === "validate") {
        const specs = (q.get("productSpec") || "").split(",").map((s) => s.trim()).filter(Boolean);
        return NextResponse.json({ ok: true, result: tbtEngine.validateTbtCompliance(q.get("hsCode") || "", q.get("dest") || "", specs) });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: tbtEngine.listAllTbtRules() });
      }
      break;
    }
    case "controlled-goods": {
      if (action === "check") {
        return NextResponse.json({ ok: true, result: controlledGoodsEngine.checkControlledGoods(q.get("hsCode") || "", q.get("origin") || "", q.get("dest") || "", q.get("product") || "") });
      }
      if (action === "validateLicense") {
        return NextResponse.json({ ok: true, result: controlledGoodsEngine.validateControlledGoodsLicense(q.get("licenseNumber") || "", q.get("hsCode") || "") });
      }
      if (action === "listAll") {
        return NextResponse.json({ ok: true, result: controlledGoodsEngine.listAllControlRules() });
      }
      break;
    }
    case "customs-valuation": {
      if (action === "calculate") {
        const txValue = Number(q.get("transactionValue") || 0);
        const transport = Number(q.get("transportCosts") || 0);
        const insurance = Number(q.get("insurance") || 0);
        const currency = q.get("currency") || "USD";
        const forceMethod = (q.get("forceMethod") || undefined) as any;
        return NextResponse.json({ ok: true, result: customsValuationEngine.calculateCustomsValue(txValue, [], transport, insurance, { currency, forceMethod }) });
      }
      if (action === "getMethod") {
        return NextResponse.json({ ok: true, result: customsValuationEngine.getValuationMethod({
          relatedPartySale: q.get("relatedParty") === "true",
          isNewProduct: q.get("isNewProduct") === "true",
          consignmentSale: q.get("consignment") === "true",
          noComparableData: q.get("noComparableData") === "true",
        }) });
      }
      if (action === "validate") {
        const declared = Number(q.get("declaredValue") || 0);
        const customs = Number(q.get("customsValue") || 0);
        return NextResponse.json({ ok: true, result: customsValuationEngine.validateValuation(declared, customs) });
      }
      if (action === "listMethods") {
        return NextResponse.json({ ok: true, result: customsValuationEngine.listValuationMethods() });
      }
      break;
    }
    case "true-landed-cost": {
      if (action === "calculate") {
        const ustn = q.get("ustn") || "";
        const r = await trueLandedCostEngine.calculateTrueLandedCost(ustn);
        return NextResponse.json({ ok: true, result: r });
      }
      if (action === "breakdown") {
        const ustn = q.get("ustn") || "";
        const r = await trueLandedCostEngine.getLandedCostBreakdown(ustn);
        return NextResponse.json({ ok: true, result: r });
      }
      break;
    }
    case "document-consistency": {
      if (action === "validate") {
        const ustn = q.get("ustn") || "";
        const r = await documentConsistencyEngine.validateDocumentConsistency(ustn);
        return NextResponse.json({ ok: true, result: r });
      }
      if (action === "checkSet") {
        const ustn = q.get("ustn") || "";
        const r = await documentConsistencyEngine.checkDocumentSet(ustn);
        return NextResponse.json({ ok: true, result: r });
      }
      break;
    }
  }
  return NextResponse.json(
    { ok: false, error: `Unknown action "${action}" for engine "${engine}".` },
    { status: 400 },
  );
}

// ── POST dispatcher (complex queries with rich params) ─────────────────

async function dispatchPost(engine: string, action: string, p: any): Promise<NextResponse> {
  switch (engine) {
    case "classification": {
      if (action === "classify") {
        return NextResponse.json({ ok: true, result: classificationEngine.classifyProduct(p.product || "", p.origin || "") });
      }
      break;
    }
    case "origin": {
      if (action === "determine") {
        const mats = Array.isArray(p.materials) ? p.materials : [];
        return NextResponse.json({ ok: true, result: originEngine.determineOrigin(p.goods || "", p.manufacturingCountry || "", mats) });
      }
      break;
    }
    case "trade-agreement": {
      if (action === "eligibility") {
        return NextResponse.json({ ok: true, result: tradeAgreementEngine.checkAgreementEligibility(p.ftaCode || "", p.hsCode || "", p.origin || "", p.dest || "") });
      }
      break;
    }
    case "license": {
      if (action === "checkRequired") {
        return NextResponse.json({ ok: true, result: licenseEngine.checkLicenseRequired(p.hsCode || "", p.origin || "", p.dest || "", p.txType || "IMPORT") });
      }
      break;
    }
    case "permit": {
      if (action === "checkRequired") {
        return NextResponse.json({ ok: true, result: permitEngine.checkPermitRequired(p.hsCode || "", p.origin || "", p.dest || "") });
      }
      break;
    }
    case "certificate": {
      if (action === "getRequired") {
        return NextResponse.json({ ok: true, result: certificateEngine.getRequiredCertificates(p.hsCode || "", p.origin || "", p.dest || "", p.transportMode || "SEA") });
      }
      break;
    }
    case "sps": {
      if (action === "validate") {
        const docs = Array.isArray(p.documents) ? p.documents : [];
        return NextResponse.json({ ok: true, result: spsEngine.validateSpsCompliance(p.hsCode || "", p.origin || "", p.dest || "", docs) });
      }
      break;
    }
    case "tbt": {
      if (action === "validate") {
        const specs = Array.isArray(p.productSpec) ? p.productSpec : [];
        return NextResponse.json({ ok: true, result: tbtEngine.validateTbtCompliance(p.hsCode || "", p.dest || "", specs) });
      }
      break;
    }
    case "controlled-goods": {
      if (action === "check") {
        return NextResponse.json({ ok: true, result: controlledGoodsEngine.checkControlledGoods(p.hsCode || "", p.origin || "", p.dest || "", p.product || "") });
      }
      break;
    }
    case "customs-valuation": {
      if (action === "calculate") {
        const adj = Array.isArray(p.adjustments) ? p.adjustments : [];
        return NextResponse.json({ ok: true, result: customsValuationEngine.calculateCustomsValue(Number(p.transactionValue) || 0, adj, p.transportCosts, p.insurance, { currency: p.currency, forceMethod: p.forceMethod, basis: p.basis }) });
      }
      break;
    }
    case "true-landed-cost": {
      if (action === "calculate") {
        const r = await trueLandedCostEngine.calculateTrueLandedCost(p.ustn || "");
        return NextResponse.json({ ok: true, result: r });
      }
      if (action === "breakdown") {
        const r = await trueLandedCostEngine.getLandedCostBreakdown(p.ustn || "");
        return NextResponse.json({ ok: true, result: r });
      }
      break;
    }
    case "document-consistency": {
      if (action === "validate") {
        const r = await documentConsistencyEngine.validateDocumentConsistency(p.ustn || "");
        return NextResponse.json({ ok: true, result: r });
      }
      if (action === "checkSet") {
        const docs = Array.isArray(p.documents) ? p.documents : undefined;
        const r = await documentConsistencyEngine.checkDocumentSet(p.ustn || "", docs);
        return NextResponse.json({ ok: true, result: r });
      }
      break;
    }
  }
  return NextResponse.json(
    { ok: false, error: `Unknown POST action "${action}" for engine "${engine}".` },
    { status: 400 },
  );
}
