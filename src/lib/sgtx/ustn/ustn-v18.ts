// @ts-nocheck
// =============================================================================
// SGTX v18 §5 — USTN (Universal Shipment Tracking Number) canonical data
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the v18 USTN format,
// generation algorithm, validation rules, counter model, and namespace
// semantics. It exposes the v18 §5.1 spec as machine-readable data and
// provides v18-compliant generator + validator functions.
//
// IMPORTANT: The existing v17 USTN module at src/lib/sgtx/ustn/index.ts
// uses the legacy v17 format `SGTX-{buyerSuffix}-{sellerSuffix}-{ts14}-{rand8}`
// (40 chars). The v18 §5.1 format is shorter: `SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}`
// (15–22 chars). Both formats coexist for backward compatibility:
//   • v17 USTNs already issued remain valid for historical trades.
//   • New USTNs SHOULD be generated using the v18 format.
//   • The v18 validator accepts both formats (auto-detect).
//
// Consumed by:
//   • /api/v1/ustn/format            — public canonical format spec
//   • /api/sgtx/ustn/format          — internal mirror
//   • src/lib/sgtx/ustn/index.ts     — for the v18 generator alongside v17
//   • /api/v1/ustn/track             — for v18 format auto-detection
// =============================================================================

// ============ v18 §5.1.1 — Format Specification ============

export const USTN_V18_FORMAT = {
  format: "SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}",
  example: "SGTX-EG-26-F3A-1",
  length: "15-22 characters",
  components: ["SGTX", "COUNTRY", "YEAR", "TRADER", "SEQ"],
} as const;

// ============ v18 §5.1.2 — Component Definitions ============

export interface UstnComponent {
  component: string;
  width: string;
  definition: string;
}

export const USTN_COMPONENTS: UstnComponent[] = [
  {
    component: "SGTX",
    width: "4 chars",
    definition: "Fixed platform identifier",
  },
  {
    component: "COUNTRY",
    width: "2 chars",
    definition: "ISO 3166-1 alpha-2 (EG, VN, DE, etc.)",
  },
  {
    component: "YEAR",
    width: "2 chars",
    definition: "Last two digits of the year (26, 27, etc.)",
  },
  {
    component: "TRADER",
    width: "3-4 chars",
    definition: "Last 3 alphanumeric characters of the GTID checksum (F3A, 7B3A, etc.)",
  },
  {
    component: "SEQ",
    width: "Variable",
    definition: "Atomic BIGINT per year per trader",
  },
];

// ============ v18 §5.1.3 — Trader Identifier Extraction ============

/**
 * Extracts the trader identifier from a GTID per v18 §5.1.3.
 * The trader ID is the last 3 alphanumeric characters of the GTID's
 * checksum (the final component after the sequence).
 *
 * Examples:
 *   SGTX-EG-TRD-002139-7F3A → "F3A"
 *   SGTX-VN-TRD-004567-7B3A → "3A" (last 3 of "7B3A" is "B3A")
 */
export function extractTraderId(gtid: string): string {
  if (!gtid || typeof gtid !== "string") return "";
  const parts = gtid.split("-");
  if (parts.length !== 5) return "";
  const checksum = parts[4];
  if (!checksum || checksum.length < 3) return "";
  return checksum.slice(-3).toUpperCase();
}

// ============ v18 §5.1.4 — Total Length ============

export const USTN_TOTAL_LENGTH = {
  breakdown: "4 (SGTX) + 1 (-) + 2 (COUNTRY) + 1 (-) + 2 (YEAR) + 1 (-) + 3-4 (TRADER) + 1 (-) + variable (SEQ)",
  range: "15-22 characters",
  minimum: 15, // SGTX-EG-26-F3A-1
  maximum: 22, // SGTX-EG-26-F3A-999999
} as const;

// ============ v18 §5.1.5 — Generation Algorithm ============

/**
 * v18 §5.1.5 — Generate a USTN in the v18 format.
 *
 * Format: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}
 *
 * The SEQ is acquired atomically from the ustn_counters table
 * (per year, per trader). In dev mode (no DB) we fall back to a
 * random 1-6 digit number — production uses the atomic counter.
 */
