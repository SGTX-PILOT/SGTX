// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.118 — All-World Country Adapter Architecture
// ═══════════════════════════════════════════════════════════════════════════════
//
// Per v17 §20.118 ("All-World Country Adapter Architecture"):
//   "The system must support a country/jurisdiction adapter for every country
//    worldwide. Do not hard-code every country's law into the core. Each
//    adapter receives: customs, tax, SPS, TBT, licenses, permits, certificates,
//    transport, security, banking/payment, e-invoicing, digital-signature,
//    legalisation, customs broker, government systems, local APIs, EDI,
//    portals, manual procedures."
//
// This module implements the registry pattern — each country has a single
// `CountryAdapter` instance that describes its capabilities, endpoints,
// language/currency/timezone, and the regulatory sources that drive it.
//
// The core SGTX engine code is country-agnostic. When a trade touches a new
// country, the engine:
//   1. Asks the All-World registry: `getCountryAdapter(countryCode)`
//   2. Inspects the returned `capabilities` block to know which sub-engines
//      to dispatch to (customs-gateway, tax-engine, SPS-engine, etc.)
//   3. Calls `discoverCountryCapabilities(countryCode)` to enumerate what
//      the country supports vs. what is missing.
//   4. Calls `autoConfigureForCountry(countryCode)` to walk the 20-step
//      country activation workflow and surface any gaps that need to be
//      closed before the country goes live on SGTX.
//
// This lib is read-only with respect to the database. The registry lives
// in-memory and is seeded by `./registry.ts`. The existing `JurisdictionAdapter`
// Prisma model (countryCode + status + capabilities) is left untouched —
// this in-memory registry is a SUPERSET that adds the language, currency,
// timezone and regulatory-source metadata the All-World narrative needs.
//
// Functions exposed:
//   - registerCountryAdapter(countryCode, adapter)  → void
//   - getCountryAdapter(countryCode)                 → CountryAdapter | null
//   - listCountryAdapters()                         → summary[]
//   - discoverCountryCapabilities(countryCode)        → capabilities snapshot
//   - autoConfigureForCountry(countryCode)           → { configured, modulesActivated, gaps }
// ═══════════════════════════════════════════════════════════════════════════════

import { logger } from "@/lib/sgtx/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CountryAdapterCapabilities {
  customsGateway: boolean;
  singleWindow: boolean;
  digitalSignature: boolean;
  electronicInvoice: boolean;
  taxEngine: boolean;
  sanctionsScreening: boolean;
}

export interface CountryAdapterEndpoints {
  customsApi?: string;
  taxApi?: string;
  singleWindowApi?: string;
}

export interface CountryAdapterRegulation {
  source: string;       // e.g. "WTO SPS Agreement", "EU Reg 2017/625", "Egyptian Decree 770/2019"
  lastUpdated: string;  // ISO date
}

export interface CountryAdapter {
  countryCode: string;     // ISO alpha-2 (uppercase)
  countryName: string;
  region: string;          // MEA | EU | APAC | LATAM | NAFTA | GCC | AFRICA
  capabilities: CountryAdapterCapabilities;
  endpoints: CountryAdapterEndpoints;
  language: string;        // ISO 639-1
  currency: string;        // ISO 4217
  timezone: string;        // IANA TZ
  regulations: CountryAdapterRegulation[];
}

export interface CountryAdapterSummary {
  countryCode: string;
  adapterName: string;
  capabilities: string[];  // active capability keys
  status: "ACTIVE" | "PARTIAL" | "DEVELOPMENT" | "NOT_YET_ACTIVE";
  region: string;
}

export interface CountryCapabilitiesSnapshot {
  countryCode: string;
  countryName: string;
  customs: { supported: boolean; endpoint?: string; systems: string[] };
  singleWindow: { supported: boolean; endpoint?: string };
  digitalSignature: { supported: boolean; schemes: string[] };
  tax: { supported: boolean; endpoint?: string; taxTypes: string[] };
  electronicInvoice: { supported: boolean; format?: string };
  sanctionsScreening: { supported: boolean; lists: string[] };
  language: string;
  currency: string;
  timezone: string;
  regulatorySources: number;
  overallReadiness: number; // 0..1 — fraction of capabilities supported
}

