/**
 * CREATE-ENGINE-TABLES-AND-LIBS — Part XI-XVI: Trade Cost Engine + Payment
 * Evidence + Dynamic Cost Accrual (CCL-009)
 * ---------------------------------------------------------------------------
 * Creates the 5 Prisma models declared at the end of `prisma/schema.prisma`:
 *
 *   • TradeCostObligation   (Part XI  — Trade Cost Obligation Ledger)
 *   • PaymentEvent          (Part XII — Payment Event Stream)
 *   • PaymentEvidence       (Part XIII— Payment Evidence Vault)
 *   • ReeferPowerTracking   (Part XV  — Reefer Power Cost Accrual)
 *   • TradeEvent            (Part XVI — Trade Event Hash-Chain Graph)
 *
 * Why not `prisma db push`? Prisma db push would also drop/recreate shadow
 * tables and is harder to make idempotent on a shared Turso instance. This
 * script uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
 * so it can be safely re-run.
 *
 * Type mapping (Prisma → SQLite/Turso):
 *   String    → TEXT
 *   Int       → INTEGER
 *   Float     → REAL
 *   Boolean   → BOOLEAN  (SQLite type affinity = INTEGER; stored as 0/1)
 *   DateTime  → DATETIME
 *
 * Defaults:
 *   @default(now())                 → DEFAULT CURRENT_TIMESTAMP
 *   @default(true) / @default(false) → DEFAULT 1 / DEFAULT 0
 *   @default("...")                  → DEFAULT 'literal'
 *   @default(0) / @default(5)         → DEFAULT 0 / DEFAULT 5
 *   @id @default(cuid())              → TEXT PRIMARY KEY
 *
 * Constraints:
 *   @@index([a, b]) → CREATE INDEX IF NOT EXISTS ON table(a, b)
 *
 * IMPORTANT: A stale `DATABASE_URL=file:...` shell export can override .env.
 * To avoid that, we hard-code the Turso URL/token here and re-set
 * process.env.DATABASE_URL. The inline token always wins.
 *
 * Usage:
 *   cd /home/z/my-project
 *   bun run scripts/create-engine-tables.ts
 */

import { createClient } from "@libsql/client";

// ---------------------------------------------------------------------------
// Force Turso URL — ignore any stale shell `DATABASE_URL=file:...` export.
// NOTE: `@libsql/client`'s createClient() expects the `authToken` as a SEPARATE
// config field (see scripts/create-addon-tables.ts for the working pattern).
// ---------------------------------------------------------------------------
const TURSO_TOKEN =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";
const TURSO_URL = "libsql://sgtx-fortleem.aws-us-east-1.turso.io";

// Also override the env var so any nested Prisma calls hit Turso, not a file.
// In this script we never import Prisma directly, so this is defensive only.
process.env.DATABASE_URL = `${TURSO_URL}?authToken=${TURSO_TOKEN}`;
process.env.TURSO_LIBSQL_URL = process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Schema definitions — mirror the last 5 models in prisma/schema.prisma
// (rows 5168-5281). Field order + indexes match the Prisma declarations.
// ---------------------------------------------------------------------------
type DdlBlock = { table: string; create: string; indexes: string[] };

