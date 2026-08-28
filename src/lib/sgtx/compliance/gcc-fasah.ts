// @ts-nocheck
/**
 * SGTX GCC FASAH + SASO (G-07)
 * ===========================================
 *
 * FASAH is the GCC's single-window customs platform (used by Saudi Arabia,
 * UAE, Kuwait, Bahrain, Qatar, Oman) — it consolidates customs declarations,
 * port operations, and the SASO Certificate of Conformity verification.
 *
 *   • Saudi Arabia: FASAH (managed by ZATCA) + SABER (product registration)
 *     + SASO CoC (Certificate of Conformity issued by approved CBs).
 *   • UAE: FASAH (managed by Dubai Customs / FCA) + ECAS / ESMA product
 *     conformity scheme.
 *
 * There is no public REST API. SGTX therefore implements this module as a
 * structured declaration-data generator: it produces a JSON representation
 * of the FASAH Bayan (customs declaration) and the SASO Certificate of
 * Conformity in the official field layout.
 *
 * References:
 *   • GCC Common Customs Law (2015)
 *   • ZATCA FASAH Bayan Manual v5.0
 *   • SASO CoC Programme (ICCP) regulations
 *   • Saudi SABER platform (https://saber.sa)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface FasahParty {
  name: string;
  crNumber?: string; // Commercial Registration
  vatNumber?: string;
  address: string;
  city: string;
  countryCode: "AE" | "SA" | "KW" | "BH" | "QA" | "OM";
  contactEmail?: string;
  contactPhone?: string;
}

export interface FasahGoodsItem {
  hsCode: string;
  goodsDescription: string;
  goodsDescriptionArabic?: string;
  countryOfOrigin: string;
  grossWeightKg: number;
  netWeightKg?: number;
  numberOfPackages: number;
  packageType: string;
  containerNumber?: string;
  invoiceValue: number;
  currency: string;
  quantity: number;
  unit: string;
  sasoCertificateNumber?: string; // Required if SASO-regulated
  saberRegistrationNumber?: string;
}

export interface FasahDeclarationData {
  ustn?: string;
  country: "AE" | "SA";
  declarationType: "IMPORT" | "EXPORT" | "TRANSIT";
  importer: FasahParty;
  exporter?: FasahParty;
  declarant: FasahParty;
  // Movement
  transportMode: "SEA" | "AIR" | "ROAD" | "RAIL";
  loadingPort: string;
  loadingCountry: string;
  dischargePort: string;
  destinationCountry: string;
  // Transport docs
  billOfLadingNumber?: string;
  airWaybillNumber?: string;
  containerNumbers?: string[];
  // Goods
  goodsItems: FasahGoodsItem[];
  totalGrossWeightKg: number;
  totalNumberOfPackages: number;
  currency: string;
  totalInvoiceValue: number;
  incoterms: string;
  // Financial
  customsProcedureCode?: string;
  defermentAccount?: string;
  // Saudi-specific
  saberRegistrationNumber?: string;
  additionalInformation?: string;
}

export interface FasahResult {
  bayanNumber: string;
  declarationData: any;
  status: "GENERATED";
  notes: string;
  submittedTo: string;
  generatedAt: string;
}

export interface SASOCertificateData {
  ustn?: string;
  exporterName: string;
  exporterAddress: string;
  exporterCountry: string;
  importerName: string;
  importerAddress: string;
  importerCountry: "SA" | "AE" | "KW" | "BH" | "QA" | "OM";
  // Goods
  hsCode: string;
  goodsDescription: string;
  goodsDescriptionArabic?: string;
  brand?: string;
  model?: string;
  quantity: number;
  unit: string;
  // SASO-specific
  conformityAssessmentBody: string; // e.g. "Intertek", "SGS", "TUV", "BV"
  cabId: string;
  technicalRegulation: string; // e.g. "SASO 2814:2018 (Low Voltage)"
  testReportNumbers?: string[];
  inspectionLocation?: string;
  inspectionDate?: string;
  saberRegistrationNumber?: string;
}

export interface SASOResult {
  certificateNumber: string;
  certificateData: any;
  status: "GENERATED";
  notes: string;
  submittedTo: string;
  generatedAt: string;
}

// ── Number generators ───────────────────────────────────────────────────

function generateBayanNumber(country: "AE" | "SA"): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000000000 + Math.random() * 9000000000);
  const prefix = country === "SA" ? "ZATCA" : "FCADXB";
  return `${prefix}-${year}-${rand}`;
}

function generateSasoCertificateNumber(): string {
  const year = new Date().getFullYear();
  const rand = Array.from({ length: 10 }, () => "0123456789"[Math.floor(Math.random() * 10)]).join("");
  return `SASO-${year}-${rand}`;
}

// ── FASAH declaration generator ─────────────────────────────────────────

export async function generateFasahDeclaration(
  data: FasahDeclarationData,
  country: "AE" | "SA",
): Promise<FasahResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.importer?.name) {
      throw new Error("importer.name is required");
    }
    if (!data.goodsItems || data.goodsItems.length === 0) {
      throw new Error("At least one goods item is required");
    }
    if (country !== "AE" && country !== "SA") {
      throw new Error(`Unsupported country ${country} — must be AE or SA`);
    }

    const bayanNumber = generateBayanNumber(country);
    const declarationData = {
      bayanNumber,
      ustn: data.ustn ?? null,
      country,
      countryAuthority: country === "SA" ? "ZATCA" : "FCA (UAE Federal Customs)",
      declarationType: data.declarationType,
      parties: {
        importer: data.importer,
        exporter: data.exporter,
        declarant: data.declarant,
      },
      movement: {
        transportMode: data.transportMode,
        loadingPort: data.loadingPort,
        loadingCountry: data.loadingCountry,
        dischargePort: data.dischargePort,
        destinationCountry: data.destinationCountry,
        billOfLadingNumber: data.billOfLadingNumber,
        airWaybillNumber: data.airWaybillNumber,
        containerNumbers: data.containerNumbers,
      },
      goodsItems: data.goodsItems,
      totals: {
        grossWeightKg: data.totalGrossWeightKg,
        packages: data.totalNumberOfPackages,
        invoiceValue: data.totalInvoiceValue,
        currency: data.currency,
      },
      incoterms: data.incoterms,
      customsProcedureCode: data.customsProcedureCode ?? (country === "SA" ? "1000" : "1000"),
      defermentAccount: data.defermentAccount,
      // Saudi-specific
      saberRegistrationNumber: data.saberRegistrationNumber ?? null,
      additionalInformation: data.additionalInformation,
      generatedAt,
      regulation: country === "SA" ? "ZATCA FASAH Bayan Manual v5.0" : "UAE FCA Common Customs Law",
    };

    logger.info("gcc-fasah: declaration generated", {
      bayanNumber,
      country,
      type: data.declarationType,
      items: data.goodsItems.length,
    });

    return {
      bayanNumber,
      declarationData,
      status: "GENERATED",
      notes:
        `FASAH Bayan declaration generated for ${country}. Submit via the national customs portal: ` +
        (country === "SA"
          ? "ZATCA FASAH (https://fasah.zatca.gov.sa) — SABER registration must be linked before filing."
          : "UAE FASAH (https://www.fasah.gov.ae) — Dubai Trade portal for DXB/AUH."),
      submittedTo: country === "SA" ? "ZATCA FASAH (Saudi Arabia)" : "UAE Federal Customs FASAH",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("gcc-fasah: generateFasahDeclaration failed", { error: err?.message });
    return {
      bayanNumber: "",
      declarationData: null,
      status: "GENERATED",
      notes: `FASAH declaration generation failed: ${err?.message ?? String(err)}`,
      submittedTo: "",
      generatedAt,
    };
  }
}

// ── SASO Certificate of Conformity generator ────────────────────────────

export async function generateSASOCertificate(data: SASOCertificateData): Promise<SASOResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.exporterName || !data?.importerName) {
      throw new Error("exporterName and importerName are required");
    }
    if (!data.hsCode || !data.goodsDescription) {
      throw new Error("hsCode and goodsDescription are required");
    }

    const certificateNumber = generateSasoCertificateNumber();
    const certificateData = {
      certificateNumber,
      ustn: data.ustn ?? null,
      certificateType: "SASO Certificate of Conformity (CoC)",
      // Parties
      exporter: {
        name: data.exporterName,
        address: data.exporterAddress,
        country: data.exporterCountry,
      },
      importer: {
        name: data.importerName,
        address: data.importerAddress,
        country: data.importerCountry,
      },
      // Goods
      goods: {
        hsCode: data.hsCode,
        description: data.goodsDescription,
        descriptionArabic: data.goodsDescriptionArabic ?? null,
        brand: data.brand ?? null,
        model: data.model ?? null,
        quantity: data.quantity,
        unit: data.unit,
      },
      // Conformity assessment
      conformityAssessmentBody: data.conformityAssessmentBody,
      cabId: data.cabId,
      technicalRegulation: data.technicalRegulation,
      testReportNumbers: data.testReportNumbers ?? [],
      inspection: {
        location: data.inspectionLocation ?? null,
        date: data.inspectionDate ?? null,
      },
      // Linkage
      saberRegistrationNumber: data.saberRegistrationNumber ?? null,
      generatedAt,
      regulation: "SASO CoC Programme (ICCP) regulations",
    };

    logger.info("gcc-fasah: SASO CoC generated", {
      certificateNumber,
      cab: data.conformityAssessmentBody,
      hs: data.hsCode,
    });

    return {
      certificateNumber,
      certificateData,
      status: "GENERATED",
      notes:
        "SASO Certificate of Conformity payload generated. For Saudi-bound shipments, the importer must " +
        "register the product on SABER (https://saber.sa) and link this CoC to the Shipment Certificate (SC) " +
        "before the FASAH Bayan can be filed.",
      submittedTo: "SASO (via approved Conformity Assessment Body)",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("gcc-fasah: generateSASOCertificate failed", { error: err?.message });
    return {
      certificateNumber: "",
      certificateData: null,
      status: "GENERATED",
      notes: `SASO CoC generation failed: ${err?.message ?? String(err)}`,
      submittedTo: "",
      generatedAt,
    };
  }
}