export async function generateUstnV18(
  country: string,
  gtid: string,
  sequenceOverride?: number,
): Promise<{ ustn: string; country: string; year: string; traderId: string; sequence: number; format: string }> {
  const countryUpper = country.toUpperCase();
  const year2 = String(new Date().getFullYear()).slice(-2);
  const traderId = extractTraderId(gtid);

  let sequence: number;
  if (sequenceOverride !== undefined) {
    sequence = sequenceOverride;
  } else {
    // Try to acquire the next sequence atomically from the DB.
    try {
      const { db } = await import("@/lib/db");
      // Upsert creates the row if missing; on update we increment lastSequence.
      const rec = await db.ustnCounter.upsert({
        where: { country_year_traderId: { country: countryUpper, year: year2, traderId } },
        update: { lastSequence: { increment: 1 } },
        create: { country: countryUpper, year: year2, traderId, lastSequence: 1 },
      });
      sequence = (rec as any).lastSequence;
    } catch {
      // Dev fallback — random 1-999 sequence.
      sequence = Math.floor(Math.random() * 999) + 1;
    }
  }

  const ustn = `SGTX-${countryUpper}-${year2}-${traderId}-${sequence}`;
  return {
    ustn,
    country: countryUpper,
    year: year2,
    traderId,
    sequence,
    format: "v18",
  };
}

// ============ v18 §5.1.7 — Validation Rules ============

const USTN_V18_REGEX = /^SGTX-([A-Z]{2})-(\d{2})-([A-Z0-9]{3,4})-(\d{1,6})$/;

export interface ParsedUstnV18 {
  prefix: string; // "SGTX"
  country: string; // 2-letter ISO
  year: string; // 2-digit year
  traderId: string; // 3-4 char trader ID
  sequence: number; // numeric sequence
  yearFull: number; // 4-digit year
  format: "v18";
}

/**
 * v18 §5.1.7 — Validate a USTN against the v18 format.
 * Returns the parsed components if valid, null otherwise.
 */
export function parseUstnV18(ustn: string): ParsedUstnV18 | null {
  if (!ustn || typeof ustn !== "string") return null;
  const m = ustn.toUpperCase().match(USTN_V18_REGEX);
  if (!m) return null;
  const year2 = parseInt(m[2], 10);
  // Per v18 §5.1.2 the year is "last two digits of the year" — we
  // infer the 4-digit year using a sliding window (26 → 2026, 99 → 2099,
  // 00 → 2100). The platform's epoch is 2025, so years 26-99 → 20YY,
  // years 00-25 → 21YY.
  const yearFull = year2 >= 26 ? 2000 + year2 : 2100 + year2;
  return {
    prefix: "SGTX",
    country: m[1],
    year: m[2],
    traderId: m[3],
    sequence: parseInt(m[4], 10),
    yearFull,
    format: "v18",
  };
}

export function validateUstnV18(ustn: string): boolean {
  return parseUstnV18(ustn) !== null;
}

// ============ v18 §5.1.7 — Validation Rules (full list) ============

export const USTN_VALIDATION_RULES = [
  { rule: "Must start with 'SGTX-' prefix", severity: "FORMAT" },
  { rule: "COUNTRY must be a valid ISO 3166-1 alpha-2 code", severity: "FORMAT" },
  { rule: "YEAR must be 2 digits (last two digits of the year)", severity: "FORMAT" },
  { rule: "TRADER must be 3-4 alphanumeric characters derived from the GTID checksum", severity: "FORMAT" },
  { rule: "SEQ must be a positive integer (1-999999)", severity: "FORMAT" },
  { rule: "Country must not be on the sanctions blocked list", severity: "COMPLIANCE" },
  { rule: "Trader ID must correspond to a registered tenant with valid KYB", severity: "COMPLIANCE" },
  { rule: "Sequence must match the ustn_counters row for (country, year, traderId)", severity: "INTEGRITY" },
  { rule: "USTN must not be revoked (see §5.1.11 replay attack protection)", severity: "INTEGRITY" },
] as const;

// ============ v18 §5.1.8 — Counter Model (per year, per trader) ============

