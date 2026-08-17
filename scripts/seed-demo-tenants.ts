/**
 * SEED-DEMO-TENANTS
 * -----------------
 * Seeds the SGTX demo tenants into the Turso remote database so the portal
 * demo logins (trader-buyer, trader-seller, lsp, ship, lab, qc, cbr, bank,
 * pfi, gov, admin, marketplace-partner) resolve to a real Tenant row instead
 * of `tenant: null`.
 *
 * The demo GTIDs and human-readable names come from
 * `src/components/sgtx/AuthGateway.tsx` (PORTAL_DEFAULT_TENANT + DEMO_PORTALS).
 *
 * Properties:
 *  - Idempotent: uses `INSERT OR REPLACE` with deterministic primary keys
 *    (e.g. `seed-tenant-<gtid>`, `seed-trade-<ustn>`). Re-running produces
 *    the same end-state. NOTE: `INSERT OR REPLACE` on a parent triggers
 *    ON DELETE CASCADE on its children — so children are always re-inserted
 *    AFTER their parent within the same script run, leaving a consistent
 *    final state.
 *  - Defensive: every statement is wrapped in its own try/catch — a single
 *    insert failure is logged and skipped, never aborts the whole seed.
 *  - Parameterized: all values bound as args — no string interpolation of
 *    user-supplied data.
 *  - Direct libsql: uses `@libsql/client` (NOT Prisma) — proven to work with
 *    this Turso DB (see scripts/migrate-sqlite-to-turso.ts).
 *
 * Usage:
 *   cd /home/z/my-project && bun run scripts/seed-demo-tenants.ts
 */

import { createClient, type Client } from "@libsql/client";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// .env loader (minimal — matches migrate-sqlite-to-turso.ts convention)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

// IMPORTANT: the shell environment may export a STALE DATABASE_URL pointing at
// the local SQLite file (db/custom.db) — e.g. from a prior `export
// DATABASE_URL=file:...`. The guard above (`if (!process.env[k])`) would then
// keep the stale shell value and skip the Turso URL defined in .env. For a
// seed that MUST target the Turso remote DB declared in .env, we force
// DATABASE_URL to come from the .env file(s), overriding any shell value.
// Resolution order (Next.js convention): .env.local → .env.
function forceDatabaseUrlFromDotenv(): string {
  const candidates = [".env.local", ".env"];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf-8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (!line.startsWith("DATABASE_URL=")) continue;
      const val = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
      if (val) {
        process.env.DATABASE_URL = val;
        return val;
      }
    }
  }
  return process.env.DATABASE_URL || "";
}

const DATABASE_URL = forceDatabaseUrlFromDotenv();
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set. Check .env");
  process.exit(1);
}
// Safety net: refuse to seed a non-remote (file:) URL — the whole point of this
// task is to populate the Turso remote DB. A file: URL here means .env is
// misconfigured or the override above failed.
if (/^file:/i.test(DATABASE_URL)) {
  console.error(
    `✗ DATABASE_URL resolves to a LOCAL file (${DATABASE_URL}).\n` +
    `  This seed must target Turso (libsql://...). Aborting to avoid writing\n` +
    `  demo data into the wrong database. Check .env for DATABASE_URL.`
  );
  process.exit(1);
}

function extractAuthToken(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("authToken") ?? undefined;
  } catch {
    return undefined;
  }
}

function safeHost(url: string): string {
  // `libsql:` is a non-special URL scheme, so new URL(url).host returns "".
  // Manually extract the authority between "://" and the next "/" or "?".
  const m = url.match(/^[a-z]+:\/\/([^/?]+)/i);
  return m ? m[1] : "(unknown)";
}

const client: Client = createClient({
  url: DATABASE_URL,
  authToken: extractAuthToken(DATABASE_URL),
});

// ---------------------------------------------------------------------------
// Deterministic id generator (so re-runs hit the same PK → REPLACE not INSERT)
// ---------------------------------------------------------------------------
function seedId(kind: string, key: string): string {
  // CUID-compatible-ish: 24-char lowercase alnum, deterministic from kind+key.
  const slug = (kind + "-" + key).toLowerCase().replace(/[^a-z0-9]/g, "");
  const hash = slug.padEnd(24, "0").slice(0, 24);
  return `seed${hash}`;
}

// ---------------------------------------------------------------------------
// Counters for the final report
// ---------------------------------------------------------------------------
const stats = {
  tenants: { ok: 0, ignored: 0, fail: 0 },
  employees: { ok: 0, ignored: 0, fail: 0 },
  trades: { ok: 0, ignored: 0, fail: 0 },
  shipments: { ok: 0, ignored: 0, fail: 0 },
  invoices: { ok: 0, ignored: 0, fail: 0 },
  inboxItems: { ok: 0, ignored: 0, fail: 0 },
  activities: { ok: 0, ignored: 0, fail: 0 },
};

async function run(label: string, bucket: keyof typeof stats, sql: string, args: unknown[] = []): Promise<boolean> {
  try {
    const r = await client.execute({ sql, args });
    // INSERT OR IGNORE returns rowsAffected=0 when the row was ignored
    // (conflict on PK/UNIQUE). Count those separately so the report
    // distinguishes "actually inserted" from "skipped (already existed)".
    if (r.rowsAffected > 0) {
      stats[bucket].ok++;
      return true;
    } else {
      stats[bucket].ignored++;
      return false;
    }
  } catch (err: any) {
    stats[bucket].fail++;
    console.warn(`  ⚠ ${label}: ${err?.message || err}`);
    return false;
  }
}

