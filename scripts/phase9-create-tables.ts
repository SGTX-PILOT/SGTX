/**
 * Phase 9 — Create the 4 new Turso tables directly via libsql.
 * Tables: CountryActivationWorkflow, RegulatoryChangeV2, ChangePipelineStep,
 * RegulatorySnapshotVersion.
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DDL: string[] = [
  // 1. CountryActivationWorkflow
  `CREATE TABLE IF NOT EXISTS CountryActivationWorkflow (
    id TEXT PRIMARY KEY NOT NULL,
    workflowId TEXT NOT NULL UNIQUE,
    countryCode TEXT NOT NULL,
    countryName TEXT,
    currentStep INTEGER NOT NULL DEFAULT 1,
    step1JurisdictionSelected BOOLEAN NOT NULL DEFAULT 0,
    step2OfficialSourcesLoaded BOOLEAN NOT NULL DEFAULT 0,
    step3CustomsProfileConfigured BOOLEAN NOT NULL DEFAULT 0,
    step4TaxConfigured BOOLEAN NOT NULL DEFAULT 0,
    step5SpsConfigured BOOLEAN NOT NULL DEFAULT 0,
    step6TbtConfigured BOOLEAN NOT NULL DEFAULT 0,
    step7LicensingConfigured BOOLEAN NOT NULL DEFAULT 0,
    step8TransportConfigured BOOLEAN NOT NULL DEFAULT 0,
    step9CustomsSystemsIdentified BOOLEAN NOT NULL DEFAULT 0,
    step10ApisIdentified BOOLEAN NOT NULL DEFAULT 0,
    step11EdiIdentified BOOLEAN NOT NULL DEFAULT 0,
    step12PortalsIdentified BOOLEAN NOT NULL DEFAULT 0,
    step13ManualProceduresIdentified BOOLEAN NOT NULL DEFAULT 0,
    step14CredentialsEntered BOOLEAN NOT NULL DEFAULT 0,
    step15SandboxConnection BOOLEAN NOT NULL DEFAULT 0,
    step16ConformanceTesting BOOLEAN NOT NULL DEFAULT 0,
    step17LegalRegulatoryReview BOOLEAN NOT NULL DEFAULT 0,
    step18ProductionApproval BOOLEAN NOT NULL DEFAULT 0,
    step19Activation BOOLEAN NOT NULL DEFAULT 0,
    step20LoomRecord BOOLEAN NOT NULL DEFAULT 0,
    stepHistory TEXT,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    activatedAt DATETIME,
    owner TEXT,
    loomHash TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_caw_country ON CountryActivationWorkflow(countryCode)`,
  `CREATE INDEX IF NOT EXISTS idx_caw_status ON CountryActivationWorkflow(status)`,
  `CREATE INDEX IF NOT EXISTS idx_caw_step ON CountryActivationWorkflow(currentStep)`,

  // 2. RegulatoryChangeV2
  `CREATE TABLE IF NOT EXISTS RegulatoryChangeV2 (
    id TEXT PRIMARY KEY NOT NULL,
    changeId TEXT NOT NULL UNIQUE,
    changeCategory TEXT NOT NULL,
    changeType TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sourceAuthority TEXT, sourceUrl TEXT, sourceReference TEXT,
    detectedBy TEXT NOT NULL DEFAULT 'RIA',
    jurisdictionCode TEXT NOT NULL,
    announcedDate DATETIME, effectiveDate DATETIME, expiryDate DATETIME,
    affectedProducts TEXT, affectedCountries TEXT, affectedModes TEXT,
    affectedTradeLanes TEXT, affectedActiveUstns TEXT, affectedDocuments TEXT,
    affectedPolicies TEXT, affectedIntegrations TEXT,
    impactSummary TEXT,
    impactSeverity TEXT NOT NULL DEFAULT 'MINOR',
    snapshotPolicy TEXT NOT NULL DEFAULT 'PRESERVE_EXISTING',
    pipelineStatus TEXT NOT NULL DEFAULT 'DETECTED',
    pipelineHistory TEXT,
    governorDecision TEXT, multisigApproval TEXT,
    deployedAt DATETIME, deploymentNotes TEXT,
    rollbackSupported BOOLEAN NOT NULL DEFAULT 1,
    rolledBackAt DATETIME, rollbackReason TEXT,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rc2_cat ON RegulatoryChangeV2(changeCategory)`,
  `CREATE INDEX IF NOT EXISTS idx_rc2_jur ON RegulatoryChangeV2(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_rc2_pipe ON RegulatoryChangeV2(pipelineStatus)`,
  `CREATE INDEX IF NOT EXISTS idx_rc2_sev ON RegulatoryChangeV2(impactSeverity)`,
  `CREATE INDEX IF NOT EXISTS idx_rc2_eff ON RegulatoryChangeV2(effectiveDate)`,

  // 3. ChangePipelineStep
  `CREATE TABLE IF NOT EXISTS ChangePipelineStep (
    id TEXT PRIMARY KEY NOT NULL,
    changeId TEXT NOT NULL,
    stepName TEXT NOT NULL,
    stepOrder INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    actor TEXT,
    resultSummary TEXT, resultData TEXT,
    governorDecisionId TEXT, multisigRef TEXT,
    startedAt DATETIME, completedAt DATETIME,
    notes TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (changeId, stepName)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cps_change ON ChangePipelineStep(changeId)`,
  `CREATE INDEX IF NOT EXISTS idx_cps_step ON ChangePipelineStep(stepName)`,
  `CREATE INDEX IF NOT EXISTS idx_cps_status ON ChangePipelineStep(status)`,

  // 4. RegulatorySnapshotVersion
  `CREATE TABLE IF NOT EXISTS RegulatorySnapshotVersion (
    id TEXT PRIMARY KEY NOT NULL,
    versionId TEXT NOT NULL UNIQUE,
    changeId TEXT,
    jurisdictionCode TEXT NOT NULL,
    versionNumber INTEGER NOT NULL DEFAULT 1,
    snapshotContent TEXT,
    snapshotHash TEXT,
    activeTradesUsingThisVersion INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    supersededByVersion TEXT,
    effectiveDate DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rsv_jur ON RegulatorySnapshotVersion(jurisdictionCode)`,
  `CREATE INDEX IF NOT EXISTS idx_rsv_change ON RegulatorySnapshotVersion(changeId)`,
  `CREATE INDEX IF NOT EXISTS idx_rsv_ver ON RegulatorySnapshotVersion(versionNumber)`,
  `CREATE INDEX IF NOT EXISTS idx_rsv_status ON RegulatorySnapshotVersion(status)`,
]

async function main() {
  console.log(`[phase9] Creating ${DDL.length} DDL statements on Turso...`)
  let ok = 0, fail = 0
  for (const sql of DDL) {
    try { await client.execute(sql); ok++ }
    catch (e: any) { fail++; console.error(`[phase9] DDL FAILED: ${e.message}\n  SQL: ${sql.slice(0,120)}`) }
  }
  console.log(`[phase9] Done. OK=${ok} FAIL=${fail}`)
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CountryActivationWorkflow','RegulatoryChangeV2','ChangePipelineStep','RegulatorySnapshotVersion') ORDER BY name`
  )
  console.log(`[phase9] Phase 9 tables present:`)
  for (const row of res.rows) console.log(`  - ${(row as any).name}`)
}

main().catch((e) => { console.error('[phase9] FATAL', e); process.exit(1) })
