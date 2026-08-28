// @ts-nocheck
/**
 * SGTX EU Customs Gateway — Member-State Adapter Registry (§57-58)
 * ===========================================================================
 *
 * Registers the customs-system descriptors for all 27 EU Member States. Each
 * entry captures the NATIONAL specifics that the EU-wide services cannot
 * abstract away — the national customs IT system, its authentication model,
 * its representation model, its submission channels, and its certification
 * regime.
 *
 * CRITICAL (§57-58):
 *   - DO NOT assume all EU Member States have identical capabilities. Each
 *     Member State runs its OWN national customs system with its OWN
 *     authentication + certification regime, even though the EU-wide data
 *     model (EUCDM) is shared. The EU Customs Gateway coordinates the
 *     EU-wide services; the Member-State adapter handles the national filing.
 *
 *   - The EU Customs Gateway NEVER auto-selects a Member-State adapter — the
 *     broker + Governor choose, based on the office of first entry / office
 *     of departure / office of exit. This module only LISTS adapters.
 *
 *   - Every Member-State adapter starts in status `NOT_ACTIVE`. Production
 *     activation requires:
 *       (a) per-Member-State legal authorisation (national broker licence or
 *           AEO accreditation where applicable),
 *       (b) the technical credential (eIDAS seal / X.509 / OAuth2 client),
 *       (c) successful sandbox test transactions,
 *       (d) Governor approval.
 *     The status field reflects only the SGTX-side readiness, NOT the legal
 *     authorisation status (which is a separate per-tenant concern tracked in
 *     Broker BYOC).
 *
 * Status ladder:
 *   NOT_ACTIVE             — descriptor registered; no SGTX adapter built yet
 *   ADAPTER_READY          — SGTX adapter wraps a stub; no live connection
 *   SANDBOX_CONNECTED      — adapter has a live sandbox connection
 *   PRODUCTION_CONNECTED   — adapter is live in production (requires legal auth)
 *
 * References:
 *   • Regulation (EU) No 952/2013 (UCC) — Union Customs Code
 *   • DG TAXUD "National Customs Systems" reference (https://taxation-customs.ec.europa.eu)
 *   • eIDAS Regulation (EU) No 910/2014 — electronic identification + trust services
 *   • Commission Implementing Decision (EU) 2019/2151 — EU Single Window / CSW-CERTEX
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ─────────────────────────────────────────────────────────────────

export interface MemberStateAdapter {
  countryCode: string;        // "DE", "FR", "IT", ...
  countryName: string;
  customsAuthority: string;   // "Bundeszollverwaltung", "DGDDI", ...
  systemName: string;         // "ATLAS", "SOPHIA", "AIDA", ...
  systemType: string;         // "NATIONAL_CUSTOMS_SYSTEM" | "SINGLE_WINDOW" | "PORTAL"
  authenticationModel: string;// "X.509" | "OAuth2" | "eIDAS" | "BASIC_AUTH"
  representationModel: string;// "DIRECT" | "INDIRECT" | "BOTH"
  submissionChannel: string[];// ["API", "EDI", "PORTAL", "BROKER"]
  schemaVersion: string;
  certificationRequirement: string;
  testingEnvironment: string;
  productionActivationProcess: string;
  supportedTransactionTypes: string[];
  status: string;             // NOT_ACTIVE | ADAPTER_READY | SANDBOX_CONNECTED | PRODUCTION_CONNECTED
}

// ── The 27 EU Member States (§57-58) ─────────────────────────────────────
//
// Each entry is built from publicly-published DG TAXUD + national customs
// documentation. systemName is the official national customs IT system used
// for UCC transactions. Status starts at NOT_ACTIVE for every Member State —
// SGTX has not yet wired a national adapter for any of them. Each Member
// State has DIFFERENT authentication / representation / certification rules;
// do not collapse them into a single "EU customs API" call.

export const MEMBER_STATES: MemberStateAdapter[] = [
  {
    countryCode: "AT",
    countryName: "Austria",
    customsAuthority: "Bundesministerium für Finanzen (BMF)",
    systemName: "EMCS / Zoll-Online",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL"],
    schemaVersion: "UCC AT 2024.1",
    certificationRequirement: "Austrian broker licence + eIDAS QSeal",
    testingEnvironment: "BMF Testumgebung (ATLAS mirror)",
    productionActivationProcess: "BMF production authorisation + QSeal certificate registration",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "BE",
    countryName: "Belgium",
    customsAuthority: "FOD Economie / Customs and Excise (DG Douane & Accijnzen)",
    systemName: "PLDA",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "PLDA UCC 2024",
    certificationRequirement: "Belgian customs representative licence + eIDAS QSeal",
    testingEnvironment: "PLDA Acceptance (test)",
    productionActivationProcess: "DG Douane production credential + QSeal onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "BG",
    countryName: "Bulgaria",
    customsAuthority: "Национална агенция за приходите (NRA / Customs Agency)",
    systemName: "CAS",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "CAS UCC 2024",
    certificationRequirement: "Bulgarian customs broker licence + eIDAS QSeal",
    testingEnvironment: "NRA test environment",
    productionActivationProcess: "NRA production credential onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "HR",
    countryName: "Croatia",
    customsAuthority: "Carinska uprava (Customs Administration)",
    systemName: "CIS",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "CIS UCC 2024",
    certificationRequirement: "Croatian customs representative licence + eIDAS QSeal",
    testingEnvironment: "Carinska test environment",
    productionActivationProcess: "Customs Administration production onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "CY",
    countryName: "Cyprus",
    customsAuthority: "Department of Customs and Excise",
    systemName: "ASYCUDA World",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "BASIC_AUTH",
    representationModel: "BOTH",
    submissionChannel: ["PORTAL", "BROKER"],
    schemaVersion: "ASYCUDA UCC 2024",
    certificationRequirement: "Cyprus customs representative licence",
    testingEnvironment: "ASYCUDA test instance",
    productionActivationProcess: "Department of Customs production credential",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "CZ",
    countryName: "Czech Republic",
    customsAuthority: "Generální ředitelství cel (Customs Administration)",
    systemName: "Celní informační systém (CIS)",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "CIS UCC 2024",
    certificationRequirement: "Czech customs representative licence + eIDAS QSeal",
    testingEnvironment: "Celní test environment",
    productionActivationProcess: "Czech Customs production onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "DK",
    countryName: "Denmark",
    customsAuthority: "Toldstyrelsen (Danish Customs)",
    systemName: "Toldsystemet (Digital Customs)",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL"],
    schemaVersion: "UCC DK 2024.1",
    certificationRequirement: "Danish customs representative licence + eIDAS MitID-erhverv",
    testingEnvironment: "Toldstyrelsen test (TST)",
    productionActivationProcess: "Toldstyrelsen production credential + MitID-erhverv onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "EE",
    countryName: "Estonia",
    customsAuthority: "Maksu- ja Tolliamet (MTA / Estonian Tax and Customs Board)",
    systemName: "e-Tolli",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL"],
    schemaVersion: "e-Tolli UCC 2024",
    certificationRequirement: "Estonian customs representative licence + eIDAS QSeal",
    testingEnvironment: "MTA test (testkeskkond)",
    productionActivationProcess: "MTA production onboarding + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "FI",
    countryName: "Finland",
    customsAuthority: "Tulli (Finnish Customs)",
    systemName: "Tulli Clearance System (TCS)",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL"],
    schemaVersion: "UCC FI 2024.1",
    certificationRequirement: "Finnish customs representative licence + eIDAS QSeal",
    testingEnvironment: "Tulli test (ITS)",
    productionActivationProcess: "Tulli production credential + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "FR",
    countryName: "France",
    customsAuthority: "Direction Générale des Douanes et Droits Indirects (DGDDI)",
    systemName: "SOPHIA / DELTA",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "SOPHIA UCC 2024",
    certificationRequirement: "French customs representative licence (commissionnaire en douane) + eIDAS QSeal",
    testingEnvironment: "DGDDI recette (SOPHIA-REC)",
    productionActivationProcess: "DGDDI production credential + QSeal + Soprano portal onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS", "DECISION"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "DE",
    countryName: "Germany",
    customsAuthority: "Bundeszollverwaltung (Generalzolldirektion)",
    systemName: "ATLAS",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "X.509",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "ATLAS IU 2024",
    certificationRequirement: "German Spediteur customs authorisation (§27 AWV) + X.509 client certificate (KO-ID)",
    testingEnvironment: "ATLAS-Test (ATLATEST)",
    productionActivationProcess: "Bundeszollverwaltung production certificate (KO-ID) + IAA clearance",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS", "DECISION"],
    status: "ADAPTER_READY",
  },
  {
    countryCode: "GR",
    countryName: "Greece",
    customsAuthority: "ICIS NET / ΑΑΔΕ (Independent Authority for Public Revenue)",
    systemName: "ICIS",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "ICIS UCC 2024",
    certificationRequirement: "Greek customs representative licence + eIDAS QSeal",
    testingEnvironment: "ICIS NET test environment",
    productionActivationProcess: "AADE production credential onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "HU",
    countryName: "Hungary",
    customsAuthority: "Nemzeti Adó- és Vámhivatal (NAV / National Tax and Customs Administration)",
    systemName: "NAV e-Vám",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "NAV UCC 2024",
    certificationRequirement: "Hungarian customs representative licence + eIDAS QSeal",
    testingEnvironment: "NAV test environment",
    productionActivationProcess: "NAV production credential onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "IE",
    countryName: "Ireland",
    customsAuthority: "Revenue Commissioners (Customs Division)",
    systemName: "Automated Import System (AIS)",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL"],
    schemaVersion: "AIS UCC 2024",
    certificationRequirement: "Irish customs representative licence + eIDAS QSeal",
    testingEnvironment: "Revenue test (MTS)",
    productionActivationProcess: "Revenue production credential + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "IT",
    countryName: "Italy",
    customsAuthority: "Agenzia delle Dogane e dei Monopoli (AdM)",
    systemName: "AIDA",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "AIDA UCC 2024",
    certificationRequirement: "Italian spedizioniere doganale licence + eIDAS QSeal (SPID/PEC)",
    testingEnvironment: "AIDA Collaudo",
    productionActivationProcess: "Agenzia delle Dogane production credential + SPID business identity",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS", "DECISION"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "LV",
    countryName: "Latvia",
    customsAuthority: "Valsts ieņēmumu dienests (VID / State Revenue Service)",
    systemName: "VID e-Clo",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL"],
    schemaVersion: "VID UCC 2024",
    certificationRequirement: "Latvian customs representative licence + eIDAS QSeal",
    testingEnvironment: "VID test environment",
    productionActivationProcess: "VID production onboarding + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "LT",
    countryName: "Lithuania",
    customsAuthority: "Valstybinė mokesčių inspekcija (VMI) + Customs Department",
    systemName: "Mokestinės informacijos sistemos (MIS)",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL"],
    schemaVersion: "MIS UCC 2024",
    certificationRequirement: "Lithuanian customs representative licence + eIDAS QSeal",
    testingEnvironment: "VMI test environment",
    productionActivationProcess: "VMI + Customs Department production onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "LU",
    countryName: "Luxembourg",
    customsAuthority: "Administration des Douanes et Accises",
    systemName: "eDouanes",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "eDouanes UCC 2024",
    certificationRequirement: "Luxembourg customs representative licence + eIDAS QSeal",
    testingEnvironment: "Administration des Douanes test environment",
    productionActivationProcess: "Administration des Douanes production onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "MT",
    countryName: "Malta",
    customsAuthority: "Department of Customs Malta",
    systemName: "ASYCUDA World",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "BASIC_AUTH",
    representationModel: "BOTH",
    submissionChannel: ["PORTAL", "BROKER"],
    schemaVersion: "ASYCUDA UCC 2024",
    certificationRequirement: "Malta customs representative licence",
    testingEnvironment: "ASYCUDA test instance",
    productionActivationProcess: "Department of Customs production credential",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "NL",
    countryName: "Netherlands",
    customsAuthority: "Douane (Belastingdienst / Customs)",
    systemName: "AGS",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "AGS UCC 2024",
    certificationRequirement: "Dutch customs representative licence + eIDAS QSeal (DigiD for Business)",
    testingEnvironment: "Douane Heidelberg (HBG test)",
    productionActivationProcess: "Douane production credential + QSeal + EORI linkage",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS", "DECISION"],
    status: "ADAPTER_READY",
  },
  {
    countryCode: "PL",
    countryName: "Poland",
    customsAuthority: "Krajowa Administracja Skarbowa (KAS / National Revenue Administration)",
    systemName: "Celina / e-Cło",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "Celina UCC 2024",
    certificationRequirement: "Polish agencja celna licence + eIDAS QSeal (wProfil Zaufany)",
    testingEnvironment: "KAS test (środowisko testowe)",
    productionActivationProcess: "KAS production credential + QSeal onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "PT",
    countryName: "Portugal",
    customsAuthority: "Autoridade Tributária e Aduaneira (AT / Customs and Tax Authority)",
    systemName: "SIIA / Janelinha",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "SIIA UCC 2024",
    certificationRequirement: "Portuguese customs representative licence + eIDAS QSeal (Chave Móvel Digital)",
    testingEnvironment: "AT test environment",
    productionActivationProcess: "AT production credential + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "RO",
    countryName: "Romania",
    customsAuthority: "Direcția Generală a Vămilor (DGV / Romanian Customs)",
    systemName: "TICARE",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "TICARE UCC 2024",
    certificationRequirement: "Romanian comisionar vamal licence + eIDAS QSeal",
    testingEnvironment: "DGV test environment",
    productionActivationProcess: "DGV production credential onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "SK",
    countryName: "Slovakia",
    customsAuthority: "Colné riaditeľstvo (Customs Directorate)",
    systemName: "eCDV",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "eCDV UCC 2024",
    certificationRequirement: "Slovak customs representative licence + eIDAS QSeal",
    testingEnvironment: "Colné riaditeľstvo test environment",
    productionActivationProcess: "Customs Directorate production onboarding",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "SI",
    countryName: "Slovenia",
    customsAuthority: "Financial Administration (FURS)",
    systemName: "e-Carina",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "PORTAL", "BROKER"],
    schemaVersion: "e-Carina UCC 2024",
    certificationRequirement: "Slovenian customs representative licence + eIDAS QSeal (Sigen-CA)",
    testingEnvironment: "FURS test environment",
    productionActivationProcess: "FURS production onboarding + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "ES",
    countryName: "Spain",
    customsAuthority: "Agencia Estatal de Administración Tributaria (AEAT / Customs Department)",
    systemName: "SIA",
    systemType: "SINGLE_WINDOW",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL", "BROKER"],
    schemaVersion: "SIA UCC 2024",
    certificationRequirement: "Spanish customs representative licence + eIDAS QSeal (Certificado Digital)",
    testingEnvironment: "AEAT prueba environment",
    productionActivationProcess: "AEAT production credential + Certificado Digital de Representante",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS", "DECISION"],
    status: "NOT_ACTIVE",
  },
  {
    countryCode: "SE",
    countryName: "Sweden",
    customsAuthority: "Tullverket (Swedish Customs)",
    systemName: "Tullverket Declaration System (TDS)",
    systemType: "NATIONAL_CUSTOMS_SYSTEM",
    authenticationModel: "eIDAS",
    representationModel: "BOTH",
    submissionChannel: ["API", "EDI", "PORTAL"],
    schemaVersion: "TDS UCC 2024",
    certificationRequirement: "Swedish customs representative licence + eIDAS QSeal (BankID företag)",
    testingEnvironment: "Tullverket test (FTS)",
    productionActivationProcess: "Tullverket production credential + QSeal",
    supportedTransactionTypes: ["IMPORT", "EXPORT", "TRANSIT", "ENS"],
    status: "NOT_ACTIVE",
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────

/**
 * Get the Member-State adapter descriptor by ISO-2 country code.
 * Returns null when the country is not a registered EU Member State.
 *
 * Defensive: never throws — returns null on internal error.
 */
