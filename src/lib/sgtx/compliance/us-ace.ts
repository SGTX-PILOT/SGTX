// @ts-nocheck
/**
 * SGTX US ACE — Automated Commercial Environment (G-05)
 * ===========================================
 *
 * ACE is the US CBP's single-window customs system. Filers submit:
 *
 *   • Importer Security Filing (ISF, "10+2") — must be filed no later than
 *     24 hours before cargo is laden on the vessel at the foreign port.
 *   • CBP Form 3461 — Entry / Immediate Delivery (release request).
 *   • CBP Form 7501 — Entry Summary (duty payment + reconciliation), due
 *     within 10 working days of release.
 *
 * ACE is accessed via the Automated Broker Interface (ABI) — a CBP-issued
 * mainframe interface requiring an ABI software vendor licence + SCAC.
 * There is NO public REST API. SGTX therefore implements this module as a
 * structured form-data generator: it produces valid JSON representations of
 * each CBP form (in the field layout published in the CBP 7501 instructions)
 * that a licensed broker can submit via ACE ABI.
 *
 * References:
 *   • 19 CFR 141 / 142 / 143
 *   • CBP Form 3461 (10-01-21) instructions
 *   • CBP Form 7501 (10-01-21) instructions
 *   • CBP ISF 10+2 Rule (19 CFR 149)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface ISFImporter {
  name: string;
  ein?: string; // IRS number or CBP-assigned number
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ISFSeller {
  name: string;
  address: string;
  country: string;
}

// Same shape as ISFSeller — duplicated as a type alias to avoid the empty-
// interface rule while keeping the semantic naming clear at call sites.
export type ISFBuyer = ISFSeller;

export interface ISFContainer {
  containerNumber: string;
  billOfLadingNumber: string;
}

export interface ISFGoodsItem {
  hsCode: string; // 6-digit minimum, 10-digit preferred
  countryOfOrigin: string;
  goodsDescription: string;
}

export interface ISFData {
  ustn?: string;
  importer: ISFImporter;
  seller?: ISFSeller;
  buyer?: ISFBuyer;
  consignee?: ISFImporter;
  carrier: string; // SCAC code
  vesselName?: string;
  voyageNumber?: string;
  foreignPort: string; // UN/LOCODE
  usPort: string; // UN/LOCODE
  estimatedArrivalDate: string; // ETA at first US port
  billOfLadingNumber: string;
  bookingNumber?: string;
  containers: ISFContainer[];
  goodsItems: ISFGoodsItem[];
  manufacturerSupplier?: ISFSeller;
  stuffer?: ISFSeller;
}

export interface ISFResult {
  isfNumber: string;
  formData: any;
  status: "GENERATED";
  notes: string;
  filingDeadline: string;
  generatedAt: string;
}

export interface CBPFormResult {
  formType: "CBP_3461" | "CBP_7501";
  formNumber: string;
  formData: any;
  status: "GENERATED";
  notes: string;
  filingDeadline: string;
  generatedAt: string;
}

// ── ID generators ───────────────────────────────────────────────────────

function generateIsfNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000000000 + Math.random() * 9000000000);
  return `ISF-${year}-${rand}`;
}

function generateEntryNumber(): string {
  // CBP entry number format: XXX-NNNNNNN-N (3-char filer code + 7-digit + check digit)
  const filer = "SGX";
  const num = Math.floor(1000000 + Math.random() * 9000000);
  const check = Math.floor(Math.random() * 10);
  return `${filer}-${num}-${check}`;
}

// ── ISF (10+2) generator ────────────────────────────────────────────────

export async function generateISF(data: ISFData): Promise<ISFResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.importer?.name) {
      throw new Error("importer.name is required");
    }
    if (!data.containers || data.containers.length === 0) {
      throw new Error("At least one container is required");
    }

    const isfNumber = generateIsfNumber();
    const formData = {
      // ISF-10 (importer elements)
      isfNumber,
      isfVersion: "10+2",
      importerOfRecord: data.importer,
      consignee: data.consignee ?? data.importer,
      seller: data.seller ?? null,
      buyer: data.buyer ?? null,
      manufacturerSupplier: data.manufacturerSupplier ?? data.seller ?? null,
      shipToParty: data.consignee ?? data.importer,
      countryOfOrigin: data.goodsItems[0]?.countryOfOrigin ?? "",
      // ISF-2 (carrier elements)
      carrierSCAC: data.carrier,
      vesselName: data.vesselName ?? "",
      voyageNumber: data.voyageNumber ?? "",
      foreignPort: data.foreignPort,
      usPort: data.usPort,
      estimatedArrivalDate: data.estimatedArrivalDate,
      // Bill / container linkage
      billOfLadingNumber: data.billOfLadingNumber,
      bookingNumber: data.bookingNumber ?? "",
      containers: data.containers,
      // Goods
      goodsItems: data.goodsItems.map((g) => ({
        hsCode: g.hsCode,
        countryOfOrigin: g.countryOfOrigin,
        goodsDescription: g.goodsDescription,
      })),
      stuffer: data.stuffer ?? null,
      // Reference
      ustn: data.ustn ?? null,
      generatedAt,
      cbpRegulation: "19 CFR 149",
    };

    logger.info("us-ace: ISF generated", {
      isfNumber,
      importer: data.importer.name,
      containers: data.containers.length,
      foreignPort: data.foreignPort,
    });

    return {
      isfNumber,
      formData,
      status: "GENERATED",
      notes:
        "ISF 10+2 payload generated in CBP ABI field layout. Submit via ACE ABI (or a licensed broker " +
        "such as Expeditors, Livingston, FedEx Trade Networks) before the 24-hour pre-lading deadline.",
      filingDeadline:
        "No later than 24 hours before cargo is laden on the vessel at the foreign port (19 CFR 149.5).",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("us-ace: generateISF failed", { error: err?.message });
    return {
      isfNumber: "",
      formData: null,
      status: "GENERATED",
      notes: `ISF generation failed: ${err?.message ?? String(err)}`,
      filingDeadline: "",
      generatedAt,
    };
  }
}

// ── CBP Form 3461 (Entry / Immediate Delivery) ──────────────────────────

export async function generateCBP3461(data: any): Promise<CBPFormResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.importer?.name) {
      throw new Error("importer.name is required");
    }
    const entryNumber = generateEntryNumber();
    const formData = {
      formType: "CBP 3461",
      formTitle: "Entry / Immediate Delivery",
      entryNumber,
      entryType: data.entryType ?? "01 (Consumption Entry)",
      portOfEntry: data.usPort ?? "",
      portCode: data.portCode ?? "",
      importingCarrier: data.carrier ?? "",
      modeOfTransport: data.transportMode ?? "VESSEL",
      billOfLadingNumber: data.billOfLadingNumber ?? "",
      masterBillNumber: data.masterBillNumber ?? "",
      entryFiler: data.filer ?? "SGX",
      surety: data.surety ?? "",
      bondNumber: data.bondNumber ?? "",
      importer: data.importer,
      consignee: data.consignee ?? data.importer,
      shipmentReference: data.shipmentReference ?? "",
      foreignPort: data.foreignPort ?? "",
      countryOfExport: data.countryOfExport ?? "",
      countryOfOrigin: data.countryOfOrigin ?? "",
      estimatedArrivalDate: data.estimatedArrivalDate ?? "",
      containers: data.containers ?? [],
      packages: data.packages ?? 0,
      packageType: data.packageType ?? "CT",
      grossWeightKg: data.grossWeightKg ?? 0,
      commercialInvoiceValue: data.commercialInvoiceValue ?? 0,
      currency: data.currency ?? "USD",
      generatedAt,
      cbpRegulation: "19 CFR 142",
    };

    logger.info("us-ace: CBP 3461 generated", { entryNumber, importer: data.importer.name });
    return {
      formType: "CBP_3461",
      formNumber: entryNumber,
      formData,
      status: "GENERATED",
      notes:
        "CBP Form 3461 (Entry / Immediate Delivery) payload generated. Submit via ACE ABI at the " +
        "time of cargo arrival to request release from CBP.",
      filingDeadline: "At time of cargo arrival at the first US port (19 CFR 142.3).",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("us-ace: generateCBP3461 failed", { error: err?.message });
    return {
      formType: "CBP_3461",
      formNumber: "",
      formData: null,
      status: "GENERATED",
      notes: `CBP 3461 generation failed: ${err?.message ?? String(err)}`,
      filingDeadline: "",
      generatedAt,
    };
  }
}

// ── CBP Form 7501 (Entry Summary) ───────────────────────────────────────

export async function generateCBP7501(data: any): Promise<CBPFormResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.importer?.name) {
      throw new Error("importer.name is required");
    }
    const entryNumber = data.entryNumber || generateEntryNumber();
    const formData = {
      formType: "CBP 7501",
      formTitle: "Entry Summary",
      entryNumber,
      entryType: data.entryType ?? "01 (Consumption Entry)",
      portOfEntry: data.usPort ?? "",
      portCode: data.portCode ?? "",
      importingCarrier: data.carrier ?? "",
      modeOfTransport: data.transportMode ?? "VESSEL",
      billOfLadingNumber: data.billOfLadingNumber ?? "",
      entryFiler: data.filer ?? "SGX",
      surety: data.surety ?? "",
      bondNumber: data.bondNumber ?? "",
      importer: data.importer,
      consignee: data.consignee ?? data.importer,
      broker: data.broker ?? "",
      shipmentReference: data.shipmentReference ?? "",
      countryOfExport: data.countryOfExport ?? "",
      countryOfOrigin: data.countryOfOrigin ?? "",
      // Duty / tax lines
      invoiceValue: data.invoiceValue ?? 0,
      enteredValue: data.enteredValue ?? 0,
      currency: data.currency ?? "USD",
      dutyRate: data.dutyRate ?? 0,
      dutyAmount: data.dutyAmount ?? 0,
      mpf: data.mpf ?? 0, // Merchandise Processing Fee
      hmf: data.hmf ?? 0, // Harbor Maintenance Fee (sea only)
      additionalDuties: data.additionalDuties ?? 0,
      totalEstimatedDuty: 0,
      // Line items (HS code, value, duty per line)
      lineItems: (data.lineItems ?? []).map((line: any, i: number) => ({
        lineNumber: i + 1,
        hsCode: line.hsCode,
        goodsDescription: line.goodsDescription,
        countryOfOrigin: line.countryOfOrigin,
        quantity: line.quantity ?? 0,
        unit: line.unit ?? "",
        value: line.value ?? 0,
        dutyRate: line.dutyRate ?? 0,
        dutyAmount: Number(((line.value ?? 0) * (line.dutyRate ?? 0) / 100).toFixed(2)),
      })),
      generatedAt,
      cbpRegulation: "19 CFR 141",
    };

    // Compute total duty
    const lineDuty = formData.lineItems.reduce((sum: number, l: any) => sum + l.dutyAmount, 0);
    formData.totalEstimatedDuty = Number((lineDuty + formData.mpf + formData.hmf + formData.additionalDuties).toFixed(2));

    logger.info("us-ace: CBP 7501 generated", { entryNumber, totalDuty: formData.totalEstimatedDuty });
    return {
      formType: "CBP_7501",
      formNumber: entryNumber,
      formData,
      status: "GENERATED",
      notes:
        "CBP Form 7501 (Entry Summary) payload generated. File via ACE ABI within 10 working days " +
        "of release — must include duty deposit (19 CFR 141.0a).",
      filingDeadline: "Within 10 working days after release of the goods (19 CFR 142.23).",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("us-ace: generateCBP7501 failed", { error: err?.message });
    return {
      formType: "CBP_7501",
      formNumber: "",
      formData: null,
      status: "GENERATED",
      notes: `CBP 7501 generation failed: ${err?.message ?? String(err)}`,
      filingDeadline: "",
      generatedAt,
    };
  }
}
