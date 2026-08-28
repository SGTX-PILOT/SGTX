// @ts-nocheck
/**
 * SGTX Customs Gateway — Country Verification Matrix + Classification Engine
 * ===========================================================================
 *
 * Implements §9 (Integration Class definition), §33-37 (Classification
 * Criteria + Scoring Engine), and §50 (Final Country Matrix) of the
 * ZERO-EXTERNAL-COST Customs Expansion prompt.
 *
 * §5 INTEGRATION CLASS:
 *   • CLASS_A — ACE-style direct government API access (broker credential
 *               delegated but no commercial middleware required; SGTX
 *               operates a direct software boundary to the government
 *               system).
 *   • CLASS_B — broker-gateway model (broker owns/controls the credential;
 *               SGTX operates the software boundary; broker's licence +
 *               firma electrónica / GPKI / equivalent required).
 *   • CLASS_C — roadmap (commercial middleware required, or no clear
 *               self-build path; revisit after further investigation).
 *   • REJECTED — non-viable (no legal path to integration).
 *
 * §33 CLASSIFICATION CRITERIA (evidence-based):
 *   • Does the country publish an official API / EDI / web-services
 *     interface for customs declarations?
 *   • Can a software provider (SGTX) legally build an integration without
 *     going through a commercial middleware vendor?
 *   • Does the broker legally own/control the credential, or is a
 *     commercial intermediary mandatory?
 *   • Does SGTX require a separate customs licence in that country?
 *   • Is there an official test/sandbox environment?
 *   • Is the production environment access path documented?
 *
 * §36 SCORING ENGINE (calculateClassScore):
 *   + official API/EDI interface exists                → +20
 *   + software-provider access legally possible        → +15
 *   + broker credential delegation legally supported   → +15
 *   + no commercial middleware required                → +15
 *   + no separate SGTX customs licence required        → +10
 *   + official documentation published                 → +5
 *   + test environment available                       → +5
 *   − mandatory commercial intermediary                → −20
 *   − unclear / unverifiable access model              → −15
 *   − mandatory SGTX customs licence                   → −25
 *   − unverifiable / no documentation                  → −10
 *   − production access path unverified                → −10
 *
 *   Score ≥ 70  → CLASS_A
 *   Score 40-69 → CLASS_B
 *   Score < 40  → CLASS_C
 *   Score ≤ 0   → REJECTED
 *
 * §50 FINAL COUNTRY MATRIX:
 *   The COUNTRY_MATRIX constant below is the evidence-based assessment
 *   of each target country's customs integration class. It is the SINGLE
 *   SOURCE OF TRUTH for adapter classification. Adapters must NOT
 *   self-declare a higher class than what the matrix records — the matrix
 *   is reviewed and updated by the SGTX Governor + Compliance team.
 *
 * L0 invariants:
 *   - NON-MARKETPLACE: the matrix LISTS countries; it NEVER auto-selects
 *     one for a declaration. The broker + Governor choose.
 *   - try/catch with safe defaults on every public function.
 *
 * References:
 *   • ZERO-EXTERNAL-COST Customs Expansion prompt §5, §9, §33-37, §50.
 *   • WCO (World Customs Organization) Single Window Compendium.
 *   • UN/CEFACT Recommendation 33 (Single Window recommendation).
 *   • Per-country references in each adapter's header comment block.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ Types (§5, §33) ============

/** §5 — Target Integration Class. */
export type IntegrationClass = "CLASS_A" | "CLASS_B" | "CLASS_C" | "REJECTED";

/** §33 — Per-country verification + classification record. */
export interface CountryVerification {
  countryCode: string;
  countryName: string;
  region: string;
  authority: string;
  customsSystem: string;
  officialInterface: string;
  interfaceType: string; // "API" | "EDI" | "XML" | "JSON" | "WEBHOOK" | "PORTAL"
  // null = not yet investigated (used for ROADMAP / GCC / future candidates)
  selfBuildPossible: boolean | null;
  sgtxAuthorizationRequired: boolean;
  brokerAuthorizationRequired: boolean;
  commercialMiddlewareRequired: boolean | null;
  sgtxCost: string;
  brokerCost: string;
  governmentCost: string;
  credentialModel: string;
  certification: string;
  testEnvironment: string;
  productionEnvironment: string;
  implementationStatus: string;
  risk: string;
  classification: IntegrationClass;
  evidence: string;
  officialSource: string;
  decision:
    | "IMPLEMENT_NOW"
    | "IMPLEMENT_AFTER_ONBOARDING"
    | "BROKER_GATEWAY_ONLY"
    | "ROADMAP"
    | "REJECT";
}