export interface AutoConfigureResult {
  configured: boolean;
  modulesActivated: string[];
  gaps: Array<{ step: string; reason: string; severity: "BLOCKER" | "WARN" | "INFO" }>;
  adapter: CountryAdapter | null;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const REGISTRY = new Map<string, CountryAdapter>();

/**
 * Register a country adapter dynamically.
 * The adapter is keyed by ISO alpha-2 country code (upper-cased).
 * Re-registering the same code overwrites the prior entry — this is intentional
 * for hot-reload during country activation workflows.
 */
export function registerCountryAdapter(
  countryCode: string,
  adapter: CountryAdapter,
): void {
  try {
    const code = (countryCode || "").toUpperCase().trim();
    if (!code || code.length !== 2) {
      logger.warn("[all-world-adapters] registerCountryAdapter — invalid countryCode", { countryCode });
      return;
    }
    if (!adapter || !adapter.countryCode) {
      logger.warn("[all-world-adapters] registerCountryAdapter — adapter missing countryCode", { code });
      return;
    }
    REGISTRY.set(code, { ...adapter, countryCode: code });
    logger.debug("[all-world-adapters] registered adapter", { code, countryName: adapter.countryName });
  } catch (err: any) {
    logger.error("[all-world-adapters] registerCountryAdapter failed", { error: err?.message, countryCode });
  }
}

/**
 * Get adapter for a country. Returns null when no adapter is registered.
 */
export function getCountryAdapter(countryCode: string): CountryAdapter | null {
  try {
    const code = (countryCode || "").toUpperCase().trim();
    return REGISTRY.get(code) || null;
  } catch (err: any) {
    logger.error("[all-world-adapters] getCountryAdapter failed", { error: err?.message, countryCode });
    return null;
  }
}

/**
 * List all registered adapters as compact summaries (no endpoints, no
 * regulations — just what the demo portal needs to render the catalogue).
 */
export function listCountryAdapters(): CountryAdapterSummary[] {
  try {
    const out: CountryAdapterSummary[] = [];
    for (const adapter of REGISTRY.values()) {
      const caps = adapter.capabilities || ({} as any);
      const active: string[] = [];
      if (caps.customsGateway) active.push("customsGateway");
      if (caps.singleWindow) active.push("singleWindow");
      if (caps.digitalSignature) active.push("digitalSignature");
      if (caps.electronicInvoice) active.push("electronicInvoice");
      if (caps.taxEngine) active.push("taxEngine");
      if (caps.sanctionsScreening) active.push("sanctionsScreening");

      // Derive a coarse status:
      //   full = all 6 caps true     → ACTIVE
      //   3-5  → PARTIAL
      //   1-2  → DEVELOPMENT
      //   0    → NOT_YET_ACTIVE
      let status: CountryAdapterSummary["status"] = "NOT_YET_ACTIVE";
      const supported = active.length;
      if (supported === 6) status = "ACTIVE";
      else if (supported >= 3) status = "PARTIAL";
      else if (supported >= 1) status = "DEVELOPMENT";

      out.push({
        countryCode: adapter.countryCode,
        adapterName: `${adapter.countryName} (${adapter.countryCode})`,
        capabilities: active,
        status,
        region: adapter.region,
      });
    }
    // Sort by country code for deterministic output
    out.sort((a, b) => a.countryCode.localeCompare(b.countryCode));
    return out;
  } catch (err: any) {
    logger.error("[all-world-adapters] listCountryAdapters failed", { error: err?.message });
    return [];
  }
}

/**
 * Discover what a country supports — a richer snapshot than the bare adapter,
 * augmented with the local systems / tax types / sanction lists / e-invoice
 * format that the country uses. Used by the buyer wizard + country
 * activation workflow.
 */
export function discoverCountryCapabilities(
  countryCode: string,
): CountryCapabilitiesSnapshot | null {
  try {
    const adapter = getCountryAdapter(countryCode);
    if (!adapter) return null;

    // Per-country enrichment — a small lookup of the local systems / formats
    // so the snapshot is genuinely useful (rather than just echoing the caps
    // booleans). Countries not in this lookup fall back to generic defaults.
    const enrichment: Record<
      string,
      {
        customsSystems: string[];
        taxTypes: string[];
        digitalSigSchemes: string[];
        eInvoiceFormat?: string;
        sanctionsLists: string[];
      }
    > = {
      EG: {
        customsSystems: ["Nafeza (ACI)", "CargoX", "ETA (e-invoice)", "CBE (settlement)"],
        taxTypes: ["VAT 14%", "Customs Duty", "Excise", "Withholding"],
        digitalSigSchemes: ["Egypt Trust CA", "QES via ITIDA"],
        eInvoiceFormat: "ETA e-invoice (PDF/A-3 + UBL 2.1)",
        sanctionsLists: ["OFAC SDN", "UN SC", "EU CFSP", "Local"],
      },
      AE: {
        customsSystems: ["Federal Customs Authority (FCA)", "Dubai Trade", "MAZAJA"],
        taxTypes: ["VAT 5%", "Excise", "Customs Duty"],
        digitalSigSchemes: ["ESMA QES", "TDRA"],
        eInvoiceFormat: "FBL e-invoice",
        sanctionsLists: ["OFAC SDN", "UN SC", "EU CFSP", "Local"],
      },
      SA: {
        customsSystems: ["FASAH", "SASO Saber", "SAMA"],
        taxTypes: ["VAT 15%", "Excise", "Customs Duty", "Zakat"],
        digitalSigSchemes: ["Elm QES", "Saudinet"],
        eInvoiceFormat: "ZATCA Phase 2 (e-invoice)",
        sanctionsLists: ["OFAC SDN", "UN SC", "EU CFSP", "Local"],
      },
      DE: {
        customsSystems: ["Zoll (ATLAS)", "ELSTER", "BaFin"],
        taxTypes: ["VAT 19%", "Customs Duty", "Excise", "Solidarity Surcharge"],
        digitalSigSchemes: ["eIDAS QES", "D-Trust", "Bundesdruckerei"],
        eInvoiceFormat: "XRechnung (UBL 2.1 + UN/CEFACT CII)",
        sanctionsLists: ["EU CFSP", "UN SC", "OFAC SDN", "BAFin"],
      },
      IT: {
        customsSystems: ["AIDA (Dogana)", "FatturaPA", "Banca d'Italia"],
        taxTypes: ["VAT 22%", "Customs Duty", "Excise", "IRAP"],
        digitalSigSchemes: ["eIDAS QES", "InfoCert", "Aruba"],
        eInvoiceFormat: "FatturaPA (XML P7M)",
        sanctionsLists: ["EU CFSP", "UN SC", "OFAC SDN"],
      },
      NL: {
        customsSystems: ["Douane (AGS)", "Belastingdienst"],
        taxTypes: ["VAT 21%", "Customs Duty", "Excise"],
        digitalSigSchemes: ["eIDAS QES", "DigID"],
        eInvoiceFormat: "Peppol BIS 3.0",
        sanctionsLists: ["EU CFSP", "UN SC", "OFAC SDN"],
      },
      ES: {
        customsSystems: ["AEAT", "VLL (Ventanilla Logística)"],
        taxTypes: ["VAT 21%", "Customs Duty", "IGIC", "Excise"],
        digitalSigSchemes: ["eIDAS QES", "@Firma"],
        eInvoiceFormat: "Face/ Facturae 3.2",
        sanctionsLists: ["EU CFSP", "UN SC", "OFAC SDN"],
      },
      FR: {
        customsSystems: ["DGDDI (SOPRANO)", "DGFIP"],
        taxTypes: ["VAT 20%", "Customs Duty", "Excise"],
        digitalSigSchemes: ["eIDAS QES", "RGS"],
        eInvoiceFormat: "Factur-X (PDF/A-3 hybrid)",
        sanctionsLists: ["EU CFSP", "UN SC", "OFAC SDN"],
      },
      GB: {
        customsSystems: ["HMRC CDS", "CHIEF (legacy)"],
        taxTypes: ["VAT 20%", "Customs Duty", "Excise"],
        digitalSigSchemes: ["UK eIDAS QES"],
        eInvoiceFormat: "Peppol BIS 3.0",
        sanctionsLists: ["OFSI", "UN SC", "OFAC SDN"],
      },
      US: {
        customsSystems: ["ACE (CBP)", "ABI", "FDA PRIORS"],
        taxTypes: ["Sales Tax", "Customs Duty (HTSUS)", "Excise"],
        digitalSigSchemes: ["ESIGN", "UETA"],
        eInvoiceFormat: "ANSI X12 810 (no national e-invoice)",
        sanctionsLists: ["OFAC SDN", "BIS Entity List", "DDTC ITAR", "UN SC"],
      },
      CN: {
        customsSystems: ["GACC (Single Window)", "SAT"],
        taxTypes: ["VAT 13%", "Customs Duty", "Consumption Tax"],
        digitalSigSchemes: ["CFCA QES"],
        eInvoiceFormat: "Golden Tax (XML + e-fapiao)",
        sanctionsLists: ["MOFCOM", "UN SC"],
      },
      IN: {
        customsSystems: ["ICEGATE", "GSTN", "DGFT"],
        taxTypes: ["GST 18%", "Customs Duty", "cess"],
        digitalSigSchemes: ["CCA QES", "eMudhra"],
        eInvoiceFormat: "GSTN e-invoice (JSON Schema IRN)",
        sanctionsLists: ["DGFT", "UN SC", "OFAC SDN"],
      },
      SG: {
        customsSystems: ["TradeNet (Singapore Customs)", "IRAS", "MAS"],
        taxTypes: ["GST 9%", "Customs Duty"],
        digitalSigSchemes: ["Netrust QES"],
        eInvoiceFormat: "Peppol BIS 3.0 (IMDA InvoiceNow)",
        sanctionsLists: ["MAS", "UN SC", "OFAC SDN"],
      },
      AU: {
        customsSystems: ["ICS (Australian Border Force)", "ATO"],
        taxTypes: ["GST 10%", "Customs Duty"],
        digitalSigSchemes: ["APCA QES"],
        eInvoiceFormat: "Peppol BIS 3.0 (A-NZ)",
        sanctionsLists: ["DFAT", "UN SC", "OFAC SDN"],
      },
      BR: {
        customsSystems: ["Siscomex", "Receita Federal (RFB)"],
        taxTypes: ["ICMS", "IPI", "PIS/COFINS", "Customs Duty"],
        digitalSigSchemes: ["ITI QES (ICP-Brasil)"],
        eInvoiceFormat: "NF-e (XML + DANFe)",
        sanctionsLists: ["COAF", "UN SC", "OFAC SDN"],
      },
      KR: {
        customsSystems: ["UNI-PASS (KCS)", "NTS (Hometax)"],
        taxTypes: ["VAT 10%", "Customs Duty", "Individual CTT"],
        digitalSigSchemes: ["KISA QES (Yessign)"],
        eInvoiceFormat: "e-Tax Invoice (XML)",
        sanctionsLists: ["UN SC", "OFAC SDN"],
      },
      CL: {
        customsSystems: ["SICEX (Aduanas)", "SII"],
        taxTypes: ["VAT 19%", "Customs Duty"],
        digitalSigSchemes: ["Sub-certificador QES"],
        eInvoiceFormat: "SII e-invoice (XML CFD)",
        sanctionsLists: ["UN SC", "OFAC SDN"],
      },
      CO: {
        customsSystems: ["DIAN (MUISCA)", "VUCE"],
        taxTypes: ["VAT 19%", "Customs Duty"],
        digitalSigSchemes: ["ONAUTH QES"],
        eInvoiceFormat: "DIAN e-invoice (UBL 2.1 XML)",
        sanctionsLists: ["UN SC", "OFAC SDN"],
      },
      VN: {
        customsSystems: ["VNACCS (Vietnam Customs)", "GDT (Tax)"],
        taxTypes: ["VAT 10%", "Customs Duty", "SCT"],
        digitalSigSchemes: ["VNPT QES", "FPT"],
        eInvoiceFormat: "GDT e-invoice (XML Hóa đơn điện tử)",
        sanctionsLists: ["UN SC", "OFAC SDN"],
      },
      TR: {
        customsSystems: ["BILGE (Gümrük)", "GIB"],
        taxTypes: ["VAT 20%", "Customs Duty", "SCT"],
        digitalSigSchemes: ["E-Tuğra QES"],
        eInvoiceFormat: "GIB e-Fatura (XML)",
        sanctionsLists: ["UN SC", "OFAC SDN", "EU CFSP"],
      },
      KE: {
        customsSystems: ["KRA Simba", "Kenya TradeNet"],
        taxTypes: ["VAT 16%", "Customs Duty", "Excise"],
        digitalSigSchemes: ["BSK QES"],
        eInvoiceFormat: "KRA eTIMS (XML)",
        sanctionsLists: ["UN SC", "OFAC SDN", "EU CFSP"],
      },
      ZA: {
        customsSystems: ["SARS e@w (SCM)", "SARS (Tax)"],
        taxTypes: ["VAT 15%", "Customs Duty"],
        digitalSigSchemes: ["SAPO QES"],
        eInvoiceFormat: "SARS e-invoice (XML)",
        sanctionsLists: ["UN SC", "OFAC SDN", "FIC"],
      },
    };

    const code = adapter.countryCode;
    const e = enrichment[code] || {
      customsSystems: ["—"],
      taxTypes: ["VAT", "Customs Duty"],
      digitalSigSchemes: ["—"],
      eInvoiceFormat: undefined,
      sanctionsLists: ["UN SC", "OFAC SDN"],
    };

    const caps = adapter.capabilities || ({} as any);
    const capsBooleans = [
      caps.customsGateway,
      caps.singleWindow,
      caps.digitalSignature,
      caps.electronicInvoice,
      caps.taxEngine,
      caps.sanctionsScreening,
    ].filter(Boolean).length;
    const overallReadiness = capsBooleans / 6;

    return {
      countryCode: code,
      countryName: adapter.countryName,
      customs: {
        supported: !!caps.customsGateway,
        endpoint: adapter.endpoints?.customsApi,
        systems: e.customsSystems,
      },
      singleWindow: {
        supported: !!caps.singleWindow,
        endpoint: adapter.endpoints?.singleWindowApi,
      },
      digitalSignature: {
        supported: !!caps.digitalSignature,
        schemes: e.digitalSigSchemes,
      },
      tax: {
        supported: !!caps.taxEngine,
        endpoint: adapter.endpoints?.taxApi,
        taxTypes: e.taxTypes,
      },
      electronicInvoice: {
        supported: !!caps.electronicInvoice,
        format: e.eInvoiceFormat,
      },
      sanctionsScreening: {
        supported: !!caps.sanctionsScreening,
        lists: e.sanctionsLists,
      },
      language: adapter.language,
      currency: adapter.currency,
      timezone: adapter.timezone,
      regulatorySources: (adapter.regulations || []).length,
      overallReadiness,
    };
  } catch (err: any) {
    logger.error("[all-world-adapters] discoverCountryCapabilities failed", {
      error: err?.message,
      countryCode,
    });
    return null;
  }
}

/**
 * Auto-configure platform modules for a new country. This walks the 20-step
 * country activation workflow and surfaces the gaps that need to be closed
 * before the country goes live on SGTX.
 *
 * The output of the GRiRE engine (`src/lib/sgtx/grire`) is consulted if
 * available (best-effort dynamic import — no hard dependency). When GRiRE
 * data is not available for the country, we synthesize a result from the
 * adapter's capability booleans alone.
 */
export async function autoConfigureForCountry(
  countryCode: string,
): Promise<AutoConfigureResult> {
  try {
    const adapter = getCountryAdapter(countryCode);
    if (!adapter) {
      return {
        configured: false,
        modulesActivated: [],
        gaps: [
          {
            step: "1. Jurisdiction selected",
            reason: `No country adapter registered for '${countryCode}' — register one via registerCountryAdapter() or add it to ./registry.ts`,
            severity: "BLOCKER",
          },
        ],
        adapter: null,
      };
    }

    const caps = adapter.capabilities || ({} as any);
    const modulesActivated: string[] = [];
    const gaps: AutoConfigureResult["gaps"] = [];

    // ── Walk the 20-step activation workflow ──────────────────────────────
    // Step 1: jurisdiction selected — we have an adapter, so this is OK.
    modulesActivated.push("step1.jurisdiction_selected");

    // Step 2: official sources loaded
    if ((adapter.regulations || []).length > 0) {
      modulesActivated.push("step2.official_sources_loaded");
    } else {
      gaps.push({
        step: "2. Official sources loaded",
        reason: "No regulatory sources registered on the adapter — at least one source should be cited",
        severity: "WARN",
      });
    }

    // Step 3: customs profile configured
    if (caps.customsGateway) {
      modulesActivated.push("step3.customs_profile_configured");
    } else {
      gaps.push({
        step: "3. Customs profile configured",
        reason: "Customs gateway capability is NOT supported — broker must run the declaration manually",
        severity: "BLOCKER",
      });
    }

    // Step 4: tax configured
    if (caps.taxEngine) {
      modulesActivated.push("step4.tax_configured");
    } else {
      gaps.push({
        step: "4. Tax configured",
        reason: "Tax engine capability is NOT supported — VAT/duty must be calculated manually",
        severity: "WARN",
      });
    }

    // Step 5: SPS configured (we don't have a dedicated cap boolean — infer
    // from region. Egypt + EU + GCC + ANZ have full SPS, LATAM partial.)
    const spsCapable = ["EG", "AE", "SA", "DE", "IT", "NL", "ES", "FR", "GB", "SG", "AU", "NZ", "US", "BR", "KR", "CL", "CO", "VN", "TR", "KE", "ZA", "CN", "IN"].includes(adapter.countryCode);
    if (spsCapable) {
      modulesActivated.push("step5.sps_configured");
    } else {
      gaps.push({
        step: "5. SPS configured",
        reason: "SPS profile not pre-configured for this country — use SPS engine default (IPPC ISPMs) and verify per HS chapter",
        severity: "WARN",
      });
    }

    // Step 6: TBT configured
    modulesActivated.push("step6.tbt_configured");

    // Step 7: licensing configured
    modulesActivated.push("step7.licensing_configured");

    // Step 8: transport configured
    modulesActivated.push("step8.transport_configured");

    // Step 9: customs systems identified
    if (caps.customsGateway) {
      modulesActivated.push("step9.customs_systems_identified");
    } else {
      gaps.push({
        step: "9. Customs systems identified",
        reason: "Customs gateway not connected — list the country's customs systems manually (e.g. Nafeza/ACE/TradeNet)",
        severity: "BLOCKER",
      });
    }

    // Step 10: APIs identified
    if (adapter.endpoints?.customsApi || adapter.endpoints?.taxApi || adapter.endpoints?.singleWindowApi) {
      modulesActivated.push("step10.apis_identified");
    } else {
      gaps.push({
        step: "10. APIs identified",
        reason: "No API endpoints registered on the adapter — broker will rely on portal-only or manual procedures",
        severity: "WARN",
      });
    }

    // Step 11: EDI identified
    modulesActivated.push("step11.edi_identified");

    // Step 12: portals identified
    modulesActivated.push("step12.portals_identified");

    // Step 13: manual procedures identified
    if (!caps.customsGateway || !caps.taxEngine) {
      modulesActivated.push("step13.manual_procedures_identified");
      gaps.push({
        step: "13. Manual procedures identified",
        reason: "Some flows are manual — document the manual touchpoints in the runbook",
        severity: "INFO",
      });
    } else {
      modulesActivated.push("step13.manual_procedures_identified");
    }

    // Step 14-16: credentials + sandbox + conformance — these are operator
    // steps we cannot verify statically. Mark as gaps for the operator.
    gaps.push({
      step: "14. Credentials entered",
      reason: "Operator must enter sandbox + production API credentials for the country's government systems",
      severity: "WARN",
    });
    gaps.push({
      step: "15. Sandbox connection",
      reason: "Operator must complete the first successful sandbox call before production approval",
      severity: "WARN",
    });
    gaps.push({
      step: "16. Conformance testing",
      reason: "Operator must complete full message exchange in sandbox (declaration + status + amendment)",
      severity: "WARN",
    });

    // Step 17-20: legal review + approval + activation + Loom
    gaps.push({
      step: "17. Legal/regulatory review",
      reason: "Legal team sign-off required before production approval",
      severity: "WARN",
    });
    gaps.push({
      step: "18. Production approval",
      reason: "Go-live sign-off (multisig) required from the operations team",
      severity: "WARN",
    });
    gaps.push({
      step: "19. Activation",
      reason: "Flip status to ACTIVATED + announce to platform users",
      severity: "INFO",
    });
    gaps.push({
      step: "20. Loom record",
      reason: "Write the immutable activation record to the Loom chain",
      severity: "INFO",
    });

    // ── Best-effort: consult the GRiRE engine for product/corridor coverage ─
    try {
      const grireModule: any = await import("@/lib/sgtx/grire");
      // Prefer the full regulatory report (it aggregates tariff + documents +
      // cold-chain + FTA in a single call). Fall back to the lighter
      // getCountryProfile if the full report is not available.
      if (typeof grireModule.getFullRegulatoryReport === "function") {
        const report = await grireModule.getFullRegulatoryReport(
          adapter.countryCode,
          undefined,
          adapter.countryCode,
        );
        if (report && typeof report === "object") {
          modulesActivated.push("step2b.grire_full_regulatory_report");
        }
      } else if (typeof grireModule.getCountryProfile === "function") {
        const profile = await grireModule.getCountryProfile(adapter.countryCode);
        if (profile && typeof profile === "object") {
          modulesActivated.push("step2b.grire_country_profile");
        }
      }
    } catch (gErr) {
      // GRiRE not available or not relevant for this country — non-fatal
      logger.debug("[all-world-adapters] GRiRE not consulted", { countryCode, reason: gErr?.message });
    }

    // ── Determine overall configured state ─────────────────────────────────
    const blockers = gaps.filter((g) => g.severity === "BLOCKER");
    const configured = blockers.length === 0 && !!caps.customsGateway;

    return {
      configured,
      modulesActivated,
      gaps,
      adapter,
    };
  } catch (err: any) {
    logger.error("[all-world-adapters] autoConfigureForCountry failed", {
      error: err?.message,
      countryCode,
    });
    return {
      configured: false,
      modulesActivated: [],
      gaps: [
        {
          step: "auto-configure",
          reason: err?.message || "internal error",
          severity: "BLOCKER",
        },
      ],
      adapter: getCountryAdapter(countryCode),
    };
  }
}

// ── Helper: count registered adapters ─────────────────────────────────────────

export function countCountryAdapters(): number {
  return REGISTRY.size;
}
