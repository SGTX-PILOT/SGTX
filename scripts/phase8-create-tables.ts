/**
 * Phase 8 — Create the 5 new Turso tables directly via libsql.
 * Tables: IntegrationCatalog, IntegrationGapRecord, CountryReadiness,
 * TradeLaneReadiness, IntegrationAlert.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. IntegrationCatalog
  `CREATE TABLE IF NOT EXISTS IntegrationCatalog (
    id TEXT PRIMARY KEY NOT NULL,
    connectorId TEXT NOT NULL UNIQUE,
    jurisdictionCode TEXT NOT NULL,
    authority TEXT NOT NULL,
    systemName TEXT NOT NULL,
    procedure TEXT,
    transportMode TEXT,
    integrationType TEXT NOT NULL,
    purpose TEXT,
    officialUrl TEXT, apiUrl TEXT, ediUrl TEXT, portalUrl TEXT,
    documentationUrl TEXT, sandboxUrl TEXT,
    authentication TEXT,
    certificateRequirement TEXT,
    legalAgreement TEXT,
    certification TEXT,
    productionRequirements TEXT,
    status TEXT NOT NULL DEFAULT 'NOT_DISCOVERED',
    priority INTEGER NOT NULL DEFAULT 50,
    owner TEXT,
    lastVerifiedAt DATETIME,
    version TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (jurisdictionCode, authority, systemName, procedure, transportMode, integrationType)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ic_jur ON IntegrationCatalog(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_ic_auth ON IntegrationCatalog(authority)`,
  `CREATE INDEX IF NOT EXISTS idx_ic_sys ON IntegrationCatalog(systemName)`,
  `CREATE INDEX IF NOT EXISTS idx_ic_status ON IntegrationCatalog(status)`,
  `CREATE INDEX IF NOT EXISTS idx_ic_type ON IntegrationCatalog(integrationType)`,
  `CREATE INDEX IF NOT EXISTS idx_ic_mode ON IntegrationCatalog(transportMode)`,

  // 2. IntegrationGapRecord
  `CREATE TABLE IF NOT EXISTS IntegrationGapRecord (
    id TEXT PRIMARY KEY NOT NULL,
    gapId TEXT NOT NULL UNIQUE,
    jurisdictionCode TEXT NOT NULL,
    authority TEXT NOT NULL,
    procedure TEXT,
    transportMode TEXT,
    systemName TEXT,
    required BOOLEAN NOT NULL DEFAULT 1,
    apiAvailable BOOLEAN NOT NULL DEFAULT 0,
    ediAvailable BOOLEAN NOT NULL DEFAULT 0,
    portalAvailable BOOLEAN NOT NULL DEFAULT 0,
    documentationAvailable BOOLEAN NOT NULL DEFAULT 0,
    credentialsRequired BOOLEAN NOT NULL DEFAULT 0,
    sandboxRequired BOOLEAN NOT NULL DEFAULT 0,
    certificationRequired BOOLEAN NOT NULL DEFAULT 0,
    legalAgreementRequired BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'MISSING',
    priority INTEGER NOT NULL DEFAULT 50,
    affectedTradeLanes TEXT,
    affectedUstns TEXT,
    owner TEXT,
    nextAction TEXT,
    dueDate DATETIME,
    source TEXT,
    evidence TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_igr_jur ON IntegrationGapRecord(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_igr_auth ON IntegrationGapRecord(authority)`,
  `CREATE INDEX IF NOT EXISTS idx_igr_status ON IntegrationGapRecord(status)`,
  `CREATE INDEX IF NOT EXISTS idx_igr_priority ON IntegrationGapRecord(priority)`,
  `CREATE INDEX IF NOT EXISTS idx_igr_due ON IntegrationGapRecord(dueDate)`,

  // 3. CountryReadiness
  `CREATE TABLE IF NOT EXISTS CountryReadiness (
    id TEXT PRIMARY KEY NOT NULL,
    countryCode TEXT NOT NULL,
    countryName TEXT,
    dimension TEXT NOT NULL,
    readinessLevel TEXT NOT NULL DEFAULT 'MISSING',
    connectedCount INTEGER NOT NULL DEFAULT 0,
    partialCount INTEGER NOT NULL DEFAULT 0,
    manualCount INTEGER NOT NULL DEFAULT 0,
    missingCount INTEGER NOT NULL DEFAULT 0,
    readinessScore REAL NOT NULL DEFAULT 0,
    lastAssessedAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (countryCode, dimension)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cr_country ON CountryReadiness(countryCode)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_dim ON CountryReadiness(dimension)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_level ON CountryReadiness(readinessLevel)`,

  // 4. TradeLaneReadiness
  `CREATE TABLE IF NOT EXISTS TradeLaneReadiness (
    id TEXT PRIMARY KEY NOT NULL,
    laneId TEXT NOT NULL UNIQUE,
    originCountry TEXT NOT NULL,
    destinationCountry TEXT NOT NULL,
    transitCountries TEXT,
    commodity TEXT,
    hs6 TEXT,
    transportMode TEXT,
    regulatoryReadiness TEXT NOT NULL DEFAULT 'MISSING',
    documentReadiness TEXT NOT NULL DEFAULT 'MISSING',
    customsReadiness TEXT NOT NULL DEFAULT 'MISSING',
    transportReadiness TEXT NOT NULL DEFAULT 'MISSING',
    governmentConnectivity TEXT NOT NULL DEFAULT 'MISSING',
    manualTouchpoints INTEGER NOT NULL DEFAULT 0,
    missingIntegrations INTEGER NOT NULL DEFAULT 0,
    blockers TEXT,
    overallReadiness REAL NOT NULL DEFAULT 0,
    lastAssessedAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tlr_orig_dest ON TradeLaneReadiness(originCountry, destinationCountry)`,
  `CREATE INDEX IF NOT EXISTS idx_tlr_mode ON TradeLaneReadiness(transportMode)`,
  `CREATE INDEX IF NOT EXISTS idx_tlr_hs6 ON TradeLaneReadiness(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_tlr_overall ON TradeLaneReadiness(overallReadiness)`,

  // 5. IntegrationAlert
  `CREATE TABLE IF NOT EXISTS IntegrationAlert (
    id TEXT PRIMARY KEY NOT NULL,
    alertId TEXT NOT NULL UNIQUE,
    alertType TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'WARN',
    jurisdictionCode TEXT,
    authority TEXT,
    systemName TEXT,
    connectorId TEXT,
    laneId TEXT,
    title TEXT NOT NULL,
    description TEXT,
    actionRequired TEXT,
    dueDate DATETIME,
    status TEXT NOT NULL DEFAULT 'OPEN',
    acknowledgedBy TEXT,
    acknowledgedAt DATETIME,
    resolvedBy TEXT,
    resolvedAt DATETIME,
    resolutionNotes TEXT,
    affectedUstns TEXT,
    source TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ia_type ON IntegrationAlert(alertType)`,
  `CREATE INDEX IF NOT EXISTS idx_ia_sev ON IntegrationAlert(severity)`,
  `CREATE INDEX IF NOT EXISTS idx_ia_status ON IntegrationAlert(status)`,
  `CREATE INDEX IF NOT EXISTS idx_ia_jur ON IntegrationAlert(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_ia_conn ON IntegrationAlert(connectorId)`,
  `CREATE INDEX IF NOT EXISTS idx_ia_due ON IntegrationAlert(dueDate)`,
]

async function main() {
  console.log(`[phase8] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase8] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase8] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('IntegrationCatalog','IntegrationGapRecord','CountryReadiness','TradeLaneReadiness','IntegrationAlert') ORDER BY name`
  )
  console.log(`[phase8] Phase 8 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase8] FATAL', e); process.exit(1) })
