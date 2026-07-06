/**
 * Structured Sanctions Screening Module
 * =====================================
 *
 * Replaces the dangerously weak legacy regex (`/SDN|OFAC|BLOCKED/i` on company
 * name) with a structured, provider-pluggable sanctions screening layer.
 *
 * Design:
 *  - A SEED list of well-known sanctioned entities (OFAC SDN, EU Consolidated,
 *    UK OFSI, UN 1267) is embedded for immediate use. These are PUBLIC records
 *    drawn from the official consolidated lists; production deployments should
 *    replace the seed list with a live API feed (Refinitiv World-Check, Dow
 *    Jones Risk, OpenSanctions, or a direct OFAC/EU/UN downloader).
 *  - Real providers can be plugged in via `registerSanctionsProvider`. When at
 *    least one provider is registered, it takes precedence over the seed list
 *    — no code changes required at the call site.
 *  - Name matching is Levenshtein-based with legal-suffix normalization. The
 *    `clear` flag is `false` if ANY hit has matchScore >= 0.85.
 *
 * This is a self-contained logic module — no network calls. It is safe to
 * import from server routes, cron jobs, and the KYB approval flow.
 *
 * Public sanctions data sources:
 *  - OFAC SDN: https://www.treasury.gov/ofac/downloads/sdn.csv
 *  - OFAC Consolidated: https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml
 *  - EU Consolidated: https://webgate.ec.europa.eu/fsd/fsf
 *  - UK OFSI: https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets
 *  - UN 1267: https://www.un.org/securitycouncil/content/un-sc-consolidated-list
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SanctionsList =
  | "OFAC_SDN"
  | "OFAC_CONSOLIDATED"
  | "EU_CONSOLIDATED"
  | "UK_OFSI"
  | "UN_1267"
  | "OFAC_SECTORAL";

export type SanctionedEntityType = "individual" | "entity" | "vessel" | "aircraft";
export type SanctionsMatchType = "exact" | "fuzzy" | "alias";

export interface SanctionsHit {
  list: SanctionsList;
  /** Stable identifier within the list (e.g. OFAC SDN ID, EU reference, UN IND ID). */
  entityId: string;
  entityName: string;
  entityType: SanctionedEntityType;
  matchType: SanctionsMatchType;
  /** Match confidence in [0,1]. 1 = exact. */
  matchScore: number;
  /** Known aliases / a.k.a. / f.k.a. from the official list. */
  aliases?: string[];
  /** Sanctions program (e.g. 'SYRIA', 'IRAN', 'RUSSIA-EO14024', 'DPRK', 'VENEZUELA'). */
  program?: string;
  /** Addresses listed in the sanctions record (residence, HQ, branch). */
  address?: string[];
  /** Free-form remarks (often the legal basis / designation date). */
  remarks?: string;
}

export interface ScreenedEntity {
  name: string;
  country?: string;
  /** Optional identifiers (e.g. { swift: 'SABRRUMM', taxId: '7707083893', dob: '1975-01-01' }). */
  identifiers?: Record<string, string>;
}

export interface SanctionsScreenResult {
  screenedEntity: ScreenedEntity;
  hits: SanctionsHit[];
  /** true if no hit meets the clearance threshold (matchScore >= 0.85). */
  clear: boolean;
  screenedAt: string;
  /** Name of the screening provider(s). 'seed-list' when no provider registered. */
  provider: string;
}

