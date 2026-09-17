/**
 * Phase 2 — Create the 6 new Turso tables directly via libsql.
 * Uses @libsql/client (already installed) and matches the Prisma schema.
 * Idempotent: uses CREATE TABLE IF NOT EXISTS.
 *
 * Tables:
 *   - ProductRegulatoryProfile
 *   - ClassificationRule
 *   - TariffRule
 *   - OriginRule
 *   - TradeAgreement
 *   - RegulatoryProductResult
 *
 * Run: bun run scripts/phase2-create-tables.ts
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. ProductRegulatoryProfile
  `CREATE TABLE IF NOT EXISTS ProductRegulatoryProfile (
    id TEXT PRIMARY KEY NOT NULL,
    productName TEXT NOT NULL,
    productDescription TEXT,
    hs6 TEXT NOT NULL,
    nationalTariffCodes TEXT,
    alternateClassifications TEXT,
    composition TEXT,
    material TEXT,
    casNumbers TEXT,
    brand TEXT,
    model TEXT,
    serialRequired BOOLEAN NOT NULL DEFAULT 0,
    serialRequirements TEXT,
    agricultureClassification TEXT,
    foodClassification TEXT,
    pharmaClassification TEXT,
    veterinaryClassification TEXT,
    chemicalClassification TEXT,
    dualUseClassification TEXT,
    dgClassification TEXT,
    strategicGoodsClassification TEXT,
    citesClassification TEXT,
    packagingRequirements TEXT,
    labelingRequirements TEXT,
    shelfLifeDays INTEGER,
    temperatureMinC REAL,
    temperatureMaxC REAL,
    conformityRequirements TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    confidenceScore REAL,
    sourceId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prp_hs6 ON ProductRegulatoryProfile(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_prp_status ON ProductRegulatoryProfile(status)`,
  `CREATE INDEX IF NOT EXISTS idx_prp_source ON ProductRegulatoryProfile(sourceId)`,

  // 2. ClassificationRule
  `CREATE TABLE IF NOT EXISTS ClassificationRule (
    id TEXT PRIMARY KEY NOT NULL,
    classificationType TEXT NOT NULL,
    hsCode TEXT NOT NULL,
    parentHsCode TEXT,
    jurisdictionId TEXT,
    productId TEXT,
    description TEXT,
    ruleLogic TEXT,
    legalReferences TEXT,
    confidenceThreshold REAL NOT NULL DEFAULT 0.85,
    effectiveFrom DATETIME,
    effectiveUntil DATETIME,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    sourceId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (productId) REFERENCES ProductRegulatoryProfile(id) ON DELETE SET NULL,
    FOREIGN KEY (jurisdictionId) REFERENCES JurisdictionFabric(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cr_type ON ClassificationRule(classificationType)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_hscode ON ClassificationRule(hsCode)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_jur ON ClassificationRule(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_product ON ClassificationRule(productId)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_status ON ClassificationRule(legalStatus)`,

  // 3. TariffRule
  `CREATE TABLE IF NOT EXISTS TariffRule (
    id TEXT PRIMARY KEY NOT NULL,
    tariffType TEXT NOT NULL,
    hsCode TEXT NOT NULL,
    hs6 TEXT NOT NULL,
    jurisdictionId TEXT,
    originCountry TEXT,
    agreementId TEXT,
    productId TEXT,
    rateAdValorem REAL,
    rateSpecific REAL,
    rateSpecificUnit TEXT,
    rateCompound TEXT,
    rateType TEXT NOT NULL DEFAULT 'AD_VALOREM',
    currency TEXT NOT NULL DEFAULT 'USD',
    minRate REAL,
    maxRate REAL,
    quotaVolume REAL,
    quotaUnit TEXT,
    quotaUsed REAL NOT NULL DEFAULT 0,
    quotaPeriod TEXT,
    quotaOpen BOOLEAN NOT NULL DEFAULT 1,
    sourceId TEXT,
    legalReference TEXT,
    confidenceScore REAL,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    effectiveFrom DATETIME,
    effectiveUntil DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (productId) REFERENCES ProductRegulatoryProfile(id) ON DELETE SET NULL,
    FOREIGN KEY (jurisdictionId) REFERENCES JurisdictionFabric(id) ON DELETE SET NULL,
    FOREIGN KEY (agreementId) REFERENCES TradeAgreement(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tr_type ON TariffRule(tariffType)`,
  `CREATE INDEX IF NOT EXISTS idx_tr_hs6 ON TariffRule(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_tr_jur ON TariffRule(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_tr_origin ON TariffRule(originCountry)`,
  `CREATE INDEX IF NOT EXISTS idx_tr_agreement ON TariffRule(agreementId)`,
  `CREATE INDEX IF NOT EXISTS idx_tr_status ON TariffRule(legalStatus)`,
  `CREATE INDEX IF NOT EXISTS idx_tr_eff ON TariffRule(effectiveFrom)`,

  // 4. OriginRule
  `CREATE TABLE IF NOT EXISTS OriginRule (
    id TEXT PRIMARY KEY NOT NULL,
    ruleType TEXT NOT NULL,
    hsCode TEXT,
    hs6 TEXT,
    jurisdictionId TEXT,
    agreementId TEXT,
    productId TEXT,
    originCountry TEXT,
    ruleCriteria TEXT,
    rvcThreshold REAL,
    rvcMethod TEXT,
    tariffShiftTarget TEXT,
    requiredDocuments TEXT,
    certificationBody TEXT,
    effectiveFrom DATETIME,
    effectiveUntil DATETIME,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    sourceId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (productId) REFERENCES ProductRegulatoryProfile(id) ON DELETE SET NULL,
    FOREIGN KEY (jurisdictionId) REFERENCES JurisdictionFabric(id) ON DELETE SET NULL,
    FOREIGN KEY (agreementId) REFERENCES TradeAgreement(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_or_type ON OriginRule(ruleType)`,
  `CREATE INDEX IF NOT EXISTS idx_or_hs6 ON OriginRule(hs6)`,
  `CREATE INDEX IF NOT EXISTS idx_or_jur ON OriginRule(jurisdictionId)`,
  `CREATE INDEX IF NOT EXISTS idx_or_agreement ON OriginRule(agreementId)`,
  `CREATE INDEX IF NOT EXISTS idx_or_product ON OriginRule(productId)`,
  `CREATE INDEX IF NOT EXISTS idx_or_status ON OriginRule(legalStatus)`,

  // 5. TradeAgreement
  `CREATE TABLE IF NOT EXISTS TradeAgreement (
    id TEXT PRIMARY KEY NOT NULL,
    agreementType TEXT NOT NULL,
    name TEXT NOT NULL,
    shortName TEXT,
    parties TEXT NOT NULL,
    effectiveDate DATETIME NOT NULL,
    expiryDate DATETIME,
    productCoverage TEXT,
    tariffTreatment TEXT,
    originRulesSummary TEXT,
    quotas TEXT,
    exclusions TEXT,
    certification TEXT,
    cumulation TEXT,
    directTransport BOOLEAN NOT NULL DEFAULT 1,
    legalStatus TEXT NOT NULL DEFAULT 'IN_FORCE',
    sourceId TEXT,
    confidenceScore REAL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ta_type ON TradeAgreement(agreementType)`,
  `CREATE INDEX IF NOT EXISTS idx_ta_status ON TradeAgreement(legalStatus)`,
  `CREATE INDEX IF NOT EXISTS idx_ta_eff ON TradeAgreement(effectiveDate)`,

  // 6. RegulatoryProductResult
  `CREATE TABLE IF NOT EXISTS RegulatoryProductResult (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT,
    tradeId TEXT,
    productId TEXT,
    classification TEXT,
    tariff TEXT,
    origin TEXT,
    preferentialEligibility TEXT,
    documents TEXT,
    licenses TEXT,
    permits TEXT,
    certificates TEXT,
    restrictions TEXT,
    overallConfidence REAL NOT NULL DEFAULT 0.85,
    verdict TEXT NOT NULL DEFAULT 'CONDITIONAL',
    humanReviewRequired BOOLEAN NOT NULL DEFAULT 0,
    generatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    generatedBy TEXT,
    FOREIGN KEY (productId) REFERENCES ProductRegulatoryProfile(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rpr_ustn ON RegulatoryProductResult(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_rpr_trade ON RegulatoryProductResult(tradeId)`,
  `CREATE INDEX IF NOT EXISTS idx_rpr_product ON RegulatoryProductResult(productId)`,
  `CREATE INDEX IF NOT EXISTS idx_rpr_gen ON RegulatoryProductResult(generatedAt)`,
]

async function main() {
  console.log(`[phase2] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0
  let fail = 0
  for (const sql of DDL) {
    try {
      await client.execute(sql)
      ok++
    } catch (e: any) {
      fail++
      // index "FROM ON" was a typo — log + continue; harmless on re-run
      console.error(`[phase2] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0, 120)}`)
    }
  }
  console.log(`[phase2] Done. OK=${ok} FAIL=${fail}`)

  // Verify the 6 tables exist
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ProductRegulatoryProfile','ClassificationRule','TariffRule','OriginRule','TradeAgreement','RegulatoryProductResult') ORDER BY name`
  )
  console.log(`[phase2] Phase 2 tables present:`)
  for (const row of res.rows) {
    console.log(`  - ${(row as any).name}`)
  }
}

main().catch((e) => {
  console.error('[phase2] FATAL', e)
  process.exit(1)
})
