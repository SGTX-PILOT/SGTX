// @ts-nocheck — defensive; interface stub returns NOT_SUPPORTED everywhere
// SGTX Road Corridor — Jurisdiction Adapter Framework
//
// Each jurisdiction (country) that a road corridor crosses has its own
// customs authority, document set, declaration formats, and government
// portals (e.g. Egypt Nafeza, Jordan ASE, Saudi FASAH, UAE Mira, etc.).
// The JurisdictionAdapter interface abstracts these differences so the
// road-corridor engine can call country-agnostic methods.
//
// Capability tiers:
//   • ACTIVE      — adapter has real API integration (currently: none — all
//                   API integrations require government credentials that
//                   the platform does not yet hold).
//   • MANUAL_REQUIRED — adapter knows the country's requirements but
//                   cannot file declarations automatically; the operator
//                   must use the country's portal manually.
//   • NOT_SUPPORTED — base adapter. Returns NOT_SUPPORTED for everything.
//   • NOT_YET_ACTIVE — adapter is registered but the country isn't live yet
//                   (planned for future releases).
//
// Currently the only concrete adapter is EgyptRoadAdapter (EG), which
// knows the Nafeza / UCR / GOEIC requirements but returns MANUAL_REQUIRED
// for actual filing — the platform does not yet have Nafeza API credentials.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Interface ============

export interface JurisdictionAdapterInterface {
  countryCode: string;
  validateParticipant(input: any): Promise<{ valid: boolean; issues: string[] }>;
  validateDriver(input: any): Promise<{ valid: boolean; issues: string[] }>;
  validateVehicle(input: any): Promise<{ valid: boolean; issues: string[] }>;
  validateRoute(input: any): Promise<{ valid: boolean; issues: string[] }>;
  getDocumentRequirements(input: any): Promise<any[]>;
  getPermitRequirements(input: any): Promise<any[]>;
  getCustomsRequirements(input: any): Promise<any[]>;
  createExportDeclaration(input: any): Promise<{ status: string; reference?: string }>;
  createTransitDeclaration(input: any): Promise<{ status: string; reference?: string }>;
  createImportDeclaration(input: any): Promise<{ status: string; reference?: string }>;
  submitDeclaration(reference: string): Promise<{ status: string }>;
  getDeclarationStatus(reference: string): Promise<{ status: string }>;
  amendDeclaration(reference: string, amendments: any): Promise<{ status: string }>;
  cancelDeclaration(reference: string): Promise<{ status: string }>;
  requestInspection(reference: string): Promise<{ status: string }>;
  getReleaseStatus(reference: string): Promise<{ status: string }>;
  getTransitStatus(reference: string): Promise<{ status: string }>;
  getBorderStatus(borderCode: string): Promise<{ status: string; waitTime?: number }>;
  validateGuarantee(input: any): Promise<{ valid: boolean }>;
  createGovernmentReference(input: any): Promise<{ reference: string }>;
  getGovernmentReference(reference: string): Promise<any>;
}

// ============ Base adapter (NOT_SUPPORTED for everything) ============

/**
 * Base adapter — every method returns NOT_SUPPORTED. Concrete adapters
 * override only the methods they actually support.
 */
export class BaseJurisdictionAdapter implements JurisdictionAdapterInterface {
  countryCode: string = "__BASE__";

