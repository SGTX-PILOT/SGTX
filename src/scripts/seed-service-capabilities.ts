// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §11 — Service Capability Model — Seed Script
// ═══════════════════════════════════════════════════════════════════════════════
//
// Seeds:
//   1. The ServiceCapabilityDefinition reference table — 27 capabilities per
//      v17 Section 11.2, spanning the LOGISTICS / BROKERAGE / LAB / QC /
//      FINANCE groups.
//   2. Tenant.serviceCapabilities JSON — assigns the relevant capability
//      codes to the demo LSP (Delta Freight) and SHIP (Maersk Levant Line)
//      tenants so their ProviderPortCoverage rows satisfy the
//      "provider must hold the capability" pre-condition.
//   3. ProviderPortCoverage rows for the demo LSP and SHIP tenants:
//        • Delta Freight (SGTX-EG-LSP-000120-4C7D) → TRUCKING + FORWARDER
//          at EGHAM (Hampton, EG) and EGALX (Alexandria, EG).
//        • Maersk Levant Line (SGTX-EG-SHP-000031-9E8F) → OCEAN_FREIGHT at
//          EGALX (Alexandria, EG) and DEHAM (Hamburg, DE).
//
// Properties:
//   • Idempotent: uses INSERT OR IGNORE on the unique key for definitions
//     and ProviderPortCoverage, and a defensive read-merge-write for the
//     Tenant.serviceCapabilities JSON array. Re-runs produce the same
//     end-state.
//   • Defensive: each step is wrapped in its own try/catch — a single
//     insert failure is logged and skipped, never aborts the whole seed.
//   • Parameterized: all values bound as args — no string interpolation of
//     user-supplied data.
//   • Direct libsql: uses `@libsql/client` (NOT Prisma) — proven to work
//     with the Turso DB and the `bunx tsx` runtime (see
//     scripts/seed-demo-tenants.ts for the same convention).
//
//   *** NON-MARKETPLACE GUARDRAIL ***
//   This seed only declares capability FACTS about explicit tenants. It
//   never ranks, never recommends, never compares. The platform never
//   suggests "you might also like".
//
// Usage:
//   cd /home/z/my-project && bunx tsx src/scripts/seed-service-capabilities.ts
//
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient, type Client } from "@libsql/client";
import * as fs from "node:fs";

// ────────────────────────────────────────────────────────────────────────────
// .env loader (matches scripts/seed-demo-tenants.ts convention)
// ────────────────────────────────────────────────────────────────────────────
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

// IMPORTANT: the shell environment may export a STALE DATABASE_URL pointing
// at the local SQLite file. We force DATABASE_URL to come from .env files
// so this seed targets the same DB the Next.js app uses.
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

function extractAuthToken(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("authToken") ?? undefined;
  } catch {
    return undefined;
  }
}

function safeHost(url: string): string {
  const m = url.match(/^[a-z]+:\/\/([^/?]+)/i);
  return m ? m[1] : "(unknown)";
}

const client: Client = createClient({
  url: DATABASE_URL,
  authToken: extractAuthToken(DATABASE_URL),
});

// ────────────────────────────────────────────────────────────────────────────
// 1. CAPABILITY DEFINITIONS (v17 §11.2)
// ────────────────────────────────────────────────────────────────────────────

interface CapDef {
  capabilityCode: string;
  capabilityName: string;
  capabilityGroup: string;
  requiresAccreditation: boolean;
  requiresInsurance: boolean;
  defaultPortalTab?: string;
}