// ============ §50 Final Country Matrix ============
//
// Each row is the evidence-based classification of one target country.
// Updates to this matrix require Governor review (§33-37).
//
// Notes on each classification:
//
// US (CLASS_A) — CBP ACE supports ACE ABI vendor licences; SGTX can
//   operate a software boundary wrapping the broker's filer code. ACE
//   has official documentation + a sandbox (ACE Certification). No
//   commercial middleware required.
//
// EG (CLASS_A) — Nafeza / CargoX / ETA / CBE all publish official APIs.
//   ACID pre-arrival is mandatory (Ministerial Decree 386/2020). The
//   broker holds an Egypt Trust e-Seal — SGTX operates the software
//   boundary. No commercial middleware required.
//
// AU (CLASS_A) — Australian Border Force ICS (Integrated Cargo System)
//   publishes an official EDI/XML interface. Broker holds a digital
//   certificate issued by ABF; SGTX operates the software boundary.
//   (Agent A is implementing this adapter in parallel.)
//
// IN (CLASS_A) — CBIC ICEGATE publishes a REST + EDI interface for
//   shipping bill + bill of entry filing. Broker holds an ICEGATE
//   digital signature certificate; SGTX operates the software boundary.
//   (Agent A is implementing this adapter in parallel.)
//
// BR (CLASS_A) — Receita Federal PUCOMEX publishes an official
//   web-services interface (XML/SOAP). Broker holds a valid ATO
//   (Autorização de Operador de Comércio Exterior) digital certificate;
//   SGTX operates the software boundary. (Agent A is implementing this
//   adapter in parallel.)
//
// SG (CLASS_B) — Singapore Customs TradeNet is operated by CrimsonLogic
//   as a commercial single-window. Direct system-to-system access
//   requires a TradeNet licensee agreement + onboarding. CLASS_B until
//   TradeNet onboarding completed. (Agent A is implementing this adapter
//   in parallel.)
//
// KR (CLASS_B) — Korea Customs Service UNI-PASS Open API exposes status
//   / HS / FX / AEO lookup, but declaration submission is restricted to
//   licensed 관세사 (customs brokers) with GPKI certificates. SGTX
//   operates the software boundary only.
//
// CO (CLASS_B) — Colombia VUCE / DIAN sendas web services require a
//   Colombian SIA (customs intermediary) or UAP/ALTEX importer with a
//   firma electrónica certificate. SGTX operates the software boundary
//   only. CLASS_A NOT claimable until production authorization verified.
//
// CL (CLASS_B) — Chile SICEX web services require a licensed
//   Despachador de Aduana or enrolled importer/exporter with a firma
//   electrónica avanzada. SGTX operates the software boundary only.
//
// EU (CLASS_B) — EU Customs Gateway coordinates EU-wide services (ICS2,
//   NCTS, AES, EUCDM) and delegates national filing to each Member
//   State's national customs system. Each Member State has DIFFERENT
//   authentication / certification regimes (eIDAS QSeal, X.509, national
//   broker licences).
//
// SA, AE, OM, QA, KW, BH (CLASS_C) — GCC single windows (FASAH, UAE
//   National SW, etc.) access model under investigation. Likely require
//   commercial middleware or broker-only access. See regional-gateways.ts
//   for the GCC investigation stubs.
//
// CA, JP, CN, MX, ZA, TR (CLASS_C) — Future candidates (§40). Access
//   model not yet verified; commercial middleware may be required.

