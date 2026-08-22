/**
 * Phase 5 — Create the 6 new Turso tables directly via libsql.
 * Tables: TransportGraph, TransportLeg, ProviderRelationship, LogisticsQuoteV2,
 * LandedCostBreakdown, TransportDocument, ProviderValidation.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. TransportGraph
  `CREATE TABLE IF NOT EXISTS TransportGraph (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    name TEXT, description TEXT,
    totalLegs INTEGER NOT NULL DEFAULT 0,
    primaryMode TEXT,
    isMultimodal BOOLEAN NOT NULL DEFAULT 0,
    originLocation TEXT, destinationLocation TEXT,
    estimatedTransitDays INTEGER,
    estimatedTotalCostUsd REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'PLANNED',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tg_ustn ON TransportGraph(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_tg_trade ON TransportGraph(tradeId)`,
  `CREATE INDEX IF NOT EXISTS idx_tg_status ON TransportGraph(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tg_mode ON TransportGraph(primaryMode)`,

  // 2. TransportLeg
  `CREATE TABLE IF NOT EXISTS TransportLeg (
    id TEXT PRIMARY KEY NOT NULL,
    graphId TEXT NOT NULL,
    legNumber INTEGER NOT NULL,
    legType TEXT NOT NULL,
    mode TEXT NOT NULL,
    originLocation TEXT NOT NULL,
    destinationLocation TEXT,
    handoffLocation TEXT,
    handoffType TEXT,
    providerGtid TEXT,
    providerType TEXT,
    modeEngineRef TEXT,
    modeEngineType TEXT,
    documents TEXT,
    status TEXT NOT NULL DEFAULT 'PLANNED',
    plannedDeparture DATETIME, plannedArrival DATETIME,
    actualDeparture DATETIME, actualArrival DATETIME,
    estimatedCostUsd REAL, actualCostUsd REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    modeMetadata TEXT, notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (graphId) REFERENCES TransportGraph(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tl_graph ON TransportLeg(graphId)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_mode ON TransportLeg(mode)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_provider ON TransportLeg(providerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_status ON TransportLeg(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tl_num ON TransportLeg(legNumber)`,

  // 3. ProviderRelationship
  `CREATE TABLE IF NOT EXISTS ProviderRelationship (
    id TEXT PRIMARY KEY NOT NULL,
    providerGtid TEXT NOT NULL,
    providerType TEXT NOT NULL,
    traderGtid TEXT,
    relationshipType TEXT NOT NULL,
    relationshipStatus TEXT NOT NULL DEFAULT 'ACTIVE',
    visibilityScope TEXT NOT NULL DEFAULT 'PRIVATE',
    jurisdictions TEXT, routes TEXT, serviceCatalogue TEXT,
    authorizedFrom DATETIME, authorizedUntil DATETIME, authorizedBy TEXT,
    internalTrustScore INTEGER NOT NULL DEFAULT 70,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (providerGtid, traderGtid, relationshipType)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pr_provider ON ProviderRelationship(providerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_pr_trader ON ProviderRelationship(traderGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_pr_type ON ProviderRelationship(providerType)`,
  `CREATE INDEX IF NOT EXISTS idx_pr_status ON ProviderRelationship(relationshipStatus)`,

  // 4. LogisticsQuoteV2
  `CREATE TABLE IF NOT EXISTS LogisticsQuoteV2 (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    graphId TEXT, legId TEXT,
    quoteId TEXT NOT NULL UNIQUE,
    serviceType TEXT NOT NULL,
    serviceSubtype TEXT,
    providerGtid TEXT, providerType TEXT,
    originLocation TEXT, destinationLocation TEXT,
    commodity TEXT, hs6 TEXT,
    weightKg REAL, volumeCbm REAL,
    equipmentType TEXT, equipmentCount INTEGER NOT NULL DEFAULT 1,
    specialCargo TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    baseCost REAL NOT NULL DEFAULT 0,
    surcharges TEXT,
    totalCost REAL NOT NULL DEFAULT 0,
    maxExposure REAL NOT NULL DEFAULT 0,
    issuedAt DATETIME, validUntil DATETIME,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    selectedByGtid TEXT, selectedAt DATETIME,
    legacyQuoteId TEXT,
    providerValidationStatus TEXT,
    providerValidationId TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lq2_ustn ON LogisticsQuoteV2(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_lq2_graph ON LogisticsQuoteV2(graphId)`,
  `CREATE INDEX IF NOT EXISTS idx_lq2_leg ON LogisticsQuoteV2(legId)`,
  `CREATE INDEX IF NOT EXISTS idx_lq2_provider ON LogisticsQuoteV2(providerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_lq2_service ON LogisticsQuoteV2(serviceType)`,
  `CREATE INDEX IF NOT EXISTS idx_lq2_status ON LogisticsQuoteV2(status)`,

  // 5. LandedCostBreakdown
  `CREATE TABLE IF NOT EXISTS LandedCostBreakdown (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    graphId TEXT, legId TEXT, quoteId TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    freight REAL NOT NULL DEFAULT 0,
    fuel REAL NOT NULL DEFAULT 0,
    handling REAL NOT NULL DEFAULT 0,
    terminal REAL NOT NULL DEFAULT 0,
    customs REAL NOT NULL DEFAULT 0,
    broker REAL NOT NULL DEFAULT 0,
    permits REAL NOT NULL DEFAULT 0,
    inspection REAL NOT NULL DEFAULT 0,
    lab REAL NOT NULL DEFAULT 0,
    insurance REAL NOT NULL DEFAULT 0,
    warehouse REAL NOT NULL DEFAULT 0,
    storage REAL NOT NULL DEFAULT 0,
    demurrage REAL NOT NULL DEFAULT 0,
    detention REAL NOT NULL DEFAULT 0,
    waiting REAL NOT NULL DEFAULT 0,
    specialCargo REAL NOT NULL DEFAULT 0,
    reefer REAL NOT NULL DEFAULT 0,
    dg REAL NOT NULL DEFAULT 0,
    delivery REAL NOT NULL DEFAULT 0,
    sgtxFee REAL NOT NULL DEFAULT 0,
    totalLandedCost REAL NOT NULL DEFAULT 0,
    costSources TEXT,
    fixedCost REAL NOT NULL DEFAULT 0,
    variableCost REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.85,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lcb_ustn ON LandedCostBreakdown(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_lcb_graph ON LandedCostBreakdown(graphId)`,
  `CREATE INDEX IF NOT EXISTS idx_lcb_leg ON LandedCostBreakdown(legId)`,
  `CREATE INDEX IF NOT EXISTS idx_lcb_quote ON LandedCostBreakdown(quoteId)`,

  // 6. TransportDocument
  `CREATE TABLE IF NOT EXISTS TransportDocument (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT,
    graphId TEXT, legId TEXT,
    documentType TEXT NOT NULL,
    documentNumber TEXT,
    issuerGtid TEXT, holderGtid TEXT,
    modeEngineRef TEXT, modeEngineType TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    issuedAt DATETIME, surrenderedAt DATETIME, releasedAt DATETIME,
    isElectronic BOOLEAN NOT NULL DEFAULT 1,
    payload TEXT, attachments TEXT,
    verificationHash TEXT,
    verifiedAt DATETIME, verifiedBy TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_td_ustn ON TransportDocument(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_td_graph ON TransportDocument(graphId)`,
  `CREATE INDEX IF NOT EXISTS idx_td_leg ON TransportDocument(legId)`,
  `CREATE INDEX IF NOT EXISTS idx_td_type ON TransportDocument(documentType)`,
  `CREATE INDEX IF NOT EXISTS idx_td_status ON TransportDocument(status)`,
  `CREATE INDEX IF NOT EXISTS idx_td_issuer ON TransportDocument(issuerGtid)`,

  // 7. ProviderValidation
  `CREATE TABLE IF NOT EXISTS ProviderValidation (
    id TEXT PRIMARY KEY NOT NULL,
    providerGtid TEXT NOT NULL,
    providerType TEXT NOT NULL,
    validationType TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    referenceNumber TEXT,
    issuedBy TEXT,
    issuedAt DATETIME, validFrom DATETIME, validUntil DATETIME,
    jurisdictions TEXT, routes TEXT, commodities TEXT, vehicles TEXT, drivers TEXT,
    verifiedAt DATETIME, verifiedBy TEXT,
    verificationMethod TEXT,
    evidence TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (providerGtid, validationType)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pv_provider ON ProviderValidation(providerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_pv_type ON ProviderValidation(providerType)`,
  `CREATE INDEX IF NOT EXISTS idx_pv_valtype ON ProviderValidation(validationType)`,
  `CREATE INDEX IF NOT EXISTS idx_pv_status ON ProviderValidation(status)`,
]

async function main() {
  console.log(`[phase5] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase5] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase5] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('TransportGraph','TransportLeg','ProviderRelationship','LogisticsQuoteV2','LandedCostBreakdown','TransportDocument','ProviderValidation') ORDER BY name`
  )
  console.log(`[phase5] Phase 5 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase5] FATAL', e); process.exit(1) })