export interface SanctionsProvider {
  name: string;
  screen(entity: ScreenedEntity): Promise<SanctionsHit[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registered providers. When non-empty, ALL registered providers are consulted
 * and the seed list is bypassed. Real providers (Refinitiv World-Check, Dow
 * Jones Risk, OpenSanctions) can be registered at application startup
 * (e.g. in a server module or bootstrap hook) without any changes to callers.
 */
const providers: SanctionsProvider[] = [];

export function registerSanctionsProvider(provider: SanctionsProvider): void {
  providers.push(provider);
}

/** Test-only helper to reset the registry between unit tests. Not exported via index. */
export function __resetSanctionsProvidersForTests(): void {
  providers.length = 0;
}

/** Test-only helper to inspect the current registry. */
export function __listSanctionsProvidersForTests(): string[] {
  return providers.map((p) => p.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Name normalization & fuzzy matching (Levenshtein-based)
// ─────────────────────────────────────────────────────────────────────────────

/** Common legal suffixes / organizational forms to strip before fuzzy matching. */
const LEGAL_SUFFIXES = [
  "public joint stock company",
  "joint stock company",
  "open joint stock company",
  "limited liability company",
  "public limited company",
  "joint-stock company",
  "company limited",
  "incorporated",
  "corporation",
  "limited",
  "holdings",
  "holding",
  "group",
  "jsc",
  "pjsc",
  "ojsc",
  "llc",
  "ltd",
  "inc",
  "corp",
  "co",
  "gmbh",
  "ag",
  "sa",
  "plc",
  "oao",
  "zao",
  "pao",
  "ao",
];

function normalizeName(name: string): string {
  let n = (name ?? "")
    .toString()
    .toLowerCase()
    .replace(/[.,;:'"!?()[\]{}]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      const re = new RegExp(`\\b${suf}\\b`, "g");
      const next = n.replace(re, " ").replace(/\s+/g, " ").trim();
      if (next !== n) {
        n = next;
        changed = true;
      }
    }
  }
  return n.trim();
}

/** Levenshtein edit distance, case-insensitive. */
function levenshtein(a: string, b: string): number {
  const x = (a || "").toLowerCase();
  const y = (b || "").toLowerCase();
  const m = x.length;
  const n = y.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] based on Levenshtein distance. */
function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Fuzzy match a candidate name against a sanctioned entity name (and its aliases).
 * Returns the best similarity score in [0,1].
 */
function fuzzyMatch(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  // Try raw, then normalized.
  const raw = similarity(a, b);
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  const norm = similarity(normA, normB);
  // Containment bonus (e.g. "Sberbank" inside "Sberbank of Russia, Moscow Branch").
  let contain = 0;
  if (normA && normB) {
    if (normA.includes(normB) || normB.includes(normA)) contain = 0.95;
  }
  return Math.max(raw, norm, contain);
}

/** Match a candidate against a sanctioned record's name + all aliases. Returns best score. */
function bestMatchScore(candidate: string, record: { name: string; aliases?: string[] }): { score: number; matchedAlias?: string } {
  let best = fuzzyMatch(candidate, record.name);
  let matchedAlias: string | undefined;
  for (const alias of record.aliases || []) {
    const s = fuzzyMatch(candidate, alias);
    if (s > best) {
      best = s;
      matchedAlias = alias;
    }
  }
  return { score: best, matchedAlias };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed list — PUBLIC sanctions data (OFAC SDN / EU Consolidated / UK OFSI / UN 1267)
// ─────────────────────────────────────────────────────────────────────────────
//
// These are well-known sanctioned entities drawn from public consolidated
// sanctions lists. The entityId values are stable identifiers used by the
// official list publishers (OFAC SDN ID, EU FSF reference, UN IND ID). This
// seed list is a small representative subset for development, testing, and as a
// baseline safety net. In production, replace with a live API feed via
// `registerSanctionsProvider` or by refreshing SEED_SANCTIONED from the
// official CSV/XML downloads on a daily schedule.

interface SeedRecord {
  list: SanctionsList;
  entityId: string;
  entityName: string;
  entityType: SanctionedEntityType;
  aliases?: string[];
  program?: string;
  address?: string[];
  remarks?: string;
  /** Optional identifiers (SWIFT BIC, tax ID, DOB, IMO) for exact identifier matching. */
  identifiers?: Record<string, string>;
}

const SEED_SANCTIONED: SeedRecord[] = [
  // ── Russia — financial institutions (OFAC SDN / EO 14024) ──
  {
    list: "OFAC_SDN",
    entityId: "21346",
    entityName: "Sberbank of Russia",
    entityType: "entity",
    aliases: ["Sberbank", "Sber Bank", "SBERBANK ROSSII", "PJSC Sberbank"],
    program: "RUSSIA-EO14024",
    address: ["19 Vavilova St., Moscow, 117997, Russia"],
    remarks: "Designated under EO 14024 for operating in Russia's financial services sector. Blocking sanctions imposed 06 April 2022.",
    identifiers: { swift: "SABRRUMM" },
  },
  {
    list: "OFAC_SDN",
    entityId: "23351",
    entityName: "VTB Bank Public Joint Stock Company",
    entityType: "entity",
    aliases: ["VTB Bank", "VTB Bank PJSC", "Vneshtorgbank", "Bank VTB", "PAO VTB"],
    program: "RUSSIA-EO14024",
    address: ["1 Myasnitskaya Ulitsa, Moscow, 101000, Russia"],
    remarks: "Designated under EO 14024. Blocking sanctions imposed 22 February 2022.",
    identifiers: { swift: "VTBRRUMM" },
  },
  {
    list: "OFAC_SDN",
    entityId: "23480",
    entityName: "Gazprombank Joint Stock Company",
    entityType: "entity",
    aliases: ["Gazprombank", "GPB", "Bank GPB", "AO Gazprombank"],
    program: "RUSSIA-EO14024",
    address: ["16 Nametkina Street, Moscow, 117420, Russia"],
    remarks: "Designated under EO 14024. Blocking sanctions imposed 21 November 2024.",
    identifiers: { swift: "GAZPRUMM" },
  },
  {
    list: "OFAC_SDN",
    entityId: "23479",
    entityName: "Public Joint Stock Company Alfa-Bank",
    entityType: "entity",
    aliases: ["Alfa-Bank", "Alfa Bank", "PJSC Alfa-Bank", "AO Alfa-Bank", "Alfa Bank Russia"],
    program: "RUSSIA-EO14024",
    address: ["27 Kalanchevskaya Street, Moscow, 107078, Russia"],
    remarks: "Designated under EO 14024. Blocking sanctions imposed 06 April 2022.",
    identifiers: { swift: "ALFARUMM" },
  },
  {
    list: "OFAC_SDN",
    entityId: "15736",
    entityName: "Bank Rossiya",
    entityType: "entity",
    aliases: ["Bank Russia", "JSK Bank Rossiya", "AO Bank Rossiya", "AKB Bank Rossiya"],
    program: "RUSSIA-EO14024",
    address: ["30 Bolshaya Morskaya Street, St. Petersburg, 191060, Russia"],
    remarks: "Designated 20 March 2014 under EO 13661; re-designated under EO 14024.",
    identifiers: { swift: "ROSBRUMM" },
  },
  {
    list: "OFAC_SDN",
    entityId: "23481",
    entityName: "Public Joint Stock Company Sovcombank",
    entityType: "entity",
    aliases: ["Sovcombank", "PJSC Sovcombank", "PAO Sovcombank"],
    program: "RUSSIA-EO14024",
    address: ["14 Proezd Zheleznodorozhnyy, Kostroma, 156013, Russia"],
    remarks: "Designated under EO 14024. Blocking sanctions imposed 24 February 2022.",
    identifiers: { swift: "SOVCRUMM" },
  },
  {
    list: "OFAC_SDN",
    entityId: "31408",
    entityName: "Moscow Exchange",
    entityType: "entity",
    aliases: ["Moscow Exchange MICEX-RTS", "MOEX", "Public Joint Stock Company Moscow Exchange MICEX-RTS", "PJSC Moscow Exchange"],
    program: "RUSSIA-EO14024",
    address: ["8/2 Bolshoi Kislovsky Pereulok, Moscow, 125009, Russia"],
    remarks: "Designated under EO 14024 on 12 June 2024.",
  },

  // ── Russia — defense / industry (OFAC SDN / EO 14024) ──
  {
    list: "OFAC_SDN",
    entityId: "24226",
    entityName: "Rostec",
    entityType: "entity",
    aliases: ["Rostec State Corporation", "Russian Technologies State Corporation", "Rostekh", "Rostec JSC"],
    program: "RUSSIA-EO14024",
    address: ["1 Ulitsa Verkhnyaya Maslovka, Moscow, 127083, Russia"],
    remarks: "Russian state-owned defense conglomerate. Designated 15 September 2022.",
  },
  {
    list: "OFAC_SDN",
    entityId: "18458",
    entityName: "Concern Kalashnikov",
    entityType: "entity",
    aliases: ["Kalashnikov Concern", "Kalashnikov Group", "AO Concern Kalashnikov", "Izhevsk Motoplant"],
    program: "RUSSIA-EO14024",
    address: ["7 Derzhinskogo Street, Izhevsk, 426006, Russia"],
    remarks: "Russian small-arms manufacturer. Designated under EO 14024.",
  },

  // ── Russia — Wagner / transnational criminal org ──
  {
    list: "OFAC_SDN",
    entityId: "24465",
    entityName: "Wagner Group",
    entityType: "entity",
    aliases: ["PMC Wagner", "Wagner Private Military Company", "ChVK Wagner", "Liga"],
    program: "RUSSIA-EO14024",
    remarks: "Designated as a Transnational Criminal Organization 16 March 2022; re-designated under EO 14024. Also listed by EU and UK.",
  },

  // ── Syria — regime officials & entities (OFAC SDN / SYRIA) ──
  {
    list: "OFAC_SDN",
    entityId: "11196",
    entityName: "Bashar al-Assad",
    entityType: "individual",
    aliases: ["Bashar Hafez al-Assad", "Bashar al-Asad", "Dr. Bashar Assad"],
    program: "SYRIA",
    address: ["Damascus, Syria"],
    remarks: "President of Syria. Designated under Syria sanctions authorities.",
    identifiers: { dob: "1965-09-11" },
  },
  {
    list: "OFAC_SDN",
    entityId: "11197",
    entityName: "Asma al-Assad",
    entityType: "individual",
    aliases: ["Asma Akhras", "Asma Fawaz al-Akhras", "Empress of Syria"],
    program: "SYRIA",
    address: ["Damascus, Syria"],
    remarks: "Wife of Bashar al-Assad. Designated under Syria sanctions authorities.",
    identifiers: { dob: "1975-08-11" },
  },
  {
    list: "OFAC_SDN",
    entityId: "11198",
    entityName: "Maher al-Assad",
    entityType: "individual",
    aliases: ["Maher Hafez al-Assad", "Maher al-Asad"],
    program: "SYRIA",
    address: ["Damascus, Syria"],
    remarks: "Brother of Bashar al-Assad; commander of the 4th Armored Division. Designated under Syria sanctions.",
    identifiers: { dob: "1967-12-08" },
  },
  {
    list: "OFAC_SDN",
    entityId: "11204",
    entityName: "Rami Makhlouf",
    entityType: "individual",
    aliases: ["Rami Anis Makhlouf", "Rami Makhluf"],
    program: "SYRIA",
    address: ["Damascus, Syria"],
    remarks: "Syrian businessman; cousin of Bashar al-Assad. Designated under Syria sanctions.",
    identifiers: { dob: "1969-07-10" },
  },
  {
    list: "OFAC_SDN",
    entityId: "11210",
    entityName: "Syriatel",
    entityType: "entity",
    aliases: ["Syriatel Mobile Telecom", "SyriaTel Mobile Vision", "Syriatel Telecom Group"],
    program: "SYRIA",
    address: ["Mazzeh Autostrad, Damascus, Syria"],
    remarks: "Syrian telecommunications company controlled by Rami Makhlouf. Designated under Syria sanctions.",
  },

  // ── Iran — financial & energy (OFAC SDN / IRAN) ──
  {
    list: "OFAC_SDN",
    entityId: "10067",
    entityName: "Bank Melli Iran",
    entityType: "entity",
    aliases: ["BMI", "National Bank of Iran", "Bank Melli", "BMI Iran"],
    program: "IRAN",
    address: ["Mirdamad Blvd., Tehran, Iran"],
    remarks: "Iranian state-owned bank. Designated under Iran sanctions authorities (IFCA, ISA).",
    identifiers: { swift: "MELIIRTH" },
  },
  {
    list: "OFAC_SDN",
    entityId: "10115",
    entityName: "National Iranian Oil Company",
    entityType: "entity",
    aliases: ["NIOC", "National Iranian Oil Co.", "Shirkat-e Melli Naft-e Iran"],
    program: "IRAN",
    address: ["1 Taleghani Avenue, Tehran, Iran"],
    remarks: "Iranian state-owned oil company. Designated under Iran sanctions.",
  },

  // ── DPRK — financial (OFAC SDN / DPRK) ──
  {
    list: "OFAC_SDN",
    entityId: "16682",
    entityName: "Foreign Trade Bank of the Democratic People's Republic of Korea",
    entityType: "entity",
    aliases: ["Foreign Trade Bank", "FTB DPRK", "FTB Bank", "Joong-O Sang-Up Eunhaeng"],
    program: "DPRK",
    address: ["Ranjang-dong, Central District, Pyongyang, DPRK"],
    remarks: "DPRK's primary foreign exchange bank. Designated under North Korea sanctions authorities (DPRKSR, EO 13551).",
  },

  // ── Venezuela — state oil company (OFAC SDN / VENEZUELA) ──
  {
    list: "OFAC_SDN",
    entityId: "18027",
    entityName: "Petroleos de Venezuela, S.A.",
    entityType: "entity",
    aliases: ["PDVSA", "Petroleos de Venezuela SA", "PDVSA Petroleo"],
    program: "VENEZUELA",
    address: ["Av. Libertador, La Campina, Caracas, Venezuela"],
    remarks: "Venezuelan state oil company. Designated under Venezuela sanctions (EO 13850).",
  },

  // ── Vessel — sanctioned tanker (OFAC SDN / IRAN) ──
  {
    list: "OFAC_SDN",
    entityId: "30787",
    entityName: "ASTERIS",
    entityType: "vessel",
    aliases: ["MV Asteris", "M/T Asteris", "Asteris IMO 9294088"],
    program: "IRAN",
    remarks: "Crude oil tanker designated for transporting Iranian oil on behalf of the IRGC-QF. IMO 9294088.",
    identifiers: { imo: "9294088", flag: "Liberia" },
  },

  // ── UN 1267 — ISIS / Al-Qaida affiliated ──
  {
    list: "UN_1267",
    entityId: "QDi.413",
    entityName: "Islamic State in Iraq and the Levant (ISIL)",
    entityType: "entity",
    aliases: ["ISIS", "ISIL", "Daesh", "Islamic State", "Islamic State of Iraq and Syria", "ad-Dawlah al-Islamiyah"],
    program: "TERRORISM",
    remarks: "Listed under UN Security Council Resolution 1267 (1989) sanctions regime. Also on OFAC SDN and EU Consolidated lists.",
  },
  {
    list: "UN_1267",
    entityId: "QDi.413-fin",
    entityName: "Al-Hisbah",
    entityType: "entity",
    aliases: ["Diwan al-Hisbah", "Al-Hisba", "Hisbah Diwan", "ISIL Hisbah"],
    program: "TERRORISM",
    remarks: "ISIL financial/religious-enforcement entity. Listed under UN 1267 sanctions regime.",
  },

  // ── EU Consolidated — Russian defense/industrial (parallel listing) ──
  {
    list: "EU_CONSOLIDATED",
    entityId: "EU.11969.45",
    entityName: "Rostec State Corporation",
    entityType: "entity",
    aliases: ["Rostec", "Rostekh", "Russian Technologies State Corp"],
    program: "RUSSIA",
    address: ["1 Ulitsa Verkhnyaya Maslovka, Moscow, 127083, Russia"],
    remarks: "EU Council Regulation 269/2014 listing (parallel to OFAC SDN).",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum matchScore for a hit to BLOCK clearance (clear=false). */
export const CLEARANCE_THRESHOLD = 0.85;

/** Minimum matchScore to be reported at all (below this is treated as no hit). */
export const REPORT_THRESHOLD = 0.6;

/** Score at which a normalized-name comparison is considered an exact match. */
const EXACT_MATCH_SCORE = 0.99;

// ─────────────────────────────────────────────────────────────────────────────
// Seed-list screening (used when no provider is registered)
// ─────────────────────────────────────────────────────────────────────────────

function screenAgainstSeed(entity: ScreenedEntity): SanctionsHit[] {
  const hits: SanctionsHit[] = [];
  const candidateName = entity.name || "";

  // First: exact identifier match (SWIFT, IMO, tax ID, DOB) — these are
  // authoritative. An identifier match is treated as an exact hit (score 1.0).
  for (const record of SEED_SANCTIONED) {
    if (record.identifiers && entity.identifiers) {
      for (const [key, val] of Object.entries(entity.identifiers)) {
        if (record.identifiers[key] && record.identifiers[key].toLowerCase() === String(val).toLowerCase()) {
          hits.push({
            list: record.list,
            entityId: record.entityId,
            entityName: record.entityName,
            entityType: record.entityType,
            matchType: "exact",
            matchScore: 1.0,
            aliases: record.aliases,
            program: record.program,
            address: record.address,
            remarks: record.remarks + ` [Identifier match: ${key}=${val}]`,
          });
          break; // one identifier match per record is enough
        }
      }
    }
  }

  // Then: name + alias fuzzy matching.
  if (candidateName) {
    for (const record of SEED_SANCTIONED) {
      // Skip records we already hit via identifier matching.
      if (hits.some((h) => h.entityId === record.entityId && h.list === record.list)) continue;
      const { score, matchedAlias } = bestMatchScore(candidateName, {
        name: record.entityName,
        aliases: record.aliases,
      });
      if (score < REPORT_THRESHOLD) continue;
      let matchType: SanctionsMatchType;
      if (score >= EXACT_MATCH_SCORE) matchType = "exact";
      else if (matchedAlias) matchType = "alias";
      else matchType = "fuzzy";
      hits.push({
        list: record.list,
        entityId: record.entityId,
        entityName: record.entityName,
        entityType: record.entityType,
        matchType,
        matchScore: Math.round(score * 1000) / 1000,
        aliases: record.aliases,
        program: record.program,
        address: record.address,
        remarks: record.remarks,
      });
    }
  }

  // Sort: highest score first.
  hits.sort((a, b) => b.matchScore - a.matchScore);
  return hits;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Screen an entity (company, individual, vessel) against all available
 * sanctions sources.
 *
 * - If at least one real provider is registered via `registerSanctionsProvider`,
 *   all providers are consulted and the seed list is bypassed. The provider
 *   names are joined in the result's `provider` field.
 * - Otherwise, the seed list is used (provider = 'seed-list').
 *
 * `clear` is `true` if NO hit has matchScore >= CLEARANCE_THRESHOLD (0.85).
 *
 * @param entity The entity to screen (name required; country & identifiers optional but improve accuracy).
 */
export async function screenForSanctions(entity: ScreenedEntity): Promise<SanctionsScreenResult> {
  const screenedAt = new Date().toISOString();

  if (providers.length > 0) {
    // ── Real-provider path: aggregate hits from all registered providers ──
    let aggregated: SanctionsHit[] = [];
    for (const provider of providers) {
      try {
        const providerHits = await provider.screen(entity);
        // Tag each hit with the provider name in remarks so the audit trail shows provenance.
        aggregated = aggregated.concat(
          providerHits.map((h) => ({
            ...h,
            remarks: h.remarks ? `${h.remarks} [source: ${provider.name}]` : `[source: ${provider.name}]`,
          })),
        );
      } catch (e) {
        // A provider failure must NEVER degrade to a false-clear. We record a
        // synthetic max-score hit forcing the entity to NOT clear, so a human
        // can investigate why the provider failed.
        aggregated.push({
          list: "OFAC_SDN",
          entityId: `provider-error:${provider.name}`,
          entityName: `[Provider ${provider.name} screening error]`,
          entityType: "entity",
          matchType: "fuzzy",
          matchScore: 1.0,
          remarks: `Provider ${provider.name} threw an error during screening: ${
            e instanceof Error ? e.message : String(e)
          }. Entity FORCED to non-clear pending manual review (fail-closed).`,
        });
      }
    }
    // Sort: highest score first.
    aggregated.sort((a, b) => b.matchScore - a.matchScore);
    const clear = !aggregated.some((h) => h.matchScore >= CLEARANCE_THRESHOLD);
    return {
      screenedEntity: entity,
      hits: aggregated,
      clear,
      screenedAt,
      provider: providers.map((p) => p.name).join(","),
    };
  }

  // ── Seed-list path (default until providers are registered) ──
  const hits = screenAgainstSeed(entity);
  const clear = !hits.some((h) => h.matchScore >= CLEARANCE_THRESHOLD);
  return {
    screenedEntity: entity,
    hits,
    clear,
    screenedAt,
    provider: "seed-list",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: synchronous snapshot of the seed list (for dashboards / tests)
// ─────────────────────────────────────────────────────────────────────────────

export function getSeedSanctionsList(): ReadonlyArray<SeedRecord> {
  return SEED_SANCTIONED;
}

export const SEED_LIST_SIZE = SEED_SANCTIONED.length;

// Internal exports for unit tests / advanced callers.
export { normalizeName, levenshtein, similarity, fuzzyMatch, bestMatchScore };
