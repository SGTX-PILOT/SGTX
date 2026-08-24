/**
 * CREATE-JURISDICTION-TURSO-TABLES
 * --------------------------------
 * Creates the 3 Prisma models for the SGTX Jurisdiction Fabric (CCL-014):
 *   - JurisdictionFabric  (prisma/schema.prisma lines 6054-6086)
 *   - RegulatorySource    (prisma/schema.prisma lines 6089-6114)
 *   - RegulatorySnapshot  (prisma/schema.prisma lines 6117-6140)
 *
 * Then seeds JurisdictionFabric with:
 *   - All 195 ISO 3166-1 alpha-2 countries (EG → ACTIVE, all others → NOT_ACTIVE)
 *   - EU  (CUSTOMS_TERRITORY, parent=null)
 *   - GCC (REGIONAL_UNION, parent=null, with AE/SA/KW/QA/BH/OM as children)
 *
 * Idempotency: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
 *              INSERT OR IGNORE on the unique `code` column.
 *
 * Type mapping (Prisma → SQLite/libSQL):
 *   String    → TEXT
 *   DateTime  → DATETIME
 *
 * IMPORTANT: A stale `DATABASE_URL=file:...` shell export can override .env.
 * We hard-code the Turso URL/token below and re-set process.env.DATABASE_URL
 * before instantiating the @libsql/client.
 *
 * Usage:
 *   cd /home/z/my-project
 *   DATABASE_URL="libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=<TOKEN>" \
 *     bun run scripts/create-jurisdiction-tables.ts
 */

import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Force Turso URL — ignore any stale shell `DATABASE_URL=file:...` export.
// ---------------------------------------------------------------------------
const TURSO_TOKEN =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";
const TURSO_URL = `libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=${TURSO_TOKEN}`;

process.env.DATABASE_URL = TURSO_URL; // override stale shell export

// ---------------------------------------------------------------------------
// DDL schema blocks
// ---------------------------------------------------------------------------
type DdlBlock = { table: string; create: string; indexes: string[] };

