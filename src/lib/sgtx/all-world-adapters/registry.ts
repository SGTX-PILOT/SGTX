// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.118 — All-World Country Adapter Registry (22 built-in adapters)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Per v17 §24 Phase 4 roadmap (Years 3-5): "Partner-country expansion
// (UAE→Germany→Vietnam→beyond), sovereign nodes per region, mutual USTN
// recognition".
//
// This file seeds the All-World adapter registry with 22 built-in country
// adapters. Each adapter describes the country's capabilities (customs gateway,
// single window, digital signature, electronic invoice, tax engine, sanctions
// screening), its government API endpoints, language/currency/timezone, and
// the regulatory sources that drive it.
//
// Capability coverage:
//   • "Full" adapters (all 6 capabilities true):  EG, AE, SA, DE, IT, SG
//   • "Partial" adapters (3-5 capabilities):     NL, ES, FR, GB, US, CN, IN,
//                                                AU, BR, KR, CL, CO, VN, TR,
//                                                KE, ZA
//
// Re-registration:
//   This module calls `registerCountryAdapter(...)` for each built-in. It is
//   safe to call repeatedly — the registry overwrites the prior entry on each
//   registration (the last writer wins). Other modules (or future country
//   activation workflows) can register additional adapters via the same API.
//
// The existing `JurisdictionAdapter` Prisma model (countryCode + status +
// capabilities JSON) is left untouched — this in-memory registry is the richer
// SUPERSET that adds the language/currency/timezone/regulatory-source metadata
// the All-World narrative needs.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  registerCountryAdapter,
  type CountryAdapter,
} from "./index";

// Convenience: register an adapter object directly. Equivalent to
// `registerCountryAdapter(adapter.countryCode, adapter)` — but avoids the
// easy-to-make mistake of passing the adapter as the first arg only.
function register(adapter: CountryAdapter): void {
  registerCountryAdapter(adapter.countryCode, adapter);
}

// ── Helper to build a "full" adapter (all 6 capabilities true) ─────────────────
function fullAdapter(
  countryCode: string,
  countryName: string,
  region: string,
  language: string,
  currency: string,
  timezone: string,
  endpoints: { customsApi?: string; taxApi?: string; singleWindowApi?: string },
  regulations: { source: string; lastUpdated: string }[],
): CountryAdapter {
  return {
    countryCode,
    countryName,
    region,
    capabilities: {
      customsGateway: true,
      singleWindow: true,
      digitalSignature: true,
      electronicInvoice: true,
      taxEngine: true,
      sanctionsScreening: true,
    },
    endpoints,
    language,
    currency,
    timezone,
    regulations,
  };
}

// ── Helper to build a "partial" adapter (a subset of capabilities true) ───────
function partialAdapter(
  countryCode: string,
  countryName: string,
  region: string,
  language: string,
  currency: string,
  timezone: string,
  endpoints: { customsApi?: string; taxApi?: string; singleWindowApi?: string },
  regulations: { source: string; lastUpdated: string }[],
  caps: {
    customsGateway?: boolean;
    singleWindow?: boolean;
    digitalSignature?: boolean;
    electronicInvoice?: boolean;
    taxEngine?: boolean;
    sanctionsScreening?: boolean;
  },
): CountryAdapter {
  return {
    countryCode,
    countryName,
    region,
    capabilities: {
      customsGateway: caps.customsGateway ?? true,
      singleWindow: caps.singleWindow ?? false,
      digitalSignature: caps.digitalSignature ?? true,
      electronicInvoice: caps.electronicInvoice ?? false,
      taxEngine: caps.taxEngine ?? true,
      sanctionsScreening: caps.sanctionsScreening ?? true,
    },
    endpoints,
    language,
    currency,
    timezone,
    regulations,
  };
}

// ── Seed the registry on first import ──────────────────────────────────────────

let SEEDED = false;