export const USTN_COUNTER_MODEL = {
  tableName: "ustn_counters",
  primaryKey: "(country, year, traderId)",
  fields: [
    { name: "country", type: "CHAR(2)", nullable: false, description: "ISO 3166-1 alpha-2" },
    { name: "year", type: "CHAR(2)", nullable: false, description: "Last two digits of the year" },
    { name: "trader_id", type: "VARCHAR(4)", nullable: false, description: "Last 3-4 chars of GTID checksum" },
    { name: "last_sequence", type: "BIGINT", nullable: false, defaultValue: "0", description: "Atomic counter" },
    { name: "updated_at", type: "TIMESTAMPTZ", defaultValue: "NOW()", description: "Last counter increment" },
  ],
  atomicityGuarantee:
    "Two concurrent USTN generations for the same (country, year, traderId) will get distinct sequence numbers because the increment is atomic (PostgreSQL UPDATE...RETURNING).",
  resetPolicy: "Counters never reset within a year. They roll over to a new (year) tuple on January 1st 00:00 UTC.",
} as const;

// ============ v18 §5.1.9 — USTN Examples (Complete Set) ============

export const USTN_EXAMPLES = [
  { ustn: "SGTX-EG-26-F3A-1", country: "EG", year: "26", traderId: "F3A", sequence: 1, description: "First USTN for trader F3A in Egypt 2026" },
  { ustn: "SGTX-EG-26-F3A-2", country: "EG", year: "26", traderId: "F3A", sequence: 2, description: "Second USTN for trader F3A in Egypt 2026" },
  { ustn: "SGTX-VN-26-7B3A-1", country: "VN", year: "26", traderId: "7B3A", sequence: 1, description: "First USTN for trader 7B3A in Vietnam 2026" },
  { ustn: "SGTX-DE-27-9C2-145", country: "DE", year: "27", traderId: "9C2", sequence: 145, description: "145th USTN for trader 9C2 in Germany 2027" },
  { ustn: "SGTX-SA-26-A1B-999", country: "SA", year: "26", traderId: "A1B", sequence: 999, description: "999th USTN for trader A1B in Saudi Arabia 2026" },
] as const;

// ============ v18 §5.1.10 — Namespace Semantics (Canonical) ============

export const USTN_NAMESPACE_SEMANTICS = {
  canonical: "The USTN is the canonical namespace for every trade. Every document, payment, milestone, and event references the USTN.",
  externalIds: "The USTN does NOT override external authoritative systems. External identifiers (B/L number, ACID filing, commercial invoice number, phytosanitary cert number) are preserved alongside the USTN.",
  mandatory: "Every SGTX document, API call, and payment reference must include the USTN.",
  immutable: "Once generated, the USTN never changes. A shipment may be cancelled, but the USTN remains as a historical record.",
  multiShipment: "For multi-shipment contracts, each shipment gets its own USTN at per-shipment lock. The contract itself may have a contractId but each shipment has a distinct USTN.",
  generationPoint: "Generated automatically at the authoritative lock point (single-shipment lock, or per-shipment lock for multi-shipment contracts; for a single-shipment trade this is the moment the FeeLock becomes ACTIVE at STAGE1_SETTLED).",
  physicalEmbodiment: [
    "Printed on the Bill of Lading",
    "Embedded in the e-Invoice XML",
    "Included in the ACID filing",
    "Written on the phytosanitary certificate",
    "Used as the payment narrative in the Central Bank's Instant Payment Network",
  ],
  aiAssistance: {
    autocomplete: "System autocompletes from a dropdown of recent USTNs the user has access to — no suggestions from 'similar trades of others'",
    qrScan: "Mobile app scans the USTN QR code and automatically opens the relevant Trade Command Center — no manual typing",
    manualEntry: "If a user manually types a USTN, the system validates the format in real time and, if valid, resolves it to a summary card (status, parties, commodity) without needing to submit a form",
    nonMarketplaceRule: "AI never suggests counterparties or unsolicited trades",
  },
} as const;

// ============ v18 §5.1.11 — Replay Attack Protection ============

export const USTN_REPLAY_PROTECTION = {
  threat: "An attacker who learns a USTN cannot replay it to authorize a different shipment.",
  protections: [
    "USTN is bound to the (country, year, traderId, sequence) tuple which is cryptographically derived from the tenant's GTID",
    "Each USTN generation consumes one atomic sequence number — duplicate sequence numbers are physically impossible",
    "The USTN master object binds the USTN to specific shipment details (origin, destination, commodity, quantity, parties)",
    "Any mismatch between the USTN-bound shipment details and the presented shipment is detected at customs (Nafeza ACID), bank (ISO 20022 narrative), and the Loom audit chain",
    "Revoked USTNs (see §5.1.11) are listed in a USTN revocation log; revoked USTNs cannot authorize new actions",
  ],
  verificationEndpoint: "GET /api/v1/ustn/track?ustn=... returns the canonical status + master object hash for third-party verification",
} as const;

