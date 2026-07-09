/**
 * Certificate of Origin Generation Engine
 * =======================================
 *
 * Generates Certificate of Origin data models and text representations for
 * the major preferential trade agreements that flow through SGTX:
 *
 *   • EUR.1    — Egypt-EU Association Agreement (2004) + Agadir Agreement
 *                (EG↔EU, EG↔MA/TN/JO). Issued by GOEIC / Chamber of Commerce.
 *   • EUR-MED  — Pan-Euro-Mediterranean diagonal cumulation variant of EUR.1,
 *                used when the originating inputs include materials from
 *                another Pan-Euro-Med party (TR/MA/TN/IL/…).
 *   • AR.1     — Greater Arab Free Trade Area (GAFTA) certificate of origin.
 *                Issued by the exporting party's Chamber of Commerce.
 *   • COMESA   — Common Market for Eastern & Southern Africa certificate of
 *                origin. Issued by the designated authority in the exporting
 *                member state.
 *   • AFCFTA   — African Continental Free Trade Area certificate of origin.
 *                Issued by the designated Competent Authority in the
 *                exporting party.
 *   • A.TR     — Egypt-Turkey Free Trade Agreement movement certificate
 *                (EUR.1-style). Issued by GOEIC (EG) / TIM (TR).
 *   • GSP      — Generalized System of Preferences (legacy: EU GSP was
 *                superseded by the EU's GSP+ / EBA arrangements; still used
 *                by other preference-giving countries such as Japan).
 *   • COO_GENERAL — Non-preferential Certificate of Origin (default).
 *                Issued by the exporting country's Chamber of Commerce.
 *                Also used for the EG→USA QIZ program (with annotation).
 *
 * This module is a deterministic, self-contained logic module. It performs NO
 * external API calls. Certificate numbers, stamp URLs, and QR-code payloads
 * are MOCK-generated for UI / PDF-rendering purposes — production deployments
 * would replace `random8()` with the issuing authority's serial-number
 * allocator, and `stampUrl` / `qrCodePayload` with signed URLs issued by the
 * authority's verification backend.
 *
 * The FTA preference assessment logic itself lives in `customs-pricing.ts`
 * (`applyFta`). This module focuses on the CERTIFICATE artifact that travels
 * WITH the goods to claim the preference at the destination customs office.
 *
 * References:
 *  - Egypt-EU Association Agreement (OJ L 304, 30.09.2004, p. 39).
 *  - Agadir Agreement (Rabat, 25 February 2004; in force 27 July 2006).
 *  - GAFTA (League of Arab States, 1997; in force 1 January 1998).
 *  - COMESA Treaty (1994) — Protocol on Rules of Origin.
 *  - AfCFTA Protocol on Rules of Origin (finalized December 2023).
 *  - Egypt-Turkey FTA (Ankara, 2005; in force 1 March 2007).
 *  - WTO Bali Ministerial Decision on Pre-Shipment Inspection (G/PSI/W/3).
 *  - ICC World Chambers Federation — Certificate of Origin Guidelines (2019).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types (per task spec)
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateType =
  | "EUR.1"
  | "EUR-MED"
  | "AR.1"
  | "COMESA"
  | "AFCFTA"
  | "A.TR"
  | "GSP"
  | "COO_GENERAL";

export interface CertificateOfOrigin {
  /** Mock certificate number — format: `{TYPE}-{year}-{random8}`. */
  certificateNumber: string;
  type: CertificateType;
  ustn: string;
  exporterName: string;
  exporterAddress: string;
  exporterCountry: string;
  importerName: string;
  importerAddress: string;
  importerCountry: string;
  /** FTA under which the preference is being claimed (human-readable). */
  ftaName: string;
  goods: {
    hsCode: string;
    description: string;
    quantity: number;
    unit: string;
    /** Origin criterion statement — e.g. "W" (wholly obtained), "P" (sufficient
     *  transformation / CTH), or a cumulation statement referencing the
     *  Pan-Euro-Med parties whose inputs were used. */
    originCriterion: string;
    fobValueUsd: number;
  }[];
  totalFobUsd: number;
  transportMode: string;
  /** Issuing authority (mock, country-specific). */
  issuingAuthority: string;
  /** ISO 8601 — when the certificate was issued. */
  issuedAt: string;
  /** ISO 8601 — when the certificate expires (typically 4–12 months). */
  validUntil: string;
  status: "DRAFT" | "ISSUED" | "VERIFIED" | "REVOKED";
  /** Mock stamp image URL. */
  stampUrl?: string;
  /** Verification URL — `/verify/cert/{number}`. Encoded into a QR on the
   *  rendered certificate. */
  qrCodePayload?: string;
}

