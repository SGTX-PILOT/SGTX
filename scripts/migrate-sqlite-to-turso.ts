/**
 * TURSO-DATA-MIGRATION
 * -------------------
 * Migrate ALL data from the local SQLite file (db/custom.db) to the Turso
 * remote database. Uses @libsql/client for BOTH the source (file: URL) and
 * the destination (libsql:// URL).
 *
 * Properties:
 *  - Idempotent: uses INSERT OR REPLACE so re-running produces the same state.
 *    (REPLACE chosen over IGNORE so stale Turso rows are overwritten with the
 *    source-of-truth local data. Per task instructions, IGNORE is also OK;
 *    REPLACE was chosen for stronger consistency on rows that already exist.)
 *  - Resilient: per-table try/catch — a single table failure does not abort
 *    the whole migration.
 *  - Chunked reads: 500 rows per SELECT (LIMIT/OFFSET).
 *  - Batched inserts: 100 statements per libsql batch() call (single txn).
 *  - Parameterized: all values are bound args — NEVER string-interpolated.
 *  - Column quoting: every column name is wrapped in double quotes so reserved
 *    words (e.g. "order", "limit", "select") are safe.
 *
 * Usage:
 *   cd /home/z/my-project && bun run scripts/migrate-sqlite-to-turso.ts
 */

import { createClient, type InStatement, type InArgs } from "@libsql/client";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Load .env (the project's .env holds DATABASE_URL with the embedded authToken)
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
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnvFile("/home/z/my-project/.env");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SQLITE_FILE = "/home/z/my-project/db/custom.db";
const READ_CHUNK = 500;
const INSERT_BATCH = 100;

if (!fs.existsSync(SQLITE_FILE)) {
  console.error(`FATAL: local SQLite file not found at ${SQLITE_FILE}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set in environment");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Open clients
// ---------------------------------------------------------------------------
const local = createClient({ url: `file:${SQLITE_FILE}` });
const turso = createClient({ url: process.env.DATABASE_URL });

console.log("=".repeat(72));
console.log("SQLite -> Turso migration");
console.log("=".repeat(72));
console.log(`Source: file:${SQLITE_FILE}`);
console.log(`Dest:   ${process.env.DATABASE_URL.replace(/authToken=[^&]+/, "authToken=***")}`);
console.log();

// ---------------------------------------------------------------------------
// Enumerate tables from the local SQLite file (the source of truth).
// Skip SQLite internal tables and the Prisma migrations bookkeeping table.
// ---------------------------------------------------------------------------
const tablesRes = await local.execute(
  "SELECT name FROM sqlite_master WHERE type='table' " +
    "AND name NOT LIKE 'sqlite_%' " +
    "AND name != '_prisma_migrations' " +
    "ORDER BY name"
);
const tables: string[] = tablesRes.rows.map((r) => r.name as string);
console.log(`Found ${tables.length} tables in local SQLite.\n`);

// ---------------------------------------------------------------------------
// Migration loop
// ---------------------------------------------------------------------------
let tablesMigrated = 0;
let tablesEmpty = 0;
let totalRowsMigrated = 0;
const errors: string[] = [];
const summary: { table: string; localRows: number; migrated: number }[] = [];

for (const table of tables) {
  try {
    // 1. Get column list (skip tables with no columns — should never happen).
    const colsRes = await local.execute(`PRAGMA table_info("${table}")`);
    const columns = colsRes.rows.map((r) => r.name as string);
    if (columns.length === 0) {
      console.log(`[${table}] no columns, skipping`);
      continue;
    }

    const quotedCols = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    // INSERT OR REPLACE = idempotent. Existing PK/unique rows are overwritten
    // with the source-of-truth values from local SQLite.
    const insertSql = `INSERT OR REPLACE INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;

    // 2. Get total row count to drive the chunk loop.
    const countRes = await local.execute(`SELECT count(*) AS c FROM "${table}"`);
    const total = Number(countRes.rows[0].c);
    if (total === 0) {
      tablesEmpty++;
      summary.push({ table, localRows: 0, migrated: 0 });
      console.log(`[${table}] 0 rows — skipping (empty)`);
      continue;
    }

    // 3. Read rows in chunks of READ_CHUNK and insert in batches of INSERT_BATCH.
    let offset = 0;
    let migrated = 0;
    let chunkIndex = 0;
    while (true) {
      // Retry the local read a few times in case of "database is locked".
      let readRes;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          readRes = await local.execute({
            sql: `SELECT * FROM "${table}" LIMIT ${READ_CHUNK} OFFSET ${offset}`,
            args: [],
          });
          lastErr = null;
          break;
        } catch (e: unknown) {
          lastErr = e;
          await sleep(50 * (attempt + 1));
        }
      }
      if (lastErr) throw lastErr;
      if (!readRes || readRes.rows.length === 0) break;

      const rows = readRes.rows;

      // 4. Build INSERT batches of INSERT_BATCH rows and execute as a
      // single transaction via turso.batch().
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const slice = rows.slice(i, i + INSERT_BATCH);
        const stmts: InStatement[] = slice.map((row) => {
          const args: InArgs = columns.map((c) => {
            const v = (row as Record<string, unknown>)[c];
            // libsql returns values as: number | bigint | string | Uint8Array | null.
            // All of these are accepted as-is by the libsql client when binding.
            // BigInt (large INTEGERs) and Uint8Array (BLOBs) pass through directly.
            return v as never;
          });
          return { sql: insertSql, args };
        });
        await turso.batch(stmts);
      }

      migrated += rows.length;
      offset += READ_CHUNK;
      chunkIndex++;
      // Progress log for very large tables (e.g. WorldwidePortRoute).
      if (total > READ_CHUNK) {
        process.stdout.write(
          `\r[${table}] progress ${migrated}/${total} (${chunkIndex} chunks)`
        );
      }
    }
    if (total > READ_CHUNK) process.stdout.write("\n");

    tablesMigrated++;
    totalRowsMigrated += migrated;
    summary.push({ table, localRows: total, migrated });
    console.log(`[${table}] migrated ${migrated} rows`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const full = `[${table}] FAILED: ${msg.slice(0, 300)}`;
    errors.push(full);
    console.error(full);
  }
}

