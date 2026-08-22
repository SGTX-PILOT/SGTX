/**
 * Phase 10 — Create the 2 new Turso tables directly via libsql.
 * Tables: E2ETradeGraphValidation, ProductionReadinessReport.
 * Minimal — no new major architecture, just the verification + reporting layer.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. E2ETradeGraphValidation
  `CREATE TABLE IF NOT EXISTS E2ETradeGraphValidation (
    id TEXT PRIMARY KEY NOT NULL,
    validationId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    step1Trade BOOLEAN NOT NULL DEFAULT 0,
    step2Order BOOLEAN NOT NULL DEFAULT 0,
    step3Contract BOOLEAN NOT NULL DEFAULT 0,
    step4Regulatory BOOLEAN NOT NULL DEFAULT 0,
    step5Documents BOOLEAN NOT NULL DEFAULT 0,
    step6Licenses BOOLEAN NOT NULL DEFAULT 0,
    step7Permits BOOLEAN NOT NULL DEFAULT 0,
    step8Certificates BOOLEAN NOT NULL DEFAULT 0,
    step9Booking BOOLEAN NOT NULL DEFAULT 0,
    step10ExportCustoms BOOLEAN NOT NULL DEFAULT 0,
    step11Transport BOOLEAN NOT NULL DEFAULT 0,
    step12Transit BOOLEAN NOT NULL DEFAULT 0,
    step13ImportCustoms BOOLEAN NOT NULL DEFAULT 0,
    step14Tax BOOLEAN NOT NULL DEFAULT 0,
    step15Release BOOLEAN NOT NULL DEFAULT 0,
    step16Delivery BOOLEAN NOT NULL DEFAULT 0,
    step17Acceptance BOOLEAN NOT NULL DEFAULT 0,
    step18Settlement BOOLEAN NOT NULL DEFAULT 0,
    step19Accounting BOOLEAN NOT NULL DEFAULT 0,
    step20Claims BOOLEAN NOT NULL DEFAULT 0,
    step21PostClearance BOOLEAN NOT NULL DEFAULT 0,
    step22Evidence BOOLEAN NOT NULL DEFAULT 0,
    step23UstnClosed BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    completedSteps INTEGER NOT NULL DEFAULT 0,
    totalSteps INTEGER NOT NULL DEFAULT 23,
    failedSteps TEXT,
    transportMode TEXT,
    multimodalLegs TEXT,
    originCountry TEXT,
    destinationCountry TEXT,
    transitCountries TEXT,
    startedAt DATETIME, completedAt DATETIME, duration INTEGER,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_e2e_ustn ON E2ETradeGraphValidation(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_e2e_status ON E2ETradeGraphValidation(status)`,
  `CREATE INDEX IF NOT EXISTS idx_e2e_mode ON E2ETradeGraphValidation(transportMode)`,

  // 2. ProductionReadinessReport
  `CREATE TABLE IF NOT EXISTS ProductionReadinessReport (
    id TEXT PRIMARY KEY NOT NULL,
    reportId TEXT NOT NULL UNIQUE,
    implementedModules TEXT,
    activeJurisdictions TEXT,
    inactiveJurisdictions TEXT,
    activeConnectors TEXT,
    missingConnectors TEXT,
    sandboxConnectors TEXT,
    portalOnlyIntegrations TEXT,
    manualOnlyIntegrations TEXT,
    governmentApprovalsRequired TEXT,
    credentialsRequired TEXT,
    certificationsRequired TEXT,
    legalAgreementsRequired TEXT,
    transportIntegrations TEXT,
    bankIntegrations TEXT,
    erpIntegrations TEXT,
    insuranceIntegrations TEXT,
    customsIntegrations TEXT,
    taxIntegrations TEXT,
    spsTbtIntegrations TEXT,
    outstandingBlockers TEXT,
    testResults TEXT,
    securityResults TEXT,
    deploymentResults TEXT,
    overallReadiness TEXT NOT NULL DEFAULT 'INTEGRATION_REQUIRED',
    readinessScore REAL NOT NULL DEFAULT 0,
    terminology TEXT NOT NULL DEFAULT 'CORRECT',
    generatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    generatedBy TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prr_id ON ProductionReadinessReport(reportId)`,
  `CREATE INDEX IF NOT EXISTS idx_prr_readiness ON ProductionReadinessReport(overallReadiness)`,
  `CREATE INDEX IF NOT EXISTS idx_prr_gen ON ProductionReadinessReport(generatedAt)`,
]

async function main() {
  console.log(`[phase10] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase10] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase10] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('E2ETradeGraphValidation','ProductionReadinessReport') ORDER BY name`
  )
  console.log(`[phase10] Phase 10 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase10] FATAL', e); process.exit(1) })