// ===========================================================================
// 1. DEMO TENANTS
//    Source of truth: src/components/sgtx/AuthGateway.tsx
//    (PORTAL_DEFAULT_TENANT + DEMO_PORTALS arrays)
// ===========================================================================
type Tenant = {
  gtid: string;
  legalName: string;
  type: string;        // TRD/LSP/SHIP/LAB/QC/CBR/BANK/PFI/GOV/ADM/MKT
  country: string;
  city: string;
  sector: string;
  traderMode?: string;
  kybTier: number;
  trustScore: number;
  trustConfidence?: number;
  kybStatus?: string;
  pepStatus?: string;
  lifecycleState: string;
  defiAllowed?: boolean;
  logoColor: string;
  bankName?: string;
  bankSwift?: string;
  bankCity?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  bankCurrency?: string;
  bankIbanFormat?: string;
  globalNotes?: string;
};

const TENANTS: Tenant[] = [
  {
    gtid: "SGTX-DE-TRD-001234-5B6C",
    legalName: "European Importer GmbH",
    type: "TRD", country: "DE", city: "Hamburg", sector: "Food Import & Distribution",
    traderMode: "BUY", kybTier: 2, trustScore: 88, trustConfidence: 0.82,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#1a6fb0",
    bankName: "Deutsche Handelsbank", bankSwift: "DEUTDEHH", bankCity: "Hamburg",
    bankAccountName: "European Importer GmbH", bankAccountNo: "DE89370400440532013000",
    bankCurrency: "EUR", bankIbanFormat: "DE\\d{2}\\s?\\d{8}\\s?\\d{10}",
    globalNotes: "Demo buyer tenant — frozen fruit import from EG to DE.",
  },
  {
    gtid: "SGTX-EG-TRD-002139-7F3A",
    legalName: "Strawberry Export Co.",
    type: "TRD", country: "EG", city: "Cairo", sector: "Frozen Fruit Export",
    traderMode: "SELL", kybTier: 2, trustScore: 92, trustConfidence: 0.88,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#d4321a",
    bankName: "Commercial International Bank", bankSwift: "COMEGCAXXX", bankCity: "Cairo",
    bankAccountName: "Strawberry Export Co.", bankAccountNo: "EG100200300400500",
    bankCurrency: "USD", bankIbanFormat: "EG\\d{2}\\s?\\d{4}\\s?\\d{4}\\s?\\d{16}",
    globalNotes: "Demo seller tenant — Egyptian frozen strawberry exporter.",
  },
  {
    gtid: "SGTX-EG-LSP-000120-4C7D",
    legalName: "Delta Freight & Forwarding",
    type: "LSP", country: "EG", city: "Alexandria", sector: "Trucking & Forwarding",
    kybTier: 2, trustScore: 84, trustConfidence: 0.75,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#c2410c",
    globalNotes: "Demo logistics provider — drayage Alexandria port ↔ Cairo.",
  },
  {
    gtid: "SGTX-EG-SHP-000031-9E8F",
    legalName: "Maersk Levant Line",
    type: "SHIP", country: "EG", city: "Alexandria", sector: "Ocean Container Carrier",
    kybTier: 3, trustScore: 95, trustConfidence: 0.94,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#0d6efd",
    globalNotes: "Demo shipping line — EG↔DE reefer container service.",
  },
  {
    gtid: "SGTX-EG-LAB-000014-6F4D",
    legalName: "Cairo Analytical Laboratory",
    type: "LAB", country: "EG", city: "Cairo", sector: "Food & Pesticide Testing",
    kybTier: 2, trustScore: 90, trustConfidence: 0.85,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#16a34a",
    globalNotes: "Demo laboratory — ISO 17025 pesticide residue panel.",
  },
  {
    gtid: "SGTX-EG-QC-000022-8A1C",
    legalName: "Nile Quality Inspectors",
    type: "QC", country: "EG", city: "Cairo", sector: "Pre-shipment Inspection",
    kybTier: 2, trustScore: 87, trustConfidence: 0.80,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#9333ea",
    globalNotes: "Demo QC inspector — pre-shipment cold-chain quality check.",
  },
  {
    gtid: "SGTX-EG-CBR-000009-5E7B",
    legalName: "Pyramid Customs Brokers",
    type: "CBR", country: "EG", city: "Cairo", sector: "Customs Clearance",
    kybTier: 3, trustScore: 91, trustConfidence: 0.88,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#ca8a04",
    globalNotes: "Demo customs broker — Nafeza (SAD) declarations + EUR.1.",
  },
  {
    gtid: "SGTX-EG-BNK-000007-1F8D",
    legalName: "Commercial International Bank",
    type: "BANK", country: "EG", city: "Cairo", sector: "Trade Finance",
    kybTier: 3, trustScore: 96, trustConfidence: 0.95,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    defiAllowed: true,
    logoColor: "#1e40af",
    bankName: "Commercial International Bank", bankSwift: "COMEGCAXXX", bankCity: "Cairo",
    bankAccountName: "CIB Treasury", bankAccountNo: "EG01000001234567890",
    bankCurrency: "USD", bankIbanFormat: "EG\\d{2}\\s?\\d{4}\\s?\\d{4}\\s?\\d{16}",
    globalNotes: "Demo financier (bank) — LC issuance + receivable discounting.",
  },
  {
    gtid: "SGTX-EG-PFI-000011-3C2E",
    legalName: "Sovereign Capital Partners",
    type: "PFI", country: "EG", city: "Giza", sector: "Private Trade Finance",
    kybTier: 2, trustScore: 82, trustConfidence: 0.72,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    defiAllowed: true,
    logoColor: "#be185d",
    globalNotes: "Demo private financier (non-bank) — alternative capital.",
  },
  {
    gtid: "SGTX-EG-GOV-000001-9A0B",
    legalName: "Egyptian Customs Authority",
    type: "GOV", country: "EG", city: "Cairo", sector: "Customs & Revenue",
    kybTier: 3, trustScore: 99, trustConfidence: 0.99,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#b45309",
    globalNotes: "Demo government tenant — customs clearance authority.",
  },
  {
    gtid: "SGTX-ZZ-ADM-000001-A1B2",
    legalName: "Platform Admin",
    type: "ADM", country: "ZZ", city: "Geneva", sector: "Platform Operations",
    kybTier: 3, trustScore: 100, trustConfidence: 1.0,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#0f172a",
    globalNotes: "Demo platform admin tenant — operator override access.",
  },
  {
    gtid: "SGTX-ZZ-MKT-000001-C3D4",
    legalName: "Marketplace Partner",
    type: "MKT", country: "ZZ", city: "Singapore", sector: "Marketplace Integration",
    kybTier: 2, trustScore: 85, trustConfidence: 0.78,
    kybStatus: "CLEARED", pepStatus: "NONE", lifecycleState: "VERIFIED",
    logoColor: "#0f766e",
    globalNotes: "Demo marketplace partner tenant — data syndication.",
  },
];

