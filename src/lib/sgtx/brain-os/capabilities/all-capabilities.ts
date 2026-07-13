// SGTX Brain OS — All Capabilities
// =============================================================================
// The Brain is the single orchestrating layer for ALL SGTX features.
// Every compliance module, AI module, and external integration is wrapped here
// as a BrainModule and registered with the module registry.
//
// This file is the canonical wiring point: it imports every feature module and
// exposes its functions as Brain capabilities that the Brain orchestrator can
// invoke, subscribe to, and learn from.
//
// Pattern:
//   1. Import the underlying module
//   2. Wrap it in a BrainModule with id/name/version/authority/capabilities
//   3. invoke() dispatches the capability string to the right function
//
// Authority levels:
//   A3 = capability modules (compliance + AI features)
//   A2 = learning module (advisory, no veto)
// =============================================================================

import type { BrainModule } from "../core/types";
import { moduleRegistry } from "../core/module-registry";

// --- Compliance modules -----------------------------------------------------
import * as eudr from "@/lib/sgtx/compliance/eudr";
import * as forceMajeure from "@/lib/sgtx/compliance/force-majeure";
import * as sanctions from "@/lib/sgtx/compliance/sanctions";
import * as ucp600 from "@/lib/sgtx/compliance/ucp600";
import * as arbitration from "@/lib/sgtx/compliance/arbitration";
import * as certificates from "@/lib/sgtx/compliance/certificates";
import * as chinaCustoms from "@/lib/sgtx/compliance/china-customs";
import * as codexPesticides from "@/lib/sgtx/compliance/codex-pesticides-client";
import * as countryDocRules from "@/lib/sgtx/compliance/country-doc-rules";
import * as customsMilestones from "@/lib/sgtx/compliance/customs-milestones";
import * as euPesticides from "@/lib/sgtx/compliance/eu-pesticides-client";
import * as fxControls from "@/lib/sgtx/compliance/fx-controls";
import * as gccCustoms from "@/lib/sgtx/compliance/gcc-customs";
import * as ics2Ens from "@/lib/sgtx/compliance/ics2-ens";
import * as multiRegionPesticides from "@/lib/sgtx/compliance/multi-region-pesticides";
import * as multiSourcePesticides from "@/lib/sgtx/compliance/multi-source-pesticides";
import * as nowlun from "@/lib/sgtx/compliance/nowlun-integration";
import * as preLoading from "@/lib/sgtx/compliance/pre-loading";
import * as productCompliance from "@/lib/sgtx/compliance/product-compliance";
import * as regionalPesticides from "@/lib/sgtx/compliance/regional-pesticides";
import * as usCustoms from "@/lib/sgtx/compliance/us-customs";
import * as agmarket from "@/lib/sgtx/compliance/agmarket-integration";
import * as agriCommodityForecast from "@/lib/sgtx/compliance/agri-commodity-forecast";
import * as globalMarketIntelligence from "@/lib/sgtx/compliance/global-market-intelligence";
import * as gulfAsiaMarket from "@/lib/sgtx/compliance/gulf-asia-market";

// --- AI modules -------------------------------------------------------------
import * as brainMarket from "@/lib/sgtx/ai/brain";
import * as brainIntel from "@/lib/sgtx/ai/brain-intelligence";
import * as disputeRisk from "@/lib/sgtx/ai/dispute-risk";
import * as dynamicFee from "@/lib/sgtx/ai/dynamic-fee";
import * as portalIntel from "@/lib/sgtx/ai/portal-intelligence";
import * as complianceGate from "@/lib/sgtx/ai/compliance-gate";
import * as freightPricing from "@/lib/sgtx/ai/freight-pricing";
import * as transitTime from "@/lib/sgtx/ai/transit-time";
import * as hsCodeDetector from "@/lib/sgtx/ai/hs-code-detector";
import * as customsPricing from "@/lib/sgtx/ai/customs-pricing";
import * as vesselTracking from "@/lib/sgtx/ai/vessel-tracking";
import * as aisVesselTracking from "@/lib/sgtx/ai/ais-vessel-tracking";
import * as containerTracking from "@/lib/sgtx/ai/container-tracking";
import * as perishableReqs from "@/lib/sgtx/ai/perishable-requirements";
import * as workflowValidation from "@/lib/sgtx/ai/workflow-validation";