export interface CertificateResult {
  applicable: boolean;
  certificate?: CertificateOfOrigin;
  certificateType: CertificateType;
  conditions: {
    condition_id: string;
    label: string;
    status: "met" | "unmet";
  }[];
}

export interface GenerateCertificateInput {
  ustn: string;
  exporterName: string;
  exporterAddress: string;
  exporterCountry: string;
  importerName: string;
  importerAddress: string;
  importerCountry: string;
  goods: {
    hsCode: string;
    description: string;
    quantity: number;
    unit: string;
    originCriterion: string;
    fobValueUsd: number;
  }[];
  transportMode: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country group lists (local copies to avoid coupling with customs-pricing.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** EU member states (ISO 3166-1 alpha-2). */
const EU_MEMBER_STATES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/** Agadir Agreement parties — EG, MA, TN, JO. EUR.1 issued under Agadir rules
 *  with Pan-Euro-Med cumulation box completed. */
const AGADIR_PARTIES: ReadonlySet<string> = new Set(["EG", "MA", "TN", "JO"]);

/**
 * GAFTA (Greater Arab Free Trade Area) parties — per task spec list. Note:
 * - JO/MA/TN are also Agadir parties and are matched earlier (EUR.1 wins for
 *   them because Agadir is the more specific bilateral arrangement).
 * - "COM" is the ISO 3166-1 alpha-3 code for Comoros; the alpha-2 is "KM".
 *   We accept BOTH for resilience against input variance.
 */
const GAFTA_PARTIES: ReadonlySet<string> = new Set([
  "SA", "AE", "KW", "BH", "QA", "OM", "IQ", "JO", "LB", "LY", "MA", "SD",
  "SY", "TN", "YE", "DJ", "MR", "SO", "COM", "KM", "PS",
]);

/**
 * COMESA (Common Market for Eastern and Southern Africa) parties — per task
 * spec list. DJ/LY/TN are also GAFTA parties and are matched earlier (AR.1
 * wins because GAFTA is checked first per the spec ordering).
 */
const COMESA_PARTIES: ReadonlySet<string> = new Set([
  "ET", "KE", "UG", "DJ", "ER", "BI", "RW", "MU", "MG", "MW", "ZM", "ZW",
  "SC", "KM", "LY", "TN", "SZ", "EG", "COM",
]);

/**
 * AfCFTA (African Continental Free Trade Area) parties — 54 of 55 AU members
 * (Eritrea has not signed). Used as the catch-all "any African" lookup.
 */
const AFCFTA_PARTIES: ReadonlySet<string> = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD",
  "CG", "CI", "DJ", "EG", "GQ", "SZ", "ET", "GA", "GM", "GH", "GN", "GW",
  "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA",
  "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ",
  "TG", "TN", "UG", "ZM", "ZW", "COM",
]);

/** Pan-Euro-Med diagonal cumulation parties whose originating inputs trigger
 *  the EUR-MED certificate variant (per task spec: TR/MA/TN/IL). */
const PAN_EURO_MED_CUMULATION_TRIGGER_PARTIES: ReadonlySet<string> = new Set([
  "TR", "MA", "TN", "IL",
]);

/** GCC + major Islamic destination countries for which HALAL and other
 *  Islamic-compliance considerations may attach (used here only for issuing
 *  authority selection — the HALAL engine itself lives in product-compliance.ts). */