// ===========================================================================
// 2. EMPLOYEES — one owner per key demo tenant (so login can resolve a user)
// ===========================================================================
type Employee = {
  tenantGtid: string;
  fullName: string;
  email: string;
  role: string;
  avatarColor: string;
  allowRoleSwitching?: boolean;
  defaultTraderMode?: string;
  activeTraderMode?: string;
};

const EMPLOYEES: Employee[] = [
  { tenantGtid: "SGTX-DE-TRD-001234-5B6C", fullName: "Klaus Bergmann", email: "k.bergmann@euroimport.de", role: "OWNER", avatarColor: "#1a6fb0", allowRoleSwitching: true, defaultTraderMode: "BUY", activeTraderMode: "BUY" },
  { tenantGtid: "SGTX-DE-TRD-001234-5B6C", fullName: "Lena Hoffmann", email: "l.hoffmann@euroimport.de", role: "OPERATOR", avatarColor: "#0ea5e9" },
  { tenantGtid: "SGTX-EG-TRD-002139-7F3A", fullName: "Mohamed Eltonsy", email: "m.eltonsy@strawberryexport.eg", role: "OWNER", avatarColor: "#d4321a", allowRoleSwitching: true, defaultTraderMode: "SELL", activeTraderMode: "SELL" },
  { tenantGtid: "SGTX-EG-TRD-002139-7F3A", fullName: "Sarah Ahmed", email: "s.ahmed@strawberryexport.eg", role: "OPERATOR", avatarColor: "#f59e0b" },
  { tenantGtid: "SGTX-EG-LSP-000120-4C7D", fullName: "Omar Khairy", email: "o.khairy@deltafreight.eg", role: "ADMIN", avatarColor: "#c2410c" },
  { tenantGtid: "SGTX-EG-SHP-000031-9E8F", fullName: "Captain Yara Farouk", email: "y.farouk@maersklevant.eg", role: "ADMIN", avatarColor: "#0d6efd" },
  { tenantGtid: "SGTX-EG-LAB-000014-6F4D", fullName: "Dr. Amira Said", email: "a.said@cairoanalytical.eg", role: "ANALYST", avatarColor: "#16a34a" },
  { tenantGtid: "SGTX-EG-QC-000022-8A1C", fullName: "Tarek Mansour", email: "t.mansour@nileqc.eg", role: "INSPECTOR", avatarColor: "#9333ea" },
  { tenantGtid: "SGTX-EG-CBR-000009-5E7B", fullName: "Nour El-Din", email: "n.eldin@pyramidcustoms.eg", role: "OFFICER", avatarColor: "#ca8a04" },
  { tenantGtid: "SGTX-EG-BNK-000007-1F8D", fullName: "Reem Adel", email: "r.adel@cib.eg", role: "OFFICER", avatarColor: "#1e40af" },
  { tenantGtid: "SGTX-EG-PFI-000011-3C2E", fullName: "Maged Fouad", email: "m.fouad@sovereigncap.eg", role: "OFFICER", avatarColor: "#be185d" },
  { tenantGtid: "SGTX-EG-GOV-000001-9A0B", fullName: "General Khaled Soliman", email: "k.soliman@customs.eg", role: "OFFICER", avatarColor: "#b45309" },
  { tenantGtid: "SGTX-ZZ-ADM-000001-A1B2", fullName: "Platform Operator", email: "ops@sgtx.io", role: "ADMIN", avatarColor: "#0f172a", allowRoleSwitching: true },
  { tenantGtid: "SGTX-ZZ-MKT-000001-C3D4", fullName: "Marketplace Liaison", email: "liaison@marketplace.partner", role: "OPERATOR", avatarColor: "#0f766e" },
];