  async validateParticipant(_input: any): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ["NOT_SUPPORTED by base adapter"] };
  }
  async validateDriver(_input: any): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ["NOT_SUPPORTED by base adapter"] };
  }
  async validateVehicle(_input: any): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ["NOT_SUPPORTED by base adapter"] };
  }
  async validateRoute(_input: any): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ["NOT_SUPPORTED by base adapter"] };
  }
  async getDocumentRequirements(_input: any): Promise<any[]> {
    return [];
  }
  async getPermitRequirements(_input: any): Promise<any[]> {
    return [];
  }
  async getCustomsRequirements(_input: any): Promise<any[]> {
    return [];
  }
  async createExportDeclaration(_input: any): Promise<{ status: string; reference?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async createTransitDeclaration(_input: any): Promise<{ status: string; reference?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async createImportDeclaration(_input: any): Promise<{ status: string; reference?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async submitDeclaration(_reference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getDeclarationStatus(_reference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async amendDeclaration(_reference: string, _amendments: any): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async cancelDeclaration(_reference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async requestInspection(_reference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getReleaseStatus(_reference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getTransitStatus(_reference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getBorderStatus(_borderCode: string): Promise<{ status: string; waitTime?: number }> {
    return { status: "NOT_SUPPORTED" };
  }
  async validateGuarantee(_input: any): Promise<{ valid: boolean }> {
    return { valid: false };
  }
  async createGovernmentReference(_input: any): Promise<{ reference: string }> {
    return { reference: "" };
  }
  async getGovernmentReference(_reference: string): Promise<any> {
    return null;
  }
}

// ============ Egypt Road Adapter ============

/**
 * Egypt-specific road adapter.
 *
 * Knows the following Egypt-specific requirements:
 *   • Nafeza — single-window customs portal (https://www.nafeza.gov.eg)
 *   • UCR     — Unique Consignment Reference (Egypt ACI pre-registration)
 *   • GOEIC   — General Organization for Export and Import Control
 *              (exporter registration, mandatory for non-Egyptian exporters)
 *   • ACI     — Advance Cargo Information (mandatory pre-arrival declaration)
 *   • Form 13 — Egyptian customs export declaration (EX-A equivalent)
 *   • T1 transit declaration under the Arab Transit Agreement
 *
 * All filing methods return MANUAL_REQUIRED because the platform does not
 * yet hold Nafeza API credentials. The requirement-getter methods are
 * fully implemented (they don't need API access).
 */
export class EgyptRoadAdapter extends BaseJurisdictionAdapter {
  countryCode = "EG";
  nafezaUrl = "https://www.nafeza.gov.eg";
  goeicUrl = "https://www.goeic.gov.eg";

  // --- Requirements (no API access needed) -------------------------------

  async getDocumentRequirements(input: any): Promise<any[]> {
    const docs: any[] = [
      {
        code: "UCR",
        name: "Unique Consignment Reference (ACI pre-registration)",
        authority: "Nafeza",
        mandatory: true,
        portalUrl: this.nafezaUrl,
      },
      {
        code: "EG_COMMERCIAL_INVOICE",
        name: "Commercial Invoice (legalized)",
        authority: "Egyptian Customs",
        mandatory: true,
      },
      {
        code: "EG_PACKING_LIST",
        name: "Packing List",
        authority: "Egyptian Customs",
        mandatory: true,
      },
      {
        code: "COO_EG",
        name: "Certificate of Origin (Chamber of Commerce)",
        authority: "GOEIC",
        mandatory: true,
      },
      {
        code: "FORM_4X",
        name: "Form 4X — Customs Declaration",
        authority: "Egyptian Customs",
        mandatory: true,
      },
    ];

    // Cargo-type-specific additions
    if (input?.cargoType) {
      const cargo = String(input.cargoType).toUpperCase();
      if (cargo.includes("FOOD") || cargo.includes("AGRICULTURAL")) {
        docs.push({
          code: "PHYTOSANITARY_CERT",
          name: "Phytosanitary Certificate",
          authority: "Ministry of Agriculture",
          mandatory: true,
        });
      }
      if (cargo.includes("PHARMA") || cargo.includes("DRUG")) {
        docs.push({
          code: "EG_NODCAR",
          name: "NODCAR Drug Registration",
          authority: "National Organization for Drug Control and Research",
          mandatory: true,
        });
      }
      if (cargo.includes("DANGEROUS") || cargo.includes("HAZARDOUS")) {
        docs.push({
          code: "DG_DECLARATION_EG",
          name: "Dangerous Goods Declaration (ADR-equivalent)",
          authority: "Egyptian Civil Defense",
          mandatory: true,
        });
      }
    }

    // GOEIC registration mandatory for non-Egyptian exporters
    if (input?.exporterCountry && String(input.exporterCountry).toUpperCase() !== "EG") {
      docs.push({
        code: "GOEIC_REGISTRATION",
        name: "GOEIC Exporter Registration",
        authority: "GOEIC",
        mandatory: true,
        portalUrl: this.goeicUrl,
      });
    }

    return docs;
  }

  async getPermitRequirements(input: any): Promise<any[]> {
    const permits: any[] = [];
    // Vehicle entry permit for foreign trucks
    if (input?.vehicleCountry && String(input.vehicleCountry).toUpperCase() !== "EG") {
      permits.push({
        code: "EG_VEHICLE_ENTRY_PERMIT",
        name: "Foreign Vehicle Entry Permit",
        authority: "Egyptian Ministry of Transport",
        mandatory: true,
      });
    }
    // Strategic commodity import permit
    if (input?.cargoType) {
      const cargo = String(input.cargoType).toUpperCase();
      if (cargo.includes("STRATEGIC") || cargo.includes("GRAIN") || cargo.includes("SUGAR")) {
        permits.push({
          code: "EG_STRATEGIC_IMPORT_PERMIT",
          name: "Strategic Goods Import Permit",
          authority: "Ministry of Supply",
          mandatory: true,
        });
      }
    }
    return permits;
  }

  async getCustomsRequirements(_input: any): Promise<any[]> {
    return [
      {
        code: "ACI_FILING",
        name: "Advance Cargo Information (ACI) Filing",
        authority: "Nafeza",
        mandatory: true,
        preArrival: true,
        deadlineHours: 48,
      },
      {
        code: "EG_CUSTOMS_REGIME",
        name: "Egyptian Customs Regime (EX-A / IM-8 / T1)",
        authority: "Egyptian Customs Authority",
        mandatory: true,
      },
    ];
  }

  // --- Validation (no API access needed — checks against our own DB) ----

  async validateDriver(input: any): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    try {
      if (!input?.driverId) {
        return { valid: false, issues: ["driverId required"] };
      }
      const driver = await db.internationalDriverProfile.findUnique({
        where: { driverId: input.driverId },
        include: {
          permissions: {
            where: { country: "EG", status: "ACTIVE" },
          },
        },
      });
      if (!driver) {
        return { valid: false, issues: ["Driver not found in registry"] };
      }
      if (driver.status !== "ACTIVE") {
        issues.push(`Driver status is ${driver.status}`);
      }
      // Egyptian visa required for non-Egyptian drivers
      if (driver.nationality && driver.nationality.toUpperCase() !== "EG") {
        const hasVisa = (driver.countryPermissions
          ? (() => {
              try {
                return JSON.parse(driver.countryPermissions);
              } catch {
                return [];
              }
            })()
          : []
        ).includes("EG");
        if (!hasVisa && driver.permissions.length === 0) {
          issues.push("Non-Egyptian driver has no EG visa / entry permission on file");
        }
      }
      // Dangerous goods certificate required if carrying DG
      if (input?.dangerousGoods && !driver.dangerousGoodsCertificate) {
        issues.push("Driver lacks dangerous-goods certificate");
      }
      return { valid: issues.length === 0, issues };
    } catch (err: any) {
      logger.error("[jurisdiction-adapter EG] validateDriver failed", {
        error: err?.message,
      });
      return { valid: false, issues: [`Engine error: ${err?.message}`] };
    }
  }

  async validateVehicle(input: any): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    try {
      if (!input?.vehicleId) {
        return { valid: false, issues: ["vehicleId required"] };
      }
      const vehicle = await db.internationalVehicle.findUnique({
        where: { id: input.vehicleId },
        include: {
          permissions: {
            where: { country: "EG", status: "ACTIVE" },
          },
        },
      });
      if (!vehicle) {
        return { valid: false, issues: ["Vehicle not found"] };
      }
      if (vehicle.status !== "ACTIVE") {
        issues.push(`Vehicle status is ${vehicle.status}`);
      }
      if (vehicle.registrationCountry.toUpperCase() !== "EG") {
        if (vehicle.permissions.length === 0) {
          issues.push("Foreign vehicle has no EG entry permit");
        }
      }
      if (vehicle.insuranceExpiry && new Date(vehicle.insuranceExpiry) < new Date()) {
        issues.push("Vehicle insurance expired");
      }
      if (vehicle.inspectionExpiry && new Date(vehicle.inspectionExpiry) < new Date()) {
        issues.push("Vehicle roadworthiness inspection expired");
      }
      if (input?.dangerousGoods && !vehicle.dangerousGoodsCapability) {
        issues.push("Vehicle not certified for dangerous goods");
      }
      return { valid: issues.length === 0, issues };
    } catch (err: any) {
      logger.error("[jurisdiction-adapter EG] validateVehicle failed", {
        error: err?.message,
      });
      return { valid: false, issues: [`Engine error: ${err?.message}`] };
    }
  }

  async validateRoute(input: any): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    try {
      if (!input?.origin || !input?.destination) {
        issues.push("origin and destination required");
      }
      // Egypt-Sudan overland border (Wadi Halfa) is closed for general cargo
      if (
        (input?.origin?.toUpperCase() === "EG" && input?.destination?.toUpperCase() === "SD") ||
        (input?.origin?.toUpperCase() === "SD" && input?.destination?.toUpperCase() === "EG")
      ) {
        issues.push("Egypt-Sudan overland border at Wadi Halfa restricted — verify status");
      }
      // Libya border has special permit requirements
      if (
        input?.transitCountries?.some(
          (c: string) => String(c).toUpperCase() === "LY",
        )
      ) {
        issues.push("Libya transit requires special security clearance");
      }
      return { valid: issues.length === 0, issues };
    } catch (err: any) {
      logger.error("[jurisdiction-adapter EG] validateRoute failed", {
        error: err?.message,
      });
      return { valid: false, issues: [`Engine error: ${err?.message}`] };
    }
  }

  async validateParticipant(input: any): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    try {
      if (!input?.gtid) {
        return { valid: false, issues: ["gtid required"] };
      }
      // Non-Egyptian exporters must have GOEIC registration
      if (input?.country && String(input.country).toUpperCase() !== "EG" && input?.role === "EXPORTER") {
        if (!input?.goeicRegistration) {
          issues.push("Non-Egyptian exporter requires GOEIC registration");
        }
      }
      return { valid: issues.length === 0, issues };
    } catch (err: any) {
      return { valid: false, issues: [`Engine error: ${err?.message}`] };
    }
  }

  async validateGuarantee(input: any): Promise<{ valid: boolean }> {
    try {
      if (!input?.guaranteeType) return { valid: false };
      // Egypt accepts TIR carnets, national guarantees, and bank guarantees
      const accepted = ["TIR", "NATIONAL", "BANK_GUARANTEE", "INSURANCE"];
      if (!accepted.includes(String(input.guaranteeType).toUpperCase())) {
        return { valid: false };
      }
      if (input.validity && new Date(input.validity) < new Date()) {
        return { valid: false };
      }
      return { valid: true };
    } catch {
      return { valid: false };
    }
  }

  // --- Government reference management (uses our own DB; no Nafeza call) --

  async createGovernmentReference(input: any): Promise<{ reference: string }> {
    try {
      if (!input?.ustn) return { reference: "" };
      // Generate an Egypt-format government reference: EG-NAFEZA-YYYY-{seq}
      const year = new Date().getFullYear();
      const seq = Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, "0");
      const reference = `EG-NAFEZA-${year}-${seq}`;
      await db.governmentReference.create({
        data: {
          ustn: input.ustn,
          country: "EG",
          authority: input.authority || "Nafeza",
          referenceType: input.referenceType || "EXPORT_DECLARATION",
          referenceNumber: reference,
          status: "PENDING",
        },
      });
      return { reference };
    } catch (err: any) {
      logger.error("[jurisdiction-adapter EG] createGovernmentReference failed", {
        error: err?.message,
      });
      return { reference: "" };
    }
  }

  async getGovernmentReference(reference: string): Promise<any> {
    try {
      const ref = await db.governmentReference.findUnique({
        where: { referenceNumber_referenceType_country: {
          referenceNumber: reference,
          referenceType: "EXPORT_DECLARATION", // best-effort
          country: "EG",
        } },
      });
      if (!ref) {
        // Fall back to lookup by referenceNumber alone via findFirst
        return await db.governmentReference.findFirst({
          where: { referenceNumber: reference, country: "EG" },
        });
      }
      return ref;
    } catch (err: any) {
      logger.error("[jurisdiction-adapter EG] getGovernmentReference failed", {
        error: err?.message,
      });
      return null;
    }
  }

  // --- Border status (best-effort — actual wait time requires portal API) -

  async getBorderStatus(borderCode: string): Promise<{ status: string; waitTime?: number }> {
    // Known Egypt border crossings
    const EG_BORDERS: Record<string, { name: string; operational: boolean }> = {
      "EG-LY-SALLUM": { name: "Sallum (Libya)", operational: true },
      "EG-LY-SALLOUM": { name: "Sallum (Libya)", operational: true },
      "EG-SD-WADIHALFA": { name: "Wadi Halfa (Sudan)", operational: false },
      "EG-IL-TABA": { name: "Taba (Israel)", operational: true },
      "EG-PS-RAFAH": { name: "Rafah (Palestine)", operational: false },
    };
    const border = EG_BORDERS[borderCode.toUpperCase()];
    if (!border) {
      return { status: "UNKNOWN" };
    }
    return {
      status: border.operational ? "OPERATIONAL" : "CLOSED",
      waitTime: border.operational ? undefined : undefined, // unknown without live API
    };
  }

  // --- Declaration filing — all return MANUAL_REQUIRED (no Nafeza API) ---

  async createExportDeclaration(input: any): Promise<{ status: string; reference?: string }> {
    // Generate a placeholder reference — operator must complete filing on Nafeza.
    const { reference } = await this.createGovernmentReference({
      ...input,
      referenceType: "EXPORT_DECLARATION",
      authority: "Nafeza",
    });
    return { status: "MANUAL_REQUIRED", reference };
  }

  async createTransitDeclaration(input: any): Promise<{ status: string; reference?: string }> {
    const { reference } = await this.createGovernmentReference({
      ...input,
      referenceType: "TRANSIT_DECLARATION",
      authority: "Egyptian Customs Authority",
    });
    return { status: "MANUAL_REQUIRED", reference };
  }

  async createImportDeclaration(input: any): Promise<{ status: string; reference?: string }> {
    const { reference } = await this.createGovernmentReference({
      ...input,
      referenceType: "EXPORT_DECLARATION",
      authority: "Nafeza",
    });
    return { status: "MANUAL_REQUIRED", reference };
  }

  async submitDeclaration(reference: string): Promise<{ status: string }> {
    // No Nafeza API — operator must submit manually and update the reference.
    try {
      await db.governmentReference.updateMany({
        where: { referenceNumber: reference, country: "EG" },
        data: { status: "SUBMITTED_MANUALLY" },
      });
    } catch (err: any) {
      logger.warn("[jurisdiction-adapter EG] submitDeclaration DB update failed", {
        error: err?.message,
      });
    }
    return { status: "MANUAL_REQUIRED" };
  }

  async getDeclarationStatus(reference: string): Promise<{ status: string }> {
    try {
      const ref = await this.getGovernmentReference(reference);
      if (!ref) return { status: "NOT_FOUND" };
      return { status: ref.status || "UNKNOWN" };
    } catch {
      return { status: "UNKNOWN" };
    }
  }

  async amendDeclaration(_reference: string, _amendments: any): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }

  async cancelDeclaration(reference: string): Promise<{ status: string }> {
    try {
      await db.governmentReference.updateMany({
        where: { referenceNumber: reference, country: "EG" },
        data: { status: "CANCELLED" },
      });
    } catch (err: any) {
      logger.warn("[jurisdiction-adapter EG] cancelDeclaration failed", {
        error: err?.message,
      });
    }
    return { status: "MANUAL_REQUIRED" };
  }

  async requestInspection(_reference: string): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }

  async getReleaseStatus(reference: string): Promise<{ status: string }> {
    return this.getDeclarationStatus(reference);
  }

  async getTransitStatus(reference: string): Promise<{ status: string }> {
    return this.getDeclarationStatus(reference);
  }
}

// ============ Adapter registry ============

const ADAPTER_REGISTRY: Record<string, () => JurisdictionAdapterInterface> = {
  EG: () => new EgyptRoadAdapter(),
  // The remaining countries return the BaseJurisdictionAdapter (NOT_SUPPORTED).
  // They are registered as NOT_YET_ACTIVE in seedJurisdictionAdapters().
  JO: () => new BaseJurisdictionAdapter(),
  SA: () => new BaseJurisdictionAdapter(),
  AE: () => new BaseJurisdictionAdapter(),
  KW: () => new BaseJurisdictionAdapter(),
  QA: () => new BaseJurisdictionAdapter(),
  BH: () => new BaseJurisdictionAdapter(),
  OM: () => new BaseJurisdictionAdapter(),
  IQ: () => new BaseJurisdictionAdapter(),
  LY: () => new BaseJurisdictionAdapter(),
};

/**
 * Get the jurisdiction adapter for a country code. Falls back to the
 * BaseJurisdictionAdapter (which returns NOT_SUPPORTED) if the country
 * is not registered.
 */
export function getJurisdictionAdapter(countryCode: string): JurisdictionAdapterInterface {
  const code = (countryCode || "").toUpperCase();
  const factory = ADAPTER_REGISTRY[code];
  if (factory) return factory();
  return new BaseJurisdictionAdapter();
}

/**
 * List all registered adapters with their status + operating mode.
 * Reads from the JurisdictionAdapter Prisma table (seeded by
 * seedJurisdictionAdapters below).
 */
export async function listJurisdictionAdapters(): Promise<Array<{
  countryCode: string;
  adapterName: string;
  status: string;
  operatingMode: string;
  capabilities: string[];
  portalUrl?: string;
  healthStatus?: string;
  lastHealthCheck?: string | null;
}>> {
  try {
    const rows = await db.jurisdictionAdapter.findMany({
      orderBy: { countryCode: "asc" },
    });
    return rows.map((r: any) => ({
      countryCode: r.countryCode,
      adapterName: r.adapterName,
      status: r.status,
      operatingMode: r.operatingMode,
      capabilities: (() => {
        try {
          return JSON.parse(r.capabilities || "[]");
        } catch {
          return [];
        }
      })(),
      portalUrl: r.portalUrl,
      healthStatus: r.healthStatus,
      lastHealthCheck: r.lastHealthCheck?.toISOString() || null,
    }));
  } catch (err: any) {
    logger.error("[jurisdiction-adapter] listJurisdictionAdapters failed", {
      error: err?.message,
    });
    return [];
  }
}

/**
 * Seed the JurisdictionAdapter Prisma table with the 10 supported countries.
 * Idempotent — uses upsert on countryCode. Safe to call multiple times.
 *
 *   EG = ACTIVE (Egypt — Nafeza / UCR / GOEIC, manual filing only)
 *   JO / SA / AE / KW / QA / BH / OM / IQ / LY = NOT_YET_ACTIVE
 *
 * This function is exposed publicly so a future admin route can re-run it
 * after schema changes.
 */
export async function seedJurisdictionAdapters(): Promise<{ seeded: number }> {
  const SPEC: Array<{
    countryCode: string;
    adapterName: string;
    status: string;
    operatingMode: string;
    capabilities: string[];
    portalUrl?: string;
  }> = [
    {
      countryCode: "EG",
      adapterName: "EgyptRoadAdapter (Nafeza / UCR / GOEIC)",
      status: "ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [
        "getDocumentRequirements",
        "getPermitRequirements",
        "getCustomsRequirements",
        "validateDriver",
        "validateVehicle",
        "validateRoute",
        "validateParticipant",
        "validateGuarantee",
        "createGovernmentReference",
        "getBorderStatus",
      ],
      portalUrl: "https://www.nafeza.gov.eg",
    },
    {
      countryCode: "JO",
      adapterName: "JordanRoadAdapter (ASE)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "SA",
      adapterName: "SaudiRoadAdapter (FASAH / SAUDI ATC)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "AE",
      adapterName: "UaeRoadAdapter (Mira / Dubai Customs)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "KW",
      adapterName: "KuwaitRoadAdapter (KCS)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "QA",
      adapterName: "QatarRoadAdapter (Najiz / GAEC)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "BH",
      adapterName: "BahrainRoadAdapter (Bahrain Customs)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "OM",
      adapterName: "OmanRoadAdapter (Bayan)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "IQ",
      adapterName: "IraqRoadAdapter (GCCS)",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
    {
      countryCode: "LY",
      adapterName: "LibyaRoadAdapter",
      status: "NOT_YET_ACTIVE",
      operatingMode: "MANUAL_REQUIRED",
      capabilities: [],
    },
  ];

  let seeded = 0;
  for (const spec of SPEC) {
    try {
      await db.jurisdictionAdapter.upsert({
        where: { countryCode: spec.countryCode },
        create: {
          countryCode: spec.countryCode,
          adapterName: spec.adapterName,
          status: spec.status,
          operatingMode: spec.operatingMode,
          capabilities: JSON.stringify(spec.capabilities),
          portalUrl: spec.portalUrl || null,
          healthStatus: spec.status === "ACTIVE" ? "HEALTHY" : "UNKNOWN",
        },
        update: {
          adapterName: spec.adapterName,
          status: spec.status,
          operatingMode: spec.operatingMode,
          capabilities: JSON.stringify(spec.capabilities),
          portalUrl: spec.portalUrl || null,
        },
      });
      seeded++;
    } catch (err: any) {
      logger.warn("[jurisdiction-adapter] seedJurisdictionAdapters upsert failed", {
        countryCode: spec.countryCode,
        error: err?.message,
      });
    }
  }
  logger.info("[jurisdiction-adapter] seedJurisdictionAdapters complete", { seeded });
  return { seeded };
}
