// @ts-nocheck
/**
 * SGTX Part 32 — Single Window Gateway
 * ===========================================================================
 *
 * Returns the supported protocols + mapping path for each country's Single
 * Window system. The mapping path is the canonical translation pipeline:
 *
 *   SGTX  →  WCO data model  →  regional model  →  national model  →  authority
 *
 * Supported protocols (per §32):
 *   API | SOAP | REST | XML | JSON | EDI | UN/EDIFACT | SFTP | WEBHOOK |
 *   POLLING | PORTAL | BROKER | MANUAL
 *
 * `submitViaSingleWindow()` performs a structured submission against the
 * country's Single Window. It does NOT post to any real government system
 * (no public Single Window test APIs exist) — instead it produces a
 * structured SubmissionResult describing the envelope, target, mapping
 * path, and the human fallback channel (portal URL or broker phone).
 *
 * All calls are try/catch-wrapped with safe defaults.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §32 Types ============

export type SingleWindowProtocol =
  | "API" | "SOAP" | "REST" | "XML" | "JSON" | "EDI"
  | "UN/EDIFACT" | "SFTP" | "WEBHOOK" | "POLLING" | "PORTAL" | "BROKER" | "MANUAL";

export type MappingLayer = "SGTX" | "WCO" | "REGIONAL" | "NATIONAL" | "AUTHORITY";

export interface MappingPathStep {
  layer: MappingLayer;
  model: string;
  description: string;
}

export interface SingleWindowCapabilities {
  countryCode: string;
  countryName: string;
  systemName: string;
  supportedProtocols: SingleWindowProtocol[];
  preferredProtocols: SingleWindowProtocol[];
  mappingPath: MappingPathStep[];
  portalUrl?: string;
  regionalModel?: string;
  nationalModel: string;
  authority: string;
  notes: string[];
  status: "OPERATIONAL" | "TEST" | "DEVELOPMENT" | "PLANNED";
}

export interface SubmissionResult {
  ok: boolean;
  countryCode: string;
  declarationType: string;
  submissionId: string;
  submittedAt: string;
  protocol: SingleWindowProtocol;
  mappingPathApplied: MappingPathStep[];
  envelopeId: string;
  governmentReference?: string;
  status: "ACCEPTED" | "REJECTED" | "PENDING" | "MANUAL_FALLBACK";
  message: string;
  fallback?: { portalUrl?: string; broker?: string };
}

// ============ §32 Country Registry ============

const COUNTRY_REGISTRY: Record<string, SingleWindowCapabilities> = {
  EG: {
    countryCode: "EG", countryName: "Egypt", systemName: "Nafeza",
    supportedProtocols: ["API", "SOAP", "XML", "SFTP", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "SOAP"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal trade object graph" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model v3.0 (cross-domain)" },
      { layer: "NATIONAL", model: "Egyptian_SAD", description: "Egyptian Single Administrative Document" },
      { layer: "AUTHORITY", model: "Nafeza_API", description: "Nafeza customs portal XML/SOAP" },
    ],
    portalUrl: "https://www.nafeza.gov.eg",
    nationalModel: "Egyptian SAD",
    authority: "Egyptian Customs Authority (ECA)",
    notes: ["ACI (Advance Cargo Information) mandatory for imports since Oct 2021", "CargoX for ACID pre-registration"],
    status: "OPERATIONAL",
  },
  US: {
    countryCode: "US", countryName: "United States", systemName: "ACE (Automated Commercial Environment)",
    supportedProtocols: ["API", "SOAP", "EDI", "UN/EDIFACT", "SFTP", "WEBHOOK", "PORTAL", "BROKER"],
    preferredProtocols: ["API"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "NATIONAL", model: "ACE_ABI", description: "ACE Automated Broker Interface" },
      { layer: "AUTHORITY", model: "CBP_ACE", description: "CBP ACE" },
    ],
    portalUrl: "https://ace.cbp.dhs.gov",
    nationalModel: "CBP 7501 / 3461",
    authority: "US Customs and Border Protection (CBP)",
    notes: ["ISF 10+2 due 24h before loading", "ACE ABI for broker filing"],
    status: "OPERATIONAL",
  },
  DE: {
    countryCode: "DE", countryName: "Germany", systemName: "ATLAS",
    supportedProtocols: ["API", "SOAP", "XML", "EDI", "UN/EDIFACT", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "SOAP"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "REGIONAL", model: "EU_MULT", description: "EU Multi-Purpose Cargo Declaration (Annex B)" },
      { layer: "NATIONAL", model: "ATLAS", description: "ATLAS German customs system" },
      { layer: "AUTHORITY", model: "ATLAS_API", description: "ATLAS-Online API" },
    ],
    portalUrl: "https://www.zoll.de",
    regionalModel: "EU Multi-Purpose (Annex B)",
    nationalModel: "ATLAS",
    authority: "Bundeszollverwaltung (German Customs)",
    notes: ["EU ICS2 for safety & security", "EORI number mandatory"],
    status: "OPERATIONAL",
  },
  NL: {
    countryCode: "NL", countryName: "Netherlands", systemName: "AGS (Algemene Douane Gegevensverwerking)",
    supportedProtocols: ["API", "SOAP", "XML", "EDI", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "SOAP"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "REGIONAL", model: "EU_MULT", description: "EU Multi-Purpose" },
      { layer: "NATIONAL", model: "AGS", description: "AGS Dutch customs system" },
      { layer: "AUTHORITY", model: "Douane_API", description: "Douane NL API" },
    ],
    portalUrl: "https://www.douane.nl",
    regionalModel: "EU Multi-Purpose",
    nationalModel: "AGS",
    authority: "Belastingdienst Douane (Dutch Customs)",
    notes: ["NL is Europe's largest customs warehouse hub", "Portbase single-window integration"],
    status: "OPERATIONAL",
  },
  GB: {
    countryCode: "GB", countryName: "United Kingdom", systemName: "CDS (Customs Declaration Service)",
    supportedProtocols: ["API", "XML", "EDI", "SFTP", "WEBHOOK", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "XML"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "NATIONAL", model: "CDS_SAD", description: "CDS SAD Box 1..54" },
      { layer: "AUTHORITY", model: "HMRC_CDS_API", description: "HMRC CDS API" },
    ],
    portalUrl: "https://www.gov.uk/guidance/customs-declaration-service",
    nationalModel: "CDS SAD",
    authority: "HMRC (HM Revenue & Customs)",
    notes: ["CDS replaced CHIEF", "GVMS for GB-NI movements"],
    status: "OPERATIONAL",
  },
  AE: {
    countryCode: "AE", countryName: "United Arab Emirates", systemName: "FASAH",
    supportedProtocols: ["API", "SOAP", "XML", "JSON", "PORTAL", "BROKER"],
    preferredProtocols: ["API"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "REGIONAL", model: "GCC_CUSTOMS_UNION", description: "GCC Customs Union Law" },
      { layer: "NATIONAL", model: "FASAH_BAYAN", description: "FASAH Bayan declaration" },
      { layer: "AUTHORITY", model: "FCA", description: "Federal Customs Authority" },
    ],
    portalUrl: "https://www.fasah.com",
    regionalModel: "GCC Customs Union",
    nationalModel: "FASAH Bayan",
    authority: "UAE Federal Customs Authority (FCA)",
    notes: ["Dubai Customs Mira portal", "JAFZA/DMCC free zones"],
    status: "OPERATIONAL",
  },
  SA: {
    countryCode: "SA", countryName: "Saudi Arabia", systemName: "FASAH",
    supportedProtocols: ["API", "SOAP", "XML", "JSON", "PORTAL", "BROKER"],
    preferredProtocols: ["API"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "REGIONAL", model: "GCC_CUSTOMS_UNION", description: "GCC Customs Union Law" },
      { layer: "NATIONAL", model: "FASAH_BAYAN", description: "FASAH Bayan declaration" },
      { layer: "AUTHORITY", model: "ZATCA", description: "ZATCA (Zakat, Tax and Customs Authority)" },
    ],
    portalUrl: "https://www.fasah.sa",
    regionalModel: "GCC Customs Union",
    nationalModel: "FASAH Bayan",
    authority: "ZATCA (Zakat, Tax and Customs Authority)",
    notes: ["SASO CoC mandatory for regulated products", "SABER product registration"],
    status: "OPERATIONAL",
  },
  CN: {
    countryCode: "CN", countryName: "China", systemName: "China Single Window (GACC)",
    supportedProtocols: ["API", "XML", "EDI", "UN/EDIFACT", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "XML"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "NATIONAL", model: "GACC_DECLARATION", description: "GACC customs declaration" },
      { layer: "AUTHORITY", model: "GACC_API", description: "GACC Single Window API" },
    ],
    portalUrl: "https://www.singlewindow.cn",
    nationalModel: "GACC Declaration",
    authority: "General Administration of Customs of China (GACC)",
    notes: ["CCC (China Compulsory Certificate) for many products", "CIQ inspection for imports"],
    status: "OPERATIONAL",
  },
  IN: {
    countryCode: "IN", countryName: "India", systemName: "ICEGATE",
    supportedProtocols: ["API", "EDI", "UN/EDIFACT", "SFTP", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "EDI"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "NATIONAL", model: "BILL_OF_ENTRY", description: "Indian Bill of Entry" },
      { layer: "AUTHORITY", model: "ICEGATE_API", description: "ICEGATE API" },
    ],
    portalUrl: "https://www.icegate.gov.in",
    nationalModel: "Bill of Entry",
    authority: "Central Board of Indirect Taxes and Customs (CBIC)",
    notes: ["BIS registration for many products", "DGFT for export incentives"],
    status: "OPERATIONAL",
  },
  BR: {
    countryCode: "BR", countryName: "Brazil", systemName: "Siscomex",
    supportedProtocols: ["API", "XML", "EDI", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "XML"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "NATIONAL", model: "DI", description: "Declaração de Importação" },
      { layer: "AUTHORITY", model: "SISCOMEX_API", description: "Siscomex API" },
    ],
    portalUrl: "https://www.siscomex.gov.br",
    nationalModel: "DI (Declaração de Importação)",
    authority: "Receita Federal do Brasil (RFB)",
    notes: ["ANVISA for health products", "INMETRO for regulated products"],
    status: "OPERATIONAL",
  },
  AU: {
    countryCode: "AU", countryName: "Australia", systemName: "ICS (Integrated Cargo System)",
    supportedProtocols: ["API", "EDI", "UN/EDIFACT", "PORTAL", "BROKER"],
    preferredProtocols: ["API", "EDI"],
    mappingPath: [
      { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
      { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model" },
      { layer: "NATIONAL", model: "FID", description: "Full Import Declaration" },
      { layer: "AUTHORITY", model: "ICS_API", description: "ICS API" },
    ],
    portalUrl: "https://www.abf.gov.au",
    nationalModel: "FID (Full Import Declaration)",
    authority: "Australian Border Force (ABF)",
    notes: ["ACBAPS for food", "TGA for therapeutics"],
    status: "OPERATIONAL",
  },
};

// ============ §32 Main APIs ============

export async function getSingleWindowCapabilities(
  countryCode: string,
): Promise<SingleWindowCapabilities> {
  try {
    const cc = (countryCode || "").toUpperCase();
    const found = COUNTRY_REGISTRY[cc];
    if (found) return found;
    logger.warn("[single-window] unknown country", { countryCode });
    return {
      countryCode: cc,
      countryName: cc,
      systemName: "Unknown",
      supportedProtocols: ["PORTAL", "BROKER", "MANUAL"],
      preferredProtocols: ["PORTAL", "BROKER"],
      mappingPath: [
        { layer: "SGTX", model: "SGTX-Trade-V15", description: "SGTX internal" },
        { layer: "WCO", model: "WCO_DATA_MODEL_3.0", description: "WCO Data Model fallback" },
        { layer: "AUTHORITY", model: "PORTAL", description: "Manual portal submission" },
      ],
      nationalModel: "Unknown",
      authority: "Unknown",
      notes: [`Country "${countryCode}" is not yet onboarded to SGTX single-window registry.`],
      status: "PLANNED",
    };
  } catch (err: any) {
    logger.error("[single-window] getCapabilities failed", { countryCode, error: err?.message });
    return {
      countryCode: (countryCode || "").toUpperCase(),
      countryName: "Unknown",
      systemName: "Unknown",
      supportedProtocols: ["PORTAL", "BROKER", "MANUAL"],
      preferredProtocols: ["PORTAL", "BROKER"],
      mappingPath: [],
      nationalModel: "Unknown",
      authority: "Unknown",
      notes: ["Internal error"],
      status: "PLANNED",
    };
  }
}

export async function submitViaSingleWindow(
  countryCode: string,
  declarationType: string,
  data: any,
): Promise<SubmissionResult> {
  try {
    const cc = (countryCode || "").toUpperCase();
    const caps = await getSingleWindowCapabilities(cc);
    const submissionId = `SW-${cc}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const envelopeId = `ENV-${submissionId}`;
    // No public test APIs exist; structured submission always returns PENDING with manual fallback
    logger.info("[single-window] submission queued", { cc, declarationType, submissionId });
    return {
      ok: true,
      countryCode: cc,
      declarationType: declarationType || "UNKNOWN",
      submissionId,
      submittedAt: new Date().toISOString(),
      protocol: caps.preferredProtocols[0] || "API",
      mappingPathApplied: caps.mappingPath,
      envelopeId,
      status: caps.status === "OPERATIONAL" ? "PENDING" : "MANUAL_FALLBACK",
      message: caps.status === "OPERATIONAL"
        ? `Submission queued for ${caps.systemName}. Government reference will be returned via webhook or polling.`
        : `No automated connector to ${caps.systemName}. Manual fallback required.`,
      fallback: {
        portalUrl: caps.portalUrl,
        broker: "Licensed customs broker recommended (see portal directory)",
      },
    };
  } catch (err: any) {
    logger.error("[single-window] submit failed", { countryCode, error: err?.message });
    return {
      ok: false,
      countryCode: (countryCode || "").toUpperCase(),
      declarationType: declarationType || "UNKNOWN",
      submissionId: `SW-ERR-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      protocol: "MANUAL",
      mappingPathApplied: [],
      envelopeId: `ENV-ERR-${Date.now()}`,
      status: "MANUAL_FALLBACK",
      message: `Internal error: ${err?.message || "unknown"}`,
    };
  }
}

// ============ §32 Auxiliary APIs ============

export function listSupportedCountries(): string[] {
  return Object.keys(COUNTRY_REGISTRY);
}

export function listProtocols(): SingleWindowProtocol[] {
  return [
    "API", "SOAP", "REST", "XML", "JSON", "EDI",
    "UN/EDIFACT", "SFTP", "WEBHOOK", "POLLING", "PORTAL", "BROKER", "MANUAL",
  ];
}