export const COUNTRY_MATRIX: CountryVerification[] = [
  // ── Already implemented (US, EG) ──────────────────────────────────────
  {
    countryCode: "US",
    countryName: "United States",
    region: "North America",
    authority: "CBP (Customs and Border Protection)",
    customsSystem: "ACE (Automated Commercial Environment)",
    officialInterface: "ACE ABI (Automated Broker Interface) + AES",
    interfaceType: "EDI",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time (no per-call fees)",
    brokerCost: "CBP-issued ABI filer code + SCAC + broker licence",
    governmentCost: "ACE test environment free; production access free",
    credentialModel: "Broker-owned filer code + SCAC (reference only — actual value never flows through SGTX)",
    certification: "CBP ABI software vendor licence (for the broker's ABI software)",
    testEnvironment: "ACE Certification Environment (ACE_CERT)",
    productionEnvironment: "ACE Production (ACE_PROD)",
    implementationStatus: "CORE_READY — adapter shipped in adapters/us-ace-adapter.ts",
    risk: "Low — official ACE ABI documentation is public; broker credential model is well-established.",
    classification: "CLASS_A",
    evidence: "CBP publishes ACE ABI Programmer's Guide; ACE Certification Environment is openly available; broker filer code is the standard authorization model. 19 CFR 141-143, 149.",
    officialSource: "https://www.cbp.gov/trade/automated",
    decision: "IMPLEMENT_NOW",
  },
  {
    countryCode: "EG",
    countryName: "Egypt",
    region: "MENA (non-GCC)",
    authority: "Egyptian Customs Authority + ETA + CBE",
    customsSystem: "Nafeza / CargoX / ETA / CBE",
    officialInterface: "Nafeza SAD API + CargoX blockchain API + ETA e-Invoice API + CBE settlement",
    interfaceType: "API",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time (no per-call fees)",
    brokerCost: "Egypt Trust e-Seal (broker/exporter) + CargoX blockchain key + ETA e-Seal",
    governmentCost: "Free access to Nafeza / CargoX / ETA",
    credentialModel: "Broker/exporter-held Egypt Trust e-Seal + CargoX blockchain key + ETA e-Seal (references only)",
    certification: "Egypt Trust e-Seal (ONAC-accredited CA in Egypt)",
    testEnvironment: "Nafeza sandbox + CargoX sandbox + ETA sandbox",
    productionEnvironment: "Nafeza production (nafeza.gov.eg)",
    implementationStatus: "CORE_READY — adapter shipped in adapters/egypt-adapter.ts",
    risk: "Low — official Nafeza / CargoX / ETA APIs are public; broker credential model is mandatory since Oct 2021.",
    classification: "CLASS_A",
    evidence: "Egypt Ministerial Decree 386/2020 mandates ACID (CargoX) before SAD (Nafeza) acceptance. 385/2020 mandates ETA e-Invoice. All three systems publish public APIs.",
    officialSource: "https://www.nafeza.gov.eg",
    decision: "IMPLEMENT_NOW",
  },

  // ── New candidates (§8 — Agent A building in parallel) ───────────────
  {
    countryCode: "AU",
    countryName: "Australia",
    region: "APAC",
    authority: "Australian Border Force (ABF)",
    customsSystem: "ICS (Integrated Cargo System)",
    officialInterface: "ICS EDI (XML over MQ) + Cargo Report + Import Declaration",
    interfaceType: "EDI",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time",
    brokerCost: "ABF digital certificate (Gatekeeper-accredited CA)",
    governmentCost: "Free access to ICS test + production",
    credentialModel: "Broker-held ABF digital certificate (Gatekeeper CA)",
    certification: "ABF-issued user certificate under the Gatekeeper framework",
    testEnvironment: "ICS Test Environment (ICTE)",
    productionEnvironment: "ICS Production",
    implementationStatus: "IN_PROGRESS (Agent A) — adapter in adapters/australia-adapter.ts",
    risk: "Low — ICS EDI is well-documented; broker credential model is standard.",
    classification: "CLASS_A",
    evidence: "ABF publishes ICS EDI specifications (XML over MQ). Broker holds a Gatekeeper-accredited digital certificate. Customs Act 1901 + Customs (Prohibited Imports) Regulations.",
    officialSource: "https://www.abf.gov.au",
    decision: "IMPLEMENT_NOW",
  },
  {
    countryCode: "IN",
    countryName: "India",
    region: "APAC (South Asia)",
    authority: "CBIC (Central Board of Indirect Taxes and Customs)",
    customsSystem: "ICEGATE (Indian Customs EDI System)",
    officialInterface: "ICEGATE REST + EDI (Shipping Bill + Bill of Entry)",
    interfaceType: "API",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time",
    brokerCost: "ICEGATE ICEGATE digital signature certificate (CA-in-India)",
    governmentCost: "Free access to ICEGATE",
    credentialModel: "Broker-held ICEGATE digital signature certificate",
    certification: "CBIC-issued IEC (Importer Exporter Code) + DSC (Digital Signature Certificate, CCA India)",
    testEnvironment: "ICEGATE test environment",
    productionEnvironment: "ICEGATE production (icegate.gov.in)",
    implementationStatus: "IN_PROGRESS (Agent A) — adapter in adapters/india-adapter.ts",
    risk: "Low — ICEGATE publishes REST + EDI specifications; DSC is the standard model.",
    classification: "CLASS_A",
    evidence: "CBIC publishes ICEGATE REST API + EDI specifications. Customs Act 1962 + Customs Brokers Licensing Regulations 2018. DSC issued by CCA India.",
    officialSource: "https://www.icegate.gov.in",
    decision: "IMPLEMENT_NOW",
  },
  {
    countryCode: "BR",
    countryName: "Brazil",
    region: "LATAM",
    authority: "Receita Federal do Brasil (RFB)",
    customsSystem: "PUCOMEX / SISCOMEX (Sistema Integrado de Comércio Exterior)",
    officialInterface: "SISCOMEX/PUCOMEX web services (XML/SOAP)",
    interfaceType: "XML",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time",
    brokerCost: "RFB-issued ATO (Autorização de Operador) + e-CNPJ digital certificate",
    governmentCost: "Free access to SISCOMEX (per-declaration fee in production)",
    credentialModel: "Broker-held e-CNPJ digital certificate (ITI-accredited CA in Brazil)",
    certification: "RFB ATO licence + ICP-Brasil e-CNPJ certificate",
    testEnvironment: "SISCOMEX Piloto / Homologação",
    productionEnvironment: "SISCOMEX Production",
    implementationStatus: "IN_PROGRESS (Agent A) — adapter in adapters/brazil-adapter.ts",
    risk: "Low-Medium — SISCOMEX web services are documented; ATO licence process is established.",
    classification: "CLASS_A",
    evidence: "Receita Federal publishes PUCOMEX/SISCOMEX web-services specs. Decreto-Lei 37/1966 + IN RFB 1734/2017. ICP-Brasil is the national PKI.",
    officialSource: "https://www.gov.br/receitafederal",
    decision: "IMPLEMENT_NOW",
  },
  {
    countryCode: "SG",
    countryName: "Singapore",
    region: "APAC (ASEAN)",
    authority: "Singapore Customs",
    customsSystem: "TradeNet (operated by CrimsonLogic under Singapore Customs)",
    officialInterface: "TradeNet XML message interface (system-to-system)",
    interfaceType: "XML",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: true,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "TradeNet licensee onboarding fee (one-time, paid to CrimsonLogic)",
    brokerCost: "Singapore Customs declaration permit account + CrimsonLogic TradeNet licence",
    governmentCost: "Per-declaration fee (TradeNet)",
    credentialModel: "Broker-held TradeNet credentials + SGTX licensee agreement with CrimsonLogic",
    certification: "CrimsonLogic TradeNet licensee agreement (system-to-system)",
    testEnvironment: "TradeNet UAT environment",
    productionEnvironment: "TradeNet Production",
    implementationStatus: "IN_PROGRESS (Agent A) — adapter in adapters/singapore-adapter.ts",
    risk: "Medium — TradeNet is operated by CrimsonLogic (commercial), but is the official single window. SGTX licensee agreement is required.",
    classification: "CLASS_B",
    evidence: "Singapore Customs Act (Cap 70) + TradeNet is operated by CrimsonLogic under Singapore Customs oversight. System-to-system access requires a CrimsonLogic licensee agreement.",
    officialSource: "https://www.customs.gov.sg",
    decision: "IMPLEMENT_AFTER_ONBOARDING",
  },

  // ── New adapters (this task — COUNTRY-ADAPTERS-2) ────────────────────
  {
    countryCode: "KR",
    countryName: "South Korea",
    region: "APAC",
    authority: "Korea Customs Service (KCS / 관세청)",
    customsSystem: "UNI-PASS",
    officialInterface: "UNI-PASS Open API (status / HS / FX / AEO) + declaration filing via licensed 관세사",
    interfaceType: "API",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time",
    brokerCost: "KCS-issued 관세사 licence + GPKI / 공동인증서 certificate",
    governmentCost: "Free access to UNI-PASS Open API",
    credentialModel: "Broker-held GPKI certificate (Korea digital government PKI)",
    certification: "KCS-issued 관세사 licence + GPKI certificate",
    testEnvironment: "UNI-PASS test portal",
    productionEnvironment: "UNI-PASS production (unipass.customs.go.kr)",
    implementationStatus: "CORE_READY — adapter shipped in adapters/south-korea-adapter.ts",
    risk: "Medium — Open API is public; declaration submission requires licensed 관세사 + GPKI.",
    classification: "CLASS_B",
    evidence: "KCS publishes UNI-PASS Open API portal (unipass.customs.go.kr). Declaration submission restricted to licensed 관세사 with GPKI certificate per Korea Customs Act Art. 229, 241, 246.",
    officialSource: "https://unipass.customs.go.kr",
    decision: "IMPLEMENT_AFTER_ONBOARDING",
  },
  {
    countryCode: "CO",
    countryName: "Colombia",
    region: "LATAM",
    authority: "DIAN (Dirección de Impuestos y Aduanas Nacionales)",
    customsSystem: "VUCE (Ventanilla Única de Comercio Exterior) / SICEX",
    officialInterface: "DIAN Servicios Electrónicos Aduaneros (sendas) SOAP/XML web services",
    interfaceType: "XML",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time",
    brokerCost: "DIAN-issued SIA licence + firma electrónica (ONAC-accredited CA)",
    governmentCost: "Free access to DIAN sendas",
    credentialModel: "Broker-held firma electrónica (ONAC-accredited digital signature)",
    certification: "DIAN SIA licence + ONAC-accredited firma electrónica certificate",
    testEnvironment: "DIAN Piloto / Pruebas",
    productionEnvironment: "DIAN sendas production",
    implementationStatus: "CORE_READY — adapter shipped in adapters/colombia-adapter.ts",
    risk: "Medium — DIAN sendas is documented; SIA licence + firma electrónica required.",
    classification: "CLASS_B",
    evidence: "DIAN publishes sendas SOAP/XML web-services specs. Estatuto Aduanero (Decreto 1165/2019) + Resolución DIAN 000080/2021. Firma electrónica issued by ONAC-accredited CA. CLASS_A NOT claimable until technical authorization verified for at least one onboarded SIA.",
    officialSource: "https://www.vuce.gov.co",
    decision: "IMPLEMENT_AFTER_ONBOARDING",
  },
  {
    countryCode: "CL",
    countryName: "Chile",
    region: "LATAM",
    authority: "Servicio Nacional de Aduanas",
    customsSystem: "SICEX (Sistema Integrado de Comercio Exterior)",
    officialInterface: "SICEX web services (XML/SOAP) — DIN (import), DUS (export)",
    interfaceType: "XML",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time",
    brokerCost: "Aduanas-issued Despachador licence + firma electrónica avanzada (SUBTEL-accredited CA)",
    governmentCost: "Free access to SICEX",
    credentialModel: "Broker-held firma electrónica avanzada (SUBTEL-accredited certificate)",
    certification: "Aduanas Despachador licence + SUBTEL-accredited firma electrónica avanzada",
    testEnvironment: "SICEX Piloto",
    productionEnvironment: "SICEX production (aduana.cl/sicex)",
    implementationStatus: "CORE_READY — adapter shipped in adapters/chile-adapter.ts",
    risk: "Medium — SICEX web services documented; Despachador licence + firma electrónica avanzada required.",
    classification: "CLASS_B",
    evidence: "Aduanas Chile publishes SICEX web-services specs. Ordenanza de Aduanas (Ley 18.320 / DFL 329/1979) + Compendio de Resoluciones Aduaneras Res. 1600/2014. Ley 19.799 firma electrónica. Do NOT implement unsupported direct government access.",
    officialSource: "https://www.aduana.cl",
    decision: "IMPLEMENT_AFTER_ONBOARDING",
  },

  // ── EU gateway (already implemented — §5 multi-layer architecture) ────
  {
    countryCode: "EU",
    countryName: "European Union",
    region: "Europe",
    authority: "EU Commission (DG TAXUD) + 27 Member-State customs authorities",
    customsSystem: "EUCDM / ICS2 / NCTS / AES / CDS / TARIC / EORI / AEO / PoUS / CSW-CERTEX",
    officialInterface: "EU-wide services (ICS2 / NCTS / AES) + per-Member-State national systems",
    interfaceType: "XML",
    selfBuildPossible: true,
    sgtxAuthorizationRequired: true,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: false,
    sgtxCost: "Engineering time + per-Member-State onboarding",
    brokerCost: "Per-Member-State broker licence + eIDAS QSeal certificate",
    governmentCost: "Free access to EU-wide test environments; per-Member-State fees vary",
    credentialModel: "Per-Member-State broker credential (X.509 / eIDAS QSeal / national broker licence)",
    certification: "Per-Member-State certification (e.g. DE Atlas-Teilnehmereigenschaft, NL AGS account, IT AIDA, etc.)",
    testEnvironment: "EU-wide test (ICS2/IP3 sandbox, NCTS Conformance) + per-Member-State national test environments",
    productionEnvironment: "Per-Member-State national production systems",
    implementationStatus: "CORE_READY — EU Customs Gateway + 27 Member-State registry shipped in adapters/eu-gateway/",
    risk: "High — each of 27 Member States has DIFFERENT authentication / certification / submission channels. PRODUCTION activation requires per-Member-State legal authorisation + eIDAS QSeal + sandbox tests + Governor approval.",
    classification: "CLASS_B",
    evidence: "Regulation (EU) 952/2013 (UCC) + Implementing Decision 2019/2153 (EUCDM 3.0). Each Member State runs its OWN national customs system with its OWN authentication regime — do NOT collapse into a single 'EU customs API'.",
    officialSource: "https://taxation-customs.ec.europa.eu",
    decision: "IMPLEMENT_AFTER_ONBOARDING",
  },

  // ── GCC (§41 — under investigation, see regional-gateways.ts) ────────
  {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    region: "GCC",
    authority: "Saudi Customs (ZATCA)",
    customsSystem: "FASAH",
    officialInterface: "FASAH XML/SOAP web services (access model under investigation)",
    interfaceType: "XML",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: true,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD pending FASAH access investigation",
    brokerCost: "TBD",
    governmentCost: "TBD",
    credentialModel: "TBD — FASAH access model under investigation",
    certification: "TBD",
    testEnvironment: "TBD",
    productionEnvironment: "FASAH production (fasah.sa)",
    implementationStatus: "ROADMAP — §41 GCC special rule, see regional-gateways.ts",
    risk: "High — FASAH access model not yet verified.",
    classification: "CLASS_C",
    evidence: "FASAH is the Saudi single window. Access model (direct API vs. broker-only vs. commercial middleware) under investigation per §41.",
    officialSource: "https://fasah.sa",
    decision: "ROADMAP",
  },
  {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    region: "GCC",
    authority: "UAE Federal Customs Authority + Dubai Customs + Abu Dhabi Customs",
    customsSystem: "UAE National Single Window + Dubai Customs Mirsal 2",
    officialInterface: "Mirsal 2 XML/SOAP (access model under investigation)",
    interfaceType: "XML",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: true,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD pending UAE customs access investigation",
    brokerCost: "TBD",
    governmentCost: "TBD",
    credentialModel: "TBD — UAE customs access model under investigation",
    certification: "TBD",
    testEnvironment: "TBD",
    productionEnvironment: "Mirsal 2 production (dubaicustoms.gov.ae)",
    implementationStatus: "ROADMAP — §41 GCC special rule, see regional-gateways.ts",
    risk: "High — UAE has multiple customs authorities (Federal + Dubai + Abu Dhabi); access model not yet verified.",
    classification: "CLASS_C",
    evidence: "Mirsal 2 is Dubai Customs' electronic system. UAE Federal Customs Authority operates the national single window. Access model under investigation per §41.",
    officialSource: "https://www.dubaicustoms.gov.ae",
    decision: "ROADMAP",
  },

  // ── Future candidates (§40) ──────────────────────────────────────────
  {
    countryCode: "CA",
    countryName: "Canada",
    region: "North America",
    authority: "CBSA (Canada Border Services Agency)",
    customsSystem: "CARM (CBSA Assessment and Revenue Management)",
    officialInterface: "CARM EDI + SOAP/XML web services (access model under investigation)",
    interfaceType: "EDI",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD",
    brokerCost: "CBSA-issued broker licence + digital certificate",
    governmentCost: "Free access to CARM test",
    credentialModel: "Broker-held CBSA digital certificate (TBD)",
    certification: "CBSA customs broker licence",
    testEnvironment: "CARM Test Environment",
    productionEnvironment: "CARM production (cbsa-asfc.gc.ca)",
    implementationStatus: "ROADMAP — §40 future candidate",
    risk: "Medium — CARM is documented; broker credential model is standard.",
    classification: "CLASS_C",
    evidence: "CARM launched May 2024 (replaced older CCS). Customs Act + CBSA broker licensing. Access model under investigation.",
    officialSource: "https://www.cbsa-asfc.gc.ca",
    decision: "ROADMAP",
  },
  {
    countryCode: "JP",
    countryName: "Japan",
    region: "APAC",
    authority: "Japan Customs (Ministry of Finance / Tax Agency)",
    customsSystem: "NACCS (Nippon Automated Cargo Clearance System)",
    officialInterface: "NACCS EDI (XML over private network — access model under investigation)",
    interfaceType: "EDI",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: true,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD — NACCS access likely requires commercial agreement",
    brokerCost: "NACCS user agreement + digital certificate",
    governmentCost: "Per-declaration fee (NACCS)",
    credentialModel: "Broker-held NACCS user certificate (TBD)",
    certification: "NACCS user agreement + Customs broker licence",
    testEnvironment: "NACCS Test System",
    productionEnvironment: "NACCS production",
    implementationStatus: "ROADMAP — §40 future candidate",
    risk: "High — NACCS is operated by a private consortium (NACCS Corp.); commercial middleware may be required.",
    classification: "CLASS_C",
    evidence: "NACCS is operated by NACCS Corporation (private). Customs Act (Japan) Law No. 61/1954. Access model under investigation.",
    officialSource: "https://www.naccs.com",
    decision: "ROADMAP",
  },
  {
    countryCode: "CN",
    countryName: "China",
    region: "APAC",
    authority: "China Customs (General Administration of Customs / GACC)",
    customsSystem: "China International Trade Single Window",
    officialInterface: "Single Window XML/SOAP (access model under investigation)",
    interfaceType: "XML",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: true,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD",
    brokerCost: "China Customs broker licence + IC card + digital certificate",
    governmentCost: "Free access to Single Window",
    credentialModel: "Broker-held China Customs IC card + digital certificate",
    certification: "China Customs broker licence",
    testEnvironment: "Single Window test environment",
    productionEnvironment: "Single Window production (singlewindow.cn)",
    implementationStatus: "ROADMAP — §40 future candidate",
    risk: "High — Single Window access requires Chinese legal entity + broker licence; commercial middleware may be required.",
    classification: "CLASS_C",
    evidence: "China International Trade Single Window operated by GACC. Customs Law of PRC. Access model requires Chinese legal entity + broker licence; under investigation.",
    officialSource: "https://www.singlewindow.cn",
    decision: "ROADMAP",
  },
  {
    countryCode: "MX",
    countryName: "Mexico",
    region: "LATAM",
    authority: "SAT (Servicio de Administración Tributaria)",
    customsSystem: "VVDM (Ventanilla Digital Mexicana)",
    officialInterface: "VVDM web services + CFDI e-Invoice (access model under investigation)",
    interfaceType: "XML",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD",
    brokerCost: "SAT-issued Agente Aduanal licence + e.firma (firma electrónica avanzada)",
    governmentCost: "Free access to VVDM",
    credentialModel: "Broker-held e.firma (SAT-issued digital certificate)",
    certification: "SAT Agente Aduanal licence + e.firma",
    testEnvironment: "VVDM test environment",
    productionEnvironment: "VVDM production",
    implementationStatus: "ROADMAP — §40 future candidate",
    risk: "Medium — VVDM is documented; Agente Aduanal credential model is standard.",
    classification: "CLASS_C",
    evidence: "SAT publishes VVDM web-services specs. Ley Aduanera (Mexico). e.firma issued by SAT. Access model under investigation.",
    officialSource: "https://www.sat.gob.mx",
    decision: "ROADMAP",
  },
  {
    countryCode: "ZA",
    countryName: "South Africa",
    region: "Sub-Saharan Africa",
    authority: "SARS (South African Revenue Service)",
    customsSystem: "SARS eFiling + EDI",
    officialInterface: "SARS eFiling + EDI (XML — access model under investigation)",
    interfaceType: "EDI",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD",
    brokerCost: "SARS-issued broker licence + digital certificate",
    governmentCost: "Free access to SARS eFiling",
    credentialModel: "Broker-held SARS digital certificate",
    certification: "SARS customs broker licence",
    testEnvironment: "SARS eFiling Test",
    productionEnvironment: "SARS eFiling production",
    implementationStatus: "ROADMAP — §40 future candidate",
    risk: "Medium — SARS eFiling is documented; broker credential model is standard.",
    classification: "CLASS_C",
    evidence: "SARS publishes eFiling + EDI specs. Customs and Excise Act 91/1964. Access model under investigation.",
    officialSource: "https://www.sars.gov.za",
    decision: "ROADMAP",
  },
  {
    countryCode: "TR",
    countryName: "Turkey",
    region: "MENA (non-GCC)",
    authority: "Turkish Ministry of Trade (Ticaret Bakanlığı)",
    customsSystem: "BILGE / Single Window (Tek Pencere)",
    officialInterface: "BILGE EDI + Single Window XML (access model under investigation)",
    interfaceType: "EDI",
    selfBuildPossible: null,
    sgtxAuthorizationRequired: false,
    brokerAuthorizationRequired: true,
    commercialMiddlewareRequired: null,
    sgtxCost: "TBD",
    brokerCost: "Turkish Customs broker licence + e-imza (firma electrónica)",
    governmentCost: "Free access to Single Window",
    credentialModel: "Broker-held e-imza (TÜBİTAK-accredited digital certificate)",
    certification: "Turkish customs broker licence + e-imza",
    testEnvironment: "BILGE test environment",
    productionEnvironment: "BILGE production (gumruk.gov.tr)",
    implementationStatus: "ROADMAP — §40 future candidate",
    risk: "Medium — BILGE / Single Window is documented; broker credential model is standard.",
    classification: "CLASS_C",
    evidence: "Turkish Ministry of Trade publishes BILGE + Single Window specs. Customs Law 4458/1999. e-imza issued by TÜBİTAK-accredited CA. Access model under investigation.",
    officialSource: "https://www.ticaret.gov.tr",
    decision: "ROADMAP",
  },
];

