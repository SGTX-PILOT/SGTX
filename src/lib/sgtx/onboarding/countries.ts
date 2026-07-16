// SGTX Worldwide Country Registration Data
// Comprehensive per-country legal entity types, required KYB documents,
// currency codes (ISO 4217), and phone dial codes for 195+ countries.
// Each entry also carries the emoji flag (derived from the ISO 3166-1 alpha-2
// code via regional indicator symbol offset — FIX-AUTH-COUNTRIES-KYC / Fix 6).

export interface CountryEntityType {
  code: string;
  label: string;
  description: string;
}
export interface CountryRequiredDocument {
  key: string;
  label: string;
  description: string;
  mandatory: boolean;
}
export interface CountryRegistrationData {
  code: string;
  name: string;
  currency: string; // ISO 4217
  dialCode: string; // E.164 prefix
  /**
   * Emoji flag (regional indicator symbols), e.g. "🇪🇬" for Egypt.
   * Marked optional in the interface so the source literals (which span 89
   * explicit + 154 default entries) can omit it — the public export
   * `COUNTRY_REGISTRATION_DATA` always fills it via {@link flagEmoji}.
   */
  flag?: string;
  entityTypes: CountryEntityType[];
  requiredDocuments: CountryRequiredDocument[];
}

// ============================================================
// Flag emoji helper (FIX-AUTH-COUNTRIES-KYC / Fix 6)
// ============================================================
//
// ISO 3166-1 alpha-2 codes map to Unicode "regional indicator letters"
// (U+1F1E6 .. U+1F1FF, one per A-Z). Each letter of the alpha-2 code is
// converted by adding the offset (letter - 'A') to 0x1F1E6. Two regional
// indicators in sequence render as a flag glyph on most platforms.
//
// Examples: "EG" → 🇪🇬, "DE" → 🇩🇪, "US" → 🇺🇸, "JP" → 🇯🇵.
// Codes outside the A-Z{2} pattern (e.g. numeric-only) return the empty
// string — no flag is rendered.

/**
 * Convert an ISO 3166-1 alpha-2 country code to its emoji flag.
 *
 * @param code - 2-letter uppercase ISO code (e.g. "EG", "DE", "US").
 * @returns the emoji flag (2 regional-indicator code points), or "" if the
 *          input is not a 2-letter A-Z code.
 */
export function flagEmoji(code: string): string {
  if (!code || typeof code !== "string") return "";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A_OFFSET = 0x1f1e6;
  const cp1 = A_OFFSET + (upper.charCodeAt(0) - 65);
  const cp2 = A_OFFSET + (upper.charCodeAt(1) - 65);
  return String.fromCodePoint(cp1, cp2);
}

// ============================================================
// Default documents (universal across most countries)
// ============================================================
const DEFAULT_DOCS: CountryRequiredDocument[] = [
  { key: "commercial_register", label: "Commercial Register Certificate", description: "Official company registration extract", mandatory: true },
  { key: "tax_id", label: "Tax Identification Number", description: "National tax ID (VAT/TIN)", mandatory: true },
  { key: "ubo_declaration", label: "UBO Declaration", description: "Ultimate Beneficial Owner declaration", mandatory: true },
  { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "Sanctions & AML compliance declaration", mandatory: true },
  { key: "articles_of_association", label: "Articles of Association", description: "Company charter / bylaws", mandatory: true },
  { key: "bank_reference", label: "Bank Reference Letter", description: "Reference letter from your bank", mandatory: false },
];