// ===========================================================================
// 3. TRADES — two demo trades so the dashboard has rows
// ===========================================================================
const NOW = Date.now();
const ISO = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const TRADE_1 = {
  id: seedId("trade", "strawberry-cif-hamburg"),
  ustn: "SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4",
  buyerGtid: "SGTX-DE-TRD-001234-5B6C",
  sellerGtid: "SGTX-EG-TRD-002139-7F3A",
  commodity: "Frozen Strawberries (Senga Sengana, IQF)",
  commodityHs: "0811.10.00",
  incoterm: "CIF",
  grossWeightKg: 21500,
  netWeightKg: 20000,
  tradeValueUsd: 100000,
  originPort: "Alexandria (EGALX)",
  destPort: "Hamburg (DEHAM)",
  originCountry: "EG",
  destCountry: "DE",
  phase: 5,
  status: "IN_EXECUTION",
  healthScore: 88,
  multiShipment: 1,
  sgtxFeeUsd: 1500,
  coldChain: 1,
  containerCount: 2,
  transportMode: "SEA",
  equipmentType: "REEFER_40HC",
  paymentTerms: "LC_30_DAYS",
  settlementStructure: "DOCUMENTARY_CREDIT",
  isSandbox: 0,
};

const TRADE_2 = {
  id: seedId("trade", "strawberry-settled"),
  ustn: "SGTX-1234B6C-002139F-20260210060000-T1U2V3W4",
  buyerGtid: "SGTX-DE-TRD-001234-5B6C",
  sellerGtid: "SGTX-EG-TRD-002139-7F3A",
  commodity: "Frozen Strawberries (Senga Sengana)",
  commodityHs: "0811.10.00",
  incoterm: "CIF",
  grossWeightKg: 10750,
  netWeightKg: 10000,
  tradeValueUsd: 48000,
  originPort: "Alexandria (EGALX)",
  destPort: "Hamburg (DEHAM)",
  originCountry: "EG",
  destCountry: "DE",
  phase: 6,
  status: "SETTLED",
  healthScore: 95,
  multiShipment: 0,
  sgtxFeeUsd: 720,
  coldChain: 1,
  containerCount: 1,
  transportMode: "SEA",
  equipmentType: "REEFER_40HC",
  paymentTerms: "ADVANCE",
  settlementStructure: "DIRECT_TRANSFER",
  isSandbox: 0,
};

// ===========================================================================
// 4. SHIPMENTS (one per trade — minimal columns to satisfy schema)
// ===========================================================================
const SHIPMENTS = [
  {
    id: seedId("ship", "t1-seq1"),
    tradeId: TRADE_1.id,
    ustn: TRADE_1.ustn,
    sequence: 1,
    vesselName: "MSC Amsterdam",
    vesselImo: "IMO 9778601",
    containerNo: "MSCU 4471823",
    containerCount: 1,
    carrierGtid: "SGTX-EG-SHP-000031-9E8F",
    status: "IN_TRANSIT",
    originPort: "Alexandria (EGALX)",
    destPort: "Hamburg (DEHAM)",
    transportMode: "SEA",
    etd: ISO(-2 * 86400000),
    eta: ISO(16 * 86400000),
    departedAt: ISO(-2 * 86400000),
    coldChainTemp: -18.2,
    lat: 37.6,
    lng: 14.8,
  },
  {
    id: seedId("ship", "t2-seq1"),
    tradeId: TRADE_2.id,
    ustn: TRADE_2.ustn,
    sequence: 1,
    vesselName: "Hapag Vessel",
    containerNo: "HLXU 8821001",
    containerCount: 1,
    carrierGtid: "SGTX-EG-SHP-000031-9E8F",
    status: "DELIVERED",
    originPort: "Alexandria (EGALX)",
    destPort: "Hamburg (DEHAM)",
    transportMode: "SEA",
    eta: ISO(-70 * 86400000),
    arrivedAt: ISO(-70 * 86400000),
    releasedAt: ISO(-69 * 86400000),
    lat: 53.55,
    lng: 9.93,
  },
];