console.log();
console.log("=".repeat(72));
console.log("Migration Summary");
console.log("=".repeat(72));
console.log(`Tables with data migrated: ${tablesMigrated}`);
console.log(`Tables empty (0 rows locally): ${tablesEmpty}`);
console.log(`Total rows migrated: ${totalRowsMigrated}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  console.log("\nErrors:");
  for (const e of errors) console.log(`  ${e}`);
}

// ---------------------------------------------------------------------------
// Verification — count rows on Turso for every migrated table.
// ---------------------------------------------------------------------------
console.log();
console.log("=".repeat(72));
console.log("Turso Verification (per-table row counts)");
console.log("=".repeat(72));
let totalOnTurso = 0;
let mismatches = 0;
const verifications: {
  table: string;
  localRows: number;
  tursoRows: number;
  match: boolean;
}[] = [];

for (const { table, localRows } of summary) {
  try {
    const r = await turso.execute(`SELECT count(*) AS c FROM "${table}"`);
    const tursoRows = Number(r.rows[0].c);
    totalOnTurso += tursoRows;
    const match = tursoRows === localRows;
    if (!match) mismatches++;
    verifications.push({ table, localRows, tursoRows, match });
    const tag = match ? "OK" : `MISMATCH (local=${localRows})`;
    if (tursoRows > 0 || localRows > 0) {
      console.log(`  ${table.padEnd(40)} turso=${tursoRows.toString().padStart(7)}  ${tag}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ${table}: VERIFY FAILED: ${msg.slice(0, 200)}`);
    verifications.push({ table, localRows, tursoRows: -1, match: false });
    mismatches++;
  }
}

console.log();
console.log(`Total rows on Turso:        ${totalOnTurso}`);
console.log(`Total rows migrated:       ${totalRowsMigrated}`);
console.log(`Mismatches (turso!=local): ${mismatches}`);

// ---------------------------------------------------------------------------
// Key-table spot-check (per task requirements).
// ---------------------------------------------------------------------------
console.log();
console.log("=".repeat(72));
console.log("Key-table spot-check");
console.log("=".repeat(72));
const keyTables = [
  "WorldwidePortRoute",
  "ShippingSchedule",
  "Tenant",
  "Employee",
  "Trade",
  "Shipment",
  "Invoice",
  "InboxItem",
  "FineTuningExample",
  "GlobalMarketPrice",
  "AgriCommodityPrice",
  "NowlunFreightRate",
  "Document",
  "IntegrationHealth",
];
for (const t of keyTables) {
  const found = verifications.find((v) => v.table === t);
  if (found) {
    console.log(
      `  ${t.padEnd(28)} local=${found.localRows.toString().padStart(6)}  turso=${found.tursoRows.toString().padStart(6)}  ${found.match ? "OK" : "MISMATCH"}`
    );
  } else {
    console.log(`  ${t.padEnd(28)} (not in local DB)`);
  }
}

// ---------------------------------------------------------------------------
// Write a JSON report to disk for downstream tooling.
// ---------------------------------------------------------------------------
const reportPath = "/home/z/my-project/scripts/migrate-sqlite-to-turso.report.json";
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      tablesProcessed: tables.length,
      tablesMigrated,
      tablesEmpty,
      totalRowsMigrated,
      totalRowsOnTurso: totalOnTurso,
      errors,
      verifications,
    },
    null,
    2
  )
);
console.log(`\nFull JSON report written to: ${reportPath}`);

await local.close();
await turso.close();

// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
