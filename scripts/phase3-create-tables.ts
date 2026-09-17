/**
 * Phase 3 — Create the 8 new Turso tables directly via libsql.
 * Tables:
 *   - TradeLicense
 *   - TradePermit
 *   - RegulatoryCertificate
 *   - SpsRequirement
 *   - TbtRequirement
 *   - ControlledGoodsControl
 *   - SanctionsScreening
 *   - ComplianceConnector
 * Idempotent: CREATE TABLE IF NOT EXISTS.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. TradeLicense
  `CREATE TABLE IF NOT EXISTS TradeLicense (
    id TEXT PRIMARY KEY NOT NULL,
    licenseType TEXT NOT NULL,
    hs6 TEXT,
    productName TEXT,
    jurisdictionId TEXT,
    originCountry TEXT,
    destCountry TEXT,
    applicantGtid TEXT,
    issuingAuthority TEXT,
    licenseNumber TEXT,
    state TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    validFrom DATETIME,
    validUntil DATETIME,
    quantityAuthorized REAL,
    quantityUnit TEXT,
    conditions TEXT,
    endUserStatement BOOLEAN NOT NULL DEFAULT 0,
    endUseCertificate BOOLEAN NOT NULL DEFAULT 0,
    sourceId TEXT,
    connectorId TEXT,
    appliedAt DATETIME,
    issuedAt DATETIME,
    expiresAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tl_type ON TradeLicense(licenseType)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_state ON TradeLicense(state)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_hs6 ON TradeLicense(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_jur ON TradeLicense(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_applicant ON TradeLicense(applicantGtid)`,

  // 2. TradePermit
  `CREATE TABLE IF NOT EXISTS TradePermit (
    id TEXT PRIMARY KEY NOT NULL,
    permitType TEXT NOT NULL,
    hs6 TEXT,
    productName TEXT,
    jurisdictionId TEXT,
    originCountry TEXT,
    destCountry TEXT,
    applicantGtid TEXT,
    issuingAuthority TEXT,
    permitNumber TEXT,
    state TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    validFrom DATETIME,
    validUntil DATETIME,
    scopeNotes TEXT,
    conditions TEXT,
    sourceId TEXT,
    connectorId TEXT,
    appliedAt DATETIME,
    issuedAt DATETIME,
    expiresAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tp_type ON TradePermit(permitType)`,
  `CREATE INDEX IF NOT EXISTS idx_tp_state ON TradePermit(state)`,
  `CREATE INDEX IF NOT EXISTS idx_tp_hs6 ON TradePermit(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_tp_jur ON TradePermit(jurisdictionId)`,

  // 3. RegulatoryCertificate
  `CREATE TABLE IF NOT EXISTS RegulatoryCertificate (
    id TEXT PRIMARY KEY NOT NULL,
    certificateType TEXT NOT NULL,
    hs6 TEXT,
    productName TEXT,
    jurisdictionId TEXT,
    originCountry TEXT,
    destCountry TEXT,
    applicantGtid TEXT,
    issuingBody TEXT,
    certificateNumber TEXT,
    state TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    validFrom DATETIME,
    validUntil DATETIME,
    scopeNotes TEXT,
    attachments TEXT,
    sourceId TEXT,
    connectorId TEXT,
    appliedAt DATETIME,
    issuedAt DATETIME,
    expiresAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rc_type ON RegulatoryCertificate(certificateType)`,
  `CREATE INDEX IF NOT EXISTS idx_rc_state ON RegulatoryCertificate(state)`,
  `CREATE INDEX IF NOT EXISTS idx_rc_hs6 ON RegulatoryCertificate(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_rc_jur ON RegulatoryCertificate(jurisdictionId)`,

  // 4. SpsRequirement
  `CREATE TABLE IF NOT EXISTS SpsRequirement (
    id TEXT PRIMARY KEY NOT NULL,
    spsCategory TEXT NOT NULL,
    hs6 TEXT,
    commodity TEXT,
    originCountry TEXT,
    destCountry TEXT,
    seasonFrom TEXT,
    seasonTo TEXT,
    intendedUse TEXT,
    transportMode TEXT,
    jurisdictionId TEXT,
    requirementText TEXT,
    mandatoryActions TEXT,
    samplingRequired BOOLEAN NOT NULL DEFAULT 0,
    labTestRequired BOOLEAN NOT NULL DEFAULT 0,
    treatmentRequired TEXT,
    inspectionRequired BOOLEAN NOT NULL DEFAULT 0,
    quarantineDays INTEGER,
    mrlStandards TEXT,
    sourceId TEXT,
    connectorId TEXT,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    effectiveFrom DATETIME,
    effectiveUntil DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sps_cat ON SpsRequirement(spsCategory)`,
  `CREATE INDEX IF NOT EXISTS idx_sps_hs6 ON SpsRequirement(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_sps_orig_dest ON SpsRequirement(originCountry, destCountry)`,
  `CREATE INDEX IF NOT EXISTS idx_sps_jur ON SpsRequirement(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_sps_status ON SpsRequirement(legalStatus)`,

  // 5. TbtRequirement
  `CREATE TABLE IF NOT EXISTS TbtRequirement (
    id TEXT PRIMARY KEY NOT NULL,
    tbtCategory TEXT NOT NULL,
    hs6 TEXT,
    productName TEXT,
    jurisdictionId TEXT,
    standardReference TEXT,
    standardBody TEXT,
    requirementText TEXT,
    mandatoryStandards TEXT,
    labelingRules TEXT,
    testingRequired BOOLEAN NOT NULL DEFAULT 0,
    registrationRequired BOOLEAN NOT NULL DEFAULT 0,
    conformityBody TEXT,
    sourceId TEXT,
    connectorId TEXT,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    effectiveFrom DATETIME,
    effectiveUntil DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tbt_cat ON TbtRequirement(tbtCategory)`,
  `CREATE INDEX IF NOT EXISTS idx_tbt_hs6 ON TbtRequirement(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_tbt_jur ON TbtRequirement(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_tbt_status ON TbtRequirement(legalStatus)`,

  // 6. ControlledGoodsControl
  `CREATE TABLE IF NOT EXISTS ControlledGoodsControl (
    id TEXT PRIMARY KEY NOT NULL,
    controlCategory TEXT NOT NULL,
    hs6 TEXT,
    productName TEXT,
    casNumbers TEXT,
    controlListEntry TEXT,
    jurisdictionId TEXT,
    exportLicenseRequired BOOLEAN NOT NULL DEFAULT 1,
    importLicenseRequired BOOLEAN NOT NULL DEFAULT 0,
    transitControlRequired BOOLEAN NOT NULL DEFAULT 0,
    endUserStatementRequired BOOLEAN NOT NULL DEFAULT 1,
    endUseCertificateRequired BOOLEAN NOT NULL DEFAULT 1,
    reExportControl BOOLEAN NOT NULL DEFAULT 1,
    severity TEXT NOT NULL DEFAULT 'ENHANCED_DD',
    sourceId TEXT,
    connectorId TEXT,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    effectiveFrom DATETIME,
    effectiveUntil DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cgc_cat ON ControlledGoodsControl(controlCategory)`,
  `CREATE INDEX IF NOT EXISTS idx_cgc_hs6 ON ControlledGoodsControl(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_cgc_jur ON ControlledGoodsControl(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_cgc_sev ON ControlledGoodsControl(severity)`,
  `CREATE INDEX IF NOT EXISTS idx_cgc_status ON ControlledGoodsControl(legalStatus)`,

  // 7. SanctionsScreening
  `CREATE TABLE IF NOT EXISTS SanctionsScreening (
    id TEXT PRIMARY KEY NOT NULL,
    screeningType TEXT NOT NULL,
    screenedValue TEXT NOT NULL,
    matchedEntity TEXT,
    matchedList TEXT,
    matchScore REAL,
    ownershipPct REAL,
    uboChainDepth INTEGER,
    networkHits INTEGER NOT NULL DEFAULT 0,
    jurisdictionCode TEXT,
    verdict TEXT NOT NULL DEFAULT 'CONDITIONAL',
    reason TEXT,
    evidence TEXT,
    connectorId TEXT,
    screenedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ss_type ON SanctionsScreening(screeningType)`,
  `CREATE INDEX IF NOT EXISTS idx_ss_list ON SanctionsScreening(matchedList)`,
  `CREATE INDEX IF NOT EXISTS idx_ss_verdict ON SanctionsScreening(verdict)`,
  `CREATE INDEX IF NOT EXISTS idx_ss_jur ON SanctionsScreening(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_ss_value ON SanctionsScreening(screenedValue)`,

  // 8. ComplianceConnector
  `CREATE TABLE IF NOT EXISTS ComplianceConnector (
    id TEXT PRIMARY KEY NOT NULL,
    subsystem TEXT NOT NULL,
    jurisdictionId TEXT,
    jurisdictionCode TEXT,
    connectorName TEXT NOT NULL,
    connectorType TEXT NOT NULL,
    endpointUrl TEXT,
    apiKeyRequired BOOLEAN NOT NULL DEFAULT 0,
    apiKeyConfigured BOOLEAN NOT NULL DEFAULT 0,
    authMethod TEXT,
    status TEXT NOT NULL DEFAULT 'MISSING',
    lastSyncAt DATETIME,
    lastSyncStatus TEXT,
    lastError TEXT,
    coveragePct REAL NOT NULL DEFAULT 0,
    confidenceScore REAL,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (subsystem, jurisdictionCode)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cc_sub ON ComplianceConnector(subsystem)`,
  `CREATE INDEX IF NOT EXISTS idx_cc_status ON ComplianceConnector(status)`,
  `CREATE INDEX IF NOT EXISTS idx_cc_jur ON ComplianceConnector(jurisdictionCode)`,
]

async function main() {
  console.log(`[phase3] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0
  let fail = 0
  for (const sql of DDL) {
    try {
      await client.execute(sql)
      ok++
    } catch (e: any) {
      fail++
      console.error(`[phase3] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0, 120)}`)
    }
  }
  console.log(`[phase3] Done. OK=${ok} FAIL=${fail}`)

  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('TradeLicense','TradePermit','RegulatoryCertificate','SpsRequirement','TbtRequirement','ControlledGoodsControl','SanctionsScreening','ComplianceConnector') ORDER BY name`
  )
  console.log(`[phase3] Phase 3 tables present:`)
  for (const row of res.rows) {
    console.log(`  - ${(row as any).name}`)
  }
}

main().catch((e) => {
  console.error('[phase3] FATAL', e)
  process.exit(1)
})