// ===========================================================================
// 5. INVOICES (one commercial + one SGTX fee per trade)
// ===========================================================================
const INVOICES = [
  { id: seedId("inv", "t1-ci"), tradeId: TRADE_1.id, type: "COMMERCIAL", number: "INV-2026-0491", amountUsd: 100000, currency: "USD", status: "APPROVED", payerGtid: "SGTX-DE-TRD-001234-5B6C", payeeGtid: "SGTX-EG-TRD-002139-7F3A", dueDate: ISO(20 * 86400000), paidAt: null },
  { id: seedId("inv", "t1-sgtxfee"), tradeId: TRADE_1.id, type: "SGTX_FEE", number: "SGTX-FEE-0491", amountUsd: 1500, currency: "USD", status: "PAID", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-PLATFORM", dueDate: null, paidAt: ISO(-10 * 86400000) },
  { id: seedId("inv", "t1-lsp"), tradeId: TRADE_1.id, type: "LOGISTICS", number: "LSP-2026-0491", amountUsd: 4200, currency: "USD", status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-LSP-000120-4C7D", dueDate: ISO(5 * 86400000), paidAt: null },
  { id: seedId("inv", "t1-lab"), tradeId: TRADE_1.id, type: "LAB", number: "LAB-2026-0491", amountUsd: 280, currency: "USD", status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-LAB-000014-6F4D", dueDate: ISO(5 * 86400000), paidAt: null },
  { id: seedId("inv", "t1-qc"), tradeId: TRADE_1.id, type: "QC", number: "QC-2026-0491", amountUsd: 220, currency: "USD", status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-QC-000022-8A1C", dueDate: ISO(5 * 86400000), paidAt: null },
  { id: seedId("inv", "t2-ci"), tradeId: TRADE_2.id, type: "COMMERCIAL", number: "INV-2026-0312", amountUsd: 48000, currency: "USD", status: "PAID", payerGtid: "SGTX-DE-TRD-001234-5B6C", payeeGtid: "SGTX-EG-TRD-002139-7F3A", dueDate: ISO(-60 * 86400000), paidAt: ISO(-55 * 86400000) },
  { id: seedId("inv", "t2-sgtxfee"), tradeId: TRADE_2.id, type: "SGTX_FEE", number: "SGTX-FEE-0312", amountUsd: 720, currency: "USD", status: "PAID", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-PLATFORM", dueDate: null, paidAt: ISO(-70 * 86400000) },
];

// ===========================================================================
// 6. INBOX ITEMS — spread across several demo tenants
// ===========================================================================
const INBOX_ITEMS = [
  { id: seedId("inbox", "buyer-t1-action"), tenantGtid: "SGTX-DE-TRD-001234-5B6C", tradeId: TRADE_1.id, category: "ACTION_REQUIRED", priority: 90, title: "Approve commercial invoice INV-2026-0491", description: "Seller submitted CI for $100,000 — review and approve within 3 business days to avoid demurrage.", ctaLabel: "Review Invoice", deadline: ISO(2 * 86400000) },
  { id: seedId("inbox", "buyer-t1-update"), tenantGtid: "SGTX-DE-TRD-001234-5B6C", tradeId: TRADE_1.id, category: "SHIPMENT_UPDATE", priority: 60, title: "Shipment 1 in transit — MSC Amsterdam", description: "Container MSCU 4471823 departed Alexandria. ETA Hamburg in 16 days. Reefer temp stable at -18.2°C.", ctaLabel: "Track Shipment" },
  { id: seedId("inbox", "seller-t1-action"), tenantGtid: "SGTX-EG-TRD-002139-7F3A", tradeId: TRADE_1.id, category: "ACTION_REQUIRED", priority: 85, title: "Submit Bill of Lading — MSCU 4471823", description: "Carrier Maersk Levant requests B/L confirmation before vessel arrival at Hamburg.", ctaLabel: "Upload B/L", deadline: ISO(4 * 86400000) },
  { id: seedId("inbox", "seller-t1-info"), tenantGtid: "SGTX-EG-TRD-002139-7F3A", tradeId: TRADE_1.id, category: "PAYMENT", priority: 70, title: "Payment due from European Importer GmbH", description: "Invoice INV-2026-0491 ($100,000) due in 20 days under LC terms.", ctaLabel: "View Invoice" },
  { id: seedId("inbox", "lsp-t1-action"), tenantGtid: "SGTX-EG-LSP-000120-4C7D", tradeId: TRADE_1.id, category: "ACTION_REQUIRED", priority: 80, title: "Drayage booking — Container MSCU 4471823", description: "Pickup from Cairo cold store → Alexandria port. Scheduled departure 2026-04-16 08:00.", ctaLabel: "Confirm Pickup" },
  { id: seedId("inbox", "ship-t1-info"), tenantGtid: "SGTX-EG-SHP-000031-9E8F", tradeId: TRADE_1.id, category: "SHIPMENT_UPDATE", priority: 55, title: "Reefer telemetry — MSC Amsterdam", description: "Cold-chain log auto-generated. Temperature within range (-18.0 to -18.4°C).", ctaLabel: "View Telemetry" },
  { id: seedId("inbox", "lab-t1-info"), tenantGtid: "SGTX-EG-LAB-000014-6F4D", tradeId: TRADE_1.id, category: "DOCUMENT", priority: 50, title: "Pesticide report issued — PASS", description: "Sample SMP-0491-A. All 240 compounds below MRL thresholds. Report attached.", ctaLabel: "View Report" },
  { id: seedId("inbox", "bank-t1-info"), tenantGtid: "SGTX-EG-BNK-000007-1F8D", tradeId: TRADE_1.id, category: "FINANCING", priority: 65, title: "LC advisory request — INV-2026-0491", description: "European Importer GmbH requested LC confirmation for $100,000 trade. Review terms.", ctaLabel: "Review LC" },
];

// ===========================================================================
// 7. ACTIVITIES — audit trail for trade 1
// ===========================================================================
const ACTIVITIES = [
  { id: seedId("act", "t1-1"), tradeId: TRADE_1.id, actorGtid: "SGTX-DE-TRD-001234-5B6C", action: "SUBMITTED_TRADE_REQUEST", description: "Submitted trade request for 20,000 kg frozen strawberries", type: "INFO", createdAt: ISO(-30 * 86400000) },
  { id: seedId("act", "t1-2"), tradeId: TRADE_1.id, actorGtid: "SGTX-EG-TRD-002139-7F3A", action: "SUBMITTED_QUOTE", description: "Seller submitted quote: $5.00/kg EXW Cairo, CIF Hamburg", type: "INFO", createdAt: ISO(-28 * 86400000) },
  { id: seedId("act", "t1-3"), tradeId: TRADE_1.id, actorGtid: "SGTX-DE-TRD-001234-5B6C", action: "ACCEPTED_QUOTE", description: "Buyer accepted quote after negotiation (round 2)", type: "SUCCESS", createdAt: ISO(-26 * 86400000) },
  { id: seedId("act", "t1-4"), tradeId: TRADE_1.id, actorGtid: "SGTX-EG-TRD-002139-7F3A", action: "SIGNED_CONTRACT", description: "Contract SC-2026-0491 signed via ZITADEL passkey (QES)", type: "SUCCESS", createdAt: ISO(-20 * 86400000) },
  { id: seedId("act", "t1-5"), tradeId: TRADE_1.id, actorGtid: "SGTX-DE-TRD-001234-5B6C", action: "SIGNED_CONTRACT", description: "Counterparty signature confirmed — contract locked, USTN generated", type: "SUCCESS", createdAt: ISO(-20 * 86400000) },
  { id: seedId("act", "t1-6"), tradeId: TRADE_1.id, actorGtid: null, action: "COLLECTED_FEE", description: "SGTX fee $1,500 collected via PSP split (non-custodial FeeLock)", type: "SUCCESS", createdAt: ISO(-19 * 86400000) },
  { id: seedId("act", "t1-7"), tradeId: TRADE_1.id, actorGtid: "SGTX-EG-QC-000022-8A1C", action: "PASSED_INSPECTION", description: "Pre-shipment QC inspection: PASS (0 defects, brix 9.2)", type: "SUCCESS", createdAt: ISO(-8 * 86400000) },
  { id: seedId("act", "t1-8"), tradeId: TRADE_1.id, actorGtid: "SGTX-EG-LAB-000014-6F4D", action: "ISSUED_REPORT", description: "Pesticide residue report issued: PASS (all < MRL)", type: "SUCCESS", createdAt: ISO(-7 * 86400000) },
  { id: seedId("act", "t1-9"), tradeId: TRADE_1.id, actorGtid: "SGTX-EG-CBR-000009-5E7B", action: "SUBMITTED_DECLARATION", description: "Export declaration EX-2026-88231 filed with Nafeza (SAD)", type: "INFO", createdAt: ISO(-5 * 86400000) },
  { id: seedId("act", "t1-10"), tradeId: TRADE_1.id, actorGtid: "SGTX-EG-SHP-000031-9E8F", action: "DEPARTED", description: "MSC Amsterdam departed Alexandria → Hamburg (IMO 9778601)", type: "INFO", createdAt: ISO(-2 * 86400000) },
];

// ===========================================================================
// 8. INBOX ITEMS for the two platform tenants (admin + mkt).
//    These tenants have NO trades, so their inbox items are tradeless
//    (tradeId = NULL). Without them the admin/mkt dashboards would be empty.
// ===========================================================================
const PLATFORM_INBOX_ITEMS = [
  { id: seedId("inbox", "admin-welcome"), tenantGtid: "SGTX-ZZ-ADM-000001-A1B2", tradeId: null, category: "SYSTEM", priority: 90, title: "Platform operations dashboard ready", description: "Demo admin tenant seeded. Operator override access enabled. Review active trades and pending KYB verifications.", ctaLabel: "Open Console" },
  { id: seedId("inbox", "admin-kyc-queue"), tenantGtid: "SGTX-ZZ-ADM-000001-A1B2", tradeId: null, category: "ACTION_REQUIRED", priority: 75, title: "3 KYB verifications pending review", description: "Delta Freight, Cairo Analytical, and Nile Quality have tier-2 KYB submissions awaiting operator sign-off.", ctaLabel: "Review KYB Queue" },
  { id: seedId("inbox", "mkt-welcome"), tenantGtid: "SGTX-ZZ-MKT-000001-C3D4", tradeId: null, category: "SYSTEM", priority: 90, title: "Marketplace partner onboarding complete", description: "Demo marketplace partner tenant seeded. Data syndication feed is live — 4 active trades available for catalog indexing.", ctaLabel: "View Feed" },
  { id: seedId("inbox", "mkt-catalog"), tenantGtid: "SGTX-ZZ-MKT-000001-C3D4", tradeId: null, category: "CATALOG", priority: 60, title: "Catalog sync scheduled", description: "Next incremental sync in 15 minutes. 12 tenants, 4 trades, 7 shipments in scope.", ctaLabel: "Sync Now" },
];

// ===========================================================================
// EXECUTION — non-destructive + idempotent
// ===========================================================================
// Strategy:
//   • Tenants & employees: `INSERT OR IGNORE` (never modifies an existing row —
//     if the gtid/email already exists, the row is left untouched). This is
//     critical because Turso already contains 10 of the 12 demo tenants with
//     cuid-style ids referenced by child rows; REPLACE would change the id and
//     (with FKs off) silently orphan children that reference Trade.id.
//   • Trades + their children: only inserted when the trade's USTN does NOT
//     already exist. For an existing trade we skip children entirely (the
//     original seed already created them) — this avoids duplicate invoices /
//     shipments / activities.
//   • Platform inbox items (admin + mkt): always `INSERT OR IGNORE`d (they
//     have NULL tradeId, so no FK risk, and their deterministic ids make them
//     safe to re-run).
// Net effect on a fully-seeded Turso: a clean no-op (all IGNORE). On an empty
// Turso: everything is inserted fresh. On a partially-seeded Turso (the
// actual current state): only the missing pieces are added.
// ===========================================================================
async function exists(sql: string, args: unknown[]): Promise<boolean> {
  try {
    const r = await client.execute({ sql, args });
    return Number((r.rows[0] as any)?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

async function seedTenants() {
  console.log("\n— Seeding demo tenants (INSERT OR IGNORE) —");
  let inserted = 0, skipped = 0;
  for (const t of TENANTS) {
    const already = await exists("SELECT COUNT(*) AS n FROM Tenant WHERE gtid=?", [t.gtid]);
    if (already) { skipped++; continue; }
    const id = seedId("tenant", t.gtid);
    const sql = `INSERT OR IGNORE INTO Tenant
      (id, gtid, legalName, type, country, traderMode, kybTier, trustScore, trustConfidence,
       kybStatus, pepStatus, lifecycleState, sanctionsCleared, defiAllowed, anonymousRfqOptOut,
       city, logoColor, sector, bankSwift, bankName, bankCity, bankAccountName, bankAccountNo,
       bankCurrency, bankIbanFormat, globalNotes, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      id, t.gtid, t.legalName, t.type, t.country, t.traderMode || "NONE",
      t.kybTier, t.trustScore, t.trustConfidence ?? null,
      t.kybStatus ?? null, t.pepStatus ?? null, t.lifecycleState,
      1, t.defiAllowed ? 1 : 0, 0,
      t.city, t.logoColor, t.sector, t.bankSwift ?? null, t.bankName ?? null,
      t.bankCity ?? null, t.bankAccountName ?? null, t.bankAccountNo ?? null,
      t.bankCurrency ?? null, t.bankIbanFormat ?? null, t.globalNotes ?? null,
      ISO(-30 * 86400000),
    ];
    if (await run(`Tenant ${t.gtid} (${t.legalName})`, "tenants", sql, args)) inserted++;
  }
  console.log(`  tenants: inserted=${inserted}  skipped(exists)=${skipped}`);
}

async function seedEmployees() {
  console.log("\n— Seeding employees (INSERT OR IGNORE) —");
  let inserted = 0, skipped = 0;
  for (const e of EMPLOYEES) {
    const already = await exists("SELECT COUNT(*) AS n FROM Employee WHERE email=?", [e.email]);
    if (already) { skipped++; continue; }
    const id = seedId("emp", e.email);
    const sql = `INSERT OR IGNORE INTO Employee
      (id, tenantGtid, fullName, email, role, allowRoleSwitching, defaultTraderMode,
       activeTraderMode, avatarColor, isActive, failedLoginAttempts, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      id, e.tenantGtid, e.fullName, e.email, e.role,
      e.allowRoleSwitching ? 1 : 0,
      e.defaultTraderMode || "NONE",
      e.activeTraderMode || "NONE",
      e.avatarColor, 1, 0,
      ISO(-30 * 86400000), ISO(0),
    ];
    if (await run(`Employee ${e.email}`, "employees", sql, args)) inserted++;
  }
  console.log(`  employees: inserted=${inserted}  skipped(exists)=${skipped}`);
}

// Returns the list of trades that were newly inserted (so their children get seeded).
async function seedTradesIfMissing(): Promise<typeof TRADE_1[]> {
  console.log("\n— Seeding trades (INSERT OR IGNORE, skip if USTN exists) —");
  const inserted: typeof TRADE_1[] = [];
  for (const t of [TRADE_1, TRADE_2]) {
    const already = await exists("SELECT COUNT(*) AS n FROM Trade WHERE ustn=?", [t.ustn]);
    if (already) {
      console.log(`  Trade ${t.ustn}: skipped (already exists — children preserved)`);
      continue;
    }
    const sql = `INSERT OR IGNORE INTO Trade
      (id, ustn, buyerGtid, sellerGtid, commodity, commodityHs, incoterm, grossWeightKg,
       netWeightKg, tradeValueUsd, originPort, destPort, originCountry, destCountry, phase,
       status, healthScore, multiShipment, sgtxFeeUsd, coldChain, containerCount,
       transportMode, equipmentType, paymentTerms, settlementStructure, isSandbox, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      t.id, t.ustn, t.buyerGtid, t.sellerGtid, t.commodity, t.commodityHs, t.incoterm,
      t.grossWeightKg, t.netWeightKg, t.tradeValueUsd, t.originPort, t.destPort,
      t.originCountry, t.destCountry, t.phase, t.status, t.healthScore,
      t.multiShipment, t.sgtxFeeUsd,
      t.coldChain, t.containerCount, t.transportMode ?? null, t.equipmentType ?? null,
      t.paymentTerms ?? null, t.settlementStructure ?? null, t.isSandbox,
      ISO(-30 * 86400000), ISO(0),
    ];
    if (await run(`Trade ${t.ustn}`, "trades", sql, args)) inserted.push(t);
  }
  console.log(`  trades: inserted=${inserted.length}  skipped(exists)=${2 - inserted.length}`);
  return inserted;
}

async function seedChildrenFor(newTrades: typeof TRADE_1[]) {
  if (newTrades.length === 0) {
    console.log("\n— Skipping trade children (no new trades) —");
    return;
  }
  const newIds = new Set(newTrades.map(t => t.id));

  console.log("\n— Seeding shipments (only for new trades) —");
  for (const s of SHIPMENTS) {
    if (!newIds.has(s.tradeId)) continue;
    const sql = `INSERT OR IGNORE INTO Shipment
      (id, tradeId, ustn, sequence, vesselName, vesselImo, containerNo, containerCount,
       carrierGtid, status, originPort, destPort, transportMode, etd, eta, departedAt,
       coldChainTemp, lat, lng, arrivedAt, releasedAt, legSequence, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      s.id, s.tradeId, s.ustn, s.sequence,
      (s as any).vesselName ?? null, (s as any).vesselImo ?? null,
      (s as any).containerNo ?? null, (s as any).containerCount ?? 1,
      (s as any).carrierGtid ?? null, s.status, s.originPort, s.destPort,
      s.transportMode, (s as any).etd ?? null, (s as any).eta ?? null,
      (s as any).departedAt ?? null, (s as any).coldChainTemp ?? null,
      (s as any).lat ?? null, (s as any).lng ?? null,
      (s as any).arrivedAt ?? null, (s as any).releasedAt ?? null,
      1, ISO(-10 * 86400000),
    ];
    await run(`Shipment ${s.containerNo ?? s.id}`, "shipments", sql, args);
  }

  console.log("\n— Seeding invoices (only for new trades) —");
  for (const i of INVOICES) {
    if (!newIds.has(i.tradeId)) continue;
    const sql = `INSERT OR IGNORE INTO Invoice
      (id, tradeId, type, number, invoiceNumber, amountUsd, currency, status, payerGtid,
       payeeGtid, dueDate, paidAt, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      i.id, i.tradeId, i.type, i.number, i.number, i.amountUsd, i.currency, i.status,
      i.payerGtid, i.payeeGtid, i.dueDate, i.paidAt, ISO(-25 * 86400000),
    ];
    await run(`Invoice ${i.number}`, "invoices", sql, args);
  }

  console.log("\n— Seeding activities (only for new trades) —");
  for (const a of ACTIVITIES) {
    if (!newIds.has(a.tradeId)) continue;
    const sql = `INSERT OR IGNORE INTO Activity
      (id, tradeId, actorGtid, action, description, type, metadata, createdAt)
      VALUES (?,?,?,?,?,?,?,?)`;
    const args = [
      a.id, a.tradeId, a.actorGtid, a.action, a.description, a.type,
      null, a.createdAt,
    ];
    await run(`Activity ${a.action}`, "activities", sql, args);
  }

  console.log("\n— Seeding trade-referencing inbox items (only for new trades) —");
  for (const i of INBOX_ITEMS) {
    if (i.tradeId && !newIds.has(i.tradeId)) continue;
    const sql = `INSERT OR IGNORE INTO InboxItem
      (id, tenantGtid, tradeId, category, priority, title, description, ctaLabel, deadline,
       dismissed, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      i.id, i.tenantGtid, i.tradeId, i.category, i.priority, i.title, i.description,
      i.ctaLabel ?? null, i.deadline ?? null, 0, ISO(-3 * 86400000),
    ];
    await run(`InboxItem ${i.tenantGtid.slice(0, 16)}… ${i.title.slice(0, 30)}`, "inboxItems", sql, args);
  }
}

async function seedPlatformInboxItems() {
  console.log("\n— Seeding platform inbox items for admin + mkt (tradeless) —");
  for (const i of PLATFORM_INBOX_ITEMS) {
    const sql = `INSERT OR IGNORE INTO InboxItem
      (id, tenantGtid, tradeId, category, priority, title, description, ctaLabel, deadline,
       dismissed, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    const args = [
      i.id, i.tenantGtid, i.tradeId, i.category, i.priority, i.title, i.description,
      i.ctaLabel ?? null, i.deadline ?? null, 0, ISO(-3 * 86400000),
    ];
    await run(`InboxItem ${i.tenantGtid.slice(0, 16)}… ${i.title.slice(0, 30)}`, "inboxItems", sql, args);
  }
}

// ===========================================================================
// VERIFICATION
// ===========================================================================
async function verify() {
  console.log("\n— Verification —");
  const tables = ["Tenant", "Employee", "Trade", "Shipment", "Invoice", "InboxItem", "Activity"];
  for (const tbl of tables) {
    try {
      const r = await client.execute(`SELECT COUNT(*) AS n FROM ${tbl}`);
      console.log(`  ${tbl.padEnd(12)} = ${r.rows[0]?.n}`);
    } catch (e: any) {
      console.warn(`  ${tbl}: ${e?.message}`);
    }
  }
  console.log("\n  Tenant roster:");
  try {
    const r = await client.execute(
      `SELECT gtid, legalName, type, country, lifecycleState FROM Tenant ORDER BY gtid`
    );
    for (const row of r.rows) {
      const x = row as any;
      console.log(`    ${x.gtid}  ${x.type.padEnd(5)} ${x.country}  ${x.lifecycleState.padEnd(8)}  ${x.legalName}`);
    }
  } catch (e: any) {
    console.warn("  tenant roster query failed:", e?.message);
  }
}

// ===========================================================================
// MAIN
// ===========================================================================
async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  SEED-DEMO-TENANTS — Turso remote database");
  console.log("  DATABASE_URL host:", safeHost(DATABASE_URL));
  console.log("════════════════════════════════════════════════════════════");
  console.log("  Strategy: INSERT OR IGNORE (non-destructive, idempotent).");
  console.log("  Existing rows are NEVER modified — only missing rows are added.");

  // FKs remain ENABLED throughout. INSERT OR IGNORE never triggers a DELETE,
  // so there is no cascade/orphan risk. Parent rows (Tenant, Trade) are always
  // inserted before their children, so every child FK is satisfied at insert
  // time. This is safer than the REPLACE + PRAGMA foreign_keys=OFF pattern.

  await seedTenants();
  await seedEmployees();
  const newTrades = await seedTradesIfMissing();
  await seedChildrenFor(newTrades);
  await seedPlatformInboxItems();

  await verify();

  console.log("\n— Seed stats —");
  let totalInserted = 0, totalIgnored = 0, totalFail = 0;
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(12)} inserted=${v.ok}  ignored=${v.ignored}  fail=${v.fail}`);
    totalInserted += v.ok; totalIgnored += v.ignored; totalFail += v.fail;
  }
  console.log(`\n  TOTAL: inserted=${totalInserted}  ignored(exists)=${totalIgnored}  failed=${totalFail}`);
  if (totalFail > 0) {
    console.warn(`\n⚠ ${totalFail} insert(s) failed — see warnings above.`);
  } else {
    console.log("\n✓ All statements succeeded (0 failures). Idempotent re-run confirmed.");
  }
  client.close();
}

main().catch((err) => {
  console.error("FATAL:", err);
  client.close();
  process.exit(1);
});