// ============ Lookup functions ============

/**
 * §50 — Look up a single country's verification record by ISO-2 code.
 *
 * NON-MARKETPLACE: this function LOOKS UP a record; it NEVER auto-selects
 * a country for a declaration.
 */
export function getCountryVerification(countryCode: string): CountryVerification | null {
  try {
    if (!countryCode) return null;
    const upper = countryCode.toUpperCase();
    return COUNTRY_MATRIX.find((c) => c.countryCode === upper) || null;
  } catch (err: any) {
    logger.error("[country-verification-matrix] getCountryVerification failed", { error: err?.message });
    return null;
  }
}

/**
 * §50 — List all countries matching the given IntegrationClass.
 */
export function listCountriesByClass(classification: IntegrationClass): CountryVerification[] {
  try {
    return COUNTRY_MATRIX.filter((c) => c.classification === classification);
  } catch (err: any) {
    logger.error("[country-verification-matrix] listCountriesByClass failed", { error: err?.message });
    return [];
  }
}

/**
 * §50 — List countries that are IMPLEMENT_NOW or IMPLEMENT_AFTER_ONBOARDING
 * (i.e. adapter is being built or has been built).
 */
export function getImplementationReadyCountries(): CountryVerification[] {
  try {
    return COUNTRY_MATRIX.filter(
      (c) => c.decision === "IMPLEMENT_NOW" || c.decision === "IMPLEMENT_AFTER_ONBOARDING",
    );
  } catch (err: any) {
    logger.error("[country-verification-matrix] getImplementationReadyCountries failed", { error: err?.message });
    return [];
  }
}