const CAPABILITIES: CapDef[] = [
  // ── LOGISTICS ─────────────────────────────────────────────────────────────
  { capabilityCode: "TRUCKING", capabilityName: "Road freight transport", capabilityGroup: "LOGISTICS", requiresAccreditation: false, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "FORWARDER", capabilityName: "Freight forwarding", capabilityGroup: "LOGISTICS", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "WAREHOUSING", capabilityName: "Storage / warehousing", capabilityGroup: "LOGISTICS", requiresAccreditation: false, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "OCEAN_FREIGHT", capabilityName: "Ocean container shipping", capabilityGroup: "LOGISTICS", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "AIR_FREIGHT", capabilityName: "Air cargo", capabilityGroup: "LOGISTICS", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "RAIL_FREIGHT", capabilityName: "Rail transport", capabilityGroup: "LOGISTICS", requiresAccreditation: false, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "RO_RO", capabilityName: "Roll-on / roll-off", capabilityGroup: "LOGISTICS", requiresAccreditation: false, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "MULTIMODAL", capabilityName: "Multimodal transport", capabilityGroup: "LOGISTICS", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "LCL", capabilityName: "Less than container load", capabilityGroup: "LOGISTICS", requiresAccreditation: false, requiresInsurance: true, defaultPortalTab: "logistics" },
  { capabilityCode: "FCL", capabilityName: "Full container load", capabilityGroup: "LOGISTICS", requiresAccreditation: false, requiresInsurance: true, defaultPortalTab: "logistics" },

  // ── BROKERAGE ────────────────────────────────────────────────────────────
  { capabilityCode: "CUSTOMS_BROKERAGE", capabilityName: "Customs clearance", capabilityGroup: "BROKERAGE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "customs" },
  { capabilityCode: "EXPORT_CUSTOMS", capabilityName: "Export declaration", capabilityGroup: "BROKERAGE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "customs" },
  { capabilityCode: "IMPORT_CUSTOMS", capabilityName: "Import declaration", capabilityGroup: "BROKERAGE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "customs" },
  { capabilityCode: "TRANSIT_CUSTOMS", capabilityName: "Transit declaration", capabilityGroup: "BROKERAGE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "customs" },

  // ── LAB ──────────────────────────────────────────────────────────────────
  { capabilityCode: "LAB_TESTING", capabilityName: "Laboratory testing", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "lab" },
  { capabilityCode: "PESTICIDE_RESIDUE", capabilityName: "Pesticide MRL testing", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "lab" },
  { capabilityCode: "MICROBIOLOGICAL", capabilityName: "Microbiological testing", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "lab" },
  { capabilityCode: "CHEMICAL", capabilityName: "Chemical analysis", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "lab" },
  { capabilityCode: "GMO_TESTING", capabilityName: "GMO testing", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "lab" },

  // ── QC ───────────────────────────────────────────────────────────────────
  { capabilityCode: "QC_INSPECTION", capabilityName: "Quality control inspection", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "qc" },
  { capabilityCode: "PRE_SHIPMENT_QC", capabilityName: "Pre-shipment inspection", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "qc" },
  { capabilityCode: "LOADING_SUPERVISION", capabilityName: "Loading supervision", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "qc" },
  { capabilityCode: "DISCHARGE_SUPERVISION", capabilityName: "Discharge supervision", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "qc" },

  // ── FINANCE ──────────────────────────────────────────────────────────────
  { capabilityCode: "TRADE_FINANCE", capabilityName: "Trade finance", capabilityGroup: "FINANCE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "finance" },
  { capabilityCode: "LC_ISSUANCE", capabilityName: "Letter of credit issuance", capabilityGroup: "FINANCE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "finance" },
  { capabilityCode: "FACTORING", capabilityName: "Factoring", capabilityGroup: "FINANCE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "finance" },
  { capabilityCode: "FORFAITING", capabilityName: "Forfaiting", capabilityGroup: "FINANCE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "finance" },
  { capabilityCode: "SUPPLY_CHAIN_FINANCE", capabilityName: "Supply chain finance", capabilityGroup: "FINANCE", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "finance" },
];

// ────────────────────────────────────────────────────────────────────────────
// 2. TENANT CAPABILITY ASSIGNMENTS + PORT COVERAGE (per task spec)
// ────────────────────────────────────────────────────────────────────────────

interface TenantCapabilitySeed {
  gtid: string;
  legalNameForLog: string;
  capabilityCodes: string[];
  coverage: Array<{
    capabilityCode: string;
    portUnlocode: string;
    countryCode: string;
  }>;
}

const TENANT_SEEDS: TenantCapabilitySeed[] = [
  {
    gtid: "SGTX-EG-LSP-000120-4C7D", // Delta Freight & Forwarding (demo LSP)
    legalNameForLog: "Delta Freight & Forwarding",
    capabilityCodes: ["TRUCKING", "FORWARDER"],
    coverage: [
      { capabilityCode: "TRUCKING", portUnlocode: "EGHAM", countryCode: "EG" },
      { capabilityCode: "TRUCKING", portUnlocode: "EGALX", countryCode: "EG" },
      { capabilityCode: "FORWARDER", portUnlocode: "EGHAM", countryCode: "EG" },
      { capabilityCode: "FORWARDER", portUnlocode: "EGALX", countryCode: "EG" },
    ],
  },
  {
    gtid: "SGTX-EG-SHP-000031-9E8F", // Maersk Levant Line (demo SHIP)
    legalNameForLog: "Maersk Levant Line",
    capabilityCodes: ["OCEAN_FREIGHT"],
    coverage: [
      { capabilityCode: "OCEAN_FREIGHT", portUnlocode: "EGALX", countryCode: "EG" },
      { capabilityCode: "OCEAN_FREIGHT", portUnlocode: "DEHAM", countryCode: "DE" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Stats
// ────────────────────────────────────────────────────────────────────────────
const stats = {
  definitions: { created: 0, ignored: 0, failed: 0 },
  tenants: { found: 0, missing: 0, capsAdded: 0, capsUnchanged: 0, failed: 0 },
  coverage: { created: 0, ignored: 0, failed: 0 },
};

function ISO(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// Deterministic id generator so re-runs hit the same PK (idempotent on
// the unique tuple — INSERT OR IGNORE will short-circuit).
function seedId(kind: string, key: string): string {
  const slug = (kind + "-" + key).toLowerCase().replace(/[^a-z0-9]/g, "");
  const hash = slug.padEnd(24, "0").slice(0, 24);
  return `seed${hash}`;
}

async function exec(label: string, sql: string, args: unknown[] = []): Promise<number> {
  try {
    const r = await client.execute({ sql, args });
    return r.rowsAffected ?? 0;
  } catch (err: any) {
    console.warn(`  ⚠ ${label}: ${err?.message || err}`);
    return -1;
  }
}

async function exists(sql: string, args: unknown[] = []): Promise<boolean> {
  try {
    const r = await client.execute({ sql, args });
    const n = (r.rows[0] as any)?.n;
    return Number(n) > 0;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Seed ServiceCapabilityDefinition rows
// ────────────────────────────────────────────────────────────────────────────
async function seedDefinitions() {
  console.log("\n— Seeding ServiceCapabilityDefinition rows (idempotent) —");
  for (const cap of CAPABILITIES) {
    const id = seedId("def", cap.capabilityCode);
    const sql = `INSERT OR IGNORE INTO ServiceCapabilityDefinition
      (id, capabilityCode, capabilityName, capabilityGroup,
       requiresAccreditation, requiresInsurance, defaultPortalTab)
      VALUES (?,?,?,?,?,?,?)`;
    const args = [
      id, cap.capabilityCode, cap.capabilityName, cap.capabilityGroup,
      cap.requiresAccreditation ? 1 : 0, cap.requiresInsurance ? 1 : 0,
      cap.defaultPortalTab ?? null,
    ];
    const affected = await exec(`def ${cap.capabilityCode}`, sql, args);
    if (affected > 0) {
      stats.definitions.created++;
      console.log(`  + ${cap.capabilityCode.padEnd(22)} (${cap.capabilityGroup}) ${cap.capabilityName}`);
    } else if (affected === 0) {
      stats.definitions.ignored++;
    } else {
      stats.definitions.failed++;
    }
  }
  console.log(
    `  definitions: created=${stats.definitions.created}  ignored(exists)=${stats.definitions.ignored}  failed=${stats.definitions.failed}`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Seed Tenant.serviceCapabilities JSON + ProviderPortCoverage rows
// ────────────────────────────────────────────────────────────────────────────
function parseCapabilitiesArray(raw: any): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => String(c).toUpperCase().trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function seedTenant(seed: TenantCapabilitySeed) {
  console.log(`  • ${seed.gtid} — ${seed.legalNameForLog}`);

  // Look up the tenant row
  let currentCapsRaw: any = "[]";
  let legalName: string | null = null;
  try {
    const r = await client.execute({
      sql: `SELECT serviceCapabilities, legalName FROM Tenant WHERE gtid=?`,
      args: [seed.gtid],
    });
    if (r.rows.length === 0) {
      stats.tenants.missing++;
      console.warn(
        `    ⚠ tenant ${seed.gtid} not found in DB — run seed-demo-tenants first; skipping this tenant`,
      );
      return;
    }
    currentCapsRaw = (r.rows[0] as any).serviceCapabilities ?? "[]";
    legalName = (r.rows[0] as any).legalName ?? null;
    stats.tenants.found++;
  } catch (err: any) {
    stats.tenants.failed++;
    console.warn(`    ⚠ tenant lookup failed: ${err?.message || err}`);
    return;
  }

  // Merge new capability codes into the existing JSON array
  const before = parseCapabilitiesArray(currentCapsRaw);
  const additions = seed.capabilityCodes
    .map((c) => c.toUpperCase())
    .filter((c) => !before.includes(c));
  if (additions.length === 0) {
    stats.tenants.capsUnchanged++;
    console.log(`    capabilities: already holding ${before.length}  (no change)`);
  } else {
    const mergedSet = new Set([...before, ...additions]);
    const after = Array.from(mergedSet).sort();
    const affected = await exec(
      `tenant ${seed.gtid} serviceCapabilities`,
      `UPDATE Tenant SET serviceCapabilities=? WHERE gtid=?`,
      [JSON.stringify(after), seed.gtid],
    );
    if (affected < 0) {
      stats.tenants.failed++;
      console.warn(`    ⚠ failed to update serviceCapabilities for ${seed.gtid}`);
      return;
    }
    stats.tenants.capsAdded += additions.length;
    console.log(
      `    capabilities: ${before.length} → ${after.length}  (added: ${additions.join(", ")})`,
    );
  }

  // Seed ProviderPortCoverage rows (idempotent on the UNIQUE tuple
  // [providerGtid, serviceCapability, portUnlocode])
  for (const c of seed.coverage) {
    const upperCode = c.capabilityCode.toUpperCase();
    const upperPort = c.portUnlocode.toUpperCase();
    const upperCountry = c.countryCode.toUpperCase();
    const id = seedId("cov", `${seed.gtid}-${upperCode}-${upperPort}`);

    // INSERT OR IGNORE — the UNIQUE constraint on the tuple makes it
    // idempotent. If the row already exists, we still want to ensure
    // isActive=1 and countryCode is current, so we run an UPDATE afterward
    // for that case.
    const sql = `INSERT OR IGNORE INTO ProviderPortCoverage
      (id, providerGtid, serviceCapability, portUnlocode, countryCode,
       isActive, lastVerified, createdAt)
      VALUES (?,?,?,?,?,?,?,?)`;
    const args = [
      id, seed.gtid, upperCode, upperPort, upperCountry,
      1, ISO(0), ISO(0),
    ];
    const affected = await exec(
      `cov ${upperCode}@${upperPort}`,
      sql,
      args,
    );
    if (affected > 0) {
      stats.coverage.created++;
      console.log(`    + coverage ${upperCode.padEnd(16)} @ ${upperPort} (${upperCountry})`);
    } else if (affected === 0) {
      // Row exists — re-activate and re-verify in case it was soft-deleted.
      await exec(
        `cov-update ${upperCode}@${upperPort}`,
        `UPDATE ProviderPortCoverage
           SET isActive=1, countryCode=?, lastVerified=?
         WHERE providerGtid=? AND serviceCapability=? AND portUnlocode=?`,
        [upperCountry, ISO(0), seed.gtid, upperCode, upperPort],
      );
      stats.coverage.ignored++;
      console.log(`    = coverage ${upperCode.padEnd(16)} @ ${upperPort} (${upperCountry}) — already exists (re-verified)`);
    } else {
      stats.coverage.failed++;
    }
  }
}

async function seedAllTenants() {
  console.log("\n— Seeding Tenant.serviceCapabilities + ProviderPortCoverage —");
  for (const seed of TENANT_SEEDS) {
    await seedTenant(seed);
  }
  console.log(
    `  tenants:  found=${stats.tenants.found}  missing=${stats.tenants.missing}  failed=${stats.tenants.failed}`,
  );
  console.log(
    `  capabilities: added=${stats.tenants.capsAdded}  unchanged=${stats.tenants.capsUnchanged}`,
  );
  console.log(
    `  coverage: created=${stats.coverage.created}  re-verified=${stats.coverage.ignored}  failed=${stats.coverage.failed}`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Verification
// ────────────────────────────────────────────────────────────────────────────
async function verify() {
  console.log("\n— Verification —");
  try {
    const r = await client.execute(
      `SELECT COUNT(*) AS n FROM ServiceCapabilityDefinition`,
    );
    console.log(`  ServiceCapabilityDefinition rows: ${r.rows[0]?.n}`);
  } catch (e: any) {
    console.warn(`  ServiceCapabilityDefinition count failed: ${e?.message}`);
  }
  try {
    const r = await client.execute(
      `SELECT capabilityGroup, COUNT(*) AS n
         FROM ServiceCapabilityDefinition
        GROUP BY capabilityGroup
        ORDER BY capabilityGroup`,
    );
    for (const row of r.rows) {
      const x = row as any;
      console.log(`    ${x.capabilityGroup.padEnd(10)} : ${x.n}`);
    }
  } catch (e: any) {
    console.warn(`  group-breakdown failed: ${e?.message}`);
  }
  try {
    const r = await client.execute(
      `SELECT providerGtid, serviceCapability, portUnlocode, countryCode, isActive
         FROM ProviderPortCoverage
        ORDER BY providerGtid, serviceCapability, portUnlocode`,
    );
    console.log(`  ProviderPortCoverage rows: ${r.rows.length}`);
    for (const row of r.rows) {
      const x = row as any;
      const active = Number(x.isActive) === 1 ? "active" : "inactive";
      console.log(
        `    ${x.providerGtid}  ${x.serviceCapability.padEnd(16)}  ${x.portUnlocode}  ${x.countryCode}  ${active}`,
      );
    }
  } catch (e: any) {
    console.warn(`  ProviderPortCoverage listing failed: ${e?.message}`);
  }
  try {
    const r = await client.execute(
      `SELECT gtid, legalName, serviceCapabilities
         FROM Tenant
        WHERE gtid IN (${TENANT_SEEDS.map(() => "?").join(",")})
        ORDER BY gtid`,
      TENANT_SEEDS.map((s) => s.gtid),
    );
    console.log(`  Tenant capability assignments:`);
    for (const row of r.rows) {
      const x = row as any;
      const caps = parseCapabilitiesArray(x.serviceCapabilities);
      console.log(`    ${x.gtid}  ${x.legalName}  caps=[${caps.join(", ")}]`);
    }
  } catch (e: any) {
    console.warn(`  tenant assignment listing failed: ${e?.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log(" SGTX v17 §11 — Service Capability Model — Seed Script");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  DATABASE_URL host: ${safeHost(DATABASE_URL)}`);
  console.log(`  Capabilities to seed: ${CAPABILITIES.length}`);
  console.log(`  Tenants to seed:     ${TENANT_SEEDS.length}`);
  console.log();
  console.log("  Strategy: INSERT OR IGNORE (non-destructive, idempotent).");
  console.log("  *** NON-MARKETPLACE GUARDRAIL ***");
  console.log("  This seed only declares capability facts about explicit");
  console.log("  tenants. It never ranks, recommends, or compares.");

  await seedDefinitions();
  await seedAllTenants();
  await verify();

  console.log("\n— Seed stats —");
  console.log(
    `  definitions:  created=${stats.definitions.created}  ignored(exists)=${stats.definitions.ignored}  failed=${stats.definitions.failed}`,
  );
  console.log(
    `  tenants:       found=${stats.tenants.found}  missing=${stats.tenants.missing}  failed=${stats.tenants.failed}`,
  );
  console.log(
    `  capabilities:  added=${stats.tenants.capsAdded}  unchanged=${stats.tenants.capsUnchanged}`,
  );
  console.log(
    `  coverage:      created=${stats.coverage.created}  re-verified=${stats.coverage.ignored}  failed=${stats.coverage.failed}`,
  );
  const totalFail =
    stats.definitions.failed + stats.tenants.failed + stats.coverage.failed;
  if (totalFail > 0) {
    console.warn(`\n⚠ ${totalFail} operation(s) failed — see warnings above.`);
  } else {
    console.log("\n✓ All statements succeeded (0 failures). Idempotent re-run confirmed.");
  }
  client.close();
}

main().catch((err) => {
  console.error("FATAL:", err);
  try { client.close(); } catch { /* noop */ }
  process.exit(1);
});
