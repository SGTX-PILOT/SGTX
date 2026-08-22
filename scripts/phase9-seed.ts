/**
 * Phase 9 — Seed data covering all §7 test scenarios.
 *
 * §7 test scenarios:
 *   1. regulation change        → RegulatoryChangeV2 (TARIFF, AMENDED, DETECTED→DEPLOYED)
 *   2. effective date            → change with future effectiveDate
 *   3. active trade snapshot    → RegulatorySnapshotVersion (v1 ACTIVE for locked trade)
 *   4. future trade new rule    → RegulatorySnapshotVersion (v2 ACTIVE after deployment)
 *   5. policy simulation        → change at SIMULATED status
 *   6. rollback                 → change at ROLLED_BACK status
 *
 * Plus: country activation workflow for EG (partially complete) + SA (fully ACTIVATED).
 *
 * Run: bun run scripts/phase9-seed.ts
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

async function exec(sql: string, args: unknown[] = []) {
  const safeArgs = args.map((a) => {
    if (a instanceof Date) return a.toISOString()
    if (a === undefined) return null
    return a
  })
  await client.execute({ sql, args: safeArgs })
}

const NOW = new Date()
const PAST = new Date('2024-01-01')
const FUTURE = new Date('2027-12-31')
const FUTURE_EFFECTIVE = new Date('2025-06-01')

async function main() {
  console.log('[seed] Phase 9 country activation + regulatory change seed — start')

  // -------------------------------------------------------------------------
  // §1 CountryActivationWorkflows (EG partially complete + SA fully ACTIVATED)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/4 CountryActivationWorkflows')
  // EG — partially complete (step 1-8 done, step 9+ pending)
  await exec(
    `INSERT OR IGNORE INTO CountryActivationWorkflow (id, workflowId, countryCode, countryName, currentStep, step1JurisdictionSelected, step2OfficialSourcesLoaded, step3CustomsProfileConfigured, step4TaxConfigured, step5SpsConfigured, step6TbtConfigured, step7LicensingConfigured, step8TransportConfigured, step9CustomsSystemsIdentified, step10ApisIdentified, step11EdiIdentified, step12PortalsIdentified, step13ManualProceduresIdentified, step14CredentialsEntered, step15SandboxConnection, step16ConformanceTesting, step17LegalRegulatoryReview, step18ProductionApproval, step19Activation, step20LoomRecord, stepHistory, status, activatedAt, owner, loomHash, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['caw_eg_partial', 'CAW-20240101-00001', 'EG', 'Egypt', 9,
     1, 1, 1, 1, 1, 1, 1, 1,  // steps 1-8 done
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // steps 9-20 pending
     JSON.stringify([
       { step: 1, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'EG jurisdiction selected' },
       { step: 2, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'Official sources loaded (Nafeza, ETA, GOEIC)' },
       { step: 3, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'Customs profile configured' },
       { step: 4, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'Tax configured (VAT 14%)' },
       { step: 5, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'SPS configured' },
       { step: 6, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'TBT configured (GSO standards)' },
       { step: 7, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'Licensing configured' },
       { step: 8, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'Transport configured (road/air/sea/rail)' },
     ]),
     'IN_PROGRESS', null, 'SGTX Egypt Integrations', null,
     'EG — partially complete (8/20 steps done)',
     NOW.toISOString(), NOW.toISOString()]
  )
  // SA — fully ACTIVATED (all 20 steps done)
  await exec(
    `INSERT OR IGNORE INTO CountryActivationWorkflow (id, workflowId, countryCode, countryName, currentStep, step1JurisdictionSelected, step2OfficialSourcesLoaded, step3CustomsProfileConfigured, step4TaxConfigured, step5SpsConfigured, step6TbtConfigured, step7LicensingConfigured, step8TransportConfigured, step9CustomsSystemsIdentified, step10ApisIdentified, step11EdiIdentified, step12PortalsIdentified, step13ManualProceduresIdentified, step14CredentialsEntered, step15SandboxConnection, step16ConformanceTesting, step17LegalRegulatoryReview, step18ProductionApproval, step19Activation, step20LoomRecord, stepHistory, status, activatedAt, owner, loomHash, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['caw_sa_activated', 'CAW-20240101-00002', 'SA', 'Saudi Arabia', 20,
     1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,  // all 20 done
     JSON.stringify([{ step: 20, completedAt: PAST.toISOString(), completedBy: 'SGTX Admin', notes: 'Loom record sealed' }]),
     'ACTIVATED', PAST.toISOString(), 'SGTX KSA Integrations', 'sha256_placeholder_sa_activation',
     'SA — fully activated (20/20 steps)',
     NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[seed]   2 country activation workflows upserted (EG partial + SA activated)')

  // -------------------------------------------------------------------------
  // §2 RegulatoryChanges (covering §7 scenarios 1, 2, 5, 6)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/4 RegulatoryChanges')
  const changes = [
    // §7 #1 — regulation change (TARIFF, AMENDED, DEPLOYED)
    {
      id: 'rc_tariff_deployed', changeId: 'RCG-20240115-00001',
      changeCategory: 'TARIFF', changeType: 'AMENDED',
      title: 'Egypt MFN tariff on cotton fabric (520831) increased from 12% to 15%',
      description: 'Egyptian Customs Authority announced MFN tariff increase on cotton woven fabric (HS 520831) from 12% to 15%, effective 2024-02-01.',
      sourceAuthority: 'Egyptian Customs Authority', sourceUrl: 'https://customs.gov.eg/tariff-update', sourceReference: 'Gazette-2024-014',
      detectedBy: 'RIA', jurisdictionCode: 'EG',
      announcedDate: PAST.toISOString(), effectiveDate: PAST.toISOString(), expiryDate: null,
      affectedProducts: JSON.stringify(['520831']),
      affectedCountries: JSON.stringify(['EG']),
      affectedModes: JSON.stringify([]),
      affectedTradeLanes: JSON.stringify(['TLR-EG-EU-SEA']),
      affectedActiveUstns: JSON.stringify(['SGTX-PHASE7-NORMAL-0001']),
      affectedDocuments: JSON.stringify([]),
      affectedPolicies: JSON.stringify([]),
      affectedIntegrations: JSON.stringify(['CAT-20240101-00001']),
      impactSummary: 'This tariff change affects cotton fabric imports into Egypt. 1 active trade impacted. Severity: MODERATE.',
      impactSeverity: 'MODERATE',
      snapshotPolicy: 'PRESERVE_EXISTING',
      pipelineStatus: 'DEPLOYED',
      pipelineHistory: JSON.stringify([
        { status: 'DETECTED', at: PAST.toISOString(), actor: 'RIA', notes: 'Detected via gazette monitor' },
        { status: 'VERIFIED', at: PAST.toISOString(), actor: 'SGTX Compliance', notes: 'Verified against official gazette' },
        { status: 'IMPACTED', at: PAST.toISOString(), actor: 'Impact Engine', notes: '1 active USTN affected' },
        { status: 'SIMULATED', at: PAST.toISOString(), actor: 'Simulation Engine', notes: 'Additional duty $1500 per trade' },
        { status: 'APPROVED', at: PAST.toISOString(), actor: 'SGTX Admin', notes: 'Approved — non-constitutional' },
        { status: 'COMPILED', at: PAST.toISOString(), actor: 'Compile Engine', notes: 'New tariff rule compiled' },
        { status: 'DEPLOYED', at: PAST.toISOString(), actor: 'Deploy Engine', notes: 'New tariff active — existing trades retain old snapshot' },
      ]),
      governorDecision: null, multisigApproval: null,
      deployedAt: PAST.toISOString(), deploymentNotes: 'Deployed to production — v2 snapshot created',
      rollbackSupported: 1, rolledBackAt: null, rollbackReason: null,
      notes: '§7 #1 — regulation change (deployed)'
    },
    // §7 #2 — effective date (future)
    {
      id: 'rc_sps_future', changeId: 'RCG-20240201-00002',
      changeCategory: 'SPS', changeType: 'NEW',
      title: 'New UAE SPS requirement for Egyptian agricultural exports (phytosanitary pre-shipment inspection)',
      description: 'UAE NFSA announced new phytosanitary pre-shipment inspection requirement for all Egyptian agricultural exports, effective 2025-06-01.',
      sourceAuthority: 'UAE NFSA', sourceUrl: 'https://nfsa.gov.ae/new-rule', sourceReference: 'NFSA-2025-001',
      detectedBy: 'RIA', jurisdictionCode: 'AE',
      announcedDate: NOW.toISOString(), effectiveDate: FUTURE_EFFECTIVE.toISOString(), expiryDate: null,
      affectedProducts: JSON.stringify(['070310', '070320']),
      affectedCountries: JSON.stringify(['AE', 'EG']),
      affectedModes: JSON.stringify(['SEA', 'AIR', 'ROAD']),
      affectedTradeLanes: JSON.stringify(['TLR-EG-AE-ROAD']),
      affectedActiveUstns: JSON.stringify([]),
      affectedDocuments: JSON.stringify(['PHYTOSANITARY', 'INSPECTION_CERTIFICATE']),
      affectedPolicies: JSON.stringify([]),
      affectedIntegrations: JSON.stringify([]),
      impactSummary: 'New SPS requirement for Egyptian agricultural exports to UAE. No active trades impacted yet (future rule). Severity: MODERATE.',
      impactSeverity: 'MODERATE',
      snapshotPolicy: 'PRESERVE_EXISTING',
      pipelineStatus: 'IMPACTED',
      pipelineHistory: JSON.stringify([
        { status: 'DETECTED', at: NOW.toISOString(), actor: 'RIA', notes: 'Detected via UAE NFSA monitor' },
        { status: 'VERIFIED', at: NOW.toISOString(), actor: 'SGTX Compliance', notes: 'Verified' },
        { status: 'IMPACTED', at: NOW.toISOString(), actor: 'Impact Engine', notes: 'No active trades (future rule)' },
      ]),
      governorDecision: null, multisigApproval: null,
      deployedAt: null, deploymentNotes: null,
      rollbackSupported: 1, rolledBackAt: null, rollbackReason: null,
      notes: '§7 #2 — future effective date (2025-06-01)'
    },
    // §7 #5 — policy simulation (SIMULATED status)
    {
      id: 'rc_tbt_simulated', changeId: 'RCG-20240210-00003',
      changeCategory: 'TBT', changeType: 'AMENDED',
      title: 'Egypt TBT — new GSO labeling requirement for textiles (Arabic + English fiber content)',
      description: 'Egyptian Organization for Standardization (EOS) amended GSO 9 labeling requirement for textiles — now requires Arabic + English fiber content labeling.',
      sourceAuthority: 'EOS', sourceUrl: 'https://eos.org.eg/amendment', sourceReference: 'GSO-9-2024-A1',
      detectedBy: 'RIA', jurisdictionCode: 'EG',
      announcedDate: PAST.toISOString(), effectiveDate: FUTURE_EFFECTIVE.toISOString(), expiryDate: null,
      affectedProducts: JSON.stringify(['520831']),
      affectedCountries: JSON.stringify(['EG']),
      affectedModes: JSON.stringify([]),
      affectedTradeLanes: JSON.stringify(['TLR-EG-EU-SEA']),
      affectedActiveUstns: JSON.stringify(['SGTX-PHASE7-NORMAL-0001']),
      affectedDocuments: JSON.stringify(['LABELING_CERTIFICATE']),
      affectedPolicies: JSON.stringify([]),
      affectedIntegrations: JSON.stringify([]),
      impactSummary: 'New labeling requirement for textile exports. 1 active trade may need relabeling. Severity: MINOR.',
      impactSeverity: 'MINOR',
      snapshotPolicy: 'PRESERVE_EXISTING',
      pipelineStatus: 'SIMULATED',
      pipelineHistory: JSON.stringify([
        { status: 'DETECTED', at: PAST.toISOString(), actor: 'RIA', notes: 'Detected' },
        { status: 'VERIFIED', at: PAST.toISOString(), actor: 'SGTX Compliance', notes: 'Verified' },
        { status: 'IMPACTED', at: PAST.toISOString(), actor: 'Impact Engine', notes: '1 trade affected' },
        { status: 'SIMULATED', at: PAST.toISOString(), actor: 'Simulation Engine', notes: 'Relabeling cost ~$200/trade' },
      ]),
      governorDecision: null, multisigApproval: null,
      deployedAt: null, deploymentNotes: null,
      rollbackSupported: 1, rolledBackAt: null, rollbackReason: null,
      notes: '§7 #5 — policy simulation (SIMULATED status)'
    },
    // §7 #6 — rollback (ROLLED_BACK)
    {
      id: 'rc_sanctions_rolledback', changeId: 'RCG-20240301-00004',
      changeCategory: 'SANCTIONS', changeType: 'NEW',
      title: 'New sanctions on entity "Example Corp" — DEPLOYED then ROLLED BACK',
      description: 'OFAC added "Example Corp" to SDN list. SGTX deployed the change but rolled it back after the entity was removed from the list 48 hours later.',
      sourceAuthority: 'OFAC', sourceUrl: 'https://treasury.gov/ofac/sdn', sourceReference: 'OFAC-SDN-2024-001',
      detectedBy: 'RIA', jurisdictionCode: 'US',
      announcedDate: PAST.toISOString(), effectiveDate: PAST.toISOString(), expiryDate: null,
      affectedProducts: JSON.stringify([]),
      affectedCountries: JSON.stringify(['US']),
      affectedModes: JSON.stringify([]),
      affectedTradeLanes: JSON.stringify([]),
      affectedActiveUstns: JSON.stringify([]),
      affectedDocuments: JSON.stringify([]),
      affectedPolicies: JSON.stringify([]),
      affectedIntegrations: JSON.stringify([]),
      impactSummary: 'Sanctions change — rolled back after entity removed from list. No trades affected. Severity: CRITICAL (but resolved).',
      impactSeverity: 'CRITICAL',
      snapshotPolicy: 'PRESERVE_EXISTING',
      pipelineStatus: 'ROLLED_BACK',
      pipelineHistory: JSON.stringify([
        { status: 'DETECTED', at: PAST.toISOString(), actor: 'RIA', notes: 'Detected via OFAC monitor' },
        { status: 'VERIFIED', at: PAST.toISOString(), actor: 'SGTX Compliance', notes: 'Verified' },
        { status: 'IMPACTED', at: PAST.toISOString(), actor: 'Impact Engine', notes: 'No active trades' },
        { status: 'SIMULATED', at: PAST.toISOString(), actor: 'Simulation Engine', notes: 'No impact' },
        { status: 'APPROVED', at: PAST.toISOString(), actor: 'Governor', notes: 'Constitutional — Governor + multisig approved' },
        { status: 'COMPILED', at: PAST.toISOString(), actor: 'Compile Engine', notes: 'Sanctions list updated' },
        { status: 'DEPLOYED', at: PAST.toISOString(), actor: 'Deploy Engine', notes: 'Deployed' },
        { status: 'ROLLED_BACK', at: PAST.toISOString(), actor: 'SGTX Admin', notes: 'Entity removed from OFAC list — rolled back' },
      ]),
      governorDecision: 'gov-decision-001', multisigApproval: 'multisig-001',
      deployedAt: PAST.toISOString(), deploymentNotes: 'Deployed then rolled back',
      rollbackSupported: 1, rolledBackAt: PAST.toISOString(), rollbackReason: 'Entity removed from OFAC SDN list 48 hours later',
      notes: '§7 #6 — rollback (constitutional sanctions change, rolled back)'
    },
  ]
  for (const c of changes) {
    await exec(
      `INSERT OR IGNORE INTO RegulatoryChangeV2 (id, changeId, changeCategory, changeType, title, description, sourceAuthority, sourceUrl, sourceReference, detectedBy, jurisdictionCode, announcedDate, effectiveDate, expiryDate, affectedProducts, affectedCountries, affectedModes, affectedTradeLanes, affectedActiveUstns, affectedDocuments, affectedPolicies, affectedIntegrations, impactSummary, impactSeverity, snapshotPolicy, pipelineStatus, pipelineHistory, governorDecision, multisigApproval, deployedAt, deploymentNotes, rollbackSupported, rolledBackAt, rollbackReason, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.changeId, c.changeCategory, c.changeType, c.title, c.description, c.sourceAuthority, c.sourceUrl, c.sourceReference, c.detectedBy, c.jurisdictionCode, c.announcedDate, c.effectiveDate, c.expiryDate, c.affectedProducts, c.affectedCountries, c.affectedModes, c.affectedTradeLanes, c.affectedActiveUstns, c.affectedDocuments, c.affectedPolicies, c.affectedIntegrations, c.impactSummary, c.impactSeverity, c.snapshotPolicy, c.pipelineStatus, c.pipelineHistory, c.governorDecision, c.multisigApproval, c.deployedAt, c.deploymentNotes, c.rollbackSupported ? 1 : 0, c.rolledBackAt, c.rollbackReason, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${changes.length} regulatory changes upserted`)

  // -------------------------------------------------------------------------
  // §4 ChangePipelineSteps (for the deployed tariff change)
  // -------------------------------------------------------------------------
  console.log('[seed] 3/4 ChangePipelineSteps')
  const steps = [
    { changeId: 'RCG-20240115-00001', stepName: 'DETECTED', stepOrder: 1, status: 'COMPLETED', actor: 'RIA', resultSummary: 'Detected via gazette monitor', completedAt: PAST.toISOString() },
    { changeId: 'RCG-20240115-00001', stepName: 'VERIFIED', stepOrder: 2, status: 'COMPLETED', actor: 'SGTX Compliance', resultSummary: 'Verified against official gazette', completedAt: PAST.toISOString() },
    { changeId: 'RCG-20240115-00001', stepName: 'IMPACTED', stepOrder: 3, status: 'COMPLETED', actor: 'Impact Engine', resultSummary: '1 active USTN affected', completedAt: PAST.toISOString() },
    { changeId: 'RCG-20240115-00001', stepName: 'SIMULATED', stepOrder: 4, status: 'COMPLETED', actor: 'Simulation Engine', resultSummary: 'Additional duty $1500 per trade', completedAt: PAST.toISOString() },
    { changeId: 'RCG-20240115-00001', stepName: 'APPROVED', stepOrder: 5, status: 'COMPLETED', actor: 'SGTX Admin', resultSummary: 'Approved — non-constitutional', completedAt: PAST.toISOString() },
    { changeId: 'RCG-20240115-00001', stepName: 'COMPILED', stepOrder: 6, status: 'COMPLETED', actor: 'Compile Engine', resultSummary: 'New tariff rule compiled', completedAt: PAST.toISOString() },
    { changeId: 'RCG-20240115-00001', stepName: 'DEPLOYED', stepOrder: 7, status: 'COMPLETED', actor: 'Deploy Engine', resultSummary: 'Deployed — v2 snapshot active', completedAt: PAST.toISOString() },
  ]
  let stepIdx = 0
  for (const s of steps) {
    await exec(
      `INSERT OR IGNORE INTO ChangePipelineStep (id, changeId, stepName, stepOrder, status, actor, resultSummary, resultData, governorDecisionId, multisigRef, startedAt, completedAt, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`cps_${stepIdx}`, s.changeId, s.stepName, s.stepOrder, s.status, s.actor, s.resultSummary, null, null, null, PAST.toISOString(), s.completedAt, null, NOW.toISOString(), NOW.toISOString()]
    )
    stepIdx++
  }
  console.log(`[seed]   ${steps.length} pipeline steps upserted`)

  // -------------------------------------------------------------------------
  // §5 RegulatorySnapshotVersions (covering §7 #3 active trade snapshot + #4 future trade)
  // -------------------------------------------------------------------------
  console.log('[seed] 4/4 RegulatorySnapshotVersions')
  const versions = [
    // §7 #3 — active trade snapshot (v1, SUPERSEDED — was the version for the locked trade)
    {
      id: 'rsv_eg_v1', versionId: 'RSV-20240101-00001', changeId: null, jurisdictionCode: 'EG', versionNumber: 1,
      snapshotContent: JSON.stringify({ tariff: { '520831': { mfn: 0.12 } }, sps: {}, tbt: {}, licenses: {} }),
      snapshotHash: 'sha256_v1_eg',
      activeTradesUsingThisVersion: 1, status: 'SUPERSEDED', supersededByVersion: 'RSV-20240115-00002',
      effectiveDate: PAST.toISOString(),
      notes: '§7 #3 — original snapshot (v1, superseded by v2 after tariff change)'
    },
    // §7 #4 — future trade new rule (v2, ACTIVE — the new version after the tariff change)
    {
      id: 'rsv_eg_v2', versionId: 'RSV-20240115-00002', changeId: 'RCG-20240115-00001', jurisdictionCode: 'EG', versionNumber: 2,
      snapshotContent: JSON.stringify({ tariff: { '520831': { mfn: 0.15 } }, sps: {}, tbt: {}, licenses: {} }),
      snapshotHash: 'sha256_v2_eg',
      activeTradesUsingThisVersion: 0, status: 'ACTIVE', supersededByVersion: null,
      effectiveDate: PAST.toISOString(),
      notes: '§7 #4 — new snapshot (v2, ACTIVE — future trades use the new 15% tariff)'
    },
  ]
  for (const v of versions) {
    await exec(
      `INSERT OR IGNORE INTO RegulatorySnapshotVersion (id, versionId, changeId, jurisdictionCode, versionNumber, snapshotContent, snapshotHash, activeTradesUsingThisVersion, status, supersededByVersion, effectiveDate, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [v.id, v.versionId, v.changeId, v.jurisdictionCode, v.versionNumber, v.snapshotContent, v.snapshotHash, v.activeTradesUsingThisVersion, v.status, v.supersededByVersion, v.effectiveDate, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${versions.length} snapshot versions upserted`)

  console.log('[seed] Done. §7 test scenarios available:')
  console.log('[seed]   1. regulation change     → rc_tariff_deployed (TARIFF, AMENDED, DEPLOYED)')
  console.log('[seed]   2. effective date          → rc_sps_future (effectiveDate=2025-06-01)')
  console.log('[seed]   3. active trade snapshot   → rsv_eg_v1 (SUPERSEDED — locked trade retains v1)')
  console.log('[seed]   4. future trade new rule   → rsv_eg_v2 (ACTIVE — future trades use v2)')
  console.log('[seed]   5. policy simulation       → rc_tbt_simulated (SIMULATED status)')
  console.log('[seed]   6. rollback                → rc_sanctions_rolledback (ROLLED_BACK — constitutional)')
  console.log('[seed]   Country activation: EG (8/20 steps, IN_PROGRESS) + SA (20/20, ACTIVATED)')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