/**
 * §50 — Return the full matrix (single source of truth).
 */
export function getFullMatrix(): CountryVerification[] {
  try {
    return COUNTRY_MATRIX.slice();
  } catch (err: any) {
    logger.error("[country-verification-matrix] getFullMatrix failed", { error: err?.message });
    return [];
  }
}

/**
 * §50 — Return a status summary across the matrix (counts by class / decision).
 */
export function getMatrixSummary(): {
  total: number;
  byClass: Record<IntegrationClass, number>;
  byDecision: Record<string, number>;
  implementationReady: number;
  roadmap: number;
} {
  try {
    const byClass: Record<IntegrationClass, number> = {
      CLASS_A: 0,
      CLASS_B: 0,
      CLASS_C: 0,
      REJECTED: 0,
    };
    const byDecision: Record<string, number> = {};
    let implementationReady = 0;
    let roadmap = 0;

    for (const c of COUNTRY_MATRIX) {
      byClass[c.classification] = (byClass[c.classification] || 0) + 1;
      byDecision[c.decision] = (byDecision[c.decision] || 0) + 1;
      if (c.decision === "IMPLEMENT_NOW" || c.decision === "IMPLEMENT_AFTER_ONBOARDING") {
        implementationReady++;
      }
      if (c.decision === "ROADMAP") roadmap++;
    }

    return {
      total: COUNTRY_MATRIX.length,
      byClass,
      byDecision,
      implementationReady,
      roadmap,
    };
  } catch (err: any) {
    logger.error("[country-verification-matrix] getMatrixSummary failed", { error: err?.message });
    return {
      total: 0,
      byClass: { CLASS_A: 0, CLASS_B: 0, CLASS_C: 0, REJECTED: 0 },
      byDecision: {},
      implementationReady: 0,
      roadmap: 0,
    };
  }
}