const SCHEMA: DdlBlock[] = [
  // ----- Part XI: Trade Cost Obligation Ledger -----
  {
    table: "TradeCostObligation",
    create: `CREATE TABLE IF NOT EXISTS TradeCostObligation (
  id                TEXT PRIMARY KEY,
  ustn              TEXT,
  obligationType    TEXT NOT NULL,
  recipientClass    TEXT NOT NULL,
  amount            REAL NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  payer             TEXT,
  payee             TEXT,
  dueDate           DATETIME,
  calculationMethod TEXT,
  tariffSource      TEXT,
  costState         TEXT NOT NULL DEFAULT 'ESTIMATED',
  incotermDriven    BOOLEAN NOT NULL DEFAULT 1,
  createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS TradeCostObligation_ustn_idx ON TradeCostObligation(ustn)",
      "CREATE INDEX IF NOT EXISTS TradeCostObligation_obligationType_idx ON TradeCostObligation(obligationType)",
      "CREATE INDEX IF NOT EXISTS TradeCostObligation_costState_idx ON TradeCostObligation(costState)",
    ],
  },

  // ----- Part XII: Payment Event Stream -----
  {
    table: "PaymentEvent",
    create: `CREATE TABLE IF NOT EXISTS PaymentEvent (
  id                  TEXT PRIMARY KEY,
  ustn                TEXT,
  obligationId        TEXT,
  bankTransactionRef  TEXT,
  amount              REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  payer               TEXT,
  beneficiary         TEXT,
  executionDate       DATETIME,
  valueDate           DATETIME,
  status              TEXT NOT NULL DEFAULT 'INITIATED',
  evidenceReference   TEXT,
  evidenceConfidence  INTEGER,
  reconciliationState TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS PaymentEvent_ustn_idx ON PaymentEvent(ustn)",
      "CREATE INDEX IF NOT EXISTS PaymentEvent_status_idx ON PaymentEvent(status)",
      "CREATE INDEX IF NOT EXISTS PaymentEvent_obligationId_idx ON PaymentEvent(obligationId)",
    ],
  },

  // ----- Part XIII: Payment Evidence Vault -----
  {
    table: "PaymentEvidence",
    create: `CREATE TABLE IF NOT EXISTS PaymentEvidence (
  id              TEXT PRIMARY KEY,
  ustn            TEXT,
  paymentEventId  TEXT,
  evidenceType    TEXT NOT NULL,
  evidenceHash    TEXT,
  evidenceUrl     TEXT,
  payer           TEXT,
  beneficiary     TEXT,
  bankName        TEXT,
  amount          REAL NOT NULL,
  currency        TEXT,
  executionDate   DATETIME,
  valueDate       DATETIME,
  paymentStatus   TEXT,
  bankReference   TEXT,
  source          TEXT,
  confidenceLevel INTEGER NOT NULL DEFAULT 5,
  verified        BOOLEAN NOT NULL DEFAULT 0,
  verifiedAt      DATETIME,
  verifiedBy      TEXT,
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS PaymentEvidence_ustn_idx ON PaymentEvidence(ustn)",
      "CREATE INDEX IF NOT EXISTS PaymentEvidence_paymentEventId_idx ON PaymentEvidence(paymentEventId)",
      "CREATE INDEX IF NOT EXISTS PaymentEvidence_confidenceLevel_idx ON PaymentEvidence(confidenceLevel)",
    ],
  },

  // ----- Part XV: Reefer Power Cost Accrual -----
  {
    table: "ReeferPowerTracking",
    create: `CREATE TABLE IF NOT EXISTS ReeferPowerTracking (
  id               TEXT PRIMARY KEY,
  ustn             TEXT NOT NULL,
  containerNumber  TEXT NOT NULL,
  carrierGtid      TEXT,
  terminalGtid     TEXT,
  plugInRequired   BOOLEAN NOT NULL DEFAULT 1,
  powerStartAt     DATETIME,
  powerEndAt       DATETIME,
  chargeableHours  INTEGER NOT NULL DEFAULT 0,
  chargeableDays   INTEGER NOT NULL DEFAULT 0,
  applicableTariff REAL,
  monitoringCharge  REAL,
  additionalCharges REAL,
  totalAmount      REAL NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  obligationId     TEXT,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ReeferPowerTracking_ustn_idx ON ReeferPowerTracking(ustn)",
      "CREATE INDEX IF NOT EXISTS ReeferPowerTracking_containerNumber_idx ON ReeferPowerTracking(containerNumber)",
      "CREATE INDEX IF NOT EXISTS ReeferPowerTracking_status_idx ON ReeferPowerTracking(status)",
    ],
  },

  // ----- Part XVI: Trade Event Hash-Chain Graph -----
  {
    table: "TradeEvent",
    create: `CREATE TABLE IF NOT EXISTS TradeEvent (
  id               TEXT PRIMARY KEY,
  ustn             TEXT,
  eventType        TEXT NOT NULL,
  eventDescription TEXT,
  eventMetadata    TEXT,
  actorGtid        TEXT,
  source           TEXT,
  previousHash     TEXT,
  eventHash        TEXT,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS TradeEvent_ustn_idx ON TradeEvent(ustn)",
      "CREATE INDEX IF NOT EXISTS TradeEvent_eventType_idx ON TradeEvent(eventType)",
      "CREATE INDEX IF NOT EXISTS TradeEvent_createdAt_idx ON TradeEvent(createdAt)",
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  console.log("=== CREATE-ENGINE-TABLES-AND-LIBS (CCL-009) ===");
  console.log(`Target: ${TURSO_URL} (authToken ***)`);
  console.log(`Models targeted: ${SCHEMA.length}\n`);

  // Sanity ping
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
  const failures: { table: string; phase: "table" | "index"; sql: string; error: string }[] = [];

  for (const block of SCHEMA) {
    // Create table
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

    // Create indexes
    for (const idxSql of block.indexes) {
      try {
        await client.execute(idxSql);
        indexesOk++;
        const match = idxSql.match(/ON\s+(\w+)\s*\(([^)]+)\)/);
        console.log(`  ✓ index ${match ? match[0] : idxSql}`);
      } catch (err) {
        indexesFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ table: block.table, phase: "index", sql: idxSql, error: msg });
        console.error(`  ✗ index ${block.table} → ${msg}`);
      }
    }
  }

  // ----- Verification pass: confirm each table actually exists -----
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

  // Also confirm index count per table
  console.log("\n--- Index verification ---");
  for (const block of SCHEMA) {
    if (!existingTables.has(block.table)) continue;
    try {
      const res = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${block.table}' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      const idxNames = res.rows.map((r) => r.name).filter(Boolean) as string[];
      console.log(`  ${block.table}: ${idxNames.length} index(es) → ${idxNames.join(", ") || "(none)"}`);
    } catch {
      /* ignore */
    }
  }

  console.log("\n======================== SUMMARY ========================");
  console.log(`Models targeted      : ${SCHEMA.length}`);
  console.log(`Tables created OK   : ${tablesOk}`);
  console.log(`Tables FAILED       : ${tablesFailed}`);
  console.log(`Indexes created OK  : ${indexesOk}`);
  console.log(`Indexes FAILED      : ${indexesFailed}`);
  console.log(`Verified on Turso   : ${verified}/${SCHEMA.length}`);
  if (missing.length) console.log(`Missing from Turso  : ${missing.join(", ")}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - [${f.phase}] ${f.table}: ${f.error}`);
    }
  }
  console.log("========================================================");

  client.close();
  process.exit(tablesFailed === 0 && missing.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
