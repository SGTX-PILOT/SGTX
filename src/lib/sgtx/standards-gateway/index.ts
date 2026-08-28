// @ts-nocheck
/**
 * SGTX Part 76 — Global Standards Gateway
 * ===========================================================================
 *
 * Version-aware standards mapping and conversion layer. SGTX maintains a
 * canonical internal model (the "SGTX Canonical Trade Representation" —
 * SCTR). Every external standard (WCO, UBL, EDIFACT, ONE Record, E-CMR,
 * ISO 20022, etc.) is converted to/from SCTR via a declarative field
 * mapping. The mapping is *version-aware*: each standard's version is
 * an explicit configuration parameter, NOT hardcoded to a single value.
 *
 * Supported standards (§76.2 — full list):
 *   WCO_DATA_MODEL, WCO_CODE_LISTS, HS, UN_CEFACT, UN_LOCODE, UN_EDIFACT,
 *   UBL, E_CMR, E_AWB, E_BL, CARGO_XML, ONE_RECORD, ISO_20022,
 *   XADES, CADES, PADES, CMS, QES, GS1, EPCIS
 *
 * Each standard has:
 *   • currentVersion  — the version SGTX is configured to emit/consume
 *   • supportedVersions — list of all versions SGTX knows how to map
 *   • schemaUri       — canonical schema location for validation
 *   • fieldMappings   — { sctrField: standardField } bidirectional
 *
 * Conversion semantics:
 *   convertToStandard(data, target) — SCTR → external standard
 *   The reverse (parseFromStandard) is intentionally NOT in this lib; it
 *   belongs to the ingestion pipeline (§76.7) and will be added when the
 *   ingestion API is built. This lib is the OUTBOUND gateway only.
 *
 * Version policy: SGTX NEVER silently upgrades or downgrades a payload.
 * If a requested version is not in `supportedVersions`, the conversion
 * fails gracefully with `converted: false` and an explanatory error.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface StandardMapping {
  standard: string;
  currentVersion: string;
  supportedVersions: string[];
  schemaUri: string;
  fieldMappings: Record<string, string>;
  description: string;
}

export interface ConversionResult {
  standard: string;
  version: string;
  converted: boolean;
  output: any;
  warnings: string[];
}

// ============ §76.4 — Standards registry ============

const REGISTRY: Record<string, StandardMapping> = {
  WCO_DATA_MODEL: {
    standard: "WCO_DATA_MODEL",
    currentVersion: "3.0.0",
    supportedVersions: ["2.0.0", "3.0.0"],
    schemaUri: "https://www.wcoomd.org/-/media/wco/public/imported/topics/facilitation/electronic-business/wco_data_model_v3.xsd",
    fieldMappings: { ustn: "Declaration.id", hsCode: "GoodsItem.HSCode", value: "GoodsItem.InvoiceAmount", currency: "GoodsItem.InvoiceCurrencyCode" },
    description: "WCO Data Model — universal trade & customs data model.",
  },
  WCO_CODE_LISTS: {
    standard: "WCO_CODE_LISTS",
    currentVersion: "2024",
    supportedVersions: ["2022", "2023", "2024"],
    schemaUri: "https://www.wcoomd.org/en/topics/facilitation/activities-and-programmes/nomenclature-and-classification",
    fieldMappings: { country: "CountryCode", currency: "CurrencyCode", unit: "UnitOfMeasureCode" },
    description: "WCO maintained code lists (ISO 3166, ISO 4217, UNECE Rec 20).",
  },
  HS: {
    standard: "HS",
    currentVersion: "HS-2022",
    supportedVersions: ["HS-2017", "HS-2022"],
    schemaUri: "https://www.wcoomd.org/en/topics/nomenclature",
    fieldMappings: { hsCode: "HSCode" },
    description: "Harmonized Commodity Description and Coding System.",
  },
  UN_CEFACT: {
    standard: "UN_CEFACT",
    currentVersion: "20B",
    supportedVersions: ["19B", "20B", "23A"],
    schemaUri: "https://www.unece.org/cefact/",
    fieldMappings: { ustn: "ExchangedDocument.id", goods: "SupplyChain.consignment" },
    description: "UN/CEFACT Cross-Industry Information Standard.",
  },
  UN_LOCODE: {
    standard: "UN_LOCODE",
    currentVersion: "2024-2",
    supportedVersions: ["2023-1", "2023-2", "2024-1", "2024-2"],
    schemaUri: "https://unece.org/trade/cefact/unlocode-code-list-country-and-subdivision",
    fieldMappings: { portCode: "UNLOCODE" },
    description: "UN Location Code (port/airport/city identifier).",
  },
  UN_EDIFACT: {
    standard: "UN_EDIFACT",
    currentVersion: "D.20A",
    supportedVersions: ["D.96A", "D.20A"],
    schemaUri: "https://www.unece.org/trade/united-nations-electronic-data-interchange-administration-commerce-and-transport",
    fieldMappings: { ustn: "BGM+350'", value: "MOA+9'" },
    description: "UN/EDIFACT — electronic data interchange for administration, commerce, transport.",
  },
  UBL: {
    standard: "UBL",
    currentVersion: "2.1",
    supportedVersions: ["2.0", "2.1"],
    schemaUri: "https://docs.oasis-open.org/ubl/UBL-2.1.html",
    fieldMappings: { ustn: "cbc:ID", value: "cbc:LineExtensionAmount", currency: "cbc:LineExtensionAmount.currencyID" },
    description: "OASIS Universal Business Language.",
  },
  E_CMR: {
    standard: "E_CMR",
    currentVersion: "2.0",
    supportedVersions: ["1.0", "2.0"],
    schemaUri: "https://www.unece.org/fileadmin/DAM/cefact/codesfortrade/CITS/cmr/e-CMR_XML_Schema_v2.0.xsd",
    fieldMappings: { ustn: "CMRConsignment.id", sender: "CMRConsignment.sender" },
    description: "e-CMR — electronic consignment note for road transport.",
  },
  E_AWB: {
    standard: "E_AWB",
    currentVersion: "CXML-22B",
    supportedVersions: ["CXML-20A", "CXML-22B"],
    schemaUri: "https://www.iata.org/en/programs/cargo/e-freight/",
    fieldMappings: { ustn: "AirWaybillNumber", awb: "AirWaybillNumber" },
    description: "IATA Cargo-XML Air Waybill (XAWB).",
  },
  E_BL: {
    standard: "E_BL",
    currentVersion: "BOLERO-2024",
    supportedVersions: ["BOLERO-2018", "BOLERO-2024"],
    schemaUri: "https://www.bolero.net/",
    fieldMappings: { ustn: "BlNumber", blNumber: "BlNumber" },
    description: "Electronic Bill of Lading (eBL) — Bolero / TradeLens / WaveBL compatible.",
  },
  CARGO_XML: {
    standard: "CARGO_XML",
    currentVersion: "22B",
    supportedVersions: ["20A", "22B"],
    schemaUri: "https://www.iata.org/en/programs/cargo/e-freight/cargo-xml/",
    fieldMappings: { ustn: "Shipment.id", weight: "Weight" },
    description: "IATA Cargo-XML family (XAWB, XFFR, XRCT, XCSN).",
  },
  ONE_RECORD: {
    standard: "ONE_RECORD",
    currentVersion: "2.0",
    supportedVersions: ["1.0", "2.0"],
    schemaUri: "https://www.iata.org/en/programs/cargo/e-freight/one-record/",
    fieldMappings: { ustn: "Shipment.uri", pieces: "Piece" },
    description: "IATA ONE Record — shared data model for air cargo.",
  },
  ISO_20022: {
    standard: "ISO_20022",
    currentVersion: "pain.001.001.09",
    supportedVersions: ["pain.001.001.03", "pain.001.001.09", "pacs.008.001.10"],
    schemaUri: "https://www.iso20022.org/",
    fieldMappings: { ustn: "CstmrCdtTrfInitn.GrpHdr.MsgId", amount: "CstmrCdtTrfInitn.PmtInf.InstdAmt" },
    description: "ISO 20022 — universal financial messaging standard.",
  },
  XADES: {
    standard: "XADES",
    currentVersion: "1.4.2",
    supportedVersions: ["1.3.2", "1.4.2"],
    schemaUri: "https://www.etsi.org/deliver/etsi_ts/101900_101999/101903/01.04.02_60/ts_101903v010402m.pdf",
    fieldMappings: { signature: "ds:Signature.xades:QualifyingProperties" },
    description: "XML Advanced Electronic Signatures.",
  },
  CADES: {
    standard: "CADES",
    currentVersion: "2.2.1",
    supportedVersions: ["1.4.1", "2.2.1"],
    schemaUri: "https://www.etsi.org/deliver/etsi_ts/101700_101799/101733/02.02.01_60/ts_101733v020201m.pdf",
    fieldMappings: { signature: "CMS.AdES.signature" },
    description: "CMS Advanced Electronic Signatures.",
  },
  PADES: {
    standard: "PADES",
    currentVersion: "2.2.2",
    supportedVersions: ["1.0.0", "2.2.2"],
    schemaUri: "https://www.etsi.org/deliver/etsi_ts/102700_102799/102732/02.02.02_60/ts_102732v020202m.pdf",
    fieldMappings: { signature: "PDF.pkcs7.signature" },
    description: "PDF Advanced Electronic Signatures.",
  },
  CMS: {
    standard: "CMS",
    currentVersion: "RFC-5652",
    supportedVersions: ["RFC-2630", "RFC-3369", "RFC-5652"],
    schemaUri: "https://datatracker.ietf.org/doc/html/rfc5652",
    fieldMappings: { signature: "SignedData" },
    description: "Cryptographic Message Syntax (CMS).",
  },
  QES: {
    standard: "QES",
    currentVersion: "eIDAS-910-2014",
    supportedVersions: ["eIDAS-910-2014"],
    schemaUri: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=uriserv:OJ.L_.2014.257.01.0073.01.ENG",
    fieldMappings: { signature: "QualifiedElectronicSignature" },
    description: "Qualified Electronic Signature per eIDAS Regulation.",
  },
  GS1: {
    standard: "GS1",
    currentVersion: "GS1-EPC-2.0",
    supportedVersions: ["GS1-EPC-1.1", "GS1-EPC-2.0"],
    schemaUri: "https://www.gs1.org/",
    fieldMappings: { gtin: "GTIN", sscc: "SSCC" },
    description: "GS1 identification & barcoding standards.",
  },
  EPCIS: {
    standard: "EPCIS",
    currentVersion: "2.0",
    supportedVersions: ["1.2", "2.0"],
    schemaUri: "https://www.gs1.org/standards/epcis",
    fieldMappings: { ustn: "EPCISDocument.EPCISHeader", events: "EPCISDocument.EPCISBody.EventList" },
    description: "Electronic Product Code Information Services (track & trace).",
  },
};

// ============ §76.5 — Public API ============

export function listSupportedStandards(): string[] {
  try {
    return Object.keys(REGISTRY);
  } catch {
    return [];
  }
}

export async function getStandardMapping(standard: string): Promise<StandardMapping> {
  try {
    const upper = (standard || "").toUpperCase();
    const mapping = REGISTRY[upper];
    if (!mapping) {
      return {
        standard: upper,
        currentVersion: "",
        supportedVersions: [],
        schemaUri: "",
        fieldMappings: {},
        description: `Standard "${upper}" is not registered in SGTX.`,
      };
    }
    return mapping;
  } catch (err: any) {
    logger.warn("[standards-gateway] getStandardMapping failed", { standard, error: err?.message });
    return {
      standard,
      currentVersion: "",
      supportedVersions: [],
      schemaUri: "",
      fieldMappings: {},
      description: "Lookup failed.",
    };
  }
}

export async function convertToStandard(data: any, targetStandard: string, targetVersion?: string): Promise<ConversionResult> {
  try {
    const mapping = await getStandardMapping(targetStandard);
    if (!mapping.currentVersion) {
      return { standard: targetStandard, version: targetVersion || "", converted: false, output: null, warnings: [`Unknown standard: ${targetStandard}`] };
    }
    const version = targetVersion || mapping.currentVersion;
    if (!mapping.supportedVersions.includes(version)) {
      return {
        standard: targetStandard,
        version,
        converted: false,
        output: null,
        warnings: [`Version ${version} not supported. Supported: ${mapping.supportedVersions.join(", ")}`],
      };
    }
    const warnings: string[] = [];
    const output: Record<string, any> = { standard: mapping.standard, version, generatedAt: new Date().toISOString() };
    for (const [sctrField, stdField] of Object.entries(mapping.fieldMappings)) {
      try {
        const val = data?.[sctrField];
        if (val === undefined || val === null) {
          warnings.push(`Source field "${sctrField}" missing — leaving "${stdField}" empty.`);
        }
        applyPath(output, stdField, val);
      } catch (e: any) {
        warnings.push(`Failed to map ${sctrField} → ${stdField}: ${e?.message}`);
      }
    }
    return { standard: mapping.standard, version, converted: true, output, warnings };
  } catch (err: any) {
    logger.error("[standards-gateway] convertToStandard failed", { targetStandard, error: err?.message });
    return { standard: targetStandard, version: targetVersion || "", converted: false, output: null, warnings: [err?.message || "internal error"] };
  }
}

function applyPath(obj: any, path: string, value: any): void {
  try {
    const parts = path.split(".");
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]]) cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  } catch {
    /* ignore path apply errors */
  }
}