// ============ §36 Scoring Engine ============
//
// The scoring engine applies the §36 criteria to a partial
// CountryVerification record and returns:
//   • score         — integer in range [-50, +85]
//   • classification — CLASS_A / CLASS_B / CLASS_C / REJECTED
//   • reasoning     — human-readable breakdown of the score
//
// Scoring weights (§36):
//   + official API/EDI interface exists                → +20
//   + software-provider access legally possible        → +15
//   + broker credential delegation legally supported   → +15
//   + no commercial middleware required                → +15
//   + no separate SGTX customs licence required        → +10
//   + official documentation published                 → +5
//   + test environment available                       → +5
//   − mandatory commercial intermediary                → −20
//   − unclear / unverifiable access model              → −15
//   − mandatory SGTX customs licence                   → −25
//   − unverifiable / no documentation                  → −10
//   − production access path unverified                → −10
//
// Classification thresholds:
//   score ≥ 70  → CLASS_A
//   score 40-69 → CLASS_B
//   score 1-39  → CLASS_C
//   score ≤ 0   → REJECTED

export interface ClassScoreResult {
  score: number;
  classification: IntegrationClass;
  reasoning: string;
  breakdown: { criterion: string; delta: number }[];
}

export function calculateClassScore(country: Partial<CountryVerification>): ClassScoreResult {
  const fallback: ClassScoreResult = {
    score: 0,
    classification: "REJECTED",
    reasoning: "calculateClassScore internal error — defaulted to REJECTED",
    breakdown: [],
  };

  try {
    if (!country || typeof country !== "object") {
      return { ...fallback, reasoning: "country is required" };
    }

    const breakdown: { criterion: string; delta: number }[] = [];
    let score = 0;

    // + official API/EDI interface exists
    const hasOfficialInterface =
      !!country.officialInterface &&
      country.officialInterface.trim().length > 0 &&
      !/TBD|under investigation/i.test(country.officialInterface);
    if (hasOfficialInterface) {
      score += 20;
      breakdown.push({ criterion: "Official API/EDI interface exists", delta: +20 });
    } else {
      breakdown.push({ criterion: "Official API/EDI interface exists", delta: 0 });
    }

    // + software-provider access legally possible
    if (country.selfBuildPossible === true) {
      score += 15;
      breakdown.push({ criterion: "Software-provider (SGTX) self-build legally possible", delta: +15 });
    } else if (country.selfBuildPossible === null || country.selfBuildPossible === undefined) {
      score -= 15;
      breakdown.push({ criterion: "Self-build unclear / unverifiable", delta: -15 });
    } else {
      breakdown.push({ criterion: "Self-build not possible", delta: 0 });
    }

    // + broker credential delegation legally supported
    if (country.brokerAuthorizationRequired === true) {
      score += 15;
      breakdown.push({ criterion: "Broker credential delegation legally supported", delta: +15 });
    } else {
      breakdown.push({ criterion: "Broker credential delegation", delta: 0 });
    }

    // + no commercial middleware required
    if (country.commercialMiddlewareRequired === false) {
      score += 15;
      breakdown.push({ criterion: "No commercial middleware required", delta: +15 });
    } else if (country.commercialMiddlewareRequired === true) {
      score -= 20;
      breakdown.push({ criterion: "Mandatory commercial intermediary", delta: -20 });
    } else {
      // null / undefined — unclear
      score -= 5;
      breakdown.push({ criterion: "Commercial middleware requirement unclear", delta: -5 });
    }

    // + no separate SGTX customs licence required
    if (country.sgtxAuthorizationRequired === false) {
      score += 10;
      breakdown.push({ criterion: "No separate SGTX customs licence required", delta: +10 });
    } else if (country.sgtxAuthorizationRequired === true) {
      score -= 25;
      breakdown.push({ criterion: "Mandatory SGTX customs licence", delta: -25 });
    } else {
      breakdown.push({ criterion: "SGTX licence requirement unknown", delta: 0 });
    }

    // + official documentation published
    if (hasOfficialInterface && country.officialSource && !/TBD|under investigation/i.test(country.officialSource)) {
      score += 5;
      breakdown.push({ criterion: "Official documentation published", delta: +5 });
    } else {
      score -= 10;
      breakdown.push({ criterion: "Documentation unverifiable / missing", delta: -10 });
    }

    // + test environment available
    if (country.testEnvironment && !/TBD|under investigation/i.test(country.testEnvironment)) {
      score += 5;
      breakdown.push({ criterion: "Test environment available", delta: +5 });
    } else {
      score -= 5;
      breakdown.push({ criterion: "Test environment unverifiable", delta: -5 });
    }

    // − production access path unverified
    if (
      !country.productionEnvironment ||
      /TBD|under investigation/i.test(country.productionEnvironment) ||
      /ROADMAP/.test(country.implementationStatus || "")
    ) {
      score -= 10;
      breakdown.push({ criterion: "Production access path unverified", delta: -10 });
    } else {
      breakdown.push({ criterion: "Production access path verified", delta: 0 });
    }

    // ── Classification thresholds ──────────────────────────────────────
    let classification: IntegrationClass;
    if (score >= 70) classification = "CLASS_A";
    else if (score >= 40) classification = "CLASS_B";
    else if (score >= 1) classification = "CLASS_C";
    else classification = "REJECTED";

    const reasoning =
      `Score: ${score}. Breakdown: ${breakdown
        .map((b) => `${b.criterion}=${b.delta >= 0 ? "+" : ""}${b.delta}`)
        .join("; ")}. ` +
      `Classification: ${classification} ` +
      `(score ≥ 70 → CLASS_A, 40-69 → CLASS_B, 1-39 → CLASS_C, ≤ 0 → REJECTED).`;

    return { score, classification, reasoning, breakdown };
  } catch (err: any) {
    logger.error("[country-verification-matrix] calculateClassScore failed", { error: err?.message });
    return fallback;
  }
}

