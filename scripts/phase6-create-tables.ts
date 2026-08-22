/**
 * Phase 6 — Create the 9 new Turso tables directly via libsql.
 * Tables: GlobalPayment, TradeFinanceCase, LcLifecycle, DocumentaryMatch,
 * GuaranteeRecord, InsuranceLifecycle, AccountingEntry, ErpAdapter,
 * ReconciliationRecord, FinancierRelationship.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. GlobalPayment
  `CREATE TABLE IF NOT EXISTS GlobalPayment (
    id TEXT PRIMARY KEY NOT NULL,
    paymentId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    payerGtid TEXT NOT NULL, payeeGtid TEXT NOT NULL,
    paymentMethod TEXT NOT NULL,
    amountUsd REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    fxRate REAL, amountLocal REAL,
    payerBankBic TEXT, payerAccount TEXT, payeeBankBic TEXT, payeeAccount TEXT, pspName TEXT,
    settlementStructure TEXT, feeLockId TEXT, settlementInstructionId TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    idempotencyKey TEXT,
    paymentAttemptId TEXT,
    reconciliationStatus TEXT,
    reconciliationId TEXT,
    initiatedAt DATETIME, submittedAt DATETIME, settledAt DATETIME, failedAt DATETIME,
    failureReason TEXT, failureCode TEXT,
    paymentReference TEXT, attachments TEXT, notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gp_ustn ON GlobalPayment(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_gp_payer ON GlobalPayment(payerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_gp_payee ON GlobalPayment(payeeGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_gp_method ON GlobalPayment(paymentMethod)`,
  `CREATE INDEX IF NOT EXISTS idx_gp_status ON GlobalPayment(status)`,
  `CREATE INDEX IF NOT EXISTS idx_gp_idem ON GlobalPayment(idempotencyKey)`,
  `CREATE INDEX IF NOT EXISTS idx_gp_recon ON GlobalPayment(reconciliationStatus)`,

  // 2. TradeFinanceCase
  `CREATE TABLE IF NOT EXISTS TradeFinanceCase (
    id TEXT PRIMARY KEY NOT NULL,
    caseId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    borrowerGtid TEXT NOT NULL,
    financierGtid TEXT, financierType TEXT,
    financingRequestId TEXT, financingAgreementId TEXT,
    amountUsd REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    tenorDays INTEGER, apr REAL,
    status TEXT NOT NULL DEFAULT 'FINANCING_REQUEST',
    collateralType TEXT, collateralValueUsd REAL,
    disbursementAmountUsd REAL, disbursementDate DATETIME,
    repaymentAmountUsd REAL, repaymentDate DATETIME,
    marginCallThreshold REAL, marginCallTriggered BOOLEAN NOT NULL DEFAULT 0, marginCallDate DATETIME,
    relationshipVerified BOOLEAN NOT NULL DEFAULT 0,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tfc_ustn ON TradeFinanceCase(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_tfc_borrower ON TradeFinanceCase(borrowerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_tfc_financier ON TradeFinanceCase(financierGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_tfc_status ON TradeFinanceCase(status)`,

  // 3. LcLifecycle
  `CREATE TABLE IF NOT EXISTS LcLifecycle (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    lcId TEXT, lcNumber TEXT,
    currentStep TEXT NOT NULL DEFAULT 'APPLICATION',
    status TEXT NOT NULL DEFAULT 'PENDING',
    stepHistory TEXT,
    presentationDate DATETIME, presentationBankGtid TEXT,
    discrepancies TEXT, discrepancyCount INTEGER NOT NULL DEFAULT 0,
    paymentAmountUsd REAL, paymentDate DATETIME,
    reimbursementAmountUsd REAL, reimbursementDate DATETIME,
    applicantGtid TEXT, beneficiaryGtid TEXT,
    issuingBankGtid TEXT, advisingBankGtid TEXT, confirmingBankGtid TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lcl_ustn ON LcLifecycle(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_lcl_lcn ON LcLifecycle(lcNumber)`,
  `CREATE INDEX IF NOT EXISTS idx_lcl_step ON LcLifecycle(currentStep)`,
  `CREATE INDEX IF NOT EXISTS idx_lcl_status ON LcLifecycle(status)`,

  // 4. DocumentaryMatch
  `CREATE TABLE IF NOT EXISTS DocumentaryMatch (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT, lcNumber TEXT,
    documents TEXT,
    matchStatus TEXT NOT NULL DEFAULT 'PENDING',
    discrepancyCount INTEGER NOT NULL DEFAULT 0,
    discrepancies TEXT,
    fieldsChecked TEXT,
    confidence REAL NOT NULL DEFAULT 0.85,
    readyForPresentation BOOLEAN NOT NULL DEFAULT 0,
    reviewedBy TEXT, reviewedAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dm_ustn ON DocumentaryMatch(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dm_lcn ON DocumentaryMatch(lcNumber)`,
  `CREATE INDEX IF NOT EXISTS idx_dm_status ON DocumentaryMatch(matchStatus)`,
  `CREATE INDEX IF NOT EXISTS idx_dm_ready ON DocumentaryMatch(readyForPresentation)`,

  // 5. GuaranteeRecord
  `CREATE TABLE IF NOT EXISTS GuaranteeRecord (
    id TEXT PRIMARY KEY NOT NULL,
    guaranteeId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    guaranteeType TEXT NOT NULL,
    issuerGtid TEXT, issuerName TEXT,
    beneficiaryGtid TEXT, beneficiaryName TEXT,
    amountUsd REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    coverageScope TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    issuedAt DATETIME, validFrom DATETIME, validUntil DATETIME, releasedAt DATETIME,
    callAmountUsd REAL, calledAt DATETIME, callReason TEXT,
    customsBondId TEXT, bankSettlementId TEXT,
    guaranteeNumber TEXT, attachments TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gr_ustn ON GuaranteeRecord(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_gr_type ON GuaranteeRecord(guaranteeType)`,
  `CREATE INDEX IF NOT EXISTS idx_gr_status ON GuaranteeRecord(status)`,
  `CREATE INDEX IF NOT EXISTS idx_gr_issuer ON GuaranteeRecord(issuerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_gr_benef ON GuaranteeRecord(beneficiaryGtid)`,

  // 6. InsuranceLifecycle
  `CREATE TABLE IF NOT EXISTS InsuranceLifecycle (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    policyId TEXT, claimId TEXT,
    insuranceType TEXT NOT NULL,
    insurerGtid TEXT, insuredGtid TEXT NOT NULL,
    coverageAmountUsd REAL NOT NULL, premiumUsd REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    currentStep TEXT NOT NULL DEFAULT 'QUOTE',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    stepHistory TEXT,
    incidentDate DATETIME, incidentDescription TEXT,
    claimAmountUsd REAL, claimDate DATETIME,
    surveyorGtid TEXT, surveyDate DATETIME, surveyResult TEXT,
    settlementAmountUsd REAL, settlementDate DATETIME,
    recoveryAmountUsd REAL, recoveryDate DATETIME,
    policyNumber TEXT, certificateNumber TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_il_ustn ON InsuranceLifecycle(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_il_type ON InsuranceLifecycle(insuranceType)`,
  `CREATE INDEX IF NOT EXISTS idx_il_step ON InsuranceLifecycle(currentStep)`,
  `CREATE INDEX IF NOT EXISTS idx_il_status ON InsuranceLifecycle(status)`,
  `CREATE INDEX IF NOT EXISTS idx_il_insurer ON InsuranceLifecycle(insurerGtid)`,

  // 7. AccountingEntry
  `CREATE TABLE IF NOT EXISTS AccountingEntry (
    id TEXT PRIMARY KEY NOT NULL,
    entryId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    category TEXT NOT NULL,
    debitAccount TEXT NOT NULL, creditAccount TEXT NOT NULL,
    amountUsd REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    fxRate REAL, amountLocal REAL,
    description TEXT, reference TEXT,
    accountingDate DATETIME NOT NULL,
    period TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    postedAt DATETIME, postedBy TEXT,
    sourceType TEXT, sourceId TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ae_ustn ON AccountingEntry(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_ae_cat ON AccountingEntry(category)`,
  `CREATE INDEX IF NOT EXISTS idx_ae_status ON AccountingEntry(status)`,
  `CREATE INDEX IF NOT EXISTS idx_ae_period ON AccountingEntry(period)`,
  `CREATE INDEX IF NOT EXISTS idx_ae_date ON AccountingEntry(accountingDate)`,

  // 8. ErpAdapter
  `CREATE TABLE IF NOT EXISTS ErpAdapter (
    id TEXT PRIMARY KEY NOT NULL,
    traderGtid TEXT NOT NULL,
    erpType TEXT NOT NULL,
    systemName TEXT,
    endpointUrl TEXT, apiKey TEXT, apiSecret TEXT,
    authMethod TEXT,
    status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    lastSyncAt DATETIME, lastSyncStatus TEXT, lastError TEXT,
    syncFrequency TEXT, syncCategories TEXT,
    fieldMapping TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (traderGtid, erpType)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ea_trader ON ErpAdapter(traderGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_ea_type ON ErpAdapter(erpType)`,
  `CREATE INDEX IF NOT EXISTS idx_ea_status ON ErpAdapter(status)`,

  // 9. ReconciliationRecord
  `CREATE TABLE IF NOT EXISTS ReconciliationRecord (
    id TEXT PRIMARY KEY NOT NULL,
    reconciliationId TEXT NOT NULL UNIQUE,
    ustn TEXT, tradeId TEXT,
    reconciliationType TEXT NOT NULL,
    sourceType TEXT NOT NULL, sourceId TEXT NOT NULL,
    targetType TEXT NOT NULL, targetReference TEXT,
    sourceAmountUsd REAL NOT NULL, targetAmountUsd REAL NOT NULL,
    differenceUsd REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    matchedAt DATETIME,
    discrepancyReason TEXT,
    resolvedBy TEXT, resolvedAt DATETIME, resolutionNotes TEXT,
    reconciliationDate DATETIME NOT NULL,
    period TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rr_ustn ON ReconciliationRecord(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_rr_type ON ReconciliationRecord(reconciliationType)`,
  `CREATE INDEX IF NOT EXISTS idx_rr_status ON ReconciliationRecord(status)`,
  `CREATE INDEX IF NOT EXISTS idx_rr_period ON ReconciliationRecord(period)`,

  // 10. FinancierRelationship
  `CREATE TABLE IF NOT EXISTS FinancierRelationship (
    id TEXT PRIMARY KEY NOT NULL,
    traderGtid TEXT NOT NULL,
    financierGtid TEXT NOT NULL,
    financierType TEXT NOT NULL,
    relationshipStatus TEXT NOT NULL DEFAULT 'ACTIVE',
    authorizedFrom DATETIME, authorizedUntil DATETIME, authorizedBy TEXT,
    creditLimitUsd REAL, currentExposureUsd REAL NOT NULL DEFAULT 0,
    internalTrustScore INTEGER NOT NULL DEFAULT 70,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (traderGtid, financierGtid)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fr_trader ON FinancierRelationship(traderGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_fr_financier ON FinancierRelationship(financierGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_fr_type ON FinancierRelationship(financierType)`,
  `CREATE INDEX IF NOT EXISTS idx_fr_status ON FinancierRelationship(relationshipStatus)`,
]

async function main() {
  console.log(`[phase6] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase6] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase6] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('GlobalPayment','TradeFinanceCase','LcLifecycle','DocumentaryMatch','GuaranteeRecord','InsuranceLifecycle','AccountingEntry','ErpAdapter','ReconciliationRecord','FinancierRelationship') ORDER BY name`
  )
  console.log(`[phase6] Phase 6 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase6] FATAL', e); process.exit(1) })