const SCHEMA: DdlBlock[] = [
  // ----- 1. JurisdictionFabric ------------------------------------------
  {
    table: "JurisdictionFabric",
    create: `CREATE TABLE IF NOT EXISTS JurisdictionFabric (
  id                       TEXT PRIMARY KEY,
  code                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  jurisdictionType         TEXT NOT NULL,
  parentJurisdictionId     TEXT,
  customsAuthority         TEXT,
  taxAuthority             TEXT,
  spsAuthority             TEXT,
  standardsAuthority       TEXT,
  exportControlAuthority   TEXT,
  transportAuthority       TEXT,
  immigrationAuthority     TEXT,
  ports                    TEXT,
  airports                 TEXT,
  customsOffices          TEXT,
  specialRegimes           TEXT,
  legalSources             TEXT,
  effectiveFrom            DATETIME,
  effectiveUntil           DATETIME,
  status                   TEXT NOT NULL DEFAULT 'NOT_ACTIVE',
  createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parentJurisdictionId) REFERENCES JurisdictionFabric(id) ON DELETE SET NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_jurisdictionfabric_code             ON JurisdictionFabric(code)",
      "CREATE INDEX IF NOT EXISTS idx_jurisdictionfabric_status           ON JurisdictionFabric(status)",
      "CREATE INDEX IF NOT EXISTS idx_jurisdictionfabric_jurisdictiontype ON JurisdictionFabric(jurisdictionType)",
    ],
  },

  // ----- 2. RegulatorySource --------------------------------------------
  {
    table: "RegulatorySource",
    create: `CREATE TABLE IF NOT EXISTS RegulatorySource (
  id                   TEXT PRIMARY KEY,
  jurisdictionId       TEXT,
  sourceType           TEXT NOT NULL,
  title                TEXT NOT NULL,
  officialUrl          TEXT,
  publicationDate      DATETIME,
  effectiveDate        DATETIME,
  expiryDate           DATETIME,
  sourceHash           TEXT,
  authority            TEXT,
  language             TEXT,
  legalStatus          TEXT NOT NULL DEFAULT 'IN_FORCE',
  verificationStatus   TEXT NOT NULL DEFAULT 'UNVERIFIED',
  lastChecked          DATETIME,
  description          TEXT,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jurisdictionId) REFERENCES JurisdictionFabric(id) ON DELETE SET NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_regulatorysource_jurisdictionid      ON RegulatorySource(jurisdictionId)",
      "CREATE INDEX IF NOT EXISTS idx_regulatorysource_sourcetype          ON RegulatorySource(sourceType)",
      "CREATE INDEX IF NOT EXISTS idx_regulatorysource_legalstatus         ON RegulatorySource(legalStatus)",
      "CREATE INDEX IF NOT EXISTS idx_regulatorysource_verificationstatus ON RegulatorySource(verificationStatus)",
    ],
  },

  // ----- 3. RegulatorySnapshot ------------------------------------------
  {
    table: "RegulatorySnapshot",
    create: `CREATE TABLE IF NOT EXISTS RegulatorySnapshot (
  id                       TEXT PRIMARY KEY,
  ustn                     TEXT,
  tradeId                  TEXT,
  jurisdictionId           TEXT,
  snapshotDate              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applicableRules          TEXT,
  customsProcedure         TEXT,
  sanctionsState           TEXT,
  transportRequirements    TEXT,
  governmentIntegrations   TEXT,
  tariffSnapshot           TEXT,
  documentSnapshot         TEXT,
  snapshotHash              TEXT,
  version                  TEXT,
  status                   TEXT NOT NULL DEFAULT 'VALID',
  createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jurisdictionId) REFERENCES JurisdictionFabric(id) ON DELETE SET NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_regulatorysnapshot_ustn           ON RegulatorySnapshot(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_regulatorysnapshot_jurisdictionid ON RegulatorySnapshot(jurisdictionId)",
      "CREATE INDEX IF NOT EXISTS idx_regulatorysnapshot_snapshotdate   ON RegulatorySnapshot(snapshotDate)",
    ],
  },
];

// ---------------------------------------------------------------------------
// ISO 3166-1 alpha-2 countries — full 195 list (also used by scripts/generate-country-data.ts)
// ---------------------------------------------------------------------------
const ISO_COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ["AF","Afghanistan"],["AL","Albania"],["DZ","Algeria"],["AD","Andorra"],["AO","Angola"],
  ["AG","Antigua and Barbuda"],["AR","Argentina"],["AM","Armenia"],["AU","Australia"],["AT","Austria"],
  ["AZ","Azerbaijan"],["BS","Bahamas"],["BH","Bahrain"],["BD","Bangladesh"],["BB","Barbados"],
  ["BY","Belarus"],["BE","Belgium"],["BZ","Belize"],["BJ","Benin"],["BT","Bhutan"],
  ["BO","Bolivia"],["BA","Bosnia and Herzegovina"],["BW","Botswana"],["BR","Brazil"],["BN","Brunei"],
  ["BG","Bulgaria"],["BF","Burkina Faso"],["BI","Burundi"],["CV","Cabo Verde"],["KH","Cambodia"],
  ["CM","Cameroon"],["CA","Canada"],["CF","Central African Republic"],["TD","Chad"],["CL","Chile"],
  ["CN","China"],["CO","Colombia"],["KM","Comoros"],["CG","Congo (Brazzaville)"],["CD","Congo (Kinshasa)"],
  ["CR","Costa Rica"],["CI","Côte d'Ivoire"],["HR","Croatia"],["CU","Cuba"],["CY","Cyprus"],
  ["CZ","Czech Republic"],["DK","Denmark"],["DJ","Djibouti"],["DM","Dominica"],["DO","Dominican Republic"],
  ["EC","Ecuador"],["EG","Egypt"],["SV","El Salvador"],["GQ","Equatorial Guinea"],["ER","Eritrea"],
  ["EE","Estonia"],["SZ","Eswatini"],["ET","Ethiopia"],["FJ","Fiji"],["FI","Finland"],
  ["FR","France"],["GA","Gabon"],["GM","Gambia"],["GE","Georgia"],["DE","Germany"],
  ["GH","Ghana"],["GR","Greece"],["GD","Grenada"],["GT","Guatemala"],["GN","Guinea"],
  ["GW","Guinea-Bissau"],["GY","Guyana"],["HT","Haiti"],["HN","Honduras"],["HU","Hungary"],
  ["IS","Iceland"],["IN","India"],["ID","Indonesia"],["IR","Iran"],["IQ","Iraq"],
  ["IE","Ireland"],["IL","Israel"],["IT","Italy"],["JM","Jamaica"],["JP","Japan"],
  ["JO","Jordan"],["KZ","Kazakhstan"],["KE","Kenya"],["KI","Kiribati"],["KP","North Korea"],
  ["KR","South Korea"],["KW","Kuwait"],["KG","Kyrgyzstan"],["LA","Laos"],["LV","Latvia"],
  ["LB","Lebanon"],["LS","Lesotho"],["LR","Liberia"],["LY","Libya"],["LI","Liechtenstein"],
  ["LT","Lithuania"],["LU","Luxembourg"],["MG","Madagascar"],["MW","Malawi"],["MY","Malaysia"],
  ["MV","Maldives"],["ML","Mali"],["MT","Malta"],["MH","Marshall Islands"],["MR","Mauritania"],
  ["MU","Mauritius"],["MX","Mexico"],["FM","Micronesia"],["MD","Moldova"],["MC","Monaco"],
  ["MN","Mongolia"],["ME","Montenegro"],["MA","Morocco"],["MZ","Mozambique"],["MM","Myanmar"],
  ["NA","Namibia"],["NR","Nauru"],["NP","Nepal"],["NL","Netherlands"],["NZ","New Zealand"],
  ["NI","Nicaragua"],["NE","Niger"],["NG","Nigeria"],["MK","North Macedonia"],["NO","Norway"],
  ["OM","Oman"],["PK","Pakistan"],["PW","Palau"],["PA","Panama"],["PG","Papua New Guinea"],
  ["PY","Paraguay"],["PE","Peru"],["PH","Philippines"],["PL","Poland"],["PT","Portugal"],
  ["QA","Qatar"],["RO","Romania"],["RU","Russia"],["RW","Rwanda"],["KN","Saint Kitts and Nevis"],
  ["LC","Saint Lucia"],["VC","Saint Vincent and the Grenadines"],["WS","Samoa"],["SM","San Marino"],
  ["ST","Sao Tome and Principe"],["SA","Saudi Arabia"],["SN","Senegal"],["RS","Serbia"],["SC","Seychelles"],
  ["SL","Sierra Leone"],["SG","Singapore"],["SK","Slovakia"],["SI","Slovenia"],["SB","Solomon Islands"],
  ["SO","Somalia"],["ZA","South Africa"],["SS","South Sudan"],["ES","Spain"],["LK","Sri Lanka"],
  ["SD","Sudan"],["SR","Suriname"],["SE","Sweden"],["CH","Switzerland"],["SY","Syria"],
  ["TW","Taiwan"],["TJ","Tajikistan"],["TZ","Tanzania"],["TH","Thailand"],["TL","Timor-Leste"],
  ["TG","Togo"],["TO","Tonga"],["TT","Trinidad and Tobago"],["TN","Tunisia"],["TR","Turkey"],
  ["TM","Turkmenistan"],["TV","Tuvalu"],["UG","Uganda"],["UA","Ukraine"],["AE","United Arab Emirates"],
  ["GB","United Kingdom"],["US","United States"],["UY","Uruguay"],["UZ","Uzbekistan"],["VU","Vanuatu"],
  ["VA","Vatican City"],["VE","Venezuela"],["VN","Vietnam"],["YE","Yemen"],["ZM","Zambia"],
  ["ZW","Zimbabwe"],
];

// Egyptian Customs Authority — EG is the only ACTIVE jurisdiction at seed time.
const ACTIVE_COUNTRY_CODE = "EG";
const ACTIVE_CUSTOMS_AUTHORITY = "Egyptian Customs Authority";

// Gulf Cooperation Council members — they get parentJurisdictionId = GCC.
const GCC_MEMBERS = ["AE","SA","KW","QA","BH","OM"] as const;

// Deterministic IDs for customs territories / unions (so we can wire children
// deterministically without an extra round-trip — they're just TEXT primary keys).
const EU_ID  = "jur-fabric-EU";
const GCC_ID = "jur-fabric-GCC";

type JurisdictionSeed = {
  id?: string;            // optional deterministic id for territories/unions
  code: string;
  name: string;
  jurisdictionType: string;
  customsAuthority?: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const client = createClient({ url: TURSO_URL });

  // Sanity-check connectivity
  try {
    const ping = await client.execute("SELECT 1 AS ok");
    if (ping.rows[0]?.ok !== 1) throw new Error("SELECT 1 returned unexpected value");
    console.log("✓ Turso connection OK");
  } catch (err) {
    console.error("✗ Turso connection FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let tablesOk = 0;
  let tablesFailed = 0;
  let indexesOk = 0;
  let indexesFailed = 0;
  const failures: { table: string; phase: "table" | "index" | "seed"; sql: string; error: string }[] = [];

  // ----- 1. Create tables + indexes ------------------------------------
  for (const block of SCHEMA) {
    try {
      await client.execute(block.create);
      tablesOk++;
      console.log(`✓ table  ${block.table}`);
    } catch (err) {
      tablesFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: block.table, phase: "table", sql: block.create, error: msg });
      console.error(`✗ table  ${block.table} → ${msg}`);
      continue; // skip indexes if the table failed
    }

    for (const idxSql of block.indexes) {
      try {
        await client.execute(idxSql);
        indexesOk++;
        console.log(`  ✓ index ${idxSql.match(/ON\s+(\w+)\s*\(([^)]+)\)/)?.[0] ?? idxSql}`);
      } catch (err) {
        indexesFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ table: block.table, phase: "index", sql: idxSql, error: msg });
        console.error(`  ✗ index ${block.table} → ${msg}`);
      }
    }
  }

  // ----- 2. Build seed list: all countries + EU + GCC ----------------
  const seeds: JurisdictionSeed[] = [];

  for (const [code, name] of ISO_COUNTRIES) {
    const isActive = code === ACTIVE_COUNTRY_CODE;
    seeds.push({
      code,
      name,
      jurisdictionType: "COUNTRY",
      customsAuthority: isActive ? ACTIVE_CUSTOMS_AUTHORITY : null,
      status: isActive ? "ACTIVE" : "NOT_ACTIVE",
    });
  }

  // EU customs territory — parent = null
  seeds.push({
    id: EU_ID,
    code: "EU",
    name: "European Union (Customs Territory)",
    jurisdictionType: "CUSTOMS_TERRITORY",
    customsAuthority: "Directorate-General for Taxation and Customs Union (DG TAXUD)",
    status: "NOT_ACTIVE",
  });

  // GCC regional union — parent = null (children linked below)
  seeds.push({
    id: GCC_ID,
    code: "GCC",
    name: "Gulf Cooperation Council",
    jurisdictionType: "REGIONAL_UNION",
    customsAuthority: "GCC Customs Union Secretariat",
    status: "NOT_ACTIVE",
  });

  // ----- 3. Seed JurisdictionFabric via INSERT OR IGNORE -------------
  console.log("\n--- Seeding JurisdictionFabric ---");
  let seedInserted = 0;
  let seedSkipped = 0;
  let seedFailed = 0;

  const seedInsertSql = `INSERT OR IGNORE INTO JurisdictionFabric
    (id, code, name, jurisdictionType, customsAuthority, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

  for (const s of seeds) {
    try {
      const res = await client.execute({
        sql: seedInsertSql,
        args: [
          s.id ?? randomUUID(),
          s.code,
          s.name,
          s.jurisdictionType,
          s.customsAuthority ?? null,
          s.status,
        ],
      });
      if (res.rowsAffected > 0) {
        seedInserted++;
        console.log(`  ✓ seeded ${s.code.padEnd(3)} (${s.jurisdictionType.padEnd(18)} / ${s.status})`);
      } else {
        seedSkipped++;
        console.log(`  · skipped ${s.code.padEnd(3)} (already present)`);
      }
    } catch (err) {
      seedFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: "JurisdictionFabric", phase: "seed", sql: seedInsertSql, error: msg });
      console.error(`  ✗ seed ${s.code} → ${msg}`);
    }
  }

  // ----- 4. Wire GCC members → GCC parent ---------------------------
  console.log("\n--- Linking GCC members to GCC parent ---");
  let linked = 0;
  let linkFailed = 0;
  const linkSql = `UPDATE JurisdictionFabric
    SET parentJurisdictionId = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE code = ? AND parentJurisdictionId IS NULL`;

  for (const code of GCC_MEMBERS) {
    try {
      const res = await client.execute({ sql: linkSql, args: [GCC_ID, code] });
      if (res.rowsAffected > 0) {
        linked++;
        console.log(`  ✓ linked ${code} → GCC`);
      } else {
        console.log(`  · ${code} already linked (or row missing)`);
      }
    } catch (err) {
      linkFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: "JurisdictionFabric", phase: "seed", sql: linkSql, error: msg });
      console.error(`  ✗ link ${code} → GCC failed: ${msg}`);
    }
  }

  // ----- 5. Verification pass: tables exist --------------------------
  console.log("\n--- Verification ---");
  const existingTables = new Set<string>();
  try {
    const res = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
    );
    for (const row of res.rows) {
      if (typeof row.name === "string") existingTables.add(row.name);
    }
  } catch (err) {
    console.error("✗ Failed to read sqlite_master:", err instanceof Error ? err.message : err);
  }

  let verified = 0;
  const missing: string[] = [];
  for (const block of SCHEMA) {
    if (existingTables.has(block.table)) verified++;
    else missing.push(block.table);
  }

  // ----- 6. Row-count verification -----------------------------------
  let totalRows = 0;
  let activeRows = 0;
  let euRows = 0;
  let gccRows = 0;
  let gccLinked = 0;

  try {
    const res = await client.execute(
      `SELECT
         COUNT(*) AS n,
         SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS a,
         SUM(CASE WHEN code='EU'  THEN 1 ELSE 0 END) AS eu,
         SUM(CASE WHEN code='GCC' THEN 1 ELSE 0 END) AS gcc,
         SUM(CASE WHEN parentJurisdictionId='${GCC_ID}' THEN 1 ELSE 0 END) AS gccLinked
       FROM JurisdictionFabric`
    );
    totalRows  = Number((res.rows[0] as any)?.n  ?? 0);
    activeRows = Number((res.rows[0] as any)?.a  ?? 0);
    euRows     = Number((res.rows[0] as any)?.eu ?? 0);
    gccRows    = Number((res.rows[0] as any)?.gcc ?? 0);
    gccLinked  = Number((res.rows[0] as any)?.gccLinked ?? 0);
  } catch (err) {
    console.error("✗ Failed to count JurisdictionFabric rows:", err instanceof Error ? err.message : err);
  }

  console.log("\n======================== SUMMARY ========================");
  console.log(`Models targeted      : ${SCHEMA.length}`);
  console.log(`Tables created OK    : ${tablesOk}`);
  console.log(`Tables FAILED        : ${tablesFailed}`);
  console.log(`Indexes created OK   : ${indexesOk}`);
  console.log(`Indexes FAILED       : ${indexesFailed}`);
  console.log(`Verified on Turso    : ${verified}/${SCHEMA.length}`);
  if (missing.length) console.log(`Missing from Turso   : ${missing.join(", ")}`);
  console.log(`--- JurisdictionFabric seed ---`);
  console.log(`Seed rows inserted   : ${seedInserted}`);
  console.log(`Seed rows skipped    : ${seedSkipped} (already existed)`);
  console.log(`Seed rows FAILED     : ${seedFailed}`);
  console.log(`GCC members linked   : ${linked}  (failed: ${linkFailed})`);
  console.log(`Total rows           : ${totalRows}`);
  console.log(`Active rows          : ${activeRows}`);
  console.log(`EU territory rows    : ${euRows}`);
  console.log(`GCC union rows       : ${gccRows}`);
  console.log(`GCC child links      : ${gccLinked} (expect 6)`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - [${f.phase}] ${f.table}: ${f.error}`);
    }
  }
  console.log("========================================================");

  client.close();
  process.exit(
    tablesFailed === 0 && missing.length === 0 && seedFailed === 0 && linkFailed === 0
      ? 0
      : 1
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