export function seedAllWorldAdapters(): void {
  if (SEEDED) return;
  SEEDED = true;

  // === EGYPT (EG) — full ===
  register(
    fullAdapter(
      "EG",
      "Egypt",
      "MEA",
      "ar",
      "EGP",
      "Africa/Cairo",
      {
        customsApi: "https://api.nafeza.gov.eg/edi/v1",
        taxApi: "https://api.eta.gov.eg/api/v1",
        singleWindowApi: "https://www.nafeza.gov.eg",
      },
      [
        { source: "WTO Valuation Agreement", lastUpdated: "2024-01-01" },
        { source: "Egyptian Customs Law 66/1963", lastUpdated: "2024-06-01" },
        { source: "Egyptian Decree 770/2019 (ACI)", lastUpdated: "2024-06-01" },
        { source: "EU-Egypt Association Agreement (2004)", lastUpdated: "2024-01-01" },
        { source: "GAFTA (Greater Arab Free Trade Area)", lastUpdated: "2024-01-01" },
      ],
    ),
  );

  // === UAE (AE) — full ===
  register(
    fullAdapter(
      "AE",
      "United Arab Emirates",
      "GCC",
      "ar",
      "AED",
      "Asia/Dubai",
      {
        customsApi: "https://api.fca.gov.ae/v1",
        taxApi: "https://api.tax.gov.ae/v1",
        singleWindowApi: "https://www.dubaitrade.ae",
      },
      [
        { source: "GCC Common Customs Law", lastUpdated: "2024-01-01" },
        { source: "UAE Federal Law 7/2017 (Tax Procedures)", lastUpdated: "2024-06-01" },
        { source: "UAE Federal Law 8/2017 (VAT)", lastUpdated: "2024-06-01" },
        { source: "ESMA Digital Signature Regulation", lastUpdated: "2024-06-01" },
      ],
    ),
  );

  // === SAUDI ARABIA (SA) — full ===
  register(
    fullAdapter(
      "SA",
      "Saudi Arabia",
      "GCC",
      "ar",
      "SAR",
      "Asia/Riyadh",
      {
        customsApi: "https://www.fasah.sa/api/v1",
        taxApi: "https://api.zatca.gov.sa/v1",
        singleWindowApi: "https://www.fasah.sa",
      },
      [
        { source: "GCC Common Customs Law", lastUpdated: "2024-01-01" },
        { source: "Saudi VAT Law (Royal Decree M/113)", lastUpdated: "2024-06-01" },
        { source: "SASO Saber Regulation", lastUpdated: "2024-06-01" },
        { source: "ZATCA e-Invoicing Phase 2", lastUpdated: "2024-06-01" },
      ],
    ),
  );

  // === GERMANY (DE) — full ===
  register(
    fullAdapter(
      "DE",
      "Germany",
      "EU",
      "de",
      "EUR",
      "Europe/Berlin",
      {
        customsApi: "https://www.zoll.de/EDI/api/v1",
        taxApi: "https://www.elster.de/api/v1",
        singleWindowApi: "https://www.zoll.de",
      },
      [
        { source: "EU Customs Code (UCC Regulation 952/2013)", lastUpdated: "2024-01-01" },
        { source: "EU VAT Directive 2006/112/EC", lastUpdated: "2024-06-01" },
        { source: "German AO (Abgabenordnung)", lastUpdated: "2024-06-01" },
        { source: "eIDAS Regulation 910/2014 (QES)", lastUpdated: "2024-06-01" },
        { source: "XRechnung Standard 2.2+", lastUpdated: "2024-06-01" },
      ],
    ),
  );

  // === ITALY (IT) — full ===
  register(
    fullAdapter(
      "IT",
      "Italy",
      "EU",
      "it",
      "EUR",
      "Europe/Rome",
      {
        customsApi: "https://telematico.adm.gov.it/api/v1",
        taxApi: "https://api.fatturaPA.gov.it/v1",
        singleWindowApi: "https://www.adm.gov.it",
      },
      [
        { source: "EU Customs Code (UCC)", lastUpdated: "2024-01-01" },
        { source: "Italian DPR 633/1972 (VAT)", lastUpdated: "2024-06-01" },
        { source: "FatturaPA (XML P7M) Standard", lastUpdated: "2024-06-01" },
        { source: "eIDAS Regulation 910/2014", lastUpdated: "2024-06-01" },
      ],
    ),
  );

  // === NETHERLANDS (NL) — partial (no single window, no e-invoice) ===
  register(
    partialAdapter(
      "NL",
      "Netherlands",
      "EU",
      "nl",
      "EUR",
      "Europe/Amsterdam",
      {
        customsApi: "https://www.douane.nl/api/v1",
        taxApi: "https://www.belastingdienst.nl/api/v1",
      },
      [
        { source: "EU Customs Code (UCC)", lastUpdated: "2024-01-01" },
        { source: "Dutch VAT Act (Wet OB)", lastUpdated: "2024-06-01" },
        { source: "Peppol BIS 3.0 (e-invoice via Peppol)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );

  // === SPAIN (ES) — partial (no single window) ===
  register(
    partialAdapter(
      "ES",
      "Spain",
      "EU",
      "es",
      "EUR",
      "Europe/Madrid",
      {
        customsApi: "https://www.agenciatributaria.es/api/v1",
        taxApi: "https://www.agenciatributaria.es/api/v1",
      },
      [
        { source: "EU Customs Code (UCC)", lastUpdated: "2024-01-01" },
        { source: "Spanish VAT Law (Ley IVA)", lastUpdated: "2024-06-01" },
        { source: "Facturae 3.2 Standard", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );

  // === FRANCE (FR) — partial (no single window) ===
  register(
    partialAdapter(
      "FR",
      "France",
      "EU",
      "fr",
      "EUR",
      "Europe/Paris",
      {
        customsApi: "https://www.douane.gouv.fr/api/v1",
        taxApi: "https://www.impots.gouv.fr/api/v1",
      },
      [
        { source: "EU Customs Code (UCC)", lastUpdated: "2024-01-01" },
        { source: "French CGI (Code Général des Impôts)", lastUpdated: "2024-06-01" },
        { source: "Factur-X Standard (AFNOR)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );

  // === UNITED KINGDOM (GB) — partial (no single window, no e-invoice) ===
  register(
    partialAdapter(
      "GB",
      "United Kingdom",
      "EU", // Post-Brexit — kept in EU region for geographic convenience
      "en",
      "GBP",
      "Europe/London",
      {
        customsApi: "https://api.declaration.tax.service.gov.uk/v1",
        taxApi: "https://api.tax.service.gov.uk/v1",
      },
      [
        { source: "Taxation (Cross-border Trade) Act 2018", lastUpdated: "2024-01-01" },
        { source: "UK VAT Act 1994", lastUpdated: "2024-06-01" },
        { source: "UK eIDAS (Electronic Communications Act)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: false,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );

  // === UNITED STATES (US) — partial (no single window, no national e-invoice) ===
  register(
    partialAdapter(
      "US",
      "United States",
      "NAFTA",
      "en",
      "USD",
      "America/New_York",
      {
        customsApi: "https://api.cbp.gov/ace/v1",
        taxApi: "https://api.irs.gov/v1",
      },
      [
        { source: "Tariff Act of 1930 (HTSUS)", lastUpdated: "2024-01-01" },
        { source: "Trade Act of 2002 (ACE)", lastUpdated: "2024-06-01" },
        { source: "OFAC Sanctions Regulations", lastUpdated: "2024-06-01" },
        { source: "BIS EAR (Export Administration Regulations)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: false,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );

  // === CHINA (CN) — partial ===
  register(
    partialAdapter(
      "CN",
      "China",
      "APAC",
      "zh",
      "CNY",
      "Asia/Shanghai",
      {
        customsApi: "https://www.singlewindow.cn/api/v1",
        taxApi: "https://www.chinatax.gov.cn/api/v1",
      },
      [
        { source: "Customs Law of the PRC", lastUpdated: "2024-01-01" },
        { source: "PRC VAT Provisional Regulations", lastUpdated: "2024-06-01" },
        { source: "GACC Single Window Regulation", lastUpdated: "2024-06-01" },
        { source: "Golden Tax System (e-fapiao)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === INDIA (IN) — partial ===
  register(
    partialAdapter(
      "IN",
      "India",
      "APAC",
      "hi",
      "INR",
      "Asia/Kolkata",
      {
        customsApi: "https://www.icegate.gov.in/api/v1",
        taxApi: "https://api.gst.gov.in/v1",
      },
      [
        { source: "Indian Customs Act 1962", lastUpdated: "2024-01-01" },
        { source: "GST Act 2017 (CGST + SGST + IGST)", lastUpdated: "2024-06-01" },
        { source: "ICEGATE Single Window", lastUpdated: "2024-06-01" },
        { source: "GSTN e-invoice (IRN)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === SINGAPORE (SG) — full ===
  register(
    fullAdapter(
      "SG",
      "Singapore",
      "APAC",
      "en",
      "SGD",
      "Asia/Singapore",
      {
        customsApi: "https://api.tradenet.gov.sg/v1",
        taxApi: "https://api.iras.gov.sg/v1",
        singleWindowApi: "https://www.tradenet.gov.sg",
      },
      [
        { source: "Singapore Customs Act", lastUpdated: "2024-01-01" },
        { source: "Singapore GST Act", lastUpdated: "2024-06-01" },
        { source: "TradeNet Single Window", lastUpdated: "2024-06-01" },
        { source: "IMDA Peppol InvoiceNow", lastUpdated: "2024-06-01" },
        { source: "MAS Sanctions Regulations", lastUpdated: "2024-06-01" },
      ],
    ),
  );

  // === AUSTRALIA (AU) — partial (no single window) ===
  register(
    partialAdapter(
      "AU",
      "Australia",
      "APAC",
      "en",
      "AUD",
      "Australia/Sydney",
      {
        customsApi: "https://www.abf.gov.au/api/v1",
        taxApi: "https://api.ato.gov.au/v1",
      },
      [
        { source: "Customs Act 1901", lastUpdated: "2024-01-01" },
        { source: "A New Tax System (GST) Act 1999", lastUpdated: "2024-06-01" },
        { source: "DFAT Sanctions Regulations", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );

  // === BRAZIL (BR) — partial ===
  register(
    partialAdapter(
      "BR",
      "Brazil",
      "LATAM",
      "pt-BR",
      "BRL",
      "America/Sao_Paulo",
      {
        customsApi: "https://www4.receita.fazenda.gov.br/api/v1",
        taxApi: "https://api.rfb.gov.br/v1",
      },
      [
        { source: "Brazilian Customs Regulation (Decreto-Lei 37/1966)", lastUpdated: "2024-01-01" },
        { source: "Brazilian Tax Code (CTN)", lastUpdated: "2024-06-01" },
        { source: "ICMS Regulation (state VAT)", lastUpdated: "2024-06-01" },
        { source: "NF-e (Nota Fiscal Eletrônica)", lastUpdated: "2024-06-01" },
        { source: "ICP-Brasil Digital Signature", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === SOUTH KOREA (KR) — partial ===
  register(
    partialAdapter(
      "KR",
      "South Korea",
      "APAC",
      "ko",
      "KRW",
      "Asia/Seoul",
      {
        customsApi: "https://api.customs.go.kr/v1",
        taxApi: "https://api.hometax.go.kr/v1",
      },
      [
        { source: "Customs Act (Republic of Korea)", lastUpdated: "2024-01-01" },
        { source: "Value Added Tax Act (Korea)", lastUpdated: "2024-06-01" },
        { source: "UNI-PASS Single Window", lastUpdated: "2024-06-01" },
        { source: "e-Tax Invoice (NTS)", lastUpdated: "2024-06-01" },
        { source: "KISA Digital Signature Act", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === CHILE (CL) — partial ===
  register(
    partialAdapter(
      "CL",
      "Chile",
      "LATAM",
      "es",
      "CLP",
      "America/Santiago",
      {
        customsApi: "https://www.aduana.cl/api/v1",
        taxApi: "https://api.sii.cl/v1",
      },
      [
        { source: "Chilean Customs Ordinance (Ordenanza de Aduanas)", lastUpdated: "2024-01-01" },
        { source: "Chilean VAT Law (DL 825/1974)", lastUpdated: "2024-06-01" },
        { source: "SICEX Single Window", lastUpdated: "2024-06-01" },
        { source: "SII e-invoice (XML CFD)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === COLOMBIA (CO) — partial ===
  register(
    partialAdapter(
      "CO",
      "Colombia",
      "LATAM",
      "es",
      "COP",
      "America/Bogota",
      {
        customsApi: "https://api.dian.gov.co/v1",
        taxApi: "https://api.dian.gov.co/v1",
      },
      [
        { source: "Colombian Customs Statute (Decreto 1165/2019)", lastUpdated: "2024-01-01" },
        { source: "Colombian VAT Statute (E.T. Art 420)", lastUpdated: "2024-06-01" },
        { source: "DIAN e-invoice (UBL 2.1)", lastUpdated: "2024-06-01" },
        { source: "ONAUTH Digital Signature", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: false,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === VIETNAM (VN) — partial ===
  register(
    partialAdapter(
      "VN",
      "Vietnam",
      "APAC",
      "vi",
      "VND",
      "Asia/Ho_Chi_Minh",
      {
        customsApi: "https://api.customs.gov.vn/v1",
        taxApi: "https://api.gdt.gov.vn/v1",
      },
      [
        { source: "Vietnam Customs Law 54/2014/QH13", lastUpdated: "2024-01-01" },
        { source: "Vietnam VAT Law (Luật Thuế GTGT)", lastUpdated: "2024-06-01" },
        { source: "VNACCS Single Window", lastUpdated: "2024-06-01" },
        { source: "EVFTA (EU-Vietnam FTA)", lastUpdated: "2024-06-01" },
        { source: "GDT e-invoice (Hóa đơn điện tử)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === TURKEY (TR) — partial ===
  register(
    partialAdapter(
      "TR",
      "Turkey",
      "MEA",
      "tr",
      "TRY",
      "Europe/Istanbul",
      {
        customsApi: "https://api.gumruk.gov.tr/v1",
        taxApi: "https://api.gib.gov.tr/v1",
      },
      [
        { source: "Turkish Customs Law 4458/1999", lastUpdated: "2024-01-01" },
        { source: "Turkish VAT Law 3065/1984", lastUpdated: "2024-06-01" },
        { source: "BILGE Single Window", lastUpdated: "2024-06-01" },
        { source: "GIB e-Fatura", lastUpdated: "2024-06-01" },
        { source: "EU-Turkey Customs Union (Decision 1/95)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: true,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === KENYA (KE) — partial ===
  register(
    partialAdapter(
      "KE",
      "Kenya",
      "AFRICA",
      "sw",
      "KES",
      "Africa/Nairobi",
      {
        customsApi: "https://api.kra.go.ke/v1",
        taxApi: "https://api.kra.go.ke/v1",
      },
      [
        { source: "Kenya EACMA (East African Community Customs Mgmt Act)", lastUpdated: "2024-01-01" },
        { source: "Kenya VAT Act 2013", lastUpdated: "2024-06-01" },
        { source: "KRA Simba System", lastUpdated: "2024-06-01" },
        { source: "Kenya TradeNet Single Window", lastUpdated: "2024-06-01" },
        { source: "EU-Kenya EPA (2014)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: false,
        electronicInvoice: true,
        taxEngine: true,
        sanctionsScreening: false,
      },
    ),
  );

  // === SOUTH AFRICA (ZA) — partial ===
  register(
    partialAdapter(
      "ZA",
      "South Africa",
      "AFRICA",
      "en",
      "ZAR",
      "Africa/Johannesburg",
      {
        customsApi: "https://api.sars.gov.za/v1",
        taxApi: "https://api.sars.gov.za/v1",
      },
      [
        { source: "South African Customs and Excise Act 91/1964", lastUpdated: "2024-01-01" },
        { source: "South African VAT Act 89/1991", lastUpdated: "2024-06-01" },
        { source: "SARS e@w Single Window", lastUpdated: "2024-06-01" },
        { source: "SADC FTA (Southern African Development Community)", lastUpdated: "2024-06-01" },
      ],
      {
        customsGateway: true,
        singleWindow: true,
        digitalSignature: false,
        electronicInvoice: false,
        taxEngine: true,
        sanctionsScreening: true,
      },
    ),
  );
}

// ── Initialise on import (idempotent — SEEDED guard) ─────────────────────────
seedAllWorldAdapters();

// ── Test helper: reset SEEDED flag (only used by tests / dev) ─────────────────
export function _resetAllWorldSeedFlag(): void {
  SEEDED = false;
}
