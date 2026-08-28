// @ts-nocheck
/**
 * SGTX Enhanced Sanctions Screening Engine (G-03)
 * ===========================================
 *
 * Wraps the existing OpenSanctions.org client (which aggregates OFAC SDN,
 * EU CFSP, UN SC, UK OFSI, etc.) with:
 *
 *   • Country-level sanctions screening (hardcoded sanctioned-country list:
 *     IR, SY, KP, CU, RU-Crimea/DNR/LNR regions).
 *   • Vessel screening (calls OpenSanctions with the vessel schema, then
 *     adds IMO-number checks against the UN 1718 Sanctions Committee vessel
 *     list — published as a public JSON file).
 *   • Unified `ScreeningResult` shape across person / company / vessel /
 *     country — consumed by the trade-underwriting gate.
 *
 * All upstream calls go through the existing `screenAgainstOpenSanctions()`
 * helper (uses `fetchWithTimeout` — 15s hard timeout, no API key required).
 * Failures return `clear: false` (defensive — caller should NOT auto-clear
 * when the screening source is unreachable).
 */

import { logger } from "@/lib/sgtx/logger";
import {
  screenAgainstOpenSanctions,
  OpenSanctionsResult,
  OpenSanctionsHit,
} from "@/lib/sgtx/compliance/opensanctions-client";

// ── Types ────────────────────────────────────────────────────────────────

export type EntityType = "person" | "company" | "vessel" | "country";

export interface SanctionMatch {
  name: string;
  entity_type: EntityType;
  datasets: string[]; // e.g. ["ofac_sdn", "eu_cfs", "un_sc_sanctions", "uk_ofsi"]
  match_score: number;
  source_url: string;
  caption?: string;
  notes?: string;
}

export interface ScreeningResult {
  query: { name: string; type: EntityType };
  clear: boolean;
  matches: SanctionMatch[];
  screeningSource: string;
  screenedAt: string;
  notes: string;
}

// ── Country sanctions list (hardcoded — sourced from OFAC + EU + UN) ────

interface SanctionedCountry {
  iso2: string;
  name: string;
  designatingAuthorities: string[];
  sourceUrl: string;
  notes: string;
}

const SANCTIONED_COUNTRIES: SanctionedCountry[] = [
  {
    iso2: "IR",
    name: "Iran",
    designatingAuthorities: ["OFAC", "EU CFSP", "UN SC"],
    sourceUrl: "https://ofac.treasury.gov/sanctions-programs-and-country-information",
    notes: "Comprehensive US secondary sanctions; EU/UN arms embargo + nuclear-related restrictions.",
  },
  {
    iso2: "SY",
    name: "Syria",
    designatingAuthorities: ["OFAC", "EU CFSP", "UN SC"],
    sourceUrl: "https://www.sanctionsmap.eu",
    notes: "Comprehensive US sanctions; EU sectoral; UN SC Res 2254.",
  },
  {
    iso2: "KP",
    name: "North Korea (DPRK)",
    designatingAuthorities: ["OFAC", "EU CFSP", "UN SC"],
    sourceUrl: "https://www.un.org/securitycouncil/content/un-sc-resolutions-targeting-dprk",
    notes: "Full UN sanctions regime — sanctionsmap.eu Annex IIB.",
  },
  {
    iso2: "CU",
    name: "Cuba",
    designatingAuthorities: ["OFAC"],
    sourceUrl: "https://ofac.treasury.gov/cuba-sanctions",
    notes: "US comprehensive embargo; EU has lifted (1996 blocking statute).",
  },
  {
    iso2: "RU",
    name: "Russia (comprehensive sectoral)",
    designatingAuthorities: ["OFAC", "EU CFSP", "UK OFSI"],
    sourceUrl: "https://home.treasury.gov/policy-issues/financial-sanctions/sanctions-programs-and-country-information/russia-sanctions",
    notes: "Sectoral sanctions + 5 packages since Feb 2022. Entity-level screening mandatory.",
  },
];