// --- Worldwide Routes Orchestrator -----------------------------------------
import * as worldwideRoutes from "./worldwide-routes-orchestrator";

// --- Learning ---------------------------------------------------------------
import { learningLoop } from "../learning/learning-loop";

// =============================================================================
// COMPLIANCE MODULE WRAPPERS
// =============================================================================

export const eudrModule: BrainModule = {
  id: "eudr-brain",
  name: "EUDR Compliance Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "EU Deforestation Regulation due diligence assessment",
  capabilities: ["compliance.eudr"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.eudr":
        return eudr.assessEudr(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const forceMajeureModule: BrainModule = {
  id: "force-majeure-brain",
  name: "Force Majeure Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Trade force majeure assessment and active event monitoring",
  capabilities: ["compliance.fm", "force-majeure.assess", "force-majeure.active-events"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.fm":
      case "force-majeure.assess":
        return forceMajeure.assessTradeForceMajeure(input);
      case "force-majeure.active-events":
        return forceMajeure.getActiveForceMajeureEvents();
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const sanctionsModule: BrainModule = {
  id: "sanctions-brain",
  name: "Sanctions Screening Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "OFAC / EU / UN sanctions screening for buyers, sellers, vessels",
  capabilities: ["compliance.sanctions", "sanctions.screen"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.sanctions":
      case "sanctions.screen":
        return sanctions.screenForSanctions(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const ucp600Module: BrainModule = {
  id: "ucp600-brain",
  name: "UCP 600 LC Validation Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Letter of Credit document validation under UCP 600 rules",
  capabilities: ["compliance.ucp600", "ucp600.validate"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.ucp600":
      case "ucp600.validate":
        return ucp600.validateLcDocuments(input?.terms ?? input, input?.documents ?? []);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const arbitrationModule: BrainModule = {
  id: "arbitration-brain",
  name: "Arbitration Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Jurisdiction-specific arbitration clause determination (CRCICA/ICC/AAA/CIETAC/GAFTA)",
  capabilities: ["compliance.arbitration"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.arbitration":
        return arbitration.determineArbitration(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const certificatesModule: BrainModule = {
  id: "certificates-brain",
  name: "Certificates of Origin Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Certificate type determination and generation (EUR.1, A.TR, AR.1, COO, etc.)",
  capabilities: ["compliance.certificates", "certificates.generate"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.certificates":
        return certificates.determineCertificateType(
          input?.originCountry ?? input?.origin,
          input?.destCountry ?? input?.destination,
        );
      case "certificates.generate":
        return certificates.generateCertificate(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const chinaCustomsModule: BrainModule = {
  id: "china-customs-brain",
  name: "China Customs Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "GACC Single Window filing, CCC certification, phytosanitary eCert",
  capabilities: ["compliance.china"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.china":
        return chinaCustoms.assessChinaCompliance(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const codexPesticidesModule: BrainModule = {
  id: "codex-pesticides-brain",
  name: "Codex Pesticides Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Codex Alimentarius MRL lookup and database synchronization",
  capabilities: ["compliance.codex-pesticides", "codex.lookup", "codex.sync"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.codex-pesticides":
      case "codex.lookup":
        return codexPesticides.lookupCodexMrl(input?.pesticide ?? input?.pesticideName, input?.commodity ?? input?.commodityName);
      case "codex.sync":
        return codexPesticides.syncCodexPesticides();
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const countryDocRulesModule: BrainModule = {
  id: "country-doc-rules-brain",
  name: "Country Document Rules Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Per-jurisdiction document rules (19 countries) and lane-required docs",
  capabilities: ["compliance.doc-rules"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.doc-rules":
        if (input?.originCountry && input?.destCountry) {
          return countryDocRules.getRequiredDocsForLane(
            input.originCountry,
            input.destCountry,
            input?.hsCode ?? "",
            input?.commodity ?? "",
          );
        }
        return countryDocRules.getCountryDocRules(input?.country ?? input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const customsMilestonesModule: BrainModule = {
  id: "customs-milestones-brain",
  name: "Customs Milestones Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Country-specific customs clearance milestone timeline",
  capabilities: ["compliance.customs-milestones"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.customs-milestones":
        return customsMilestones.getCustomsMilestones(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const euPesticidesModule: BrainModule = {
  id: "eu-pesticides-brain",
  name: "EU Pesticides Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "EU MRL lookup, compliance check, and EU pesticides database sync",
  capabilities: ["compliance.eu-pesticides", "eu-pesticides.lookup", "eu-pesticides.check", "eu-pesticides.sync"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.eu-pesticides":
      case "eu-pesticides.lookup":
        return euPesticides.lookupMrl(input?.pesticide ?? input?.pestResName, input?.product ?? input?.productCode);
      case "eu-pesticides.check":
        return euPesticides.checkMrlCompliance(
          input?.pesticide ?? input?.pestResName,
          input?.product ?? input?.productCode,
          input?.detectedLevelMgKg ?? input?.detectedLevel ?? 0,
        );
      case "eu-pesticides.sync":
        return euPesticides.syncEuPesticides(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const fxControlsModule: BrainModule = {
  id: "fx-controls-brain",
  name: "FX Controls Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Country-specific FX repatriation and exchange controls (EG/CN/IN/BR/KE/GH/MA)",
  capabilities: ["compliance.fx-controls"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.fx-controls":
        return fxControls.assessFxControls(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const gccCustomsModule: BrainModule = {
  id: "gcc-customs-brain",
  name: "GCC Customs Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "GCC customs (FASAH / Dubai Trade), GCC CET, GAFTA preferences, halal requirements",
  capabilities: ["compliance.gcc"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.gcc":
        return gccCustoms.assessGccCompliance(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const ics2EnsModule: BrainModule = {
  id: "ics2-ens-brain",
  name: "ICS2 ENS Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "EU ICS2 Entry Summary Declaration assessment and filing generation",
  capabilities: ["compliance.ics2-ens"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.ics2-ens":
        return ics2Ens.assessIcs2Ens(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const multiRegionPesticidesModule: BrainModule = {
  id: "multi-region-pesticides-brain",
  name: "Multi-Region Pesticides Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Cross-region MRL lookup and compliance check (EU/CODEX/USA/JP/AU/CA)",
  capabilities: ["compliance.multi-region-pesticides"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.multi-region-pesticides":
        if (input?.pesticide && input?.commodity && input?.detectedLevelMgKg != null) {
          return multiRegionPesticides.checkMultiRegionCompliance(
            input.pesticide,
            input.commodity,
            input.detectedLevelMgKg,
            input?.destinationCountry,
            input?.euProductCode,
          );
        }
        if (input?.pesticide && input?.commodity) {
          return multiRegionPesticides.lookupMultiRegionMrl(
            input.pesticide,
            input.commodity,
            input?.destinationCountry,
            input?.euProductCode,
          );
        }
        throw new Error("multi-region-pesticides requires {pesticide, commodity}");
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const multiSourcePesticidesModule: BrainModule = {
  id: "multi-source-pesticides-brain",
  name: "Multi-Source Pesticides Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Strictest-source MRL compliance across EU + Codex databases",
  capabilities: ["compliance.multi-source-pesticides"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.multi-source-pesticides":
        return multiSourcePesticides.checkMultiSourceCompliance(
          input?.pesticide,
          input?.commodity ?? input?.commodityName,
          input?.detectedLevelMgKg ?? input?.detectedLevel ?? 0,
          input?.euProductCode,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const nowlunModule: BrainModule = {
  id: "nowlun-brain",
  name: "Nowlun Logistics Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Nowlun integration: freight rates, port status, transit times, FM checks",
  capabilities: [
    "logistics.nowlun-rates",
    "logistics.port-status",
    "logistics.transit-time",
    "logistics.force-majeure-check",
    "logistics.nowlun-sync",
  ],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.nowlun-rates":
        return nowlun.getFreightRate(input?.originPort || input?.origin, input?.destinationPort || input?.destination, input?.containerType);
      case "logistics.port-status":
        return nowlun.getPortStatus(input?.portName ?? input?.port ?? (typeof input === 'string' ? input : 'unknown'));
      case "logistics.transit-time":
        return nowlun.getTransitTime(input?.originCountry || input?.origin || 'unknown', input?.destinationCountry || input?.destination || 'unknown', input?.containerType);
      case "logistics.force-majeure-check":
        return nowlun.checkPortForceMajeure(input?.portName ?? input?.port ?? (typeof input === 'string' ? input : 'unknown'));
      case "logistics.nowlun-sync":
        return nowlun.syncAllNowlunData();
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const preLoadingModule: BrainModule = {
  id: "pre-loading-brain",
  name: "Pre-Loading Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Country-specific pre-loading requirements and inspection steps",
  capabilities: ["compliance.pre-loading"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.pre-loading":
        return preLoading.assessPreLoading(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const productComplianceModule: BrainModule = {
  id: "product-compliance-brain",
  name: "Product Compliance Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Product-specific compliance checks (labeling, packaging, standards)",
  capabilities: ["compliance.product"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.product":
        return productCompliance.assessProductCompliance(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const regionalPesticidesModule: BrainModule = {
  id: "regional-pesticides-brain",
  name: "Regional Pesticides Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Per-region pesticide MRL lookup and database sync (USA/JP/AU/CA)",
  capabilities: ["compliance.regional-pesticides"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.regional-pesticides":
        if (input?.region && input?.pesticide && input?.commodity) {
          return regionalPesticides.lookupRegionalMrl(input.region, input.pesticide, input.commodity);
        }
        return regionalPesticides.syncAllRegionalPesticides();
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const usCustomsModule: BrainModule = {
  id: "us-customs-brain",
  name: "US Customs Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "US CBP ACE entry, ISF 10+2, FDA Prior Notice, BIS export control",
  capabilities: ["compliance.us-customs"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.us-customs":
        return usCustoms.assessUsCompliance(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

// =============================================================================
// AI MODULE WRAPPERS
// =============================================================================

export const marketBrainModule: BrainModule = {
  id: "market-brain",
  name: "Market Price Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Commodity price search and quote validation against market bands",
  capabilities: ["market.search", "market.validate-price"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "market.search":
        return brainMarket.searchCommodityPrices(input?.commodity || "unknown", input?.port || "", input?.country || "");
      case "market.validate-price":
        return brainMarket.validateQuotePrice(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const intelligenceBrainModule: BrainModule = {
  id: "intelligence-brain",
  name: "Predictive Intelligence Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "5-layer predictive intelligence: risk, demand, credit, route, ETA, sanctions radar",
  capabilities: [
    "intelligence.risk",
    "intelligence.demand",
    "intelligence.credit",
    "intelligence.route",
    "intelligence.eta",
    "intelligence.sanctions",
  ],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "intelligence.risk":
        return brainIntel.predictTradeRisk({
          ustn: input?.ustn || "unknown",
          buyerGtid: input?.buyerGtid || input?.actorGtid || "unknown",
          sellerGtid: input?.sellerGtid || input?.actorGtid || "unknown",
          commodity: input?.commodity || "unknown",
          hsCode: input?.hsCode || "0000",
          tradeValueUsd: input?.tradeValueUsd || input?.contractValueUsd || 0,
          originCountry: input?.originCountry || "EG",
          destCountry: input?.destCountry || "DE",
          incoterm: input?.incoterm || "CIF",
        });
      case "intelligence.demand":
        return brainIntel.forecastDemand(input?.commodity, input?.hsCode, input?.targetMonth);
      case "intelligence.credit":
        return brainIntel.assessCreditRisk({
          ...input,
          repaymentHistory: input?.repaymentHistory || { onTime: 10, late: 0, defaulted: 0 },
        });
      case "intelligence.route":
        return brainIntel.optimizeRoute(input);
      case "intelligence.eta":
        return brainIntel.predictETA(input);
      case "intelligence.sanctions":
        return brainIntel.sanctionsRadar(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const disputeRiskModule: BrainModule = {
  id: "dispute-risk-brain",
  name: "Dispute Risk Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Predictive dispute risk scoring and root-cause analysis",
  capabilities: ["dispute.predict", "dispute.root-cause"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "dispute.predict":
      case "dispute.root-cause":
        return disputeRisk.predictDisputeRisk(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const dynamicFeeModule: BrainModule = {
  id: "dynamic-fee-brain",
  name: "Dynamic Fee Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Risk-adjusted dynamic trade fee calculation",
  capabilities: ["pricing.dynamic-fee"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "pricing.dynamic-fee":
        return dynamicFee.calculateDynamicFee(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const portalIntelligenceModule: BrainModule = {
  id: "portal-intelligence-brain",
  name: "Portal Intelligence Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Tenant portal insights and trade readiness scoring",
  capabilities: ["portal.intelligence", "readiness.update", "readiness.score"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "portal.intelligence":
        return portalIntel.getPortalIntelligence(input);
      case "readiness.update":
      case "readiness.score":
        try {
        return await portalIntel.calculateTradeReadinessScore(
          typeof input === "string" ? input : input?.tenantGtid,
        );
        } catch(e) { return { error: (e as Error).message, score: 0, tier: "PROVISIONAL" }; }
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const complianceGateModule: BrainModule = {
  id: "compliance-gate-brain",
  name: "Compliance Gate Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Auto pre-check compliance gate (sanctions + FM + jurisdiction routing)",
  capabilities: ["compliance.precheck"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.precheck":
        return complianceGate.autoCheckCompliance(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const freightPricingModule: BrainModule = {
  id: "freight-pricing-brain",
  name: "Freight Pricing Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "AI freight pricing estimator with carrier DB + market adjustments",
  capabilities: ["logistics.freight-pricing"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.freight-pricing":
        return freightPricing.estimateFreightPricing({
          ...input,
          originPort: input?.originPort || input?.origin || "unknown",
          destinationPort: input?.destinationPort || input?.destination || "unknown",
        });
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const transitTimeModule: BrainModule = {
  id: "transit-time-brain",
  name: "Transit Time Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "AI transit-time estimation grounded in shipping-line schedules",
  capabilities: ["logistics.transit-time-est"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.transit-time-est":
        return transitTime.estimateTransitTime({
          ...input,
          originPort: input?.originPort || input?.origin || "unknown",
          destinationPort: input?.destinationPort || input?.destination || "unknown",
        });
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const hsCodeDetectorModule: BrainModule = {
  id: "hs-code-detector-brain",
  name: "HS Code Detector Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "HS code detection from product description (DB + AI fallback)",
  capabilities: ["ai.hs-code-detect"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "ai.hs-code-detect":
        return hsCodeDetector.detectHsCode(
          typeof input === "string" ? input : input?.productDescription ?? input?.description ?? input?.product,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const customsPricingModule: BrainModule = {
  id: "customs-pricing-brain",
  name: "Customs Pricing Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Customs duty, VAT, FTA preferences, and total landed cost calculation",
  capabilities: ["ai.customs-pricing"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "ai.customs-pricing":
        return customsPricing.calculateCustomsPricing({
          ...input,
          destinationPort: input?.destinationPort || input?.destination || input?.destCountry || "unknown",
          hsCode: input?.hsCode || "0000",
        });
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const vesselTrackingModule: BrainModule = {
  id: "vessel-tracking-brain",
  name: "Vessel Tracking Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Vessel position tracking, ETA updates, and schedule deviation alerts",
  capabilities: ["logistics.vessel-tracking"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.vessel-tracking":
        return vesselTracking.trackVessel(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const aisVesselTrackingModule: BrainModule = {
  id: "ais-vessel-tracking-brain",
  name: "AIS Live Vessel Tracking Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "Live vessel positions via AISStream.io (real-time AIS feed, complementing the DB-cached vessel tracking module)",
  capabilities: ["logistics.ais-vessel-tracking"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.ais-vessel-tracking":
        // Dispatch by input shape:
        //   - string or { imo } -> single vessel position via AISStream.io
        //   - { portCode, radiusKm? } -> vessels near port (UN/LOCODE)
        //   - { latMin, latMax, lonMin, lonMax } -> vessels in bounding box
        if (typeof input === "string") {
          return aisVesselTracking.getVesselPosition(input);
        }
        if (input?.imo) {
          return aisVesselTracking.getVesselPosition(input.imo);
        }
        if (input?.portCode) {
          return aisVesselTracking.getVesselsNearPortCode(
            input.portCode,
            input?.radiusKm ?? 50,
          );
        }
        if (
          input?.latMin != null &&
          input?.latMax != null &&
          input?.lonMin != null &&
          input?.lonMax != null
        ) {
          return aisVesselTracking.getVesselsInArea(
            input.latMin,
            input.latMax,
            input.lonMin,
            input.lonMax,
          );
        }
        throw new Error(
          "logistics.ais-vessel-tracking requires { imo } | { portCode, radiusKm? } | { latMin, latMax, lonMin, lonMax } | string(imo)",
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const containerTrackingModule: BrainModule = {
  id: "container-tracking-brain",
  name: "Container Tracking Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Container tracking via Terminal49 + simulated fallback",
  capabilities: ["logistics.container-tracking"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.container-tracking":
        return containerTracking.trackContainer(
          typeof input === "string" ? input : input?.containerNumber ?? input?.container,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const perishableRequirementsModule: BrainModule = {
  id: "perishable-reqs-brain",
  name: "Perishable Requirements Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Cold-chain requirements for perishable commodities (temp, humidity, shelf life)",
  capabilities: ["ai.perishable-reqs"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "ai.perishable-reqs":
        return perishableReqs.getPerishableRequirements(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const workflowValidationModule: BrainModule = {
  id: "workflow-validation-brain",
  name: "Workflow Validation Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description: "Critical-decision workflow validation (trade/payment/contract/dispute)",
  capabilities: ["workflow.validate"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "workflow.validate": {
        const normInput = { ...input, params: { ...(input?.params || input), hsCode: input?.hsCode || input?.params?.hsCode || "0000" } };
        const kind = normInput?.kind ?? normInput?.workflow ?? "trade";
        const params = normInput?.params ?? normInput;
        switch (kind) {
          case "payment":
            return workflowValidation.validatePayment(params);
          case "contract":
            return workflowValidation.validateContract(params);
          case "dispute":
            return workflowValidation.validateDispute(params);
          case "trade":
          default:
            return workflowValidation.validateTradeRequest(params);
        }
      }
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

// =============================================================================
// MARKET INTELLIGENCE MODULE WRAPPERS
// (USDA AgMarketNews USA produce, worldwide agri forecast, global multi-region,
//  Gulf + Asia frozen packing) — distinct from the generic `market.search`
//  brain module which validates quotes against cached bands.
// =============================================================================

export const agmarketModule: BrainModule = {
  id: "agmarket-brain",
  name: "USDA AgMarket News Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "USDA AgMarketNews USA produce prices (fruit & vegetable): lookup, recommendation, sync",
  capabilities: ["market.agmarket"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "market.agmarket":
        if (input?.action === "sync") return agmarket.syncAgMarketPrices();
        if (input?.action === "list") return agmarket.getAllCommodities();
        if (input?.action === "stats") return agmarket.getAgMarketStats();
        if (input?.action === "recommendation" || (input?.commodity && input?.role)) {
          return agmarket.getMarketRecommendation(
            input?.commodity ?? input?.product ?? "unknown",
            input?.role === "seller" ? "seller" : "buyer",
          );
        }
        return agmarket.getCommodityPrice(
          typeof input === "string"
            ? input
            : input?.commodity ?? input?.product ?? "unknown",
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const agriCommodityForecastModule: BrainModule = {
  id: "agri-commodity-forecast-brain",
  name: "Agri Commodity Forecast Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "Worldwide agri commodity price forecasting with geopolitical + seasonal factors",
  capabilities: ["market.agri-forecast"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "market.agri-forecast":
        if (input?.action === "sync") return agriCommodityForecast.syncAgriCommodities();
        if (input?.action === "list") return agriCommodityForecast.getAllAgriCommodities();
        if (input?.action === "events") return agriCommodityForecast.getActiveGeopoliticalEvents();
        return agriCommodityForecast.getCommodityForecast(
          typeof input === "string"
            ? input
            : input?.commodity ?? input?.product ?? "unknown",
          input?.region,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const globalMarketIntelligenceModule: BrainModule = {
  id: "global-market-intelligence-brain",
  name: "Global Market Intelligence Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "Multi-region (Europe + Australia + USA + AI) market prices and recommendations",
  capabilities: ["market.global-intelligence"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "market.global-intelligence":
        if (input?.action === "sync") return globalMarketIntelligence.syncGlobalMarketPrices();
        if (input?.action === "stats") return globalMarketIntelligence.getGlobalMarketStats();
        if (input?.action === "recommendation" || (input?.commodity && input?.role)) {
          return globalMarketIntelligence.getGlobalMarketRecommendation(
            input?.commodity ?? input?.product ?? "unknown",
            input?.role === "seller" ? "seller" : "buyer",
            input?.isFrozen,
          );
        }
        return globalMarketIntelligence.getGlobalPrice(
          typeof input === "string"
            ? input
            : input?.commodity ?? input?.product ?? "unknown",
          input?.isFrozen,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

export const gulfAsiaMarketModule: BrainModule = {
  id: "gulf-asia-market-brain",
  name: "Gulf + Asia Market Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "Gulf + Asia market prices with frozen packing types and packing-aware recommendations",
  capabilities: ["market.gulf-asia"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "market.gulf-asia":
        if (input?.action === "sync") return gulfAsiaMarket.syncGulfAsiaMarketPrices();
        if (input?.action === "recommendation" || (input?.commodity && input?.role)) {
          return gulfAsiaMarket.getPackingAwareRecommendation(
            input?.commodity ?? input?.product ?? "unknown",
            input?.role === "seller" ? "seller" : "buyer",
            input?.packingType,
          );
        }
        return gulfAsiaMarket.getFrozenPackingPrices(
          typeof input === "string"
            ? input
            : input?.commodity ?? input?.product ?? "unknown",
          input?.packingType,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

// =============================================================================
// WORLDWIDE PORT ROUTES MODULE
// =============================================================================

export const worldwideRoutesModule: BrainModule = worldwideRoutes.worldwideRoutesModule;

// =============================================================================
// LEARNING MODULE
// =============================================================================

export const learningModule: BrainModule = {
  id: "learning-brain",
  name: "Learning Loop Brain",
  version: "1.0.0",
  type: "learning",
  authority: "A3",
  description: "Continuous learning from outcome feedback (success/failure recording)",
  capabilities: ["learning.record-success", "learning.record-failure"],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "learning.record-success":
        return learningLoop.recordFeedback({
          ...input,
          actualOutcome: "success",
          expectedOutcome: input?.expectedOutcome ?? "success",
        });
      case "learning.record-failure":
        return learningLoop.recordFeedback({
          ...input,
          actualOutcome: "failure",
          expectedOutcome: input?.expectedOutcome ?? "success",
        });
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * All Brain capability modules, in canonical registration order.
 * Every feature in SGTX is wired here so the Brain can invoke it.
 */
export const allBrainModules: BrainModule[] = [
  // Compliance (21)
  eudrModule,
  forceMajeureModule,
  sanctionsModule,
  ucp600Module,
  arbitrationModule,
  certificatesModule,
  chinaCustomsModule,
  codexPesticidesModule,
  countryDocRulesModule,
  customsMilestonesModule,
  euPesticidesModule,
  fxControlsModule,
  gccCustomsModule,
  ics2EnsModule,
  multiRegionPesticidesModule,
  multiSourcePesticidesModule,
  nowlunModule,
  preLoadingModule,
  productComplianceModule,
  regionalPesticidesModule,
  usCustomsModule,
  // AI (15)
  marketBrainModule,
  intelligenceBrainModule,
  disputeRiskModule,
  dynamicFeeModule,
  portalIntelligenceModule,
  complianceGateModule,
  freightPricingModule,
  transitTimeModule,
  hsCodeDetectorModule,
  customsPricingModule,
  vesselTrackingModule,
  aisVesselTrackingModule,
  containerTrackingModule,
  perishableRequirementsModule,
  workflowValidationModule,
  // Market Intelligence (4)
  agmarketModule,
  agriCommodityForecastModule,
  globalMarketIntelligenceModule,
  gulfAsiaMarketModule,
  // Worldwide Routes (1)
  worldwideRoutesModule,
  // Learning (1)
  learningModule,
];

/**
 * Register every Brain capability module with the module registry.
 * Called once during Brain bootstrap. Idempotent — re-registration is a no-op.
 *
 * After this returns, the Brain orchestrator can invoke any of the 42 modules'
 * 71 capabilities through `brainOrchestrator.invoke(capability, input)`.
 */
export async function registerAllCapabilities(): Promise<void> {
  for (const m of allBrainModules) {
    await moduleRegistry.register(m);
  }
}
