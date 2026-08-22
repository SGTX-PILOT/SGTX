/**
 * Phase 7 — Create the 6 new Turso tables directly via libsql.
 * Tables: DeliveryAcceptance, TradeClaim, ReturnRecord, PostClearanceAction,
 * FinalEvidencePackage, TradeClosureState.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. DeliveryAcceptance
  `CREATE TABLE IF NOT EXISTS DeliveryAcceptance (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT, shipmentId TEXT,
    receiverGtid TEXT, receiverName TEXT, receiverSignature TEXT,
    quantityDelivered REAL, quantityUnit TEXT, quantityAccepted REAL, quantityRejected REAL,
    condition TEXT NOT NULL DEFAULT 'GOOD', conditionNotes TEXT,
    quality TEXT NOT NULL DEFAULT 'ACCEPTABLE', qualityNotes TEXT,
    temperatureMinC REAL, temperatureMaxC REAL, temperatureActualC REAL, temperatureCompliant BOOLEAN,
    podReference TEXT, documents TEXT, photos TEXT,
    status TEXT NOT NULL DEFAULT 'DELIVERED',
    acceptanceTimestamp DATETIME, rejectionReason TEXT,
    deliveryLocation TEXT, deliveryLat REAL, deliveryLng REAL,
    claimId TEXT, notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_da_ustn ON DeliveryAcceptance(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_da_receiver ON DeliveryAcceptance(receiverGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_da_status ON DeliveryAcceptance(status)`,
  `CREATE INDEX IF NOT EXISTS idx_da_ts ON DeliveryAcceptance(acceptanceTimestamp)`,

  // 2. TradeClaim
  `CREATE TABLE IF NOT EXISTS TradeClaim (
    id TEXT PRIMARY KEY NOT NULL,
    claimId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT, parentUstn TEXT,
    claimType TEXT NOT NULL,
    claimSeverity TEXT NOT NULL DEFAULT 'MINOR',
    claimDescription TEXT,
    claimedAmountUsd REAL, claimedAmountLocal REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    claimantGtid TEXT, respondentGtid TEXT,
    evidence TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    resolutionAmountUsd REAL, resolutionNotes TEXT,
    deliveryAcceptanceId TEXT, returnId TEXT, insuranceClaimId TEXT,
    filedAt DATETIME, reviewedAt DATETIME, resolvedAt DATETIME, closedAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tc_ustn ON TradeClaim(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_tc_parent ON TradeClaim(parentUstn)`,
  `CREATE INDEX IF NOT EXISTS idx_tc_type ON TradeClaim(claimType)`,
  `CREATE INDEX IF NOT EXISTS idx_tc_status ON TradeClaim(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tc_claimant ON TradeClaim(claimantGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_tc_respondent ON TradeClaim(respondentGtid)`,

  // 3. ReturnRecord
  `CREATE TABLE IF NOT EXISTS ReturnRecord (
    id TEXT PRIMARY KEY NOT NULL,
    returnId TEXT NOT NULL UNIQUE,
    ustn TEXT, parentUstn TEXT, parentTradeId TEXT,
    returnType TEXT NOT NULL,
    reason TEXT,
    quantityReturned REAL, quantityUnit TEXT,
    goodsCondition TEXT NOT NULL DEFAULT 'GOOD',
    returnOrigin TEXT, returnDestination TEXT, transportMode TEXT,
    reExportDeclaration TEXT, reImportDeclaration TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    claimId TEXT, deliveryAcceptanceId TEXT,
    initiatedAt DATETIME, shippedAt DATETIME, receivedAt DATETIME, completedAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rr_ustn ON ReturnRecord(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_rr_parent ON ReturnRecord(parentUstn)`,
  `CREATE INDEX IF NOT EXISTS idx_rr_type ON ReturnRecord(returnType)`,
  `CREATE INDEX IF NOT EXISTS idx_rr_status ON ReturnRecord(status)`,

  // 4. PostClearanceAction
  `CREATE TABLE IF NOT EXISTS PostClearanceAction (
    id TEXT PRIMARY KEY NOT NULL,
    actionId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT, customsOperationId TEXT,
    actionType TEXT NOT NULL,
    description TEXT,
    customsAuthority TEXT, customsReference TEXT,
    amountUsd REAL, currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'OPEN',
    resolution TEXT, resolutionNotes TEXT,
    filedAt DATETIME, reviewedAt DATETIME, resolvedAt DATETIME,
    accountingEntryId TEXT, reconciliationId TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pca_ustn ON PostClearanceAction(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_pca_customs ON PostClearanceAction(customsOperationId)`,
  `CREATE INDEX IF NOT EXISTS idx_pca_type ON PostClearanceAction(actionType)`,
  `CREATE INDEX IF NOT EXISTS idx_pca_status ON PostClearanceAction(status)`,

  // 5. FinalEvidencePackage
  `CREATE TABLE IF NOT EXISTS FinalEvidencePackage (
    id TEXT PRIMARY KEY NOT NULL,
    packageId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    rfq TEXT, quotation TEXT, purchaseOrder TEXT, contract TEXT,
    invoice TEXT, packingList TEXT, licenses TEXT, permits TEXT, certificates TEXT,
    customs TEXT, transport TEXT, gps TEXT, iot TEXT, inspection TEXT, qc TEXT,
    governmentReferences TEXT, payment TEXT, bankConfirmation TEXT, settlement TEXT,
    accounting TEXT, delivery TEXT, claims TEXT, disputes TEXT, communications TEXT,
    governorDecisions TEXT, loomChain TEXT,
    packageHash TEXT, sealedAt DATETIME, sealedBy TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    completenessScore REAL NOT NULL DEFAULT 0,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fep_ustn ON FinalEvidencePackage(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_fep_status ON FinalEvidencePackage(status)`,
  `CREATE INDEX IF NOT EXISTS idx_fep_sealed ON FinalEvidencePackage(sealedAt)`,

  // 6. TradeClosureState
  `CREATE TABLE IF NOT EXISTS TradeClosureState (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT NOT NULL UNIQUE,
    tradeId TEXT,
    deliveryAccepted BOOLEAN NOT NULL DEFAULT 0,
    settlementComplete BOOLEAN NOT NULL DEFAULT 0,
    financialReconciliationComplete BOOLEAN NOT NULL DEFAULT 0,
    activeCustomsObligationsComplete BOOLEAN NOT NULL DEFAULT 0,
    requiredPostClearanceObligationsComplete BOOLEAN NOT NULL DEFAULT 0,
    disputeClaimStateResolved BOOLEAN NOT NULL DEFAULT 0,
    evidencePackageSealed BOOLEAN NOT NULL DEFAULT 0,
    evidencePackageId TEXT,
    closureState TEXT NOT NULL DEFAULT 'OPEN',
    closedAt DATETIME, closedBy TEXT,
    closureChecklist TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tcs_ustn ON TradeClosureState(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_tcs_state ON TradeClosureState(closureState)`,
]

async function main() {
  console.log(`[phase7] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase7] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase7] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('DeliveryAcceptance','TradeClaim','ReturnRecord','PostClearanceAction','FinalEvidencePackage','TradeClosureState') ORDER BY name`
  )
  console.log(`[phase7] Phase 7 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase7] FATAL', e); process.exit(1) })