export function getMemberStateAdapter(countryCode: string): MemberStateAdapter | null {
  try {
    if (!countryCode) return null;
    const upper = String(countryCode).toUpperCase().trim();
    return MEMBER_STATES.find((ms) => ms.countryCode === upper) || null;
  } catch (e: any) {
    logger.error("[eu-gateway/member-state-registry] getMemberStateAdapter failed", {
      error: e?.message,
    });
    return null;
  }
}

/**
 * List all registered EU Member-State adapter descriptors.
 * Defensive: returns an empty array on internal error.
 */
export function listMemberStates(): MemberStateAdapter[] {
  try {
    return [...MEMBER_STATES];
  } catch (e: any) {
    logger.error("[eu-gateway/member-state-registry] listMemberStates failed", {
      error: e?.message,
    });
    return [];
  }
}

/**
 * Return a per-Member-State status summary (countryCode + status + ready flag).
 * `ready` is true when the adapter is ADAPTER_READY, SANDBOX_CONNECTED, or
 * PRODUCTION_CONNECTED. NOT_ACTIVE adapters are NOT ready.
 *
 * Defensive: returns an empty array on internal error.
 */
export function getMemberStateStatus(): {
  countryCode: string;
  countryName: string;
  status: string;
  ready: boolean;
}[] {
  try {
    return MEMBER_STATES.map((ms) => ({
      countryCode: ms.countryCode,
      countryName: ms.countryName,
      status: ms.status,
      ready:
        ms.status === "ADAPTER_READY" ||
        ms.status === "SANDBOX_CONNECTED" ||
        ms.status === "PRODUCTION_CONNECTED",
    }));
  } catch (e: any) {
    logger.error("[eu-gateway/member-state-registry] getMemberStateStatus failed", {
      error: e?.message,
    });
    return [];
  }
}