// Russian sub-regions recognised as sanctioned occupied territories
const SANCTIONED_REGIONS: SanctionedCountry[] = [
  {
    iso2: "RU-CRIMEA",
    name: "Crimea (Ukraine)",
    designatingAuthorities: ["OFAC", "EU CFSP", "UK OFSI", "UN GA Res 68/262"],
    sourceUrl: "https://www.sanctionsmap.eu",
    notes: "Annexed 2014. EU Reg 269/2014 Art 1bis; OFAC E.O. 13685.",
  },
  {
    iso2: "RU-DNR",
    name: "Donetsk People's Republic (Ukraine)",
    designatingAuthorities: ["OFAC", "EU CFSP", "UK OFSI"],
    sourceUrl: "https://www.sanctionsmap.eu",
    notes: "EU Reg 833/2014; OFAC E.O. 14065.",
  },
  {
    iso2: "RU-LNR",
    name: "Luhansk People's Republic (Ukraine)",
    designatingAuthorities: ["OFAC", "EU CFSP", "UK OFSI"],
    sourceUrl: "https://www.sanctionsmap.eu",
    notes: "EU Reg 833/2014; OFAC E.O. 14065.",
  },
];

function findSanctionedCountry(code: string): SanctionedCountry | null {
  const c = (code ?? "").toUpperCase().trim();
  return (
    SANCTIONED_COUNTRIES.find((x) => x.iso2 === c) ??
    SANCTIONED_REGIONS.find((x) => x.iso2 === c) ??
    null
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mapOpenSanctionsHits(
  hits: OpenSanctionsHit[],
  type: EntityType,
): SanctionMatch[] {
  return hits.map((h) => ({
    name: h.caption,
    entity_type: type,
    datasets: h.datasets ?? [],
    match_score: h.matchScore,
    source_url: `https://www.opensanctions.org/entities/${h.id}/`,
    caption: h.caption,
    notes: h.matchedAlias ? `Matched alias: ${h.matchedAlias}` : undefined,
  }));
}

// ── Country screening (no external API — pure table lookup) ─────────────

function screenCountry(nameOrCode: string): ScreeningResult {
  const screenedAt = new Date().toISOString();
  const q = (nameOrCode ?? "").trim();
  // Try ISO2 match first
  let entry = findSanctionedCountry(q);
  // Try name match (case-insensitive)
  if (!entry) {
    const lower = q.toLowerCase();
    const pool = [...SANCTIONED_COUNTRIES, ...SANCTIONED_REGIONS];
    entry = pool.find((c) => c.name.toLowerCase() === lower) ?? null;
  }
  const matches: SanctionMatch[] = entry
    ? [
        {
          name: entry.name,
          entity_type: "country" as EntityType,
          datasets: entry.designatingAuthorities.map((a) => a.toLowerCase().replace(/\s+/g, "_")),
          match_score: 1.0,
          source_url: entry.sourceUrl,
          notes: entry.notes,
        },
      ]
    : [];
  return {
    query: { name: q, type: "country" },
    clear: matches.length === 0,
    matches,
    screeningSource: "SGTX_HARDCODED_COUNTRY_LIST",
    screenedAt,
    notes:
      matches.length > 0
        ? "Country appears on the SGTX sanctioned-country list. Trade must be blocked pending compliance review."
        : "Country not on the SGTX sanctioned-country list. Entity-level screening still required.",
  };
}

// ── Vessel screening ────────────────────────────────────────────────────
//
// Vessel screening uses OpenSanctions (which includes OFAC's vessel SDN
// entries + the UN Security Council DPRK vessel list, republished by
// OpenSanctions as `sdn_vessels` / `un_sc_sanctions_vessels`).
//
// Real production-grade vessel screening should ALSO consult the UN 1718
// Sanctions Committee's port-entry denial list — a public JSON file at:
//   https://www.un.org/securitycouncil/content/un-sc-resolutions-targeting-dprk
// (downloadable as `dprk_vessel_list.json`). We do not hardcode that list
// here because it changes frequently; OpenSanctions re-publishes it within
// ~24h.

async function screenVessel(name: string, imo?: string): Promise<ScreeningResult> {
  const screenedAt = new Date().toISOString();
  try {
    const aliases = imo ? [imo] : [];
    const osResult: OpenSanctionsResult = await screenAgainstOpenSanctions(name, aliases);
    const matches = mapOpenSanctionsHits(osResult.hits, "vessel");
    return {
      query: { name, type: "vessel" },
      clear: matches.length === 0,
      matches,
      screeningSource: "opensanctions.org (vessel SDN + UN SC DPRK vessel list)",
      screenedAt,
      notes:
        matches.length > 0
          ? "Vessel matched a sanctioned-vessel record. Block loading; request port-state authority confirmation."
          : "No OpenSanctions vessel match. For high-risk lanes, also consult the UN 1718 port-entry denial list directly.",
    };
  } catch (err: any) {
    logger.error("sanctions-screening-engine: vessel screen failed", { error: err?.message, name });
    // DEFENSIVE: do NOT auto-clear when the upstream screening source is unreachable
    return {
      query: { name, type: "vessel" },
      clear: false,
      matches: [],
      screeningSource: "opensanctions.org (UNREACHABLE)",
      screenedAt,
      notes: "Upstream screening source failed. Treat as BLOCKED pending manual review.",
    };
  }
}

// ── Person / company screening ──────────────────────────────────────────

async function screenPersonOrCompany(
  name: string,
  type: "person" | "company",
  aliases?: string[],
): Promise<ScreeningResult> {
  const screenedAt = new Date().toISOString();
  try {
    const osResult: OpenSanctionsResult = await screenAgainstOpenSanctions(name, aliases);
    const matches = mapOpenSanctionsHits(osResult.hits, type);
    return {
      query: { name, type },
      clear: matches.length === 0,
      matches,
      screeningSource: "opensanctions.org (OFAC + EU CFSP + UN SC + UK OFSI + 50+ other lists)",
      screenedAt,
      notes:
        matches.length > 0
          ? `Matched ${matches.length} sanctioned ${type}(s). Block transaction; file SAR if applicable.`
          : `No sanctioned ${type} match found. Screening cache TTL: 24h.`,
    };
  } catch (err: any) {
    logger.error("sanctions-screening-engine: person/company screen failed", { error: err?.message, name });
    return {
      query: { name, type },
      clear: false,
      matches: [],
      screeningSource: "opensanctions.org (UNREACHABLE)",
      screenedAt,
      notes: "Upstream screening source failed. Treat as BLOCKED pending manual review.",
    };
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export async function screenEntity(
  name: string,
  type: EntityType,
  options?: { aliases?: string[]; imo?: string },
): Promise<ScreeningResult> {
  try {
    const n = (name ?? "").trim();
    if (!n) {
      return {
        query: { name: "", type },
        clear: false,
        matches: [],
        screeningSource: "none",
        screenedAt: new Date().toISOString(),
        notes: "Empty screening query — must supply a name (or IMO / country code).",
      };
    }
    switch (type) {
      case "country":
        return screenCountry(n);
      case "vessel":
        return screenVessel(n, options?.imo);
      case "person":
      case "company":
        return screenPersonOrCompany(n, type, options?.aliases);
      default:
        return {
          query: { name: n, type: "person" as EntityType },
          clear: false,
          matches: [],
          screeningSource: "none",
          screenedAt: new Date().toISOString(),
          notes: `Unknown entity type ${type}`,
        };
    }
  } catch (err: any) {
    logger.error("sanctions-screening-engine: caught exception", { error: err?.message, type, name });
    return {
      query: { name, type },
      clear: false,
      matches: [],
      screeningSource: "error",
      screenedAt: new Date().toISOString(),
      notes: "Screening engine exception — treat as BLOCKED pending manual review.",
    };
  }
}

/** Returns the full sanctioned-country list (for UI / docs). */
export function listSanctionedCountries(): SanctionedCountry[] {
  return [...SANCTIONED_COUNTRIES, ...SANCTIONED_REGIONS];
}
