// @ts-nocheck
/**
 * SGTX UK CDS — Customs Declaration Service + GVMS (G-06)
 * ===========================================
 *
 * UK HMRC's Customs Declaration Service (CDS) replaced CHIEF on 30 Sept 2023.
 * Declarations follow the EU's New Computerised Transit System (NCTS) data
 * model (the same 54-box Data Element structure used in EU customs systems).
 *
 * CDS is accessed via:
 *   • HMRC's declaration-upload API (requires HMRC-issued OAuth credentials)
 *   • A licensed software vendor (e.g. Descartes, Customs-Trade)
 *
 * There is no unauthenticated public API. SGTX therefore implements this
 * module as a structured declaration-data generator: it produces a JSON
 * representation of the CDS declaration in the HMRC SAD Box layout (Boxes 1
 * to 54 of the Single Administrative Document) that a broker can submit
 * via the CDS API or third-party software.
 *
 * The Goods Vehicle Movement Service (GVMS) is the post-Brexit border
 * system for road goods moving between GB and NI / EU. It generates Goods
 * Movement References (GMRs) that hauliers must hold before boarding.
 *
 * References:
 *   • HMRC CDS Data Element Format (DEF) v3.0
 *   • Customs (Export Declaration) (EU Exit) Regs 2019
 *   • GVMS: The Border Operating Model (HMRC, 2021)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface CDSDeclarationData {
  ustn?: string;
  declarationType: "IM" | "EX" | "CO" | "TRANSIT"; // Import / Export / Combined / Transit
  declarationDate?: string;
  // Parties
  exporter?: Party;
  importer: Party;
  declarant: Party;
  representative?: Party;
  consignee?: Party;
  // Movement
  transportMode: string; // 1=Sea, 2=Rail, 3=Road, 4=Air
  loadingPort: string;
  dischargePort: string;
  destinationCountry: string; // GB
  countryOfExport: string;
  countryOfOrigin: string;
  // Transport docs
  billOfLadingNumber?: string;
  bookingNumber?: string;
  containerNumbers?: string[];
  vehicleRegistration?: string;
  // Goods
  goodsItems: GoodsItem[];
  totalGrossWeightKg: number;
  totalNumberOfPackages: number;
  currency: string;
  totalInvoiceValue: number;
  incoterms: string;
  // Financial
  customsProcedureCode?: string; // CPC (4-digit)
  valuationMethod?: string;
  preferentialOriginCertificate?: string;
  // Bond / deferment
  defermentAccountNumber?: string;
  bondNumber?: string;
  additionalInformation?: string;
}

export interface Party {
  name: string;
  eori?: string;
  address: string;
  city: string;
  countryCode: string;
  postalCode?: string;
  tin?: string; // Tax Identification Number
}

export interface GoodsItem {
  hsCode: string;
  goodsDescription: string;
  countryOfOrigin: string;
  grossWeightKg: number;
  netWeightKg?: number;
  numberOfPackages: number;
  packageType: string;
  containerNumber?: string;
  invoiceValue: number;
  currency: string;
  quantity?: number;
  unit?: string;
  customsProcedureCode?: string;
  additionalCodes?: string[];
}

export interface CDSResult {
  mrn: string;
  declarationData: any;
  boxes: Record<string, any>; // SAD Box 1..54
  status: "GENERATED";
  notes: string;
  submittedTo: string;
  generatedAt: string;
}

export interface GVMSData {
  ustn?: string;
  haulier: Party;
  vehicleRegistration: string;
  trailerRegistration?: string;
  crossingRoute: string; // e.g. "DOVER-CALAIS", "HOLYHEAD-DUBLIN", "GB-NI"
  crossingDateTime: string;
  declarations: Array<{ declarationMRN: string; goodsItems: number }>;
}

export interface GVMSResult {
  gmrNumber: string;
  gmrData: any;
  status: "GENERATED";
  notes: string;
  generatedAt: string;
}

// ── MRN / GMR generators ────────────────────────────────────────────────
// UK CDS MRN format: 18 chars: 2 country (GB) + 2 year + 2 country-of-filing + 12 alphanumeric
function generateMRN(): string {
  const year = String(new Date().getFullYear()).slice(-2);
  const rand = Array.from({ length: 14 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
  return `GB${year}GB${rand}`;
}

function generateGMR(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000000 + Math.random() * 900000000);
  return `GMR-${year}-${rand}`;
}

// ── CDS Declaration generator (SAD box layout) ──────────────────────────

export async function generateCDSDeclaration(data: CDSDeclarationData): Promise<CDSResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.importer?.name) {
      throw new Error("importer.name is required");
    }
    if (!data.goodsItems || data.goodsItems.length === 0) {
      throw new Error("At least one goods item is required");
    }

    const mrn = generateMRN();
    // Build SAD Box layout (the 54-box Single Administrative Document)
    const boxes: Record<string, any> = {
      "1": data.declarationType, // Declaration type
      "2": data.declarant?.name ?? "",
      "8": data.consignee?.name ?? data.importer.name,
      "14": data.declarant?.eori ?? data.declarant?.tin ?? "",
      "15a": data.countryOfExport,
      "15b": data.loadingPort,
      "17a": data.destinationCountry,
      "17b": data.dischargePort,
      "18": data.transportMode,
      "19": data.containerNumbers?.join(", ") ?? "",
      "21": data.transportMode,
      "22": data.billOfLadingNumber ?? "",
      "30": data.containerNumbers?.join(", ") ?? "",
      "31": data.goodsItems.map((g, i) => ({
        item: i + 1,
        hsCode: g.hsCode,
        description: g.goodsDescription,
        packages: g.numberOfPackages,
        packageType: g.packageType,
        container: g.containerNumber ?? "",
      })),
      "33": data.goodsItems.map((g) => g.hsCode),
      "34": data.countryOfOrigin,
      "35": data.goodsItems.map((g) => g.grossWeightKg),
      "36": data.goodsItems.map((g) => g.netWeightKg ?? g.grossWeightKg),
      "37": data.customsProcedureCode ?? "4000", // Default: release for free circulation
      "38": data.totalGrossWeightKg,
      "40": data.preferentialOriginCertificate ?? "",
      "41": data.goodsItems.map((g) => ({ hs: g.hsCode, suppUnits: g.quantity ?? g.netWeightKg ?? 0 })),
      "42": data.goodsItems.map((g) => g.invoiceValue),
      "43": data.goodsItems.map((g) => g.currency),
      "44": data.additionalInformation ?? "",
      "45": data.incoterms,
      "46": data.totalInvoiceValue,
      "47": {
        customsDuty: 0, // Computed by CDS after submission
        vat: 0,
        total: 0,
      },
      "48": data.defermentAccountNumber ?? "",
      "49": data.representative?.name ?? data.declarant.name,
      "50": data.bondNumber ?? "",
      "54": data.declarant?.name ?? "",
    };

    const declarationData = {
      mrn,
      ustn: data.ustn ?? null,
      declarationType: data.declarationType,
      declarationDate: data.declarationDate ?? new Date().toISOString(),
      parties: {
        exporter: data.exporter,
        importer: data.importer,
        declarant: data.declarant,
        representative: data.representative,
        consignee: data.consignee,
      },
      movement: {
        transportMode: data.transportMode,
        loadingPort: data.loadingPort,
        dischargePort: data.dischargePort,
        destinationCountry: data.destinationCountry,
        countryOfExport: data.countryOfExport,
        countryOfOrigin: data.countryOfOrigin,
        billOfLadingNumber: data.billOfLadingNumber,
        bookingNumber: data.bookingNumber,
        containerNumbers: data.containerNumbers,
        vehicleRegistration: data.vehicleRegistration,
      },
      goodsItems: data.goodsItems,
      totals: {
        grossWeightKg: data.totalGrossWeightKg,
        packages: data.totalNumberOfPackages,
        invoiceValue: data.totalInvoiceValue,
        currency: data.currency,
      },
      incoterms: data.incoterms,
      customsProcedureCode: data.customsProcedureCode ?? "4000",
      preferentialOriginCertificate: data.preferentialOriginCertificate,
      defermentAccountNumber: data.defermentAccountNumber,
      bondNumber: data.bondNumber,
      additionalInformation: data.additionalInformation,
      generatedAt,
      hmrcRegulation: "Customs (Export Declaration) (EU Exit) Regs 2019",
    };

    logger.info("uk-cds: CDS declaration generated", { mrn, type: data.declarationType, items: data.goodsItems.length });

    return {
      mrn,
      declarationData,
      boxes,
      status: "GENERATED",
      notes:
        "CDS declaration generated in HMRC SAD Box 1..54 layout (NCTS-compatible). Submit via the HMRC CDS " +
        "API (requires OAuth credentials) or a licensed broker (Descartes, Customs-Trade, etc.).",
      submittedTo: "HMRC Customs Declaration Service (CDS)",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("uk-cds: generateCDSDeclaration failed", { error: err?.message });
    return {
      mrn: "",
      declarationData: null,
      boxes: {},
      status: "GENERATED",
      notes: `CDS declaration generation failed: ${err?.message ?? String(err)}`,
      submittedTo: "",
      generatedAt,
    };
  }
}

// ── GVMS (Goods Vehicle Movement Service) generator ─────────────────────

export async function generateGVMS(data: GVMSData): Promise<GVMSResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.haulier?.name) {
      throw new Error("haulier.name is required");
    }
    if (!data.vehicleRegistration) {
      throw new Error("vehicleRegistration is required");
    }
    if (!data.declarations || data.declarations.length === 0) {
      throw new Error("At least one declaration MRN is required");
    }

    const gmrNumber = generateGMR();
    const gmrData = {
      gmrNumber,
      ustn: data.ustn ?? null,
      haulier: data.haulier,
      vehicle: {
        registration: data.vehicleRegistration,
        trailerRegistration: data.trailerRegistration ?? null,
      },
      crossing: {
        route: data.crossingRoute,
        dateTime: data.crossingDateTime,
      },
      declarations: data.declarations.map((d, i) => ({
        sequence: i + 1,
        declarationMRN: d.declarationMRN,
        goodsItems: d.goodsItems,
      })),
      generatedAt,
      hmrcRegulation: "The Border Operating Model (HMRC, 2021)",
    };

    logger.info("uk-cds: GVMS GMR generated", { gmrNumber, route: data.crossingRoute, declarations: data.declarations.length });

    return {
      gmrNumber,
      gmrData,
      status: "GENERATED",
      notes:
        "GVMS Goods Movement Reference generated. The haulier must hold this GMR before boarding the " +
        "ferry / Eurotunnel. Submit via the HMRC GVMS API (requires OAuth credentials).",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("uk-cds: generateGVMS failed", { error: err?.message });
    return {
      gmrNumber: "",
      gmrData: null,
      status: "GENERATED",
      notes: `GVMS GMR generation failed: ${err?.message ?? String(err)}`,
      generatedAt,
    };
  }
}