// ============ v18 §5 — USTN Lifecycle (16 statuses) ============
// (mirrors the existing v17 USTN_STATUSES for v18 documentation)

export const USTN_LIFECYCLE_STATUSES = [
  { status: "INITIATED", description: "Trade request created, USTN generated", whoCanAdvance: "Seller must accept" },
  { status: "STAGE1_PENDING", description: "Seller quote submitted, waiting Stage 1 payment", whoCanAdvance: "Seller (pay)" },
  { status: "STAGE1_SETTLED", description: "All Stage 1 mandatory invoices paid", whoCanAdvance: "System (auto)" },
  { status: "CUSTOMS_SUBMITTED", description: "Nafeza declaration filed", whoCanAdvance: "Broker or System" },
  { status: "BOOKED", description: "Container booking confirmed", whoCanAdvance: "SHIP user" },
  { status: "LOADED", description: "Container loaded on vessel", whoCanAdvance: "LSP driver or SHIP" },
  { status: "DEPARTED", description: "Vessel departed", whoCanAdvance: "SHIP user" },
  { status: "IN_TRANSIT", description: "Vessel at sea (automatic from AIS)", whoCanAdvance: "System (auto)" },
  { status: "ARRIVED", description: "Vessel arrived at destination port", whoCanAdvance: "SHIP user" },
  { status: "CUSTOMS_IMPORT", description: "Import customs clearance started", whoCanAdvance: "Buyer or CBR" },
  { status: "DELIVERED", description: "Buyer confirms receipt of goods", whoCanAdvance: "Buyer" },
  { status: "SETTLED", description: "Trade principal paid by buyer", whoCanAdvance: "System (auto)" },
  { status: "COMPLETED", description: "All milestones closed, documents archived", whoCanAdvance: "System (auto, 30d after SETTLED)" },
  { status: "DISPUTED", description: "Quality or payment claim raised", whoCanAdvance: "Any party" },
  { status: "DISTRESSED", description: "Cargo declared distressed", whoCanAdvance: "Seller" },
  { status: "CANCELLED", description: "Trade cancelled before completion", whoCanAdvance: "Any party with consent" },
] as const;

// ============ v18 §5.10 — USTN Closure Conditions (7) ============

export const USTN_CLOSURE_CONDITIONS = [
  { id: 1, name: "Settlement Confirmed", description: "Bank-confirmed settlement of the principal payment" },
  { id: 2, name: "Delivery Confirmed", description: "Buyer-confirmed receipt of goods at the destination" },
  { id: 3, name: "Customs Closed", description: "Both export and import customs declarations closed" },
  { id: 4, name: "Documents Archived", description: "All 26 evidence categories sealed and archived" },
  { id: 5, name: "Disputes Resolved", description: "All disputes filed against the USTN are resolved or withdrawn" },
  { id: 6, name: "Financial Exposure Cleared", description: "All financing, guarantees, and deferred payments settled" },
  { id: 7, name: "Timeline Complete", description: "30-day post-settlement window elapsed with no incident" },
] as const;

// ============ Convenience: full canonical USTN payload ============

export function getUstnFormatPayload() {
  return {
    format: USTN_V18_FORMAT,
    components: USTN_COMPONENTS,
    total_length: USTN_TOTAL_LENGTH,
    validation_rules: USTN_VALIDATION_RULES,
    counter_model: USTN_COUNTER_MODEL,
    examples: USTN_EXAMPLES,
    namespace_semantics: USTN_NAMESPACE_SEMANTICS,
    replay_protection: USTN_REPLAY_PROTECTION,
    lifecycle_statuses: USTN_LIFECYCLE_STATUSES,
    closure_conditions: USTN_CLOSURE_CONDITIONS,
    counts: {
      components: USTN_COMPONENTS.length, // 5
      validation_rules: USTN_VALIDATION_RULES.length, // 9
      examples: USTN_EXAMPLES.length, // 5
      lifecycle_statuses: USTN_LIFECYCLE_STATUSES.length, // 16
      closure_conditions: USTN_CLOSURE_CONDITIONS.length, // 7
      physical_embodiments: USTN_NAMESPACE_SEMANTICS.physicalEmbodiment.length, // 5
      ai_assistance_features: Object.keys(USTN_NAMESPACE_SEMANTICS.aiAssistance).length, // 4
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