// ============================================================
// Region: AFRICA
// ============================================================
const AFRICA: CountryRegistrationData[] = [
  {
    code: "EG", name: "Egypt", currency: "EGP", dialCode: "+20",
    entityTypes: [
      { code: "SAE", label: "Société Anonyme Egyptienne (SAE)", description: "Joint stock company — Egyptian public/share-based company" },
      { code: "LLC", label: "Limited Liability Company (LLC)", description: "Most common — 2-50 partners, capped at 50" },
      { code: "BRANCH", label: "Branch of Foreign Company", description: "Registered branch of foreign parent (GAFI approval)" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Single-owner commercial register" },
      { code: "FZ", label: "Free Zone Company", description: "Investment in SCZone or specialized free zones" },
    ],
    requiredDocuments: [
      { key: "commercial_register", label: "Commercial Registry Extract", description: "From the Companies Registry (GAFI)", mandatory: true },
      { key: "tax_card", label: "Tax Card (البطاقة الضريبية)", description: "Egyptian Tax Authority card", mandatory: true },
      { key: "import_card", label: "Import Card (بطاقة مستورد)", description: "Required for traders (GOEIC)", mandatory: false },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Ultimate Beneficial Owner", mandatory: true },
      { key: "articles_of_association", label: "Articles of Association", description: "Company contract (Arabic or bilingual)", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "AML/sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From an Egyptian or international bank", mandatory: false },
    ],
  },
  {
    code: "NG", name: "Nigeria", currency: "NGN", dialCode: "+234",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company (Ltd)", description: "CAC-registered private limited" },
      { code: "PLC", label: "Public Limited Company (Plc)", description: "Publicly traded company" },
      { code: "LLC", label: "Limited Liability Company (LLC)", description: "LLC structure (post-CAMA 2020)" },
      { code: "BRANCH", label: "Foreign Company Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "Business Name (Sole Proprietorship)", description: "Registered business name" },
      { code: "PARTNERSHIP", label: "Partnership", description: "General or limited partnership" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "ZA", name: "South Africa", currency: "ZAR", dialCode: "+27",
    entityTypes: [
      { code: "PTY", label: "Private Company (Pty) Ltd", description: "Private company limited by shares" },
      { code: "LTD", label: "Public Company (Ltd)", description: "Public limited company" },
      { code: "CC", label: "Close Corporation (CC)", description: "Legacy — no new registrations since 2011" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual trader" },
      { code: "PARTNERSHIP", label: "Partnership", description: "General partnership" },
      { code: "NPC", label: "Non-Profit Company (NPC)", description: "Section 21 company" },
      { code: "SOC", label: "State-Owned Company (SOC)", description: "Government-owned entity" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "KE", name: "Kenya", currency: "KES", dialCode: "+254",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company", description: "Private company limited by shares" },
      { code: "PLC", label: "Public Limited Company", description: "Public company" },
      { code: "LLP", label: "Limited Liability Partnership", description: "LLP" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Single owner" },
      { code: "BRANCH", label: "Branch of Foreign Company", description: "Foreign company branch" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "MA", name: "Morocco", currency: "MAD", dialCode: "+212",
    entityTypes: [
      { code: "SARL", label: "SARL (Société à Responsabilité Limitée)", description: "Limited liability company" },
      { code: "SA", label: "SA (Société Anonyme)", description: "Public limited company" },
      { code: "SNC", label: "SNC (Société en Nom Collectif)", description: "General partnership" },
      { code: "SCS", label: "SCS (Société en Commandite Simple)", description: "Limited partnership" },
      { code: "BRANCH", label: "Branch of Foreign Company", description: "Bureau de liaison / succursale" },
      { code: "AUTO", label: "Auto-entrepreneur", description: "Sole entrepreneur regime" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "TN", name: "Tunisia", currency: "TND", dialCode: "+216",
    entityTypes: [
      { code: "SARL", label: "SARL", description: "Limited liability company" },
      { code: "SA", label: "SA (Société Anonyme)", description: "Public limited company" },
      { code: "SNC", label: "SNC", description: "General partnership" },
      { code: "SCS", label: "SCS", description: "Limited partnership" },
      { code: "SUCCURSALE", label: "Succursale", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "GH", name: "Ghana", currency: "GHS", dialCode: "+233",
    entityTypes: [
      { code: "LTD", label: "Private Limited by Shares", description: "Private company" },
      { code: "PLC", label: "Public Limited", description: "Public company" },
      { code: "LLP", label: "Limited Liability Partnership", description: "LLP" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual business" },
      { code: "EXTERNAL", label: "External Company", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "ET", name: "Ethiopia", currency: "ETB", dialCode: "+251",
    entityTypes: [
      { code: "PVT", label: "Private Limited Company (PVT)", description: "Private limited — 2-50 shareholders" },
      { code: "SC", label: "Share Company (SC)", description: "Public share company" },
      { code: "PARTNERSHIP", label: "General Partnership", description: "Partnership" },
      { code: "BRANCH", label: "Branch of Foreign Company", description: "Foreign branch (EIC-licensed)" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual trader" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "TZ", name: "Tanzania", currency: "TZS", dialCode: "+255",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company", description: "Private limited" },
      { code: "PLC", label: "Public Limited Company", description: "Public company" },
      { code: "BRANCH", label: "Branch of Foreign Company", description: "Foreign branch" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual business" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "UG", name: "Uganda", currency: "UGX", dialCode: "+256",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company", description: "Private limited" },
      { code: "PLC", label: "Public Limited Company", description: "Public company" },
      { code: "BRANCH", label: "Foreign Company Branch", description: "External company" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual business" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "DZ", name: "Algeria", currency: "DZD", dialCode: "+213",
    entityTypes: [
      { code: "SARL", label: "SARL (EURL if single)", description: "Limited liability (single-owner = EURL)" },
      { code: "SPA", label: "SPA (Société par Actions)", description: "Joint stock company" },
      { code: "SNC", label: "SNC", description: "General partnership" },
      { code: "BRANCH", label: "Foreign Branch", description: "Succursale (51% Algerian cap on foreign trade)" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "LY", name: "Libya", currency: "LYD", dialCode: "+218",
    entityTypes: [
      { code: "LTD", label: "Limited Liability Company", description: "LLC" },
      { code: "JSC", label: "Joint Stock Company", description: "Share company" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "SD", name: "Sudan", currency: "SDG", dialCode: "+249",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company", description: "LLC" },
      { code: "JSC", label: "Joint Stock Company", description: "Public company" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "AO", name: "Angola", currency: "AOA", dialCode: "+244",
    entityTypes: [
      { code: "LDA", label: "Sociedade por Quotas (LDA)", description: "LLC" },
      { code: "SA", label: "Sociedade Anónima (SA)", description: "Joint stock" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
      { code: "SOLE", label: "Empresário em Nome Individual", description: "Sole proprietor" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "CM", name: "Cameroon", currency: "XAF", dialCode: "+237",
    entityTypes: [
      { code: "SARL", label: "SARL", description: "LLC" },
      { code: "SA", label: "SA", description: "Public limited" },
      { code: "SNC", label: "SNC", description: "General partnership" },
      { code: "BRANCH", label: "Branch", description: "Foreign branch" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "CI", name: "Côte d'Ivoire", currency: "XOF", dialCode: "+225",
    entityTypes: [
      { code: "SARL", label: "SARL", description: "LLC" },
      { code: "SA", label: "SA", description: "Public limited" },
      { code: "SNC", label: "SNC", description: "General partnership" },
      { code: "BRANCH", label: "Succursale", description: "Foreign branch" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "SN", name: "Senegal", currency: "XOF", dialCode: "+221",
    entityTypes: [
      { code: "SARL", label: "SARL", description: "LLC" },
      { code: "SA", label: "SA", description: "Public limited" },
      { code: "SNC", label: "SNC", description: "General partnership" },
      { code: "BRANCH", label: "Succursale", description: "Foreign branch" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
];

// ============================================================
// Region: EUROPE (EU + non-EU)
// ============================================================
const EU_DEFAULT_DOCS: CountryRequiredDocument[] = [
  { key: "commercial_register", label: "Commercial Register Extract", description: "From national companies registry", mandatory: true },
  { key: "vat_id", label: "VAT Identification Number", description: "EU VAT number (VIES-validated)", mandatory: true },
  { key: "ubo_declaration", label: "UBO Declaration", description: "Ultimate Beneficial Owner (per EU AMLD5)", mandatory: true },
  { key: "articles_of_association", label: "Articles of Association", description: "Company statutes", mandatory: true },
  { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "EU/UN sanctions compliance", mandatory: true },
  { key: "bank_reference", label: "Bank Reference Letter", description: "From EU-regulated bank", mandatory: false },
  { key: "gdpr_compliance", label: "GDPR Compliance Statement", description: "Data protection compliance", mandatory: false },
];

const EUROPE: CountryRegistrationData[] = [
  {
    code: "DE", name: "Germany", currency: "EUR", dialCode: "+49",
    entityTypes: [
      { code: "GMBH", label: "GmbH (Gesellschaft mit beschränkter Haftung)", description: "Private limited — most common SME form" },
      { code: "AG", label: "AG (Aktiengesellschaft)", description: "Public limited / joint stock" },
      { code: "KG", label: "KG (Kommanditgesellschaft)", description: "Limited partnership" },
      { code: "OHG", label: "OHG (Offene Handelsgesellschaft)", description: "General partnership" },
      { code: "GBR", label: "GbR (Gesellschaft bürgerlichen Rechts)", description: "Civil-law partnership" },
      { code: "UG", label: "UG (Unternehmergesellschaft)", description: "Mini-GmbH (low capital)" },
      { code: "EK", label: "e.K. (Einzelkaufmann)", description: "Sole proprietorship (registered merchant)" },
      { code: "BRANCH", label: "Zweigniederlassung (Branch)", description: "Branch of foreign company" },
      { code: "EG", label: "eG (Genossenschaft)", description: "Cooperative" },
      { code: "STIFTUNG", label: "Stiftung", description: "Foundation" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "FR", name: "France", currency: "EUR", dialCode: "+33",
    entityTypes: [
      { code: "SARL", label: "SARL (Société à Responsabilité Limitée)", description: "Private limited — 2-100 partners" },
      { code: "SAS", label: "SAS (Société par Actions Simplifiée)", description: "Simplified joint stock — flexible, popular with startups" },
      { code: "SA", label: "SA (Société Anonyme)", description: "Public limited company" },
      { code: "SNC", label: "SNC (Société en Nom Collectif)", description: "General partnership" },
      { code: "SCI", label: "SCI (Société Civile Immobilière)", description: "Civil real-estate company" },
      { code: "EURL", label: "EURL", description: "Single-member SARL" },
      { code: "SASU", label: "SASU", description: "Single-member SAS" },
      { code: "AUTO", label: "Auto-entrepreneur", description: "Sole proprietor micro-enterprise" },
      { code: "BRANCH", label: "Succursale", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "IT", name: "Italy", currency: "EUR", dialCode: "+39",
    entityTypes: [
      { code: "SRL", label: "S.r.l. (Società a Responsabilità Limitata)", description: "Private limited" },
      { code: "SPA", label: "S.p.A. (Società per Azioni)", description: "Public limited" },
      { code: "SAPA", label: "S.a.p.a.", description: "Partnership limited by shares" },
      { code: "SNC", label: "S.n.c.", description: "General partnership" },
      { code: "SAS", label: "S.a.s.", description: "Limited partnership" },
      { code: "SRLS", label: "S.r.l.s. (Semplificata)", description: "Simplified S.r.l. (low capital)" },
      { code: "BRANCH", label: "Stabile Organizzazione", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "ES", name: "Spain", currency: "EUR", dialCode: "+34",
    entityTypes: [
      { code: "SL", label: "S.L. (Sociedad Limitada)", description: "Private limited" },
      { code: "SA", label: "S.A. (Sociedad Anónima)", description: "Public limited" },
      { code: "SLU", label: "S.L.U. (Unipersonal)", description: "Single-member S.L." },
      { code: "SAU", label: "S.A.U.", description: "Single-member S.A." },
      { code: "SCL", label: "Sociedad Civil Limitada", description: "Civil partnership" },
      { code: "SLNE", label: "S.L.N.E. (Nueva Empresa)", description: "New Enterprise limited" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "NL", name: "Netherlands", currency: "EUR", dialCode: "+31",
    entityTypes: [
      { code: "BV", label: "B.V. (Besloten Vennootschap)", description: "Private limited" },
      { code: "NV", label: "N.V. (Naamloze Vennootschap)", description: "Public limited" },
      { code: "VOF", label: "V.O.F.", description: "General partnership" },
      { code: "CV", label: "C.V. (Commanditaire Vennootschap)", description: "Limited partnership" },
      { code: "MAATSCHAP", label: "Maatschap", description: "Professional partnership" },
      { code: "EEIG", label: "European Economic Interest Grouping", description: "EU cross-border partnership" },
      { code: "BRANCH", label: "Vestiging", description: "Branch of foreign company" },
      { code: "STICHTING", label: "Stichting", description: "Foundation" },
      { code: "VERENIGING", label: "Vereniging", description: "Association" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "BE", name: "Belgium", currency: "EUR", dialCode: "+32",
    entityTypes: [
      { code: "BV", label: "BV (Besploten Vennootschap) / SRL", description: "Private limited (post-2019 reform)" },
      { code: "NV", label: "NV (Naamloze Vennootschap) / SA", description: "Public limited" },
      { code: "CV", label: "CV (Commanditaire Vennootschap)", description: "Limited partnership" },
      { code: "VOF", label: "VOF", description: "General partnership" },
      { code: "VZW", label: "VZW (Vereniging zonder Winstoogmerk)", description: "Non-profit" },
      { code: "BRANCH", label: "Branch (Filiale)", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "GB", name: "United Kingdom", currency: "GBP", dialCode: "+44",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company (Ltd)", description: "Private company limited by shares" },
      { code: "PLC", label: "Public Limited Company (Plc)", description: "Public company" },
      { code: "LLP", label: "Limited Liability Partnership (LLP)", description: "LLP" },
      { code: "LP", label: "Limited Partnership (LP)", description: "LP" },
      { code: "SOLE", label: "Sole Trader", description: "Sole proprietorship" },
      { code: "PARTNERSHIP", label: "General Partnership", description: "Unregistered partnership" },
      { code: "CIC", label: "Community Interest Company (CIC)", description: "Social enterprise" },
      { code: "BRANCH", label: "UK Establishment (Branch)", description: "Branch of overseas company" },
    ],
    requiredDocuments: [
      { key: "commercial_register", label: "Companies House Extract", description: "From Companies House", mandatory: true },
      { key: "vat_id", label: "VAT Registration Number", description: "HMRC VAT (optional below £90k threshold)", mandatory: false },
      { key: "ubo_declaration", label: "PSC Register (People with Significant Control)", description: "UBO declaration per UK Companies Act", mandatory: true },
      { key: "articles_of_association", label: "Memorandum & Articles of Association", description: "Company constitution", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "UK OFSI sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From FCA-regulated bank", mandatory: false },
    ],
  },
  {
    code: "CH", name: "Switzerland", currency: "CHF", dialCode: "+41",
    entityTypes: [
      { code: "AG", label: "AG (Aktiengesellschaft)", description: "Public limited / joint stock" },
      { code: "GMBH", label: "GmbH (Gesellschaft mit beschränkter Haftung)", description: "Private limited" },
      { code: "KG", label: "Kommanditgesellschaft", description: "Limited partnership" },
      { code: "SOLE", label: "Einzelunternehmen", description: "Sole proprietorship" },
      { code: "GENOSSENSCHAFT", label: "Genossenschaft", description: "Cooperative" },
      { code: "BRANCH", label: "Zweigniederlassung", description: "Branch of foreign company" },
      { code: "STIFTUNG", label: "Stiftung", description: "Foundation" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "AT", name: "Austria", currency: "EUR", dialCode: "+43",
    entityTypes: [
      { code: "GMBH", label: "GmbH", description: "Private limited" },
      { code: "AG", label: "AG", description: "Public limited" },
      { code: "OG", label: "OG (Offene Gesellschaft)", description: "General partnership" },
      { code: "KG", label: "KG", description: "Limited partnership" },
      { code: "BRANCH", label: "Zweigniederlassung", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "PT", name: "Portugal", currency: "EUR", dialCode: "+351",
    entityTypes: [
      { code: "LDA", label: "Lda. (Sociedade por Quotas)", description: "Private limited" },
      { code: "SA", label: "S.A. (Sociedade Anónima)", description: "Public limited" },
      { code: "UNIPESSOAL", label: "Unipessoal Lda.", description: "Single-member Lda." },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "IE", name: "Ireland", currency: "EUR", dialCode: "+353",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company (LTD)", description: "Single-member private ltd" },
      { code: "DAC", label: "Designated Activity Company (DAC)", description: "Activity-specific private ltd" },
      { code: "PLC", label: "Public Limited Company (Plc)", description: "Public company" },
      { code: "CLG", label: "Company Limited by Guarantee (CLG)", description: "Non-profit guarantee company" },
      { code: "UC", label: "Unlimited Company", description: "Unlimited liability company" },
      { code: "IOM", label: "Irish Operational Market entity", description: "Specialist" },
      { code: "BRANCH", label: "Branch (External Company)", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "PL", name: "Poland", currency: "PLN", dialCode: "+48",
    entityTypes: [
      { code: "SPZOO", label: "Sp. z o.o. (Spółka z ograniczoną odpowiedzialnością)", description: "Private limited" },
      { code: "SA", label: "S.A. (Spółka Akcyjna)", description: "Public limited" },
      { code: "JDG", label: "Jednoosobowa Działalność Gospodarcza", description: "Sole proprietorship" },
      { code: "SPJ", label: "Spółka jawna", description: "General partnership" },
      { code: "SPK", label: "Spółka komandytowa", description: "Limited partnership" },
      { code: "BRANCH", label: "Oddział", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "SE", name: "Sweden", currency: "SEK", dialCode: "+46",
    entityTypes: [
      { code: "AB", label: "Aktiebolag (AB)", description: "Private or public limited" },
      { code: "HB", label: "Handelsbolag (HB)", description: "General partnership" },
      { code: "KB", label: "Kommanditbolag (KB)", description: "Limited partnership" },
      { code: "EK", label: "Enskild firma", description: "Sole proprietorship" },
      { code: "BRANCH", label: "Filia", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "DK", name: "Denmark", currency: "DKK", dialCode: "+45",
    entityTypes: [
      { code: "APS", label: "ApS (Anpartsselskab)", description: "Private limited" },
      { code: "AS", label: "A/S (Aktieselskab)", description: "Public limited" },
      { code: "IVS", label: "IvS (Iværksætterselskab)", description: "Startup vehicle (being phased out)" },
      { code: "SMBA", label: "S.m.b.A. (Selskab med begrænset ansvar)", description: "Limited liability w/ guarantee" },
      { code: "BRANCH", label: "Filial", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "FI", name: "Finland", currency: "EUR", dialCode: "+358",
    entityTypes: [
      { code: "OY", label: "Oy (Osakeyhtiö)", description: "Private limited" },
      { code: "OYJ", label: "Oyj (Julkinen osakeyhtiö)", description: "Public limited" },
      { code: "KY", label: "Ky (Kommandiittiyhtiö)", description: "Limited partnership" },
      { code: "AY", label: "Avoin yhtiö", description: "General partnership" },
      { code: "BRANCH", label: "Sivuliike", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "NO", name: "Norway", currency: "NOK", dialCode: "+47",
    entityTypes: [
      { code: "AS", label: "AS (Aksjeselskap)", description: "Private limited" },
      { code: "ASA", label: "ASA (Allmennaksjeselskap)", description: "Public limited" },
      { code: "AS", label: "ANS (Ansvarlig selskap)", description: "General partnership" },
      { code: "DA", label: "DA (Delt ansvar)", description: "Shared liability partnership" },
      { code: "KS", label: "KS (Kommandittselskap)", description: "Limited partnership" },
      { code: "BRANCH", label: "Norskfilial", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "CZ", name: "Czech Republic", currency: "CZK", dialCode: "+420",
    entityTypes: [
      { code: "SRO", label: "s.r.o. (Společnost s ručením omezeným)", description: "Private limited" },
      { code: "AS", label: "a.s. (Akciová společnost)", description: "Public limited" },
      { code: "VOS", label: "v.o.s. (Veřejná obchodní společnost)", description: "General partnership" },
      { code: "KOS", label: "k.s. (Komanditní společnost)", description: "Limited partnership" },
      { code: "BRANCH", label: "Odštěpný závod", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "GR", name: "Greece", currency: "EUR", dialCode: "+30",
    entityTypes: [
      { code: "IKE", label: "Ι.Κ.Ε. (Private Capital Company)", description: "Private limited (flexible)" },
      { code: "EE", label: "Ε.Ε. (General Partnership)", description: "General partnership" },
      { code: "EPE", label: "Ε.Π.Ε. (Limited Liability Company)", description: "Legacy LLC (replaced by IKE)" },
      { code: "AE", label: "Α.Ε. (Société Anonyme)", description: "Public limited" },
      { code: "OE", label: "Ο.Ε.", description: "General partnership (older form)" },
      { code: "BRANCH", label: "Υποκατάστημα", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "RO", name: "Romania", currency: "RON", dialCode: "+40",
    entityTypes: [
      { code: "SRL", label: "S.R.L. (Societate cu Răspundere Limitată)", description: "Private limited" },
      { code: "SA", label: "S.A. (Societate pe Acțiuni)", description: "Public limited" },
      { code: "SNC", label: "S.N.C.", description: "General partnership" },
      { code: "SCS", label: "S.C.S.", description: "Limited partnership" },
      { code: "PFA", label: "PFA (Persoană Fizică Autorizată)", description: "Sole proprietor" },
      { code: "BRANCH", label: "Sediu Secundar", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "HU", name: "Hungary", currency: "HUF", dialCode: "+36",
    entityTypes: [
      { code: "KFT", label: "Kft. (Korlátolt felelősségű társaság)", description: "Private limited" },
      { code: "RT", label: "Rt. (Részvénytársaság)", description: "Public limited" },
      { code: "BT", label: "Bt. (Egyéni cég)", description: "Sole proprietor" },
      { code: "KKT", label: "Kkt.", description: "General partnership" },
      { code: "BRANCH", label: "Fióktelek", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "BG", name: "Bulgaria", currency: "BGN", dialCode: "+359",
    entityTypes: [
      { code: "OOD", label: "OOD (Дружество с ограничена отговорност)", description: "Private limited" },
      { code: "AD", label: "AD (Акционерно дружество)", description: "Public limited" },
      { code: "SD", label: "SD (Събирателно дружество)", description: "General partnership" },
      { code: "KOD", label: "KOD", description: "Limited partnership" },
      { code: "ET", label: "ET", description: "Sole proprietor (legacy)" },
      { code: "BRANCH", label: "Клон", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "HR", name: "Croatia", currency: "EUR", dialCode: "+385",
    entityTypes: [
      { code: "DOO", label: "d.o.o. (Društvo s ograničenom odgovornošću)", description: "Private limited" },
      { code: "DD", label: "d.d. (Dioničko društvo)", description: "Public limited" },
      { code: "JD", label: "j.d.o.o.", description: "Simple LLC" },
      { code: "BRANCH", label: "Podružnica", description: "Branch of foreign company" },
    ],
    requiredDocuments: EU_DEFAULT_DOCS,
  },
  {
    code: "RU", name: "Russia", currency: "RUB", dialCode: "+7",
    entityTypes: [
      { code: "OOO", label: "OOO (Общество с ограниченной ответственностью)", description: "Private limited" },
      { code: "PAO", label: "PAO (Публичное АО)", description: "Public limited" },
      { code: "AO", label: "AO (Непубличное АО)", description: "Non-public joint stock" },
      { code: "IP", label: "ИП (Индивидуальный предприниматель)", description: "Sole proprietor" },
      { code: "BRANCH", label: "Филиал", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "UA", name: "Ukraine", currency: "UAH", dialCode: "+380",
    entityTypes: [
      { code: "TOV", label: "ТОВ (Товариство з обмеженою відповідальністю)", description: "Private limited" },
      { code: "PAT", label: "ПАТ (Публічне акціонерне товариство)", description: "Public limited" },
      { code: "PRAT", label: "ПрАТ (Приватне акціонерне товариство)", description: "Private joint stock" },
      { code: "FOP", label: "ФОП (Фізична особа-підприємець)", description: "Sole proprietor" },
      { code: "BRANCH", label: "Філія", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "TR", name: "Turkey", currency: "TRY", dialCode: "+90",
    entityTypes: [
      { code: "LTD", label: "Ltd. Şti. (Limited Şirket)", description: "Private limited" },
      { code: "AS", label: "A.Ş. (Anonim Şirket)", description: "Public limited" },
      { code: "KOM", label: "Koll. Şti.", description: "General partnership" },
      { code: "KOMANDI", label: "Komandi Şti.", description: "Limited partnership" },
      { code: "BRANCH", label: "Şube (Branch)", description: "Branch of foreign company" },
      { code: "SOLE", label: "Şahıs Şirketi", description: "Sole proprietorship" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
];

// ============================================================
// Region: MIDDLE EAST & GULF
// ============================================================
const MIDDLE_EAST: CountryRegistrationData[] = [
  {
    code: "AE", name: "United Arab Emirates", currency: "AED", dialCode: "+971",
    entityTypes: [
      { code: "LLC", label: "LLC (Limited Liability Company)", description: "Mainland LLC — no longer requires 51% local sponsor (post-2021)" },
      { code: "PJSC", label: "Public Joint Stock Company (PJSC)", description: "Public joint stock" },
      { code: "PRJSC", label: "Private Joint Stock Company (PrJSC)", description: "Private joint stock" },
      { code: "FZE", label: "Free Zone Establishment (FZE)", description: "Single shareholder Free Zone entity" },
      { code: "FZCO", label: "Free Zone Company (FZ-LLC / FZCO)", description: "Multi-shareholder Free Zone entity" },
      { code: "BRANCH", label: "Branch of Foreign Company", description: "Mainland or Free Zone branch" },
      { code: "SOLE", label: "Sole Establishment", description: "Individual-owned mainland business" },
      { code: "CIVIL", label: "Civil Company", description: "Professional partnership" },
      { code: "HOLDING", label: "Holding Company", description: "Pure holding structure" },
    ],
    requiredDocuments: [
      { key: "trade_license", label: "Trade License", description: "From DED (mainland) or Free Zone authority", mandatory: true },
      { key: "moa", label: "Memorandum of Association (MoA)", description: "Company formation document", mandatory: true },
      { key: "esi", label: "Establishment Card / E-Signature Card", description: "Immigration/labour establishment card", mandatory: true },
      { key: "tax_id", label: "Tax Registration Number (TRN)", description: "FTA-issued VAT TRN (if registered)", mandatory: false },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Ultimate Beneficial Owner (Corporate Registry)", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "UAE sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From a UAE-licensed bank", mandatory: false },
    ],
  },
  {
    code: "SA", name: "Saudi Arabia", currency: "SAR", dialCode: "+966",
    entityTypes: [
      { code: "LLC", label: "Limited Liability Company (LLC)", description: "Most common for foreign investors" },
      { code: "JSC", label: "Joint Stock Company (JSC)", description: "Public or closed joint stock" },
      { code: "BRANCH", label: "Foreign Company Branch", description: "MISA-licensed branch" },
      { code: "SOLE", label: "Sole Establishment (Mufrad)", description: "Saudi individual-owned" },
      { code: "PARTNERSHIP", label: "General/Limited Partnership", description: "Tadamun / Tawziyah" },
      { code: "FZ", label: "Free Zone Entity (SEZ)", description: "Special Economic Zone entity" },
    ],
    requiredDocuments: [
      { key: "cr", label: "Commercial Registration (CR)", description: "From Ministry of Commerce", mandatory: true },
      { key: "misa", label: "MISA License", description: "Foreign investment license (if applicable)", mandatory: false },
      { key: "vat", label: "VAT Certificate", description: "ZATCA-issued VAT (if registered)", mandatory: false },
      { key: "articles_of_association", label: "Articles of Association", description: "Company bylaws", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Beneficial owner disclosure", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "Saudi sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From SAMA-licensed bank", mandatory: false },
    ],
  },
  {
    code: "QA", name: "Qatar", currency: "QAR", dialCode: "+974",
    entityTypes: [
      { code: "LLC", label: "LLC (WLL — With Limited Liability)", description: "WLL company (Qatari partner 51% for mainland)" },
      { code: "PJSC", label: "Public Shareholding Company", description: "Public joint stock" },
      { code: "FZ", label: "Free Zone Company", description: "QFC / Manuum Free Zone entity" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "Sole Establishment", description: "Individual establishment" },
    ],
    requiredDocuments: [
      { key: "cr", label: "Commercial Registration (CR)", description: "From Ministry of Commerce & Industry", mandatory: true },
      { key: "articles_of_association", label: "Articles of Association", description: "MoA / AoA", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Beneficial owner", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "Qatar sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From QCB-licensed bank", mandatory: false },
    ],
  },
  {
    code: "KW", name: "Kuwait", currency: "KWD", dialCode: "+965",
    entityTypes: [
      { code: "KSCC", label: "K.S.C.C. (Closed Shareholding)", description: "Closed joint stock" },
      { code: "KSC", label: "K.S.C. (Public Shareholding)", description: "Public joint stock" },
      { code: "WLL", label: "WLL (With Limited Liability)", description: "LLC (Kuwaiti partner 51% for mainland)" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "Sole Establishment", description: "Individual establishment" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "BH", name: "Bahrain", currency: "BHD", dialCode: "+973",
    entityTypes: [
      { code: "WLL", label: "W.L.L. (With Limited Liability)", description: "LLC" },
      { code: "BSC", label: "B.S.C. (Bahrain Shareholding Company)", description: "Public joint stock" },
      { code: "BSCC", label: "B.S.C.C. (Closed)", description: "Closed joint stock" },
      { code: "FZ", label: "Free Zone Entity", description: "Bahrain Logistics Zone" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "OM", name: "Oman", currency: "OMR", dialCode: "+968",
    entityTypes: [
      { code: "LLC", label: "LLC (Limited Liability Company)", description: "LLC (30% Omani if mainland; 100% foreign post-2020 reforms in many sectors)" },
      { code: "SAOG", label: "SAOG (Société Anonyme Omani General)", description: "Public joint stock" },
      { code: "SAOC", label: "SAOC (Closed)", description: "Closed joint stock" },
      { code: "FZ", label: "Free Zone Entity", description: "Salalah / Sohar Free Zone" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "JO", name: "Jordan", currency: "JOD", dialCode: "+962",
    entityTypes: [
      { code: "LTD", label: "Limited Liability Company", description: "LLC" },
      { code: "PSC", label: "Private Shareholding Company", description: "Private joint stock" },
      { code: "PUBSC", label: "Public Shareholding Company", description: "Public joint stock" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "LB", name: "Lebanon", currency: "LBP", dialCode: "+961",
    entityTypes: [
      { code: "SARL", label: "SARL", description: "LLC" },
      { code: "SA", label: "Société Anonyme Libanaise", description: "Public limited" },
      { code: "SNC", label: "SNC", description: "General partnership" },
      { code: "BRANCH", label: "Succursale", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "IQ", name: "Iraq", currency: "IQD", dialCode: "+964",
    entityTypes: [
      { code: "LLC", label: "Limited Liability Company", description: "LLC" },
      { code: "JSC", label: "Joint Stock Company", description: "Public joint stock" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "IL", name: "Israel", currency: "ILS", dialCode: "+972",
    entityTypes: [
      { code: "LTD", label: "Ltd. (Private Company)", description: "Private limited" },
      { code: "LTD_PUBLIC", label: "Public Ltd.", description: "Public limited" },
      { code: "LLP", label: "Limited Partnership", description: "LP" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "Self-Employed (Osek Patur / Murshe)", description: "Sole proprietor" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
];

// ============================================================
// Region: ASIA
// ============================================================
const ASIA: CountryRegistrationData[] = [
  {
    code: "CN", name: "China", currency: "CNY", dialCode: "+86",
    entityTypes: [
      { code: "LLC", label: "有限责任公司 (LLC)", description: "Limited liability company" },
      { code: "JSC", label: "股份有限公司 (JSC)", description: "Joint stock company" },
      { code: "FIE", label: "Foreign-Invested Enterprise (FIE)", description: "WFOE / EJV / CJV (post-2020 FIL)" },
      { code: "RO", label: "Representative Office (RO)", description: "Liaison office — no profit activity" },
      { code: "PARTNERSHIP", label: "Partnership (合伙企业)", description: "General or limited partnership" },
      { code: "SOE", label: "State-Owned Enterprise (SOE)", description: "Government-owned" },
      { code: "SOLE", label: "Individual Proprietorship", description: "Sole proprietor" },
    ],
    requiredDocuments: [
      { key: "business_license", label: "Business License (营业执照)", description: "From SAMR", mandatory: true },
      { key: "foreign_cert", label: "Foreign Investment Certificate (FIC)", description: "If FIE — post-2020 reporting", mandatory: false },
      { key: "tax_id", label: "Tax Registration Certificate", description: "Unified Social Credit Code", mandatory: true },
      { key: "articles_of_association", label: "Articles of Association (公司章程)", description: "Company charter", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Beneficial owner", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "MOFCOM compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From PRC-licensed bank", mandatory: false },
    ],
  },
  {
    code: "IN", name: "India", currency: "INR", dialCode: "+91",
    entityTypes: [
      { code: "PVT_LTD", label: "Private Limited Company", description: "Most common for startups" },
      { code: "PUB_LTD", label: "Public Limited Company", description: "Public company" },
      { code: "LLP", label: "Limited Liability Partnership (LLP)", description: "LLP" },
      { code: "OPC", label: "One Person Company (OPC)", description: "Single-member company" },
      { code: "PARTNERSHIP", label: "Partnership Firm", description: "General partnership" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual trader" },
      { code: "BRANCH", label: "Branch / Liaison / Project Office", description: "Foreign company office (RBI approval)" },
      { code: "SEC8", label: "Section 8 Company", description: "Non-profit" },
    ],
    requiredDocuments: [
      { key: "coi", label: "Certificate of Incorporation (CoI)", description: "From MCA", mandatory: true },
      { key: "pan", label: "PAN (Permanent Account Number)", description: "Income Tax PAN", mandatory: true },
      { key: "gst", label: "GST Registration", description: "GSTIN (if applicable)", mandatory: false },
      { key: "din", label: "DIN of Directors", description: "Director Identification Number", mandatory: true },
      { key: "moa_aoa", label: "MoA & AoA", description: "Memorandum & Articles of Association", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Beneficial owner (SBO under Companies Act)", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "Indian sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From RBI-licensed bank", mandatory: false },
    ],
  },
  {
    code: "JP", name: "Japan", currency: "JPY", dialCode: "+81",
    entityTypes: [
      { code: "KABU", label: "株式会社 (Kabushiki Kaisha — K.K.)", description: "Joint stock — most common" },
      { code: "GODO", label: "合同会社 (Godo Kaisha — G.K.)", description: "LLC — popular for SMEs" },
      { code: "GOMEI", label: "合名会社 (Gomei Kaisha)", description: "General partnership" },
      { code: "GOSHI", label: "合資会社 (Goshi Kaisha)", description: "Limited partnership" },
      { code: "BRANCH", label: "Foreign Company Branch (支店)", description: "Branch of foreign company" },
      { code: "SOLE", label: "個人事業 (Sole Proprietor)", description: "Individual business" },
    ],
    requiredDocuments: [
      { key: "commercial_register", label: "Certificate of Registered Matters (登記簿謄本)", description: "From Legal Affairs Bureau", mandatory: true },
      { key: "articles_of_association", label: "Articles of Incorporation (定款)", description: "Company charter (notarized)", mandatory: true },
      { key: "tax_id", label: "Corporate Number (法人番号)", description: "National Tax Agency", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Beneficial owner", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "METI/MOF sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From Japanese bank", mandatory: false },
    ],
  },
  {
    code: "KR", name: "South Korea", currency: "KRW", dialCode: "+82",
    entityTypes: [
      { code: "CHUSIK", label: "주식회사 (Chusik Hoesa)", description: "Joint stock (most common)" },
      { code: "YUHAN", label: "유한회사 (Yuhan Hoesa)", description: "LLC (legacy, less common)" },
      { code: "HAPJA", label: "합자회사 (Hapja Hoesa)", description: "Limited partnership" },
      { code: "HAPMYEONG", label: "합명회사 (Hapmyung Hoesa)", description: "General partnership" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "개인사업자 (Individual Business)", description: "Sole proprietor" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "VN", name: "Vietnam", currency: "VND", dialCode: "+84",
    entityTypes: [
      { code: "LLC", label: "Limited Liability Company (Công ty TNHH)", description: "Single or multi-member LLC" },
      { code: "JSC", label: "Joint Stock Company (Công ty Cổ phần)", description: "Public joint stock" },
      { code: "PARTNERSHIP", label: "Partnership (Công ty Hợp danh)", description: "General or limited partnership" },
      { code: "FIE", label: "Foreign-Invested Enterprise", description: "100% foreign or JV (DPI-licensed)" },
      { code: "BRANCH", label: "Foreign Branch (Chi nhánh)", description: "Branch of foreign company" },
      { code: "RO", label: "Representative Office (Văn phòng đại diện)", description: "Liaison office" },
      { code: "SOLE", label: "Sole Proprietorship (Hộ kinh doanh)", description: "Household business" },
    ],
    requiredDocuments: [
      { key: "erc", label: "Enterprise Registration Certificate (ERC)", description: "From Department of Planning & Investment", mandatory: true },
      { key: "irc", label: "Investment Registration Certificate (IRC)", description: "For FIEs only", mandatory: false },
      { key: "tax_id", label: "Tax Identification Number (MST)", description: "GDT-issued", mandatory: true },
      { key: "articles_of_association", label: "Company Charter (Điều lệ)", description: "AoA", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration", description: "Beneficial owner", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "Vietnamese compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From SBV-licensed bank", mandatory: false },
    ],
  },
  {
    code: "TH", name: "Thailand", currency: "THB", dialCode: "+66",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company (บมจ)", description: "Most common — foreign can own up to 49% (or 100% with FBL)" },
      { code: "PLC", label: "Public Limited Company", description: "Public company" },
      { code: "PARTNERSHIP", label: "Partnership (General / Limited / Registered)", description: "Three partnership forms" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch (requires FBL)" },
      { code: "RO", label: "Representative Office", description: "Liaison office (FBL required)" },
      { code: "BOI", label: "BOI-Promoted Company", description: "100% foreign with BOI promotion" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "SG", name: "Singapore", currency: "SGD", dialCode: "+65",
    entityTypes: [
      { code: "PTE_LTD", label: "Private Limited Company (Pte. Ltd.)", description: "Most common — Exempt Private (≤20 shareholders)" },
      { code: "PLC", label: "Public Limited Company", description: "Public company" },
      { code: "LLP", label: "Limited Liability Partnership (LLP)", description: "LLP" },
      { code: "LP", label: "Limited Partnership (LP)", description: "LP" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual owner" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "VCC", label: "Variable Capital Company (VCC)", description: "Fund vehicle" },
    ],
    requiredDocuments: [
      { key: "biz_profile", label: "Business Profile (BizFile)", description: "From ACRA", mandatory: true },
      { key: "uen", label: "UEN (Unique Entity Number)", description: "ACRA registration number", mandatory: true },
      { key: "constitution", label: "Constitution (formerly MoA&AoA)", description: "Company charter", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration (Register of Registrable Controllers)", description: "ACRA-mandated", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "MAS sanctions compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From MAS-licensed bank", mandatory: false },
    ],
  },
  {
    code: "MY", name: "Malaysia", currency: "MYR", dialCode: "+60",
    entityTypes: [
      { code: "SDN_BHD", label: "Sdn. Bhd. (Sendirian Berhad)", description: "Private limited — most common" },
      { code: "BHD", label: "Bhd. (Berhad)", description: "Public limited" },
      { code: "LLP", label: "LLP", description: "Limited liability partnership" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Enterprise (individual)" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "LABUAN", label: "Labuan Entity", description: "Offshore Labuan company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "ID", name: "Indonesia", currency: "IDR", dialCode: "+62",
    entityTypes: [
      { code: "PT", label: "PT (Perseroan Terbatas)", description: "Private limited — local PT" },
      { code: "PT_PMA", label: "PT PMA (Penanaman Modal Asing)", description: "Foreign-owned LLC (BKPM-approved)" },
      { code: "PUB_PERSERO", label: "PT Persero (BUMN)", description: "State-owned enterprise" },
      { code: "CV", label: "CV (Commanditaire Vennootschap)", description: "Limited partnership (legacy)" },
      { code: "BRANCH", label: "Foreign Branch (Kantor Cabang)", description: "Branch of foreign company" },
      { code: "RO", label: "Representative Office (KPPA)", description: "Liaison office" },
      { code: "SOLE", label: "UD (Usaha Dagang)", description: "Sole proprietorship" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "PH", name: "Philippines", currency: "PHP", dialCode: "+63",
    entityTypes: [
      { code: "CORP", label: "Domestic Corporation", description: "Stock corporation" },
      { code: "OPC", label: "One Person Corporation (OPC)", description: "Single shareholder" },
      { code: "PARTNERSHIP", label: "Partnership", description: "General or limited" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company (SEC)" },
      { code: "RO", label: "Representative Office", description: "Liaison office" },
      { code: "SOLE", label: "Sole Proprietorship (DTI-registered)", description: "Individual trader" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "HK", name: "Hong Kong", currency: "HKD", dialCode: "+852",
    entityTypes: [
      { code: "LTD", label: "Private Limited Company", description: "Most common — Companies Registry" },
      { code: "PUBLIC_LTD", label: "Public Limited Company", description: "Public company" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual business" },
      { code: "PARTNERSHIP", label: "Partnership", description: "General partnership" },
      { code: "BRANCH", label: "Registered Non-Hong Kong Company", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "TW", name: "Taiwan", currency: "TWD", dialCode: "+886",
    entityTypes: [
      { code: "LTD", label: "Limited Company (有限公司)", description: "Private limited" },
      { code: "CORP", label: "Company Limited by Shares (股份有限公司)", description: "Public joint stock" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "RO", label: "Representative Office", description: "Liaison office" },
      { code: "SOLE", label: "Sole Proprietorship (行號)", description: "Individual business" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "PK", name: "Pakistan", currency: "PKR", dialCode: "+92",
    entityTypes: [
      { code: "PVT_LTD", label: "Private Limited Company (Pvt.)", description: "Private limited (SECP)" },
      { code: "PUB_LTD", label: "Public Limited Company (Ltd.)", description: "Public limited" },
      { code: "SOLE", label: "Sole Proprietorship", description: "AOP / individual" },
      { code: "PARTNERSHIP", label: "Partnership (AOP)", description: "Association of Persons" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company (BOI approval)" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "BD", name: "Bangladesh", currency: "BDT", dialCode: "+880",
    entityTypes: [
      { code: "PVT_LTD", label: "Private Limited Company", description: "Private limited (RJSC)" },
      { code: "PUB_LTD", label: "Public Limited Company", description: "Public limited" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch (BIDA approval)" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual" },
      { code: "PARTNERSHIP", label: "Partnership", description: "General partnership" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "LK", name: "Sri Lanka", currency: "LKR", dialCode: "+94",
    entityTypes: [
      { code: "LTD", label: "Private Limited (Ltd.)", description: "Private limited" },
      { code: "PLC", label: "Public Limited (Plc)", description: "Public limited" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch (BOI approval)" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "KZ", name: "Kazakhstan", currency: "KZT", dialCode: "+7",
    entityTypes: [
      { code: "TOO", label: "ТОО (Limited Liability Partnership)", description: "LLC — most common" },
      { code: "AO", label: "АО (Joint Stock Company)", description: "Public joint stock" },
      { code: "GP", label: "ТЖ (Individual Entrepreneur)", description: "Sole proprietor" },
      { code: "BRANCH", label: "Филиал", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "UZ", name: "Uzbekistan", currency: "UZS", dialCode: "+998",
    entityTypes: [
      { code: "MCHJ", label: "MChJ (Mas'uliyati Cheklangan Jamiyat)", description: "LLC" },
      { code: "AJ", label: "AJ (Aksiyadorlik Jamiyati)", description: "Joint stock" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
];

// ============================================================
// Region: AMERICAS
// ============================================================
const AMERICAS: CountryRegistrationData[] = [
  {
    code: "US", name: "United States", currency: "USD", dialCode: "+1",
    entityTypes: [
      { code: "LLC", label: "LLC (Limited Liability Company)", description: "Most common for SMEs — pass-through tax" },
      { code: "C_CORP", label: "C-Corporation", description: "Public-style corporation (Delaware common)" },
      { code: "S_CORP", label: "S-Corporation", description: "Pass-through corp (≤100 US shareholders)" },
      { code: "PARTNERSHIP", label: "Partnership (LP / LLP / LLLP)", description: "General / Limited / Limited Liability LP" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual DBA" },
      { code: "NONPROFIT", label: "Nonprofit (501c3)", description: "Tax-exempt" },
      { code: "BRANCH", label: "Foreign Corporation Branch", description: "Foreign entity registered in state" },
    ],
    requiredDocuments: [
      { key: "formation_cert", label: "Certificate of Formation / Incorporation", description: "From Secretary of State", mandatory: true },
      { key: "ein", label: "EIN (Employer Identification Number)", description: "IRS-issued", mandatory: true },
      { key: "ubo_declaration", label: "UBO Declaration (FinCEN BOI Report)", description: "Beneficial Ownership Information (FinCEN)", mandatory: true },
      { key: "operating_agreement", label: "Operating Agreement / Bylaws", description: "Internal governance document", mandatory: true },
      { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "OFAC compliance", mandatory: true },
      { key: "bank_reference", label: "Bank Reference Letter", description: "From US bank", mandatory: false },
    ],
  },
  {
    code: "CA", name: "Canada", currency: "CAD", dialCode: "+1",
    entityTypes: [
      { code: "CORP", label: "Corporation (Federal or Provincial)", description: "Most common — federal or provincial" },
      { code: "LLP", label: "Limited Liability Partnership (LLP)", description: "LLP (varies by province)" },
      { code: "LP", label: "Limited Partnership (LP)", description: "LP" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual" },
      { code: "COOP", label: "Co-operative (Co-op)", description: "Member-owned" },
      { code: "BRANCH", label: "Extra-Provincial Registration", description: "Foreign company registered in province" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "MX", name: "Mexico", currency: "MXN", dialCode: "+52",
    entityTypes: [
      { code: "SAPI", label: "S.A.P.I. de C.V.", description: "Simplified joint stock — startup-friendly" },
      { code: "SA", label: "S.A. de C.V.", description: "Stock company (variable capital)" },
      { code: "SRL", label: "S. de R.L. de C.V.", description: "LLC (variable capital)" },
      { code: "SNC", label: "S. en N.C.", description: "General partnership" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
      { code: "SOLE", label: "Persona Física con Actividad Empresarial", description: "Sole proprietor" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "BR", name: "Brazil", currency: "BRL", dialCode: "+55",
    entityTypes: [
      { code: "LTDA", label: "Ltda. (Sociedade Limitada)", description: "LLC — most common" },
      { code: "SA", label: "S.A. (Sociedade Anônima)", description: "Joint stock" },
      { code: "EIRELI", label: "EIRELI", description: "Single-member LLC (being phased into SLU)" },
      { code: "SLU", label: "SLU (Sociedade Limitada Unipessoal)", description: "Single-member LLC" },
      { code: "MEI", label: "MEI (Microempreendedor Individual)", description: "Sole micro-entrepreneur" },
      { code: "BRANCH", label: "Sucursal (Foreign Branch)", description: "Branch of foreign company (federal approval)" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "AR", name: "Argentina", currency: "ARS", dialCode: "+54",
    entityTypes: [
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "SA", label: "S.A.", description: "Joint stock" },
      { code: "SAS", label: "S.A.S.", description: "Simplified joint stock (new)" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
      { code: "SOLE", label: "Sole Proprietor (Monotributo)", description: "Individual" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "CL", name: "Chile", currency: "CLP", dialCode: "+56",
    entityTypes: [
      { code: "LTDA", label: "Sociedad de Responsabilidad Limitada (Ltda.)", description: "LLC" },
      { code: "SA", label: "Sociedad Anónima (S.A.)", description: "Joint stock (open or closed)" },
      { code: "EIRL", label: "EIRL (Empresa Individual de Responsabilidad Limitada)", description: "Single-member" },
      { code: "BRANCH", label: "Agencia (Foreign Branch)", description: "Branch of foreign company" },
      { code: "SPA", label: "Sociedad por Acciones (SpA)", description: "Partnership by shares" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "CO", name: "Colombia", currency: "COP", dialCode: "+57",
    entityTypes: [
      { code: "SAS", label: "S.A.S. (Sociedad por Acciones Simplificada)", description: "Simplified joint stock — most common" },
      { code: "SA", label: "S.A.", description: "Public joint stock" },
      { code: "LTDA", label: "Ltda.", description: "LLC" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "PE", name: "Peru", currency: "PEN", dialCode: "+51",
    entityTypes: [
      { code: "SAC", label: "S.A.C. (Cerrada)", description: "Closed joint stock" },
      { code: "SA", label: "S.A.", description: "Public joint stock" },
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "EIRL", label: "E.I.R.L.", description: "Single-member" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "VE", name: "Venezuela", currency: "VES", dialCode: "+58",
    entityTypes: [
      { code: "CA", label: "C.A. (Compañía Anónima)", description: "Joint stock" },
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "EC", name: "Ecuador", currency: "USD", dialCode: "+593",
    entityTypes: [
      { code: "SA", label: "S.A.", description: "Joint stock" },
      { code: "LTDA", label: "Cia. Ltda.", description: "LLC" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "UY", name: "Uruguay", currency: "UYU", dialCode: "+598",
    entityTypes: [
      { code: "SA", label: "S.A.", description: "Joint stock" },
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "SAFIS", label: "SAFI (Free Zone)", description: "Offshore-style free zone entity" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "PY", name: "Paraguay", currency: "PYG", dialCode: "+595",
    entityTypes: [
      { code: "SA", label: "S.A.", description: "Joint stock" },
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "BO", name: "Bolivia", currency: "BOB", dialCode: "+591",
    entityTypes: [
      { code: "SA", label: "S.A.", description: "Joint stock" },
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "CR", name: "Costa Rica", currency: "CRC", dialCode: "+506",
    entityTypes: [
      { code: "SA", label: "Sociedad Anónima (S.A.)", description: "Joint stock — most common" },
      { code: "SRL", label: "S.R.L. (Sociedad de Responsabilidad Limitada)", description: "LLC" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "PA", name: "Panama", currency: "PAB", dialCode: "+507",
    entityTypes: [
      { code: "SA", label: "Sociedad Anónima", description: "Joint stock (offshore-friendly)" },
      { code: "LLC", label: "S.R.L. (Limited Liability)", description: "LLC" },
      { code: "BRANCH", label: "Sucursal (Foreign Branch)", description: "Branch of foreign company" },
      { code: "FZ", label: "Free Zone Company", description: "Colón Free Zone entity" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "DO", name: "Dominican Republic", currency: "DOP", dialCode: "+1",
    entityTypes: [
      { code: "SA", label: "S.A.", description: "Joint stock" },
      { code: "SRL", label: "S.R.L.", description: "LLC" },
      { code: "EIRL", label: "EIRL", description: "Single-member" },
      { code: "BRANCH", label: "Sucursal", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
];

// ============================================================
// Region: OCEANIA
// ============================================================
const OCEANIA: CountryRegistrationData[] = [
  {
    code: "AU", name: "Australia", currency: "AUD", dialCode: "+61",
    entityTypes: [
      { code: "PTY_LTD", label: "Pty Ltd (Proprietary Limited)", description: "Private limited — most common" },
      { code: "LTD", label: "Ltd (Public Limited)", description: "Public company (unlisted)" },
      { code: "PLC", label: "Listed Public Company", description: "ASX-listed" },
      { code: "PARTNERSHIP", label: "Partnership (LP / LLP)", description: "Partnership" },
      { code: "SOLE", label: "Sole Trader", description: "Individual" },
      { code: "TRUST", label: "Trust (Discretionary / Unit)", description: "Trust structure" },
      { code: "BRANCH", label: "Foreign Company Branch (ARBN)", description: "ASIC-registered foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "NZ", name: "New Zealand", currency: "NZD", dialCode: "+64",
    entityTypes: [
      { code: "LTD", label: "Limited Liability Company (Ltd)", description: "Private limited — most common" },
      { code: "CO", label: "Co-operative Company", description: "Co-operative" },
      { code: "SOLE", label: "Sole Trader", description: "Individual" },
      { code: "PARTNERSHIP", label: "Partnership", description: "General or LP/LLP" },
      { code: "BRANCH", label: "Overseas Company Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "FJ", name: "Fiji", currency: "FJD", dialCode: "+679",
    entityTypes: [
      { code: "LTD", label: "Limited Liability Company (Ltd)", description: "Private limited" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
      { code: "SOLE", label: "Sole Proprietorship", description: "Individual" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
  {
    code: "PG", name: "Papua New Guinea", currency: "PGK", dialCode: "+675",
    entityTypes: [
      { code: "LTD", label: "Limited Liability Company (Ltd)", description: "Private limited" },
      { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
    ],
    requiredDocuments: DEFAULT_DOCS,
  },
];

// ============================================================
// Region: Other (remaining countries — use defaults)
// ============================================================
const COUNTRY_NAMES: Record<string, { name: string; currency: string; dialCode: string }> = {
  // Already-defined countries (won't be duplicated — handled below)
  EG: { name: "Egypt", currency: "EGP", dialCode: "+20" },
  // Other African
  BW: { name: "Botswana", currency: "BWP", dialCode: "+267" },
  BF: { name: "Burkina Faso", currency: "XOF", dialCode: "+226" },
  BI: { name: "Burundi", currency: "BIF", dialCode: "+257" },
  CV: { name: "Cabo Verde", currency: "CVE", dialCode: "+238" },
  CF: { name: "Central African Republic", currency: "XAF", dialCode: "+236" },
  TD: { name: "Chad", currency: "XAF", dialCode: "+235" },
  KM: { name: "Comoros", currency: "KMF", dialCode: "+269" },
  CG: { name: "Congo", currency: "XAF", dialCode: "+242" },
  CD: { name: "Congo (DRC)", currency: "CDF", dialCode: "+243" },
  DJ: { name: "Djibouti", currency: "DJF", dialCode: "+253" },
  DM: { name: "Dominica", currency: "XCD", dialCode: "+1" },
  GQ: { name: "Equatorial Guinea", currency: "XAF", dialCode: "+240" },
  ER: { name: "Eritrea", currency: "ERN", dialCode: "+291" },
  SZ: { name: "Eswatini", currency: "SZL", dialCode: "+268" },
  ET: { name: "Ethiopia", currency: "ETB", dialCode: "+251" },
  FJ: { name: "Fiji", currency: "FJD", dialCode: "+679" },
  GA: { name: "Gabon", currency: "XAF", dialCode: "+241" },
  GM: { name: "Gambia", currency: "GMD", dialCode: "+220" },
  GE: { name: "Georgia", currency: "GEL", dialCode: "+995" },
  GH: { name: "Ghana", currency: "GHS", dialCode: "+233" },
  GD: { name: "Grenada", currency: "XCD", dialCode: "+1" },
  GN: { name: "Guinea", currency: "GNF", dialCode: "+224" },
  GW: { name: "Guinea-Bissau", currency: "XOF", dialCode: "+245" },
  GY: { name: "Guyana", currency: "GYD", dialCode: "+592" },
  HT: { name: "Haiti", currency: "HTG", dialCode: "+509" },
  HN: { name: "Honduras", currency: "HNL", dialCode: "+504" },
  IS: { name: "Iceland", currency: "ISK", dialCode: "+354" },
  IR: { name: "Iran", currency: "IRR", dialCode: "+98" },
  JM: { name: "Jamaica", currency: "JMD", dialCode: "+1" },
  KI: { name: "Kiribati", currency: "AUD", dialCode: "+686" },
  KP: { name: "North Korea", currency: "KPW", dialCode: "+850" },
  KG: { name: "Kyrgyzstan", currency: "KGS", dialCode: "+996" },
  LA: { name: "Laos", currency: "LAK", dialCode: "+856" },
  LS: { name: "Lesotho", currency: "LSL", dialCode: "+266" },
  LR: { name: "Liberia", currency: "LRD", dialCode: "+231" },
  LI: { name: "Liechtenstein", currency: "CHF", dialCode: "+423" },
  LU: { name: "Luxembourg", currency: "EUR", dialCode: "+352" },
  MG: { name: "Madagascar", currency: "MGA", dialCode: "+261" },
  MW: { name: "Malawi", currency: "MWK", dialCode: "+265" },
  MV: { name: "Maldives", currency: "MVR", dialCode: "+960" },
  ML: { name: "Mali", currency: "XOF", dialCode: "+223" },
  MT: { name: "Malta", currency: "EUR", dialCode: "+356" },
  MH: { name: "Marshall Islands", currency: "USD", dialCode: "+692" },
  MR: { name: "Mauritania", currency: "MRU", dialCode: "+222" },
  MU: { name: "Mauritius", currency: "MUR", dialCode: "+230" },
  FM: { name: "Micronesia", currency: "USD", dialCode: "+691" },
  MD: { name: "Moldova", currency: "MDL", dialCode: "+373" },
  MC: { name: "Monaco", currency: "EUR", dialCode: "+377" },
  MN: { name: "Mongolia", currency: "MNT", dialCode: "+976" },
  ME: { name: "Montenegro", currency: "EUR", dialCode: "+382" },
  MZ: { name: "Mozambique", currency: "MZN", dialCode: "+258" },
  MM: { name: "Myanmar", currency: "MMK", dialCode: "+95" },
  NA: { name: "Namibia", currency: "NAD", dialCode: "+264" },
  NR: { name: "Nauru", currency: "AUD", dialCode: "+674" },
  NP: { name: "Nepal", currency: "NPR", dialCode: "+977" },
  NI: { name: "Nicaragua", currency: "NIO", dialCode: "+505" },
  NE: { name: "Niger", currency: "XOF", dialCode: "+227" },
  MK: { name: "North Macedonia", currency: "MKD", dialCode: "+389" },
  PW: { name: "Palau", currency: "USD", dialCode: "+680" },
  PS: { name: "Palestine", currency: "ILS", dialCode: "+970" },
  PY: { name: "Paraguay", currency: "PYG", dialCode: "+595" },
  RW: { name: "Rwanda", currency: "RWF", dialCode: "+250" },
  KN: { name: "Saint Kitts and Nevis", currency: "XCD", dialCode: "+1" },
  LC: { name: "Saint Lucia", currency: "XCD", dialCode: "+1" },
  VC: { name: "Saint Vincent and the Grenadines", currency: "XCD", dialCode: "+1" },
  WS: { name: "Samoa", currency: "WST", dialCode: "+685" },
  SM: { name: "San Marino", currency: "EUR", dialCode: "+378" },
  ST: { name: "São Tomé and Príncipe", currency: "STN", dialCode: "+239" },
  SC: { name: "Seychelles", currency: "SCR", dialCode: "+248" },
  SL: { name: "Sierra Leone", currency: "SLL", dialCode: "+232" },
  SB: { name: "Solomon Islands", currency: "SBD", dialCode: "+677" },
  SO: { name: "Somalia", currency: "SOS", dialCode: "+252" },
  SS: { name: "South Sudan", currency: "SSP", dialCode: "+211" },
  LK: { name: "Sri Lanka", currency: "LKR", dialCode: "+94" },
  SR: { name: "Suriname", currency: "SRD", dialCode: "+597" },
  SY: { name: "Syria", currency: "SYP", dialCode: "+963" },
  TJ: { name: "Tajikistan", currency: "TJS", dialCode: "+992" },
  TZ: { name: "Tanzania", currency: "TZS", dialCode: "+255" },
  TL: { name: "Timor-Leste", currency: "USD", dialCode: "+670" },
  TG: { name: "Togo", currency: "XOF", dialCode: "+228" },
  TO: { name: "Tonga", currency: "TOP", dialCode: "+676" },
  TT: { name: "Trinidad and Tobago", currency: "TTD", dialCode: "+1" },
  TM: { name: "Turkmenistan", currency: "TMT", dialCode: "+993" },
  TV: { name: "Tuvalu", currency: "AUD", dialCode: "+688" },
  UG: { name: "Uganda", currency: "UGX", dialCode: "+256" },
  VU: { name: "Vanuatu", currency: "VUV", dialCode: "+678" },
  VA: { name: "Vatican City", currency: "EUR", dialCode: "+379" },
  VE: { name: "Venezuela", currency: "VES", dialCode: "+58" },
  YE: { name: "Yemen", currency: "YER", dialCode: "+967" },
  ZM: { name: "Zambia", currency: "ZMW", dialCode: "+260" },
  ZW: { name: "Zimbabwe", currency: "ZWL", dialCode: "+263" },
  BS: { name: "Bahamas", currency: "BSD", dialCode: "+1" },
  BH: { name: "Bahrain", currency: "BHD", dialCode: "+973" },
  BZ: { name: "Belize", currency: "BZD", dialCode: "+501" },
  BJ: { name: "Benin", currency: "XOF", dialCode: "+229" },
  BT: { name: "Bhutan", currency: "BTN", dialCode: "+975" },
  BO: { name: "Bolivia", currency: "BOB", dialCode: "+591" },
  BA: { name: "Bosnia and Herzegovina", currency: "BAM", dialCode: "+387" },
  BN: { name: "Brunei", currency: "BND", dialCode: "+673" },
  KH: { name: "Cambodia", currency: "KHR", dialCode: "+855" },
  AD: { name: "Andorra", currency: "EUR", dialCode: "+376" },
  AF: { name: "Afghanistan", currency: "AFN", dialCode: "+93" },
  AL: { name: "Albania", currency: "ALL", dialCode: "+355" },
  AM: { name: "Armenia", currency: "AMD", dialCode: "+374" },
  AW: { name: "Aruba", currency: "AWG", dialCode: "+297" },
  AZ: { name: "Azerbaijan", currency: "AZN", dialCode: "+994" },
  BB: { name: "Barbados", currency: "BBD", dialCode: "+1" },
  BY: { name: "Belarus", currency: "BYN", dialCode: "+375" },
  BM: { name: "Bermuda", currency: "BMD", dialCode: "+1" },
  KY: { name: "Cayman Islands", currency: "KYD", dialCode: "+1" },
  CX: { name: "Christmas Island", currency: "AUD", dialCode: "+61" },
  CC: { name: "Cocos (Keeling) Islands", currency: "AUD", dialCode: "+61" },
  CK: { name: "Cook Islands", currency: "NZD", dialCode: "+682" },
  CU: { name: "Cuba", currency: "CUP", dialCode: "+53" },
  CY: { name: "Cyprus", currency: "EUR", dialCode: "+357" },
  EE: { name: "Estonia", currency: "EUR", dialCode: "+372" },
  FO: { name: "Faroe Islands", currency: "DKK", dialCode: "+298" },
  GF: { name: "French Guiana", currency: "EUR", dialCode: "+594" },
  PF: { name: "French Polynesia", currency: "XPF", dialCode: "+689" },
  GL: { name: "Greenland", currency: "DKK", dialCode: "+299" },
  GU: { name: "Guam", currency: "USD", dialCode: "+1" },
  GG: { name: "Guernsey", currency: "GBP", dialCode: "+44" },
  IM: { name: "Isle of Man", currency: "GBP", dialCode: "+44" },
  JE: { name: "Jersey", currency: "GBP", dialCode: "+44" },
  LV: { name: "Latvia", currency: "EUR", dialCode: "+371" },
  LT: { name: "Lithuania", currency: "EUR", dialCode: "+370" },
  MO: { name: "Macao", currency: "MOP", dialCode: "+853" },
  MS: { name: "Montserrat", currency: "XCD", dialCode: "+1" },
  NC: { name: "New Caledonia", currency: "XPF", dialCode: "+687" },
  NF: { name: "Norfolk Island", currency: "AUD", dialCode: "+672" },
  MP: { name: "Northern Mariana Islands", currency: "USD", dialCode: "+1" },
  PR: { name: "Puerto Rico", currency: "USD", dialCode: "+1" },
  RE: { name: "Réunion", currency: "EUR", dialCode: "+262" },
  BL: { name: "Saint Barthélemy", currency: "EUR", dialCode: "+590" },
  SH: { name: "Saint Helena", currency: "SHP", dialCode: "+290" },
  MF: { name: "Saint Martin (French)", currency: "EUR", dialCode: "+590" },
  PM: { name: "Saint Pierre and Miquelon", currency: "EUR", dialCode: "+508" },
  SX: { name: "Sint Maarten (Dutch)", currency: "ANG", dialCode: "+1" },
  GS: { name: "South Georgia", currency: "GBP", dialCode: "+500" },
  TK: { name: "Tokelau", currency: "NZD", dialCode: "+690" },
  TC: { name: "Turks and Caicos Islands", currency: "USD", dialCode: "+1" },
  VI: { name: "U.S. Virgin Islands", currency: "USD", dialCode: "+1" },
  WF: { name: "Wallis and Futuna", currency: "XPF", dialCode: "+681" },
  EH: { name: "Western Sahara", currency: "MAD", dialCode: "+212" },
  XK: { name: "Kosovo", currency: "EUR", dialCode: "+383" },
  RS: { name: "Serbia", currency: "RSD", dialCode: "+381" },
  SI: { name: "Slovenia", currency: "EUR", dialCode: "+386" },
  SK: { name: "Slovakia", currency: "EUR", dialCode: "+421" },
  SV: { name: "El Salvador", currency: "USD", dialCode: "+503" },
  GT: { name: "Guatemala", currency: "GTQ", dialCode: "+502" },
};

// Default entities for non-explicit countries (sensible international default)
const DEFAULT_ENTITIES: CountryEntityType[] = [
  { code: "LLC", label: "Limited Liability Company (LLC)", description: "Standard LLC" },
  { code: "JSC", label: "Joint Stock Company (JSC)", description: "Share-based public company" },
  { code: "BRANCH", label: "Foreign Branch", description: "Branch of foreign company" },
  { code: "PARTNERSHIP", label: "Partnership", description: "General or limited partnership" },
  { code: "SOLE", label: "Sole Proprietorship", description: "Individual trader" },
];

// ============================================================
// Build full registry — explicit countries first, then defaults for the rest
// ============================================================
const EXPLICIT_BY_CODE: Record<string, CountryRegistrationData> = {};
const ALL_REGIONS: CountryRegistrationData[] = [
  ...AFRICA, ...EUROPE, ...MIDDLE_EAST, ...ASIA, ...AMERICAS, ...OCEANIA,
];
for (const c of ALL_REGIONS) EXPLICIT_BY_CODE[c.code] = c;

// Add remaining countries (those only in COUNTRY_NAMES) using defaults
const REMAINING: CountryRegistrationData[] = Object.entries(COUNTRY_NAMES)
  .filter(([code]) => !EXPLICIT_BY_CODE[code])
  .map(([code, v]) => ({
    code,
    name: v.name,
    currency: v.currency,
    dialCode: v.dialCode,
    flag: flagEmoji(code),
    entityTypes: DEFAULT_ENTITIES,
    requiredDocuments: DEFAULT_DOCS,
  }));

export const COUNTRY_REGISTRATION_DATA: CountryRegistrationData[] = [
  ...ALL_REGIONS,
  ...REMAINING,
].map((c) => ({
  ...c,
  // FIX-AUTH-COUNTRIES-KYC / Fix 6 — ensure every entry has a flag.
  // Source literals may omit `flag`; we derive it from the ISO alpha-2 code.
  flag: c.flag ?? flagEmoji(c.code),
}));

// ============================================================
// Public API
// ============================================================
export function getCountryData(code: string): CountryRegistrationData | undefined {
  return COUNTRY_REGISTRATION_DATA.find((c) => c.code === code.toUpperCase());
}
export function getCountryEntityTypes(code: string): CountryEntityType[] {
  return getCountryData(code)?.entityTypes ?? DEFAULT_ENTITIES;
}
export function getCountryRequiredDocuments(code: string): CountryRequiredDocument[] {
  return getCountryData(code)?.requiredDocuments ?? DEFAULT_DOCS;
}
export function getCountryCurrency(code: string): string {
  return getCountryData(code)?.currency ?? "USD";
}
export function getCountryDialCode(code: string): string {
  return getCountryData(code)?.dialCode ?? "+1";
}
export function getCountryName(code: string): string {
  return getCountryData(code)?.name ?? code;
}
/**
 * Returns the emoji flag for an ISO alpha-2 country code, using the cached
 * country data where possible (falls back to the pure {@link flagEmoji}
 * computation for codes not in the registry).
 *
 * @param code - 2-letter ISO code.
 * @returns emoji flag, or "" if the code is invalid.
 */
export function getCountryFlag(code: string): string {
  return getCountryData(code)?.flag ?? flagEmoji(code);
}
export const ALL_COUNTRY_CODES: { code: string; name: string; flag: string }[] = COUNTRY_REGISTRATION_DATA.map(
  (c) => ({ code: c.code, name: c.name, flag: c.flag ?? "" }),
).sort((a, b) => a.name.localeCompare(b.name));

// Number of countries with explicit (non-default) entity types
export const EXPLICIT_COUNTRY_COUNT = ALL_REGIONS.length;
// Total number of countries supported
export const TOTAL_COUNTRY_COUNT = COUNTRY_REGISTRATION_DATA.length;