/**
 * Return aggregate Member-State readiness statistics (count by status).
 * Used by the GET /eu/member-states route for the summary header.
 */
export function getMemberStateStatusSummary(): {
  total: number;
  ready: number;
  notActive: number;
  byStatus: Record<string, number>;
} {
  const empty = { total: 0, ready: 0, notActive: 0, byStatus: {} as Record<string, number> };
  try {
    const statuses = getMemberStateStatus();
    const byStatus: Record<string, number> = {};
    let ready = 0;
    let notActive = 0;
    for (const s of statuses) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      if (s.ready) ready++;
      if (s.status === "NOT_ACTIVE") notActive++;
    }
    return {
      total: statuses.length,
      ready,
      notActive,
      byStatus,
    };
  } catch (e: any) {
    logger.error("[eu-gateway/member-state-registry] getMemberStateStatusSummary failed", {
      error: e?.message,
    });
    return empty;
  }
}

/**
 * Filter Member-State adapters by supported transaction type
 * (e.g. "IMPORT", "TRANSIT", "ENS"). Returns the matching list.
 *
 * Used by the EU Customs Gateway to discover which Member States can accept a
 * given transaction type when routing a declaration.
 */
export function findMemberStatesByTransactionType(
  transactionType: string,
): MemberStateAdapter[] {
  try {
    if (!transactionType) return [];
    const upper = String(transactionType).toUpperCase().trim();
    return MEMBER_STATES.filter((ms) =>
      ms.supportedTransactionTypes.map((t) => t.toUpperCase()).includes(upper),
    );
  } catch (e: any) {
    logger.error("[eu-gateway/member-state-registry] findMemberStatesByTransactionType failed", {
      error: e?.message,
    });
    return [];
  }
}

/**
 * Update a Member-State adapter's status (in-memory only — does NOT persist
 * across restarts). Used by the EU adapter when sandbox/production activation
 * milestones are reached. Returns the updated descriptor or null if the
 * country code is unknown.
 *
 * NOTE: this is a runtime-only mutation. The canonical source of truth for a
 * tenant's production activation status is Broker BYOC + the Governor — never
 * this in-memory list.
 */
export function setMemberStateStatus(
  countryCode: string,
  status: string,
): MemberStateAdapter | null {
  try {
    const ms = getMemberStateAdapter(countryCode);
    if (!ms) return null;
    ms.status = status;
    return ms;
  } catch (e: any) {
    logger.error("[eu-gateway/member-state-registry] setMemberStateStatus failed", {
      error: e?.message,
    });
    return null;
  }
}
