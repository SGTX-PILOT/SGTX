/**
 * Phase 4 — Create the 6 new Turso tables directly via libsql.
 * Tables: CustomsOperationV2, GovConnector, GovGatewayCall,
 * SingleWindowMapping, MultiAgencyWorkflow, WorkflowStep, GovernmentSubmission.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. CustomsOperationV2
  `CREATE TABLE IF NOT EXISTS CustomsOperationV2 (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    operationType TEXT NOT NULL,
    jurisdictionId TEXT, jurisdictionCode TEXT,
    customsAuthority TEXT, customsOffice TEXT, procedure TEXT,
    declaration TEXT, declarationNumber TEXT,
    brokerGtid TEXT,
    documents TEXT, inspection TEXT, fees TEXT, duties TEXT, taxes TEXT,
    guarantees TEXT, release TEXT, governmentReferences TEXT,
    status TEXT NOT NULL DEFAULT 'SGTX_READY',
    connectorStatus TEXT,
    submittedAt DATETIME, acceptedAt DATETIME, rejectedAt DATETIME,
    holdAt DATETIME, releasedAt DATETIME,
    rejectionReason TEXT, holdReason TEXT,
    workflowId TEXT, workflowStepId TEXT,
    transportMode TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cov2_type ON CustomsOperationV2(operationType)`,
  `CREATE INDEX IF NOT EXISTS idx_cov2_jur ON CustomsOperationV2(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_cov2_status ON CustomsOperationV2(status)`,
  `CREATE INDEX IF NOT EXISTS idx_cov2_ustn ON CustomsOperationV2(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_cov2_broker ON CustomsOperationV2(brokerGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_cov2_mode ON CustomsOperationV2(transportMode)`,

  // 2. GovConnector
  `CREATE TABLE IF NOT EXISTS GovConnector (
    id TEXT PRIMARY KEY NOT NULL,
    jurisdictionId TEXT, jurisdictionCode TEXT,
    authority TEXT NOT NULL, systemName TEXT NOT NULL, systemType TEXT,
    protocols TEXT,
    status TEXT NOT NULL DEFAULT 'NOT_DISCOVERED',
    mode TEXT, integrationType TEXT,
    apiEnabled BOOLEAN NOT NULL DEFAULT 0,
    ediEnabled BOOLEAN NOT NULL DEFAULT 0,
    portalEnabled BOOLEAN NOT NULL DEFAULT 0,
    sandboxEnabled BOOLEAN NOT NULL DEFAULT 0,
    productionEnabled BOOLEAN NOT NULL DEFAULT 0,
    credentialsRequired BOOLEAN NOT NULL DEFAULT 0,
    credentialsConfigured BOOLEAN NOT NULL DEFAULT 0,
    certificationRequired BOOLEAN NOT NULL DEFAULT 0,
    certificationStatus TEXT,
    legalAgreement TEXT,
    lastSuccessAt DATETIME, lastErrorAt DATETIME, lastError TEXT,
    version TEXT, owner TEXT, priority INTEGER NOT NULL DEFAULT 50,
    transportModes TEXT,
    discoveryUrl TEXT, authMethod TEXT, authEndpoint TEXT,
    submitEndpoint TEXT, statusEndpoint TEXT, notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (jurisdictionCode, authority, systemName)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gc_jur ON GovConnector(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_gc_auth ON GovConnector(authority)`,
  `CREATE INDEX IF NOT EXISTS idx_gc_status ON GovConnector(status)`,
  `CREATE INDEX IF NOT EXISTS idx_gc_type ON GovConnector(systemType)`,

  // 3. GovGatewayCall
  `CREATE TABLE IF NOT EXISTS GovGatewayCall (
    id TEXT PRIMARY KEY NOT NULL,
    connectorId TEXT, ustn TEXT,
    operationType TEXT NOT NULL,
    idempotencyKey TEXT,
    requestBody TEXT, responseBody TEXT,
    statusCode INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    errorMessage TEXT,
    attemptCount INTEGER NOT NULL DEFAULT 1,
    retryScheduledAt DATETIME,
    calledAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    respondedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ggc_conn ON GovGatewayCall(connectorId)`,
  `CREATE INDEX IF NOT EXISTS idx_ggc_ustn ON GovGatewayCall(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_ggc_op ON GovGatewayCall(operationType)`,
  `CREATE INDEX IF NOT EXISTS idx_ggc_idem ON GovGatewayCall(idempotencyKey)`,
  `CREATE INDEX IF NOT EXISTS idx_ggc_status ON GovGatewayCall(status)`,
  `CREATE INDEX IF NOT EXISTS idx_ggc_called ON GovGatewayCall(calledAt)`,

  // 4. SingleWindowMapping
  `CREATE TABLE IF NOT EXISTS SingleWindowMapping (
    id TEXT PRIMARY KEY NOT NULL,
    mappingType TEXT NOT NULL,
    jurisdictionId TEXT, jurisdictionCode TEXT,
    authority TEXT, systemName TEXT,
    sourceField TEXT NOT NULL, targetField TEXT NOT NULL,
    transformation TEXT NOT NULL DEFAULT 'IDENTITY',
    codeList TEXT, defaultValue TEXT,
    required BOOLEAN NOT NULL DEFAULT 0,
    validationRegex TEXT, notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_swm_type ON SingleWindowMapping(mappingType)`,
  `CREATE INDEX IF NOT EXISTS idx_swm_jur ON SingleWindowMapping(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_swm_auth ON SingleWindowMapping(authority)`,
  `CREATE INDEX IF NOT EXISTS idx_swm_sys ON SingleWindowMapping(systemName)`,
  `CREATE INDEX IF NOT EXISTS idx_swm_src ON SingleWindowMapping(sourceField)`,

  // 5. MultiAgencyWorkflow
  `CREATE TABLE IF NOT EXISTS MultiAgencyWorkflow (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL, description TEXT,
    jurisdictionId TEXT, jurisdictionCode TEXT,
    transportMode TEXT, operationType TEXT,
    triggerConditions TEXT,
    active BOOLEAN NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_maw_jur ON MultiAgencyWorkflow(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_maw_op ON MultiAgencyWorkflow(operationType)`,
  `CREATE INDEX IF NOT EXISTS idx_maw_mode ON MultiAgencyWorkflow(transportMode)`,
  `CREATE INDEX IF NOT EXISTS idx_maw_active ON MultiAgencyWorkflow(active)`,

  // 6. WorkflowStep
  `CREATE TABLE IF NOT EXISTS WorkflowStep (
    id TEXT PRIMARY KEY NOT NULL,
    workflowId TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    agency TEXT NOT NULL,
    authority TEXT, systemName TEXT, connectorId TEXT,
    executionMode TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    parallelGroup TEXT,
    condition TEXT, riskTrigger TEXT,
    optional BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    governmentReference TEXT,
    submittedAt DATETIME, acceptedAt DATETIME, rejectedAt DATETIME,
    holdAt DATETIME, releasedAt DATETIME,
    rejectionReason TEXT, holdReason TEXT,
    customsOperationId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflowId) REFERENCES MultiAgencyWorkflow(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ws_wf ON WorkflowStep(workflowId)`,
  `CREATE INDEX IF NOT EXISTS idx_ws_agency ON WorkflowStep(agency)`,
  `CREATE INDEX IF NOT EXISTS idx_ws_status ON WorkflowStep(status)`,
  `CREATE INDEX IF NOT EXISTS idx_ws_group ON WorkflowStep(parallelGroup)`,

  // 7. GovernmentSubmission
  `CREATE TABLE IF NOT EXISTS GovernmentSubmission (
    id TEXT PRIMARY KEY NOT NULL,
    ustn TEXT, tradeId TEXT,
    workflowStepId TEXT, connectorId TEXT, customsOperationId TEXT,
    submissionType TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SGTX_READY',
    governmentReference TEXT, governmentMessage TEXT,
    payload TEXT, responsePayload TEXT,
    idempotencyKey TEXT,
    submittedAt DATETIME, acceptedAt DATETIME, rejectedAt DATETIME,
    holdAt DATETIME, releasedAt DATETIME,
    duplicateDetected BOOLEAN NOT NULL DEFAULT 0,
    duplicateOf TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gs_ustn ON GovernmentSubmission(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_gs_step ON GovernmentSubmission(workflowStepId)`,
  `CREATE INDEX IF NOT EXISTS idx_gs_conn ON GovernmentSubmission(connectorId)`,
  `CREATE INDEX IF NOT EXISTS idx_gs_status ON GovernmentSubmission(status)`,
  `CREATE INDEX IF NOT EXISTS idx_gs_type ON GovernmentSubmission(submissionType)`,
  `CREATE INDEX IF NOT EXISTS idx_gs_idem ON GovernmentSubmission(idempotencyKey)`,
]

async function main() {
  console.log(`[phase4] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase4] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase4] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CustomsOperationV2','GovConnector','GovGatewayCall','SingleWindowMapping','MultiAgencyWorkflow','WorkflowStep','GovernmentSubmission') ORDER BY name`
  )
  console.log(`[phase4] Phase 4 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase4] FATAL', e); process.exit(1) })