/**
 * §36 — Verify that a CountryVerification record's `classification` field
 * matches what the scoring engine would produce from its other fields.
 *
 * Used by the Governor + Compliance team to audit the matrix for
 * classification drift. Returns:
 *   • consistent    — true if the matrix classification matches the
 *                     scoring engine output
 *   • expectedClass — what the scoring engine would assign
 *   • actualClass   — what the matrix currently records
 *   • score         — the scoring engine's score
 *   • reasoning     — the scoring engine's reasoning
 */
export function verifyClassification(countryCode: string): {
  consistent: boolean;
  expectedClass: IntegrationClass;
  actualClass: IntegrationClass | null;
  score: number;
  reasoning: string;
} {
  const fallback = {
    consistent: false,
    expectedClass: "REJECTED" as IntegrationClass,
    actualClass: null as IntegrationClass | null,
    score: 0,
    reasoning: "verifyClassification internal error",
  };

  try {
    const country = getCountryVerification(countryCode);
    if (!country) {
      return {
        ...fallback,
        reasoning: `Unknown countryCode: ${countryCode}`,
      };
    }

    const score = calculateClassScore(country);
    return {
      consistent: score.classification === country.classification,
      expectedClass: score.classification,
      actualClass: country.classification,
      score: score.score,
      reasoning: score.reasoning,
    };
  } catch (err: any) {
    logger.error("[country-verification-matrix] verifyClassification failed", { error: err?.message });
    return fallback;
  }
}
