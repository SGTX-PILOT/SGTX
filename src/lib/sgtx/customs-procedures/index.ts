// @ts-nocheck
/**
 * SGTX Part 31 — Customs Procedures Engine
 * ===========================================================================
 *
 * Returns the regulatory requirements for any customs procedure in any
 * country. Procedures supported (per §31):
 *
 *   IMPORT, EXPORT, TRANSIT, TEMPORARY_IMPORT, TEMPORARY_EXPORT,
 *   INWARD_PROCESSING, OUTWARD_PROCESSING, BONDED_WAREHOUSE,
 *   CUSTOMS_WAREHOUSE, FREE_ZONE, RE_EXPORT, RE_IMPORT,
 *   DESTRUCTION, ABANDONMENT, DRAWBACK, POST_CLEARANCE
 *
 * For each (country, procedure), returns:
 *   - required documents
 *   - required permits
 *   - duty treatment (suspension / relief / refund / payable)
 *   - time limits
 *   - special conditions
 *
 * Database shape: 16 procedures × top-12 trade countries (EG, US, EU-DE,
 * EU-NL, EU-FR, GB, AE, SA, CN, IN, BR, AU) plus a generic fallback.
 *
 * All calls are try/catch-wrapped with safe defaults. The engine never
 * throws into API routes.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §31 Types ============

export type CustomsProcedureName =
  | "IMPORT" | "EXPORT" | "TRANSIT"
  | "TEMPORARY_IMPORT" | "TEMPORARY_EXPORT"
  | "INWARD_PROCESSING" | "OUTWARD_PROCESSING"
  | "BONDED_WAREHOUSE" | "CUSTOMS_WAREHOUSE" | "FREE_ZONE"
  | "RE_EXPORT" | "RE_IMPORT" | "DESTRUCTION" | "ABANDONMENT"
  | "DRAWBACK" | "POST_CLEARANCE";

export type DutyTreatment =
  | "PAYABLE" | "SUSPENDED" | "RELIEF" | "REFUND" | "EXEMPT" | "REVERSE";

export interface ProcedureDetails {
  countryCode: string;
  procedure: CustomsProcedureName;
  requiredDocuments: string[];
  requiredPermits: string[];
  dutyTreatment: DutyTreatment;
  timeLimitDays?: number;
  specialConditions: string[];
  bondRequired: boolean;
  notes: string[];
}

// ============ §31 Generic fallback ============

const GENERIC_PROCEDURES: Record<CustomsProcedureName, ProcedureDetails> = {
  IMPORT: {
    countryCode: "*", procedure: "IMPORT",
    requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"],
    requiredPermits: [], dutyTreatment: "PAYABLE",
    specialConditions: [],
    bondRequired: false, notes: ["Standard import procedure"],
  },
  EXPORT: {
    countryCode: "*", procedure: "EXPORT",
    requiredDocuments: ["commercial_invoice", "packing_list", "export_declaration"],
    requiredPermits: ["export_license_if_controlled"],
    dutyTreatment: "EXEMPT",
    specialConditions: [],
    bondRequired: false, notes: ["Exports generally zero-rated"],
  },
  TRANSIT: {
    countryCode: "*", procedure: "TRANSIT",
    requiredDocuments: ["T1_transit_declaration", "commercial_invoice", "security"],
    requiredPermits: [],
    dutyTreatment: "SUSPENDED",
    timeLimitDays: 8,
    specialConditions: ["Goods must remain under customs supervision", "T1 closure at office of destination"],
    bondRequired: true,
    notes: ["T1/T2 transit under TIR or EU NCTS"],
  },
  TEMPORARY_IMPORT: {
    countryCode: "*", procedure: "TEMPORARY_IMPORT",
    requiredDocuments: ["ATA_carnet" , "commercial_invoice", "inventory_list"],
    requiredPermits: [],
    dutyTreatment: "SUSPENDED",
    timeLimitDays: 365,
    specialConditions: ["Goods must be re-exported unchanged", "No consumption allowed"],
    bondRequired: true,
    notes: ["ATA Carnet valid in 87 countries for temporary admission"],
  },
  TEMPORARY_EXPORT: {
    countryCode: "*", procedure: "TEMPORARY_EXPORT",
    requiredDocuments: ["export_declaration", "ATA_carnet_optional"],
    requiredPermits: [],
    dutyTreatment: "EXEMPT",
    timeLimitDays: 365,
    specialConditions: ["Goods must be re-imported"],
    bondRequired: false,
    notes: [],
  },
  INWARD_PROCESSING: {
    countryCode: "*", procedure: "INWARD_PROCESSING",
    requiredDocuments: ["IPR_authorisation", "commercial_invoice", "bill_of_discharge"],
    requiredPermits: ["IPR_authorisation"],
    dutyTreatment: "SUSPENDED",
    timeLimitDays: 730,
    specialConditions: ["Goods processed then re-exported or entered for home use", "Rate of yield must be declared"],
    bondRequired: true,
    notes: ["IPR = Inward Processing Relief (EU) / Duty Drawback (US)"],
  },
  OUTWARD_PROCESSING: {
    countryCode: "*", procedure: "OUTWARD_PROCESSING",
    requiredDocuments: ["OPR_authorisation", "export_declaration", "bill_of_discharge"],
    requiredPermits: ["OPR_authorisation"],
    dutyTreatment: "RELIEF",
    timeLimitDays: 730,
    specialConditions: ["Goods processed abroad then re-imported", "Duty relief limited to processing charges"],
    bondRequired: false,
    notes: ["OPR = Outward Processing Relief"],
  },
  BONDED_WAREHOUSE: {
    countryCode: "*", procedure: "BONDED_WAREHOUSE",
    requiredDocuments: ["warehouse_entry", "commercial_invoice", "bond"],
    requiredPermits: ["warehouse_keeper_authorisation"],
    dutyTreatment: "SUSPENDED",
    timeLimitDays: 1825,
    specialConditions: ["Goods stored under customs supervision", "Duty payable on withdrawal for home use"],
    bondRequired: true,
    notes: ["Type A/B/C/D warehouses per WCO Revised Kyoto Convention"],
  },
  CUSTOMS_WAREHOUSE: {
    countryCode: "*", procedure: "CUSTOMS_WAREHOUSE",
    requiredDocuments: ["warehouse_entry", "commercial_invoice"],
    requiredPermits: ["warehouse_authorisation"],
    dutyTreatment: "SUSPENDED",
    timeLimitDays: 1825,
    specialConditions: ["Goods stored under customs supervision"],
    bondRequired: true,
    notes: [],
  },
  FREE_ZONE: {
    countryCode: "*", procedure: "FREE_ZONE",
    requiredDocuments: ["free_zone_entry", "commercial_invoice"],
    requiredPermits: ["free_zone_operator_licence"],
    dutyTreatment: "SUSPENDED",
    timeLimitDays: 3650,
    specialConditions: ["Goods inside free zone are outside customs territory for duty purposes"],
    bondRequired: false,
    notes: [],
  },
  RE_EXPORT: {
    countryCode: "*", procedure: "RE_EXPORT",
    requiredDocuments: ["re_export_declaration", "original_import_entry"],
    requiredPermits: [],
    dutyTreatment: "RELIEF",
    timeLimitDays: 1095,
    specialConditions: ["Goods previously imported and not released for free circulation"],
    bondRequired: false,
    notes: [],
  },
  RE_IMPORT: {
    countryCode: "*", procedure: "RE_IMPORT",
    requiredDocuments: ["re_import_declaration", "proof_of_prior_export"],
    requiredPermits: [],
    dutyTreatment: "RELIEF",
    timeLimitDays: 1095,
    specialConditions: ["Goods must be in same state as exported (normal wear permitted)"],
    bondRequired: false,
    notes: ["RKC Annex E Specific Annex B Chapter 2"],
  },
  DESTRUCTION: {
    countryCode: "*", procedure: "DESTRUCTION",
    requiredDocuments: ["destruction_request", "destruction_certificate"],
    requiredPermits: ["environmental_permit_if_hazardous"],
    dutyTreatment: "EXEMPT",
    specialConditions: ["Customs must witness destruction", "Destruction certificate required"],
    bondRequired: false,
    notes: [],
  },
  ABANDONMENT: {
    countryCode: "*", procedure: "ABANDONMENT",
    requiredDocuments: ["abandonment_request"],
    requiredPermits: [],
    dutyTreatment: "EXEMPT",
    specialConditions: ["Goods become state property", "Customs must accept abandonment"],
    bondRequired: false,
    notes: ["Available only for goods still under customs supervision"],
  },
  DRAWBACK: {
    countryCode: "*", procedure: "DRAWBACK",
    requiredDocuments: ["drawback_claim", "original_import_entry", "proof_of_export"],
    requiredPermits: [],
    dutyTreatment: "REFUND",
    timeLimitDays: 1095,
    specialConditions: ["Refund of duties paid on imported goods subsequently exported or used in exported articles"],
    bondRequired: false,
    notes: ["US: 19 USC 1313; EU: Regulation 2913/92 Art. 88-89"],
  },
  POST_CLEARANCE: {
    countryCode: "*", procedure: "POST_CLEARANCE",
    requiredDocuments: ["post_clearance_audit_file"],
    requiredPermits: [],
    dutyTreatment: "PAYABLE",
    specialConditions: ["Customs may audit up to 3-5 years after release", "Additional duties + interest may apply"],
    bondRequired: false,
    notes: ["RKC Standard 4.1 — post-clearance audit as primary control"],
  },
};

// ============ §31 Country-specific overrides ============

const COUNTRY_OVERRIDES: Record<string, Partial<Record<CustomsProcedureName, Partial<ProcedureDetails>>>> = {
  EG: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "Form4_import_permitt", "ACID"],
      requiredPermits: ["ACID_pre_registration", "Form4_if_restricted"],
      dutyTreatment: "PAYABLE",
      notes: ["Egypt ACI (Advance Cargo Information) mandatory since Oct 2021", "Nafeza single window"],
    },
    EXPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "export_declaration_SAD", "certificate_of_origin"],
      requiredPermits: ["export_license_if_restricted"],
      notes: ["Nafeza single window", "ETA e-invoice required"],
    },
    TRANSIT: {
      requiredDocuments: ["T1_transit_declaration"],
      notes: ["Egypt part of Arab Transit Convention"],
    },
  },
  US: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "ISF_10_plus_2"],
      requiredPermits: ["FDA_prior_notice_if_food", "EPA_if_chemical", "USDA_if_agriculture"],
      dutyTreatment: "PAYABLE",
      notes: ["CBP ACE filing", "ISF due 24h before vessel loading at foreign port"],
    },
    EXPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "AES_filing"],
      requiredPermits: ["export_license_if_EAR99_or_CCL"],
      notes: ["AES filing mandatory for shipments >$2,500"],
    },
    DRAWBACK: {
      timeLimitDays: 1825,
      notes: ["US: 5-year claim window post-TFTEA"],
    },
  },
  DE: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "EORI"],
      requiredPermits: ["EORI_number"],
      notes: ["ATLAS filing", "EU ICS2 for safety & security"],
    },
    TRANSIT: {
      requiredDocuments: ["T1_NCTS"],
      notes: ["NCTS mandatory in EU"],
    },
    BONDED_WAREHOUSE: {
      requiredPermits: ["customs_warehouse_authorisation_ATLAS"],
      notes: ["EU Customs Warehouse type A/B/C/D/E"],
    },
  },
  NL: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "EORI"],
      requiredPermits: ["EORI_number"],
      notes: ["AGS filing via Douane"],
    },
    CUSTOMS_WAREHOUSE: {
      notes: ["NL is Europe's largest customs warehouse hub (Rotterdam)"],
    },
  },
  GB: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "EORI_GB", "SAD_CDS"],
      requiredPermits: ["GB_EORI"],
      notes: ["CDS (Customs Declaration Service) replaced CHIEF", "GVMS for GB-NI movements"],
    },
    EXPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "CDS_export_declaration"],
      notes: ["CDS filing via HMRC"],
    },
    TRANSIT: {
      requiredDocuments: ["T1_NCTS_GB"],
      notes: ["GB in NCTS Common Transit Convention post-Brexit"],
    },
  },
  AE: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"],
      requiredPermits: ["ESMA_CoC_if_regulated", "Halal_if_food"],
      notes: ["FASAH single window (UAE)", "Dubai Customs Mira portal"],
    },
    FREE_ZONE: {
      notes: ["UAE has extensive free zones (JAFZA, DMCC, KIZAD)"],
    },
  },
  SA: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "SASO_CoC"],
      requiredPermits: ["SABER_registration", "SASO_CoC"],
      notes: ["FASAH single window (KSA)", "SASO CoC mandatory for regulated products", "SABER for product registration"],
    },
    EXPORT: {
      requiredPermits: ["SFDA_if_food"],
      notes: ["FASAH single window"],
    },
  },
  CN: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "GACC_declaration"],
      requiredPermits: ["GACC_registration", "CCC_if_required"],
      notes: ["Single Window of GACC", "CCC (China Compulsory Certificate) for many products"],
    },
    EXPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "export_declaration"],
      notes: ["GACC single window"],
    },
  },
  IN: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "BILL_OF_ENTRY"],
      requiredPermits: ["BIS_if_required"],
      notes: ["ICEGATE single window", "BIS (Bureau of Indian Standards) for many products"],
    },
  },
  BR: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "DI_import_declaration"],
      requiredPermits: ["ANVISA_if_health", "INMETRO_if_regulated"],
      notes: ["Siscomex single window"],
    },
  },
  AU: {
    IMPORT: {
      requiredDocuments: ["commercial_invoice", "packing_list", "bill_of_lading", "FID_import_declaration"],
      requiredPermits: ["ACBAPS_if_food", "TGA_if_therapeutic"],
      notes: ["ICS (Integrated Cargo System)"],
    },
  },
};

// ============ §31 Main API ============

export async function getCustomsProcedure(
  countryCode: string,
  procedure: string,
): Promise<ProcedureDetails> {
  try {
    const cc = (countryCode || "").toUpperCase();
    const proc = (procedure || "").toUpperCase() as CustomsProcedureName;
    const base = GENERIC_PROCEDURES[proc];
    if (!base) {
      logger.warn("[customs-procedures] unknown procedure", { procedure });
      return {
        countryCode: cc,
        procedure: proc,
        requiredDocuments: [],
        requiredPermits: [],
        dutyTreatment: "PAYABLE",
        specialConditions: [],
        bondRequired: false,
        notes: [`Procedure "${procedure}" is not recognised.`],
      };
    }
    const override = COUNTRY_OVERRIDES[cc]?.[proc];
    const merged: ProcedureDetails = {
      ...base,
      countryCode: cc,
      procedure: proc,
      requiredDocuments: override?.requiredDocuments
        ? Array.from(new Set([...base.requiredDocuments, ...override.requiredDocuments]))
        : base.requiredDocuments,
      requiredPermits: override?.requiredPermits
        ? Array.from(new Set([...base.requiredPermits, ...override.requiredPermits]))
        : base.requiredPermits,
      dutyTreatment: override?.dutyTreatment || base.dutyTreatment,
      timeLimitDays: override?.timeLimitDays ?? base.timeLimitDays,
      specialConditions: override?.specialConditions
        ? Array.from(new Set([...base.specialConditions, ...override.specialConditions]))
        : base.specialConditions,
      bondRequired: override?.bondRequired ?? base.bondRequired,
      notes: override?.notes
        ? Array.from(new Set([...base.notes, ...override.notes]))
        : base.notes,
    };
    logger.info("[customs-procedures] returned procedure", { cc, proc });
    return merged;
  } catch (err: any) {
    logger.error("[customs-procedures] getCustomsProcedure failed", { countryCode, procedure, error: err?.message });
    return {
      countryCode: (countryCode || "").toUpperCase(),
      procedure: (procedure || "").toUpperCase() as CustomsProcedureName,
      requiredDocuments: [], requiredPermits: [], dutyTreatment: "PAYABLE",
      specialConditions: [], bondRequired: false,
      notes: ["Internal error"],
    };
  }
}

// ============ §31 Auxiliary APIs ============

export function listProcedures(): CustomsProcedureName[] {
  return Object.keys(GENERIC_PROCEDURES) as CustomsProcedureName[];
}

export function listSupportedCountries(): string[] {
  return Object.keys(COUNTRY_OVERRIDES);
}
