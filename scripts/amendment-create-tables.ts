/**
 * SGTX Constitutional Amendment — Create the 12 new Turso tables.
 * Tables: TransactionStateVector, CanonicalEvent, TransactionTwin,
 * PaymentLeg, FinancialExposure, ObligationNode, ExceptionEvent,
 * RecoveryVaultEntry, ExternalIdentifier, BankSettlementGateway,
 * DisputePacket, ClosurePolicy.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. TransactionStateVector
  `CREATE TABLE IF NOT EXISTS TransactionStateVector (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT NOT NULL UNIQUE,
    execution TEXT NOT NULL DEFAULT 'PENDING',
    financial TEXT NOT NULL DEFAULT 'PENDING',
    legal TEXT NOT NULL DEFAULT 'PENDING',
    physicalOperational TEXT NOT NULL DEFAULT 'PENDING',
    documentary TEXT NOT NULL DEFAULT 'PENDING',
    compliance TEXT NOT NULL DEFAULT 'PENDING',
    regulatory TEXT NOT NULL DEFAULT 'PENDING',
    counterparty TEXT NOT NULL DEFAULT 'PENDING',
    reconciliation TEXT NOT NULL DEFAULT 'PENDING',
    dispute TEXT NOT NULL DEFAULT 'NONE',
    exposure TEXT NOT NULL DEFAULT 'NONE',
    closure TEXT NOT NULL DEFAULT 'OPEN',
    finalityClass TEXT NOT NULL DEFAULT 'F0',
    stateIntegrityScore REAL,
    reconciliationConfidence REAL,
    divergenceIndex TEXT,
    transactionHealth TEXT,
    lastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tsv_ustn ON TransactionStateVector(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_tsv_closure ON TransactionStateVector(closure)`,
  `CREATE INDEX IF NOT EXISTS idx_tsv_exposure ON TransactionStateVector(exposure)`,

  // 2. CanonicalEvent
  `CREATE TABLE IF NOT EXISTS CanonicalEvent (
    id TEXT PRIMARY KEY NOT NULL,
    eventId TEXT NOT NULL UNIQUE,
    ustn TEXT,
    parentEventId TEXT,
    eventType TEXT NOT NULL,
    eventTypeCategory TEXT NOT NULL,
    eventTime DATETIME NOT NULL,
    observationTime DATETIME NOT NULL,
    effectiveTime DATETIME,
    sourceSystem TEXT,
    sourceEventId TEXT,
    sourceReference TEXT,
    authority TEXT,
    evidenceReference TEXT,
    previousEventHash TEXT,
    eventHash TEXT,
    policyVersion TEXT,
    actor TEXT,
    authorizationContext TEXT,
    idempotencyKey TEXT,
    status TEXT NOT NULL DEFAULT 'RECORDED',
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ce_ustn ON CanonicalEvent(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_ce_type ON CanonicalEvent(eventType)`,
  `CREATE INDEX IF NOT EXISTS idx_ce_time ON CanonicalEvent(eventTime)`,
  `CREATE INDEX IF NOT EXISTS idx_ce_idem ON CanonicalEvent(idempotencyKey)`,
  `CREATE INDEX IF NOT EXISTS idx_ce_parent ON CanonicalEvent(parentEventId)`,

  // 3. TransactionTwin
  `CREATE TABLE IF NOT EXISTS TransactionTwin (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT NOT NULL UNIQUE,
    stateVectorId TEXT,
    obligations TEXT, actors TEXT, dependencies TEXT, documents TEXT,
    financialState TEXT, legalState TEXT, executionState TEXT,
    physicalState TEXT, complianceState TEXT,
    evidence TEXT, exceptions TEXT, exposure TEXT,
    recoveryPaths TEXT, closureConditions TEXT,
    postClosurePeriod TEXT,
    postClosureActive BOOLEAN NOT NULL DEFAULT 0,
    lastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tt_ustn ON TransactionTwin(ustn)`,

  // 4. PaymentLeg
  `CREATE TABLE IF NOT EXISTS PaymentLeg (
    id TEXT PRIMARY KEY NOT NULL,
    legId TEXT NOT NULL UNIQUE,
    ustn TEXT NOT NULL,
    settlementInstructionId TEXT,
    beneficiaryId TEXT, beneficiaryName TEXT, beneficiaryType TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    bankInstructionId TEXT, bankTransactionRef TEXT, externalPaymentRef TEXT,
    legState TEXT NOT NULL DEFAULT 'PENDING',
    valueDate DATETIME, executionTimestamp DATETIME,
    returnCode TEXT, bankEvidenceRef TEXT, sgtxEventHash TEXT,
    reconciliationStatus TEXT NOT NULL DEFAULT 'UNRECONCILED',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pl_ustn ON PaymentLeg(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_pl_state ON PaymentLeg(legState)`,
  `CREATE INDEX IF NOT EXISTS idx_pl_si ON PaymentLeg(settlementInstructionId)`,

  // 5. FinancialExposure
  `CREATE TABLE IF NOT EXISTS FinancialExposure (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT NOT NULL UNIQUE,
    grossCommercialValue REAL NOT NULL,
    expectedSettlement REAL NOT NULL,
    actualSettlement REAL NOT NULL DEFAULT 0,
    returnedAmount REAL NOT NULL DEFAULT 0,
    disputedAmount REAL NOT NULL DEFAULT 0,
    fees REAL NOT NULL DEFAULT 0,
    adjustments REAL NOT NULL DEFAULT 0,
    fxConsequences REAL NOT NULL DEFAULT 0,
    penalties REAL NOT NULL DEFAULT 0,
    compensation REAL NOT NULL DEFAULT 0,
    recoverableAmount REAL NOT NULL DEFAULT 0,
    outstandingExposure REAL NOT NULL DEFAULT 0,
    reopenedExposure REAL NOT NULL DEFAULT 0,
    contingentExposure REAL NOT NULL DEFAULT 0,
    exposureState TEXT NOT NULL DEFAULT 'NONE',
    recoveryStatus TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    lastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fe_ustn ON FinancialExposure(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_fe_state ON FinancialExposure(exposureState)`,

  // 6. ObligationNode
  `CREATE TABLE IF NOT EXISTS ObligationNode (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT NOT NULL,
    obligationId TEXT NOT NULL UNIQUE,
    obligationType TEXT NOT NULL,
    beneficiary TEXT,
    amount REAL, currency TEXT,
    prerequisites TEXT, dependencies TEXT,
    completionCondition TEXT, reversalCondition TEXT,
    disputeCondition TEXT, recoveryPath TEXT,
    financialConsequence REAL,
    state TEXT NOT NULL DEFAULT 'PENDING',
    authority TEXT,
    evidenceRequirement TEXT,
    deadline DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_on_ustn ON ObligationNode(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_on_type ON ObligationNode(obligationType)`,
  `CREATE INDEX IF NOT EXISTS idx_on_state ON ObligationNode(state)`,

  // 7. ExceptionEvent
  `CREATE TABLE IF NOT EXISTS ExceptionEvent (
    id TEXT PRIMARY KEY NOT NULL,
    exceptionId TEXT NOT NULL UNIQUE,
    ustn TEXT,
    exceptionCategory TEXT NOT NULL,
    exceptionType TEXT NOT NULL,
    severity INTEGER NOT NULL DEFAULT 2,
    triggeringEvent TEXT,
    currentStateVector TEXT,
    policyApplied TEXT,
    resolutionAction TEXT,
    affectedScope TEXT,
    detectionDeadline DATETIME, acknowledgmentDeadline DATETIME,
    resolutionTarget DATETIME, escalationDeadline DATETIME,
    status TEXT NOT NULL DEFAULT 'OPEN',
    acknowledgedBy TEXT, acknowledgedAt DATETIME,
    resolvedBy TEXT, resolvedAt DATETIME,
    resolutionNotes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ee_ustn ON ExceptionEvent(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_ee_type ON ExceptionEvent(exceptionType)`,
  `CREATE INDEX IF NOT EXISTS idx_ee_sev ON ExceptionEvent(severity)`,
  `CREATE INDEX IF NOT EXISTS idx_ee_status ON ExceptionEvent(status)`,

  // 8. RecoveryVaultEntry
  `CREATE TABLE IF NOT EXISTS RecoveryVaultEntry (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT,
    entryType TEXT NOT NULL,
    entryReference TEXT,
    entryHash TEXT,
    entryContent TEXT,
    entryUrl TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rve_ustn ON RecoveryVaultEntry(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_rve_type ON RecoveryVaultEntry(entryType)`,

  // 9. ExternalIdentifier
  `CREATE TABLE IF NOT EXISTS ExternalIdentifier (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT,
    identifierType TEXT NOT NULL,
    identifierValue TEXT NOT NULL,
    issuingAuthority TEXT,
    issuerSystem TEXT,
    relatedEntity TEXT,
    relatedEventId TEXT,
    validity TEXT,
    lifecycleStatus TEXT NOT NULL DEFAULT 'ACTIVE',
    source TEXT,
    evidence TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (identifierType, identifierValue)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ei_ustn ON ExternalIdentifier(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_ei_type ON ExternalIdentifier(identifierType)`,
  `CREATE INDEX IF NOT EXISTS idx_ei_value ON ExternalIdentifier(identifierValue)`,

  // 10. BankSettlementGateway
  `CREATE TABLE IF NOT EXISTS BankSettlementGateway (
    id TEXT PRIMARY KEY NOT NULL,
    gatewayId TEXT NOT NULL UNIQUE,
    ustn TEXT,
    bankGtid TEXT,
    bankName TEXT,
    integrationType TEXT NOT NULL,
    instructionPayload TEXT,
    instructionVersion INTEGER NOT NULL DEFAULT 1,
    schemaValidated BOOLEAN NOT NULL DEFAULT 0,
    signatureValidated BOOLEAN NOT NULL DEFAULT 0,
    ustnValidated BOOLEAN NOT NULL DEFAULT 0,
    beneficiaryConsistency BOOLEAN NOT NULL DEFAULT 0,
    bankPolicyChecked BOOLEAN NOT NULL DEFAULT 0,
    amlSanctionsChecked BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    bankResponse TEXT,
    submittedAt DATETIME,
    bankConfirmedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bsg_ustn ON BankSettlementGateway(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_bsg_bank ON BankSettlementGateway(bankGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_bsg_status ON BankSettlementGateway(status)`,

  // 11. DisputePacket
  `CREATE TABLE IF NOT EXISTS DisputePacket (
    id TEXT PRIMARY KEY NOT NULL,
    packetId TEXT NOT NULL UNIQUE,
    ustn TEXT,
    transactionHistory TEXT, timeline TEXT,
    contractReferences TEXT, applicableClauses TEXT,
    documents TEXT, signatures TEXT,
    bankPaymentEvents TEXT, logisticsEvidence TEXT,
    authorityEvents TEXT, reconciliationDiscrepancies TEXT,
    stateChanges TEXT, eventReasons TEXT,
    supportingEvidence TEXT,
    aiGeneratedSummary TEXT,
    sourceReferences TEXT,
    status TEXT NOT NULL DEFAULT 'ASSEMBLED',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dp_ustn ON DisputePacket(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dp_status ON DisputePacket(status)`,

  // 12. ClosurePolicy
  `CREATE TABLE IF NOT EXISTS ClosurePolicy (
    id TEXT PRIMARY KEY NOT NULL,
    policyId TEXT NOT NULL UNIQUE,
    policyName TEXT NOT NULL,
    requireDeliveryAccepted BOOLEAN NOT NULL DEFAULT 1,
    requireSettlementComplete BOOLEAN NOT NULL DEFAULT 1,
    requireFinancialReconciliation BOOLEAN NOT NULL DEFAULT 1,
    requireCustomsComplete BOOLEAN NOT NULL DEFAULT 1,
    requirePostClearance BOOLEAN NOT NULL DEFAULT 1,
    requireDisputesResolved BOOLEAN NOT NULL DEFAULT 1,
    requireEvidenceSealed BOOLEAN NOT NULL DEFAULT 1,
    customConditions TEXT,
    postClosureObservationDays INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cp_name ON ClosurePolicy(policyName)`,
  `CREATE INDEX IF NOT EXISTS idx_cp_active ON ClosurePolicy(active)`,
]

async function main() {
  console.log(`[amendment] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[amendment] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[amendment] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('TransactionStateVector','CanonicalEvent','TransactionTwin','PaymentLeg','FinancialExposure','ObligationNode','ExceptionEvent','RecoveryVaultEntry','ExternalIdentifier','BankSettlementGateway','DisputePacket','ClosurePolicy') ORDER BY name`
  )
  console.log(`[amendment] Constitutional Amendment tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[amendment] FATAL', e); process.exit(1) })