const GCC_ISLAMIC_DEST: ReadonlySet<string> = new Set([
  "SA", "AE", "KW", "BH", "QA", "OM", "MY", "ID", "BN", "PK", "EG",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Issuing-authority map (mock, country-specific)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock issuing authority for a given origin country and certificate type.
 * Real production deployments would look up the actual competent authority
 * per the FTA's designation notice — for SGTX we render a plausible label
 * suitable for UI / PDF output.
 */
function getIssuingAuthority(
  originCountry: string,
  certType: CertificateType,
): string {
  const c = (originCountry || "").toUpperCase().trim();

  // EG is the primary origin in SGTX — handle each cert type explicitly.
  if (c === "EG") {
    switch (certType) {
      case "EUR.1":
      case "EUR-MED":
        return "Egyptian Chamber of Commerce (GOEIC-registered)";
      case "A.TR":
        return "General Organization for Export and Import Control (GOEIC)";
      case "AR.1":
        return "General Union of Arab Chambers of Commerce (via Egyptian Chamber)";
      case "COMESA":
        return "Egyptian Chamber of Commerce — COMESA Unit";
      case "AFCFTA":
        return "Egyptian Chamber of Commerce — AfCFTA Unit";
      case "GSP":
        return "General Organization for Export and Import Control (GOEIC)";
      case "COO_GENERAL":
        return "Egyptian Chamber of Commerce";
    }
  }

  // EU member states — Chamber of Commerce of the (mock) exporter's city.
  if (EU_MEMBER_STATES.has(c)) {
    return `Chamber of Commerce of ${c}`;
  }

  // Other well-known origins.
  if (c === "TR") return "Turkish Exporters' Association (TIM)";
  if (c === "SA") return "Council of Saudi Chambers";
  if (c === "AE") return "Federation of UAE Chambers of Commerce & Industry";
  if (c === "MA") return "Federation of Moroccan Chambers of Commerce (CGEM)";
  if (c === "TN") return "Tunisian Union of Industry, Commerce & Crafts (UTICA)";
  if (c === "JO") return "Jordan Chamber of Commerce";
  if (c === "KE") return "Kenya National Chamber of Commerce & Industry";
  if (c === "ZA") return "South African Chamber of Commerce & Industry";
  if (c === "NG") return "Nigerian Association of Chambers of Commerce (NACCIMA)";
  if (c === "CN") return "China Council for the Promotion of International Trade (CCPIT)";
  if (c === "IN") return "Federation of Indian Chambers of Commerce & Industry (FICCI)";
  if (c === "US") return "US Chamber of Commerce";
  if (GCC_ISLAMIC_DEST.has(c)) return "National Chamber of Commerce";

  return "Chamber of Commerce";
}

// ─────────────────────────────────────────────────────────────────────────────
// FTA name map (for the `ftaName` field on CertificateOfOrigin)
// ─────────────────────────────────────────────────────────────────────────────

function getFtaName(
  originCountry: string,
  destCountry: string,
  certType: CertificateType,
): string {
  switch (certType) {
    case "EUR.1":
      if (originCountry === "EG" && EU_MEMBER_STATES.has(destCountry)) {
        return "Egypt-EU Association Agreement (OJ L 304, 30.09.2004)";
      }
      if (AGADIR_PARTIES.has(originCountry) && AGADIR_PARTIES.has(destCountry)) {
        return "Agadir Agreement (Pan-Euro-Med cumulation)";
      }
      return "Pan-Euro-Mediterranean preferential agreement (EUR.1)";
    case "EUR-MED":
      return "Pan-Euro-Mediterranean Cumulation System (EUR-MED)";
    case "AR.1":
      return "Greater Arab Free Trade Area (GAFTA, 1998)";
    case "COMESA":
      return "Common Market for Eastern and Southern Africa (COMESA, 2000)";
    case "AFCFTA":
      return "African Continental Free Trade Area (AfCFTA, 2021)";
    case "A.TR":
      return "Egypt-Turkey Free Trade Agreement (in force 1 March 2007)";
    case "GSP":
      return "Generalized System of Preferences (GSP)";
    case "COO_GENERAL":
      if (originCountry === "EG" && destCountry === "US") {
        return "Non-preferential Certificate of Origin (QIZ-annotated)";
      }
      return "Non-preferential Certificate of Origin";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validity window per certificate type (in months from issuedAt)
// ─────────────────────────────────────────────────────────────────────────────

const VALIDITY_MONTHS: Record<CertificateType, number> = {
  // EUR.1 / EUR-MED: typically 4–10 months; we use 10.
  "EUR.1": 10,
  "EUR-MED": 10,
  // GAFTA AR.1: 6 months (some chambers issue with 4-month validity).
  "AR.1": 6,
  // COMESA: 6 months.
  "COMESA": 6,
  // AfCFTA: 12 months.
  "AFCFTA": 12,
  // A.TR: 12 months.
  "A.TR": 12,
  // GSP: 12 months (or until the registered exporter's REX authorization
  // lapses, whichever is earlier).
  "GSP": 12,
  // Non-preferential COO: 6 months (chamber-specific; some accept 12).
  "COO_GENERAL": 6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Random helpers (mock-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 8-character alphanumeric mock serial. Uses `crypto.getRandomValues` when
 * available (Node 19+/browser/Bun), falls back to `Math.random`. Sufficient
 * for mock certificate numbers — NOT a security primitive.
 */
function random8(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I)
  const out = new Array<string>(8);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(8);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < 8; i++) out[i] = chars[buf[i] % chars.length];
  } else {
    for (let i = 0; i < 8; i++) out[i] = chars[Math.floor(Math.random() * chars.length)];
  }
  return out.join("");
}

/** Build a mock certificate number — `{TYPE}-{year}-{random8}`.
 *  Example: `EUR.1-2026-K7P3M9XQ`. */
function buildCertificateNumber(type: CertificateType): string {
  const year = new Date().getUTCFullYear();
  return `${type}-${year}-${random8()}`;
}

/** Add `months` to `date` and return a new Date. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the applicable Certificate of Origin type for a (origin, dest)
 * country pair.
 *
 * The mapping is Egypt-centric (the spec lists EG as origin for every rule).
 * For non-EG origins, the function falls back to `COO_GENERAL` (the
 * non-preferential default) — extended bilateral mappings can be added as the
 * platform onboards additional origins.
 *
 * Order of precedence (most-specific first):
 *   1. Same country → null (no international trade, no COO needed).
 *   2. EG → TR           → A.TR (Egypt-Turkey FTA).
 *   3. EG → EU member    → EUR.1 (Egypt-EU Association Agreement).
 *   4. EG → MA / TN / JO → EUR.1 (Agadir Agreement, Pan-Euro-Med cumulation).
 *   5. EG → US           → COO_GENERAL (with QIZ annotation when applicable).
 *   6. EG → GAFTA party  → AR.1 (Greater Arab Free Trade Area).
 *   7. EG → COMESA party → COMESA certificate.
 *   8. EG → any African  → AFCFTA certificate.
 *   9. Default           → COO_GENERAL.
 *
 * NOTE: `EUR-MED` is not returned by this function — it is an EUR.1 variant
 * used when the origin declaration invokes Pan-Euro-Med diagonal cumulation
 * (TR/MA/TN/IL inputs). `generateCertificate` upgrades EUR.1 → EUR-MED when
 * cumulation is detected in the goods' origin-criterion statements.
 */
export function determineCertificateType(
  originCountry: string,
  destCountry: string,
): CertificateType | null {
  const origin = (originCountry || "").toUpperCase().trim();
  const dest = (destCountry || "").toUpperCase().trim();

  if (!origin || !dest) return null;
  if (origin === dest) return null; // no international trade

  // Egypt-centric mapping (per spec).
  if (origin === "EG") {
    if (dest === "TR") return "A.TR";
    if (EU_MEMBER_STATES.has(dest)) return "EUR.1";
    if (AGADIR_PARTIES.has(dest)) return "EUR.1"; // MA / TN / JO
    if (dest === "US") return "COO_GENERAL"; // QIZ annotation applied in generateCertificate
    if (GAFTA_PARTIES.has(dest)) return "AR.1";
    if (COMESA_PARTIES.has(dest)) return "COMESA";
    if (AFCFTA_PARTIES.has(dest)) return "AFCFTA";
    return "COO_GENERAL";
  }

  // Reverse direction — EG as destination. Mirror the same agreements.
  if (dest === "EG") {
    if (origin === "TR") return "A.TR";
    if (EU_MEMBER_STATES.has(origin)) return "EUR.1";
    if (AGADIR_PARTIES.has(origin)) return "EUR.1";
    if (origin === "US") return "COO_GENERAL";
    if (GAFTA_PARTIES.has(origin)) return "AR.1";
    if (COMESA_PARTIES.has(origin)) return "COMESA";
    if (AFCFTA_PARTIES.has(origin)) return "AFCFTA";
    return "COO_GENERAL";
  }

  // Non-EG origins: preferential certificates only for well-known pairs.
  // EU ↔ EU is intra-EU (no COO needed for the preference — handled via EMCS).
  if (EU_MEMBER_STATES.has(origin) && EU_MEMBER_STATES.has(dest)) return null;
  // EU ↔ EFTA / TR / Pan-Euro-Med: EUR.1 / EUR-MED.
  if (
    (EU_MEMBER_STATES.has(origin) && AGADIR_PARTIES.has(dest)) ||
    (AGADIR_PARTIES.has(origin) && EU_MEMBER_STATES.has(dest))
  ) {
    return "EUR.1";
  }
  if (
    (EU_MEMBER_STATES.has(origin) && dest === "TR") ||
    (origin === "TR" && EU_MEMBER_STATES.has(dest))
  ) {
    return "A.TR";
  }
  // Two GAFTA parties → AR.1.
  if (GAFTA_PARTIES.has(origin) && GAFTA_PARTIES.has(dest)) return "AR.1";
  // Two COMESA parties → COMESA.
  if (COMESA_PARTIES.has(origin) && COMESA_PARTIES.has(dest)) return "COMESA";
  // Two AfCFTA parties → AFCFTA.
  if (AFCFTA_PARTIES.has(origin) && AFCFTA_PARTIES.has(dest)) return "AFCFTA";

  return "COO_GENERAL";
}

/**
 * Detect whether the goods' origin-criterion statements invoke Pan-Euro-Med
 * diagonal cumulation with TR/MA/TN/IL inputs — in which case the EUR.1
 * certificate is upgraded to EUR-MED.
 */
function detectCumulation(goods: { originCriterion: string }[]): boolean {
  for (const g of goods) {
    const crit = (g.originCriterion || "").toUpperCase();
    if (!crit) continue;
    if (crit.includes("CUMULATION") || crit.includes("CUMUL")) return true;
    if (crit.includes("PAN-EURO-MED") || crit.includes("PAN EUROS MED")) return true;
    for (const party of PAN_EURO_MED_CUMULATION_TRIGGER_PARTIES) {
      // Match standalone 2-letter party tokens (not as substrings).
      const re = new RegExp(`\\b${party}\\b`);
      if (re.test(crit)) return true;
    }
  }
  return false;
}

/**
 * Generate a Certificate of Origin for a single trade.
 *
 * The function:
 *   1. Calls `determineCertificateType` to resolve the base certificate type.
 *   2. If EUR.1 and Pan-Euro-Med cumulation is detected in the goods' origin
 *      criteria, upgrades the type to EUR-MED.
 *   3. Computes the total FOB value (sum of all goods' `fobValueUsd`).
 *   4. Builds the `CertificateOfOrigin` artifact with mock certificate number,
 *      issuing authority, validity window, stamp URL, and QR-code payload.
 *   5. Emits the standard condition set (origin criterion, direct consignment,
 *      value threshold, supporting documents, authority stamp).
 *
 * `applicable = false` when:
 *   - The (origin, dest) pair has no applicable preferential agreement
 *     (determineCertificateType returns null) AND no goods are supplied; OR
 *   - The goods array is empty.
 *
 * When `applicable = false`, no certificate is returned but the
 * `certificateType` is still set (to `COO_GENERAL` as a sensible default) so
 * that downstream UIs can render an empty-state.
 */
export function generateCertificate(input: GenerateCertificateInput): CertificateResult {
  const origin = (input.exporterCountry || "").toUpperCase().trim();
  const dest = (input.importerCountry || "").toUpperCase().trim();
  const goods = Array.isArray(input.goods) ? input.goods : [];

  const baseType = determineCertificateType(origin, dest);

  // Applicability gate — must have a resolved type AND at least one good.
  const applicable = baseType !== null && goods.length > 0;

  // Pick the certificate type — upgrade EUR.1 → EUR-MED on cumulation.
  let certificateType: CertificateType = baseType ?? "COO_GENERAL";
  if (applicable && certificateType === "EUR.1" && detectCumulation(goods)) {
    certificateType = "EUR-MED";
  }

  // Build the standard condition set. All conditions start as `unmet` since
  // the certificate is freshly generated (DRAFT state); downstream issuance
  // flows mark them `met` as the exporter uploads supporting evidence.
  const conditions: CertificateResult["conditions"] = [
    {
      condition_id: "COO-ORIGIN-CRITERION",
      label: `Goods meet the origin criterion of ${getFtaName(origin, dest, certificateType)}`,
      status: "unmet",
    },
    {
      condition_id: "COO-DIRECT-CONSIGNMENT",
      label: "Direct consignment rule satisfied (no transit through non-party territory)",
      status: "unmet",
    },
    {
      condition_id: "COO-VALUE-THRESHOLD",
      label: "FOB value meets the FTA's minimum value-added / de-minimis threshold",
      status: "unmet",
    },
    {
      condition_id: "COO-SUPPORTING-DOCS",
      label: "Supporting documents on file (commercial invoice, packing list, bill of lading)",
      status: "unmet",
    },
    {
      condition_id: "COO-AUTHORITY-STAMP",
      label: `Issuing authority stamp & authorized signature (${getIssuingAuthority(origin, certificateType)})`,
      status: "unmet",
    },
  ];

  if (!applicable) {
    return {
      applicable: false,
      certificateType,
      conditions,
    };
  }

  const totalFobUsd = goods.reduce((sum, g) => sum + (Number(g.fobValueUsd) || 0), 0);
  const issuedAt = new Date();
  const validUntil = addMonths(issuedAt, VALIDITY_MONTHS[certificateType]);
  const certificateNumber = buildCertificateNumber(certificateType);
  const verificationUrl = `/verify/cert/${certificateNumber}`;

  // QIZ annotation (EG→US): the certificate is annotated with a QIZ
  // declaration if the exporter is in a designated Egyptian QIZ. SGTX mocks
  // this as a stamp URL fragment.
  const isQiz = origin === "EG" && dest === "US";

  const certificate: CertificateOfOrigin = {
    certificateNumber,
    type: certificateType,
    ustn: (input.ustn || "").trim(),
    exporterName: input.exporterName,
    exporterAddress: input.exporterAddress,
    exporterCountry: origin,
    importerName: input.importerName,
    importerAddress: input.importerAddress,
    importerCountry: dest,
    ftaName: getFtaName(origin, dest, certificateType),
    goods: goods.map((g) => ({
      hsCode: g.hsCode,
      description: g.description,
      quantity: Number(g.quantity) || 0,
      unit: g.unit,
      originCriterion: g.originCriterion,
      fobValueUsd: Number(g.fobValueUsd) || 0,
    })),
    totalFobUsd,
    transportMode: input.transportMode,
    issuingAuthority: getIssuingAuthority(origin, certificateType),
    issuedAt: issuedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    status: "ISSUED",
    stampUrl: `https://sgtx.local/stamps/${certificateNumber}.png${isQiz ? "?qiz=true" : ""}`,
    qrCodePayload: verificationUrl,
  };

  return {
    applicable: true,
    certificate,
    certificateType,
    conditions,
  };
}

/**
 * Render a `CertificateOfOrigin` as a human-readable plain-text representation
 * suitable for PDF rendering (e.g. via pdfmake / ReportLab / LaTeX). The
 * layout mirrors the field order on the EUR.1 / AR.1 paper form.
 */
export function certificateToText(cert: CertificateOfOrigin): string {
  const lines: string[] = [];
  const rule = (s: string) => "─".repeat(s.length);

  lines.push("══════════════════════════════════════════════════════════════════════");
  lines.push("                   CERTIFICATE OF ORIGIN");
  lines.push("══════════════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`  Certificate Type :  ${cert.type}`);
  lines.push(`  Certificate No.  :  ${cert.certificateNumber}`);
  lines.push(`  USTN             :  ${cert.ustn || "—"}`);
  lines.push(`  Status           :  ${cert.status}`);
  lines.push("");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  1.  EXPORTER (Consignor)");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push(`      Name      :  ${cert.exporterName || "—"}`);
  lines.push(`      Address   :  ${cert.exporterAddress || "—"}`);
  lines.push(`      Country   :  ${cert.exporterCountry || "—"}`);
  lines.push("");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  2.  IMPORTER (Consignee)");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push(`      Name      :  ${cert.importerName || "—"}`);
  lines.push(`      Address   :  ${cert.importerAddress || "—"}`);
  lines.push(`      Country   :  ${cert.importerCountry || "—"}`);
  lines.push("");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  3.  PREFERENTIAL AGREEMENT");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push(`      FTA       :  ${cert.ftaName || "—"}`);
  lines.push(`      Transport :  ${cert.transportMode || "—"}`);
  lines.push("");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  4.  GOODS");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  #  HS Code     Description                       Qty      Unit   Origin  FOB (USD)");
  lines.push("  ─  ──────────  ───────────────────────────────  ───────  ─────  ──────  ─────────");
  cert.goods.forEach((g, i) => {
    const num = String(i + 1).padStart(2, " ");
    const hs = (g.hsCode || "").padEnd(10, " ").slice(0, 10);
    const desc = (g.description || "").padEnd(32, " ").slice(0, 32);
    const qty = String(g.quantity).padStart(7, " ");
    const unit = (g.unit || "").padEnd(5, " ");
    const crit = (g.originCriterion || "").padEnd(6, " ").slice(0, 6);
    const fob = g.fobValueUsd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).padStart(10, " ");
    lines.push(`  ${num}  ${hs}  ${desc}  ${qty}  ${unit}  ${crit}  ${fob}`);
  });
  lines.push("");
  const totalStr = cert.totalFobUsd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  lines.push(`  TOTAL FOB VALUE (USD) :  $${totalStr}`);
  lines.push("");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  5.  ISSUANCE & VALIDITY");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push(`      Issuing Authority :  ${cert.issuingAuthority || "—"}`);
  lines.push(`      Issued At         :  ${cert.issuedAt || "—"}`);
  lines.push(`      Valid Until       :  ${cert.validUntil || "—"}`);
  if (cert.stampUrl) {
    lines.push(`      Stamp URL         :  ${cert.stampUrl}`);
  }
  if (cert.qrCodePayload) {
    lines.push(`      Verification QR   :  ${cert.qrCodePayload}`);
  }
  lines.push("");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  6.  DECLARATION");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("      The undersigned declares that the above-described goods are");
  lines.push("      originating in the country identified in Box 1, in accordance");
  lines.push(`      with the rules of origin of the ${cert.ftaName || "applicable agreement"},`);
  lines.push("      and that the particulars given in this certificate are correct.");
  lines.push("");
  lines.push("      ___________________________________________");
  lines.push(`      Authorized Signature — ${cert.issuingAuthority || "Issuing Authority"}`);
  lines.push("");
  lines.push("══════════════════════════════════════════════════════════════════════");
  lines.push(`  Verify online: ${certificateVerificationUrl(cert)}`);
  lines.push("══════════════════════════════════════════════════════════════════════");

  void rule; // (kept for future use; suppresses unused-var warnings if any)
  return lines.join("\n");
}

/**
 * Build the public verification URL for a certificate.
 * Format: `/verify/cert/{certificateNumber}`.
 *
 * The verification portal (served at this path) renders the certificate's
 * public details + authenticity status. The URL is also encoded into a QR
 * code printed on the PDF certificate.
 */
export function certificateVerificationUrl(cert: CertificateOfOrigin): string {
  return `/verify/cert/${encodeURIComponent(cert.certificateNumber)}`;
}
