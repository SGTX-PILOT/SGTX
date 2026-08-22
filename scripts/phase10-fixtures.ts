/**
 * Phase 10 Remediation — 3 Canonical E2E Test Fixtures (§F)
 *
 * FIXTURE 1 — SGTX-E2E-COMPLETE-0001 — All 23 steps pass, all 7 closure conditions pass, USTN_CLOSED
 * FIXTURE 2 — SGTX-E2E-SETTLEMENT-BLOCKED-0001 — settlement incomplete, cannot close
 * FIXTURE 3 — SGTX-E2E-MULTI-BLOCKED-0001 — multiple blockers (settlement + post-clearance + evidence)
 *
 * Also marks the existing SGTX-PHASE7-NORMAL-0001 as HISTORICAL_FIXTURE.
 *
 * Run: bun run scripts/phase10-fixtures.ts
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

async function main() {
  console.log('[fixtures] Phase 10 canonical E2E fixtures — start')

  // =========================================================================
  // Mark existing SGTX-PHASE7-NORMAL-0001 as HISTORICAL_FIXTURE
  // =========================================================================
  console.log('[fixtures] 0/4 Marking existing PHASE7 fixtures as HISTORICAL')
  await exec(
    `UPDATE TradeClosureState SET notes = 'HISTORICAL_FIXTURE — not treated as live authoritative state. Created in Phase 7 seed before state-integrity hardening.' WHERE ustn LIKE 'SGTX-PHASE7-%'`
  )
  console.log('[fixtures]   Historical fixtures marked')

  // =========================================================================
  // FIXTURE 1 — SGTX-E2E-COMPLETE-0001 — FULLY COMPLETE
  // =========================================================================
  console.log('[fixtures] 1/4 FIXTURE 1 — SGTX-E2E-COMPLETE-0001 (fully complete)')

  // 1. DeliveryAcceptance — ACCEPTED
  await exec(
    `INSERT OR IGNORE INTO DeliveryAcceptance (id, ustn, tradeId, shipmentId, receiverGtid, receiverName, receiverSignature, quantityDelivered, quantityUnit, quantityAccepted, quantityRejected, condition, conditionNotes, quality, qualityNotes, temperatureMinC, temperatureMaxC, temperatureActualC, temperatureCompliant, podReference, documents, photos, status, acceptanceTimestamp, rejectionReason, deliveryLocation, deliveryLat, deliveryLng, claimId, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['da_e2e_complete', 'SGTX-E2E-COMPLETE-0001', null, null, 'SGTX-EG-SEL-000010-AAAA', 'European Importer GmbH', 'sig-e2e-001', 50000, 'KG', 50000, 0, 'GOOD', null, 'ACCEPTABLE', null, 0, 4, 2, 1, 'POD-E2E-001', JSON.stringify([{ type: 'DELIVERY_NOTE', reference: 'DN-E2E-001' }]), JSON.stringify([]), 'ACCEPTED', PAST.toISOString(), null, 'EGBE', 31.2, 29.9, null, 'FIXTURE 1 — fully complete delivery (ACCEPTED)', NOW.toISOString(), NOW.toISOString()]
  )

  // 2. GlobalPayment — SETTLED (settlement complete)
  await exec(
    `INSERT OR IGNORE INTO GlobalPayment (id, paymentId, ustn, tradeId, payerGtid, payeeGtid, paymentMethod, amountUsd, currency, fxRate, amountLocal, payerBankBic, payerAccount, payeeBankBic, payeeAccount, pspName, settlementStructure, feeLockId, settlementInstructionId, status, idempotencyKey, paymentAttemptId, reconciliationStatus, reconciliationId, initiatedAt, submittedAt, settledAt, failedAt, failureReason, failureCode, paymentReference, attachments, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['gp_e2e_complete', 'GP-E2E-COMPLETE-001', 'SGTX-E2E-COMPLETE-0001', null, 'SGTX-EG-TRD-002139-7F3A', 'SGTX-EG-SEL-000010-AAAA', 'SWIFT', 50000, 'USD', null, null, 'CBEGEGCX', null, 'EBPKEGCX', null, null, null, null, null, 'SETTLED', 'idem-e2e-complete-001', null, 'RECONCILED', null, PAST.toISOString(), PAST.toISOString(), PAST.toISOString(), null, null, null, 'SWIFT-REF-E2E-001', null, 'FIXTURE 1 — SETTLED payment (settlement complete)', NOW.toISOString(), NOW.toISOString()]
  )

  // 3. AccountingEntry — POSTED (financial reconciliation complete)
  await exec(
    `INSERT OR IGNORE INTO AccountingEntry (id, entryId, ustn, tradeId, category, debitAccount, creditAccount, amountUsd, currency, fxRate, amountLocal, description, reference, accountingDate, period, status, postedAt, postedBy, sourceType, sourceId, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['ae_e2e_complete', 'AE-E2E-COMPLETE-001', 'SGTX-E2E-COMPLETE-0001', null, 'AR', '1200-Accounts Receivable', '4000-Sales Revenue', 50000, 'USD', null, null, 'FIXTURE 1 — sales revenue', 'INV-E2E-001', PAST.toISOString(), '2024-01', 'POSTED', PAST.toISOString(), 'SGTX Accounting', null, null, 'FIXTURE 1 — POSTED accounting entry', NOW.toISOString(), NOW.toISOString()]
  )

  // 4. FinalEvidencePackage — SEALED
  await exec(
    `INSERT OR IGNORE INTO FinalEvidencePackage (id, packageId, ustn, tradeId, rfq, quotation, purchaseOrder, contract, invoice, packingList, licenses, permits, certificates, customs, transport, gps, iot, inspection, qc, governmentReferences, payment, bankConfirmation, settlement, accounting, delivery, claims, disputes, communications, governorDecisions, loomChain, packageHash, sealedAt, sealedBy, status, completenessScore, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['fep_e2e_complete', 'FEP-E2E-COMPLETE-001', 'SGTX-E2E-COMPLETE-0001', null,
     JSON.stringify([{ ref: 'RFQ-E2E-001' }]), JSON.stringify([{ ref: 'LQ2-E2E-001' }]),
     JSON.stringify([{ ref: 'PO-E2E-001' }]), JSON.stringify([{ ref: 'CONTRACT-E2E-001' }]),
     JSON.stringify([{ ref: 'INV-E2E-001' }]), JSON.stringify([{ ref: 'PL-E2E-001' }]),
     JSON.stringify([{ ref: 'LIC-E2E-001' }]), JSON.stringify([{ ref: 'PERM-E2E-001' }]),
     JSON.stringify([{ ref: 'CERT-E2E-001' }]), JSON.stringify([{ ref: 'CUS-E2E-001' }]),
     JSON.stringify([{ ref: 'BL-E2E-001' }]), JSON.stringify([{ lat: 31.2, lng: 29.9 }]),
     JSON.stringify([{ sensor: 'temp', value: 2 }]), JSON.stringify([{ ref: 'INS-E2E-001' }]),
     JSON.stringify([{ ref: 'QC-E2E-001' }]), JSON.stringify([{ ref: 'GOV-REF-E2E-001' }]),
     JSON.stringify([{ ref: 'GP-E2E-COMPLETE-001' }]), JSON.stringify([{ ref: 'BC-E2E-001' }]),
     JSON.stringify([{ ref: 'SET-E2E-001' }]), JSON.stringify([{ ref: 'AE-E2E-COMPLETE-001' }]),
     JSON.stringify([{ ref: 'POD-E2E-001' }]), JSON.stringify([]),
     JSON.stringify([]), JSON.stringify([{ ref: 'MSG-E2E-001' }]),
     JSON.stringify([{ ref: 'GOV-DEC-E2E-001' }]), JSON.stringify([{ hash: 'loom-e2e-001' }]),
     'sha256_e2e_complete_hash', PAST.toISOString(), 'SGTX Closure Agent',
     'SEALED', 1.0, 'FIXTURE 1 — sealed evidence package (100% complete)',
     NOW.toISOString(), NOW.toISOString()]
  )

  // 5. TradeClosureState — USTN_CLOSED (all 7 conditions met)
  await exec(
    `INSERT OR IGNORE INTO TradeClosureState (id, ustn, tradeId, deliveryAccepted, settlementComplete, financialReconciliationComplete, activeCustomsObligationsComplete, requiredPostClearanceObligationsComplete, disputeClaimStateResolved, evidencePackageSealed, evidencePackageId, closureState, closedAt, closedBy, closureChecklist, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['tcs_e2e_complete', 'SGTX-E2E-COMPLETE-0001', null,
     1, 1, 1, 1, 1, 1, 1,  // ALL 7 conditions = true
     'fep_e2e_complete', 'USTN_CLOSED', PAST.toISOString(), 'SGTX Closure Agent',
     JSON.stringify([
       { condition: 'deliveryAccepted', met: true, notes: 'ACCEPTED' },
       { condition: 'settlementComplete', met: true, notes: 'GP-E2E-COMPLETE-001 SETTLED' },
       { condition: 'financialReconciliationComplete', met: true, notes: 'AE-E2E-COMPLETE-001 POSTED' },
       { condition: 'activeCustomsObligationsComplete', met: true, notes: 'No open customs' },
       { condition: 'requiredPostClearanceObligationsComplete', met: true, notes: 'No open PCA' },
       { condition: 'disputeClaimStateResolved', met: true, notes: 'No open claims' },
       { condition: 'evidencePackageSealed', met: true, notes: 'FEP-E2E-COMPLETE-001 SEALED' },
     ]),
     'FIXTURE 1 — fully complete (all 7 conditions met, USTN_CLOSED)',
     NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[fixtures]   FIXTURE 1 complete (USTN_CLOSED, all 7 conditions met)')

  // =========================================================================
  // FIXTURE 2 — SGTX-E2E-SETTLEMENT-BLOCKED-0001 — SETTLEMENT INCOMPLETE
  // =========================================================================
  console.log('[fixtures] 2/4 FIXTURE 2 — SGTX-E2E-SETTLEMENT-BLOCKED-0001')

  // DeliveryAcceptance — ACCEPTED
  await exec(
    `INSERT OR IGNORE INTO DeliveryAcceptance (id, ustn, tradeId, shipmentId, receiverGtid, receiverName, receiverSignature, quantityDelivered, quantityUnit, quantityAccepted, quantityRejected, condition, conditionNotes, quality, qualityNotes, temperatureMinC, temperatureMaxC, temperatureActualC, temperatureCompliant, podReference, documents, photos, status, acceptanceTimestamp, rejectionReason, deliveryLocation, deliveryLat, deliveryLng, claimId, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['da_e2e_settl_blk', 'SGTX-E2E-SETTLEMENT-BLOCKED-0001', null, null, 'SGTX-EG-SEL-000010-AAAA', 'European Importer GmbH', 'sig-e2e-002', 30000, 'KG', 30000, 0, 'GOOD', null, 'ACCEPTABLE', null, null, null, null, null, 'POD-E2E-002', JSON.stringify([]), JSON.stringify([]), 'ACCEPTED', PAST.toISOString(), null, 'EGBE', null, null, null, 'FIXTURE 2 — delivery accepted but settlement incomplete', NOW.toISOString(), NOW.toISOString()]
  )

  // GlobalPayment — PENDING (settlement NOT complete)
  await exec(
    `INSERT OR IGNORE INTO GlobalPayment (id, paymentId, ustn, tradeId, payerGtid, payeeGtid, paymentMethod, amountUsd, currency, fxRate, amountLocal, payerBankBic, payerAccount, payeeBankBic, payeeAccount, pspName, settlementStructure, feeLockId, settlementInstructionId, status, idempotencyKey, paymentAttemptId, reconciliationStatus, reconciliationId, initiatedAt, submittedAt, settledAt, failedAt, failureReason, failureCode, paymentReference, attachments, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['gp_e2e_settl_blk', 'GP-E2E-SETTL-BLK-001', 'SGTX-E2E-SETTLEMENT-BLOCKED-0001', null, 'SGTX-EG-TRD-002139-7F3A', 'SGTX-EG-SEL-000010-AAAA', 'SWIFT', 30000, 'USD', null, null, 'CBEGEGCX', null, 'EBPKEGCX', null, null, null, null, null, 'PENDING', 'idem-e2e-settl-blk-001', null, 'UNRECONCILED', null, PAST.toISOString(), null, null, null, null, null, null, null, 'FIXTURE 2 — PENDING payment (settlement incomplete)', NOW.toISOString(), NOW.toISOString()]
  )

  // FinalEvidencePackage — SEALED
  await exec(
    `INSERT OR IGNORE INTO FinalEvidencePackage (id, packageId, ustn, tradeId, rfq, quotation, purchaseOrder, contract, invoice, packingList, licenses, permits, certificates, customs, transport, gps, iot, inspection, qc, governmentReferences, payment, bankConfirmation, settlement, accounting, delivery, claims, disputes, communications, governorDecisions, loomChain, packageHash, sealedAt, sealedBy, status, completenessScore, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['fep_e2e_settl_blk', 'FEP-E2E-SETTL-BLK-001', 'SGTX-E2E-SETTLEMENT-BLOCKED-0001', null,
     JSON.stringify([{ ref: 'RFQ-E2E-002' }]), JSON.stringify([{ ref: 'LQ2-E2E-002' }]),
     JSON.stringify([{ ref: 'PO-E2E-002' }]), JSON.stringify([{ ref: 'CONTRACT-E2E-002' }]),
     JSON.stringify([{ ref: 'INV-E2E-002' }]), JSON.stringify([{ ref: 'PL-E2E-002' }]),
     JSON.stringify([{ ref: 'LIC-E2E-002' }]), JSON.stringify([{ ref: 'PERM-E2E-002' }]),
     JSON.stringify([{ ref: 'CERT-E2E-002' }]), JSON.stringify([{ ref: 'CUS-E2E-002' }]),
     JSON.stringify([{ ref: 'BL-E2E-002' }]), JSON.stringify([{ lat: 31.2, lng: 29.9 }]),
     JSON.stringify([{ sensor: 'temp', value: 2 }]), JSON.stringify([{ ref: 'INS-E2E-002' }]),
     JSON.stringify([{ ref: 'QC-E2E-002' }]), JSON.stringify([{ ref: 'GOV-REF-E2E-002' }]),
     JSON.stringify([{ ref: 'GP-E2E-SETTL-BLK-001' }]), JSON.stringify([{ ref: 'BC-E2E-002' }]),
     JSON.stringify([{ ref: 'SET-E2E-002' }]), JSON.stringify([{ ref: 'AE-E2E-002' }]),
     JSON.stringify([{ ref: 'POD-E2E-002' }]), JSON.stringify([]),
     JSON.stringify([]), JSON.stringify([{ ref: 'MSG-E2E-002' }]),
     JSON.stringify([{ ref: 'GOV-DEC-E2E-002' }]), JSON.stringify([{ hash: 'loom-e2e-002' }]),
     'sha256_e2e_settl_blk_hash', PAST.toISOString(), 'SGTX Closure Agent',
     'SEALED', 1.0, 'FIXTURE 2 — sealed evidence package',
     NOW.toISOString(), NOW.toISOString()]
  )

  // TradeClosureState — OPEN (settlementComplete=false)
  await exec(
    `INSERT OR IGNORE INTO TradeClosureState (id, ustn, tradeId, deliveryAccepted, settlementComplete, financialReconciliationComplete, activeCustomsObligationsComplete, requiredPostClearanceObligationsComplete, disputeClaimStateResolved, evidencePackageSealed, evidencePackageId, closureState, closedAt, closedBy, closureChecklist, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['tcs_e2e_settl_blk', 'SGTX-E2E-SETTLEMENT-BLOCKED-0001', null,
     1, 0, 1, 1, 1, 1, 1,  // settlementComplete=false, rest true
     'fep_e2e_settl_blk', 'OPEN', null, null,
     JSON.stringify([
       { condition: 'deliveryAccepted', met: true },
       { condition: 'settlementComplete', met: false, notes: 'GP-E2E-SETTL-BLK-001 PENDING' },
       { condition: 'financialReconciliationComplete', met: true },
       { condition: 'activeCustomsObligationsComplete', met: true },
       { condition: 'requiredPostClearanceObligationsComplete', met: true },
       { condition: 'disputeClaimStateResolved', met: true },
       { condition: 'evidencePackageSealed', met: true },
     ]),
     'FIXTURE 2 — settlement blocked (settlementComplete=false, closureState=OPEN)',
     NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[fixtures]   FIXTURE 2 complete (settlement blocked, closureState=OPEN)')

  // =========================================================================
  // FIXTURE 3 — SGTX-E2E-MULTI-BLOCKED-0001 — MULTI-BLOCKED
  // =========================================================================
  console.log('[fixtures] 3/4 FIXTURE 3 — SGTX-E2E-MULTI-BLOCKED-0001')

  // DeliveryAcceptance — ACCEPTED (delivery OK)
  await exec(
    `INSERT OR IGNORE INTO DeliveryAcceptance (id, ustn, tradeId, shipmentId, receiverGtid, receiverName, receiverSignature, quantityDelivered, quantityUnit, quantityAccepted, quantityRejected, condition, conditionNotes, quality, qualityNotes, temperatureMinC, temperatureMaxC, temperatureActualC, temperatureCompliant, podReference, documents, photos, status, acceptanceTimestamp, rejectionReason, deliveryLocation, deliveryLat, deliveryLng, claimId, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['da_e2e_multi_blk', 'SGTX-E2E-MULTI-BLOCKED-0001', null, null, 'SGTX-EG-SEL-000010-AAAA', 'European Importer GmbH', 'sig-e2e-003', 20000, 'KG', 20000, 0, 'GOOD', null, 'ACCEPTABLE', null, null, null, null, null, 'POD-E2E-003', JSON.stringify([]), JSON.stringify([]), 'ACCEPTED', PAST.toISOString(), null, 'EGBE', null, null, null, 'FIXTURE 3 — delivery accepted but multiple blockers', NOW.toISOString(), NOW.toISOString()]
  )

  // GlobalPayment — FAILED (settlement incomplete)
  await exec(
    `INSERT OR IGNORE INTO GlobalPayment (id, paymentId, ustn, tradeId, payerGtid, payeeGtid, paymentMethod, amountUsd, currency, fxRate, amountLocal, payerBankBic, payerAccount, payeeBankBic, payeeAccount, pspName, settlementStructure, feeLockId, settlementInstructionId, status, idempotencyKey, paymentAttemptId, reconciliationStatus, reconciliationId, initiatedAt, submittedAt, settledAt, failedAt, failureReason, failureCode, paymentReference, attachments, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['gp_e2e_multi_blk', 'GP-E2E-MULTI-BLK-001', 'SGTX-E2E-MULTI-BLOCKED-0001', null, 'SGTX-EG-TRD-002139-7F3A', 'SGTX-EG-SEL-000010-AAAA', 'PSP', 20000, 'USD', null, null, null, null, null, null, 'Paymob', null, null, null, 'FAILED', 'idem-e2e-multi-blk-001', null, 'UNRECONCILED', null, PAST.toISOString(), PAST.toISOString(), null, PAST.toISOString(), 'Insufficient funds', 'NSF', null, null, 'FIXTURE 3 — FAILED payment (settlement incomplete)', NOW.toISOString(), NOW.toISOString()]
  )

  // PostClearanceAction — OPEN (post-clearance incomplete)
  await exec(
    `INSERT OR IGNORE INTO PostClearanceAction (id, actionId, ustn, tradeId, customsOperationId, actionType, description, customsAuthority, customsReference, amountUsd, currency, status, resolution, resolutionNotes, filedAt, reviewedAt, resolvedAt, accountingEntryId, reconciliationId, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['pca_e2e_multi_blk', 'PCA-E2E-MULTI-BLK-001', 'SGTX-E2E-MULTI-BLOCKED-0001', null, null, 'CUSTOMS_AUDIT', 'Open customs audit — valuation verification pending', 'Egyptian Customs Authority', 'CUS-E2E-AUDIT-001', null, 'USD', 'OPEN', null, null, PAST.toISOString(), null, null, null, null, 'FIXTURE 3 — open post-clearance audit', NOW.toISOString(), NOW.toISOString()]
  )

  // TradeClosureState — OPEN (3 blockers: settlement + post-clearance + evidence)
  await exec(
    `INSERT OR IGNORE INTO TradeClosureState (id, ustn, tradeId, deliveryAccepted, settlementComplete, financialReconciliationComplete, activeCustomsObligationsComplete, requiredPostClearanceObligationsComplete, disputeClaimStateResolved, evidencePackageSealed, evidencePackageId, closureState, closedAt, closedBy, closureChecklist, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['tcs_e2e_multi_blk', 'SGTX-E2E-MULTI-BLOCKED-0001', null,
     1, 0, 0, 1, 0, 1, 0,  // settlementComplete=false, financialReconciliation=false, postClearance=false, evidence=false
     null, 'OPEN', null, null,
     JSON.stringify([
       { condition: 'deliveryAccepted', met: true },
       { condition: 'settlementComplete', met: false, notes: 'GP-E2E-MULTI-BLK-001 FAILED' },
       { condition: 'financialReconciliationComplete', met: false, notes: 'Payment FAILED — no reconciliation' },
       { condition: 'activeCustomsObligationsComplete', met: true },
       { condition: 'requiredPostClearanceObligationsComplete', met: false, notes: 'PCA-E2E-MULTI-BLK-001 OPEN' },
       { condition: 'disputeClaimStateResolved', met: true },
       { condition: 'evidencePackageSealed', met: false, notes: 'No sealed evidence package' },
     ]),
     'FIXTURE 3 — multi-blocked (settlement + post-clearance + evidence incomplete)',
     NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[fixtures]   FIXTURE 3 complete (multi-blocked, 4 blockers)')

  // =========================================================================
  // Verify fixtures
  // =========================================================================
  console.log('[fixtures] 4/4 Verifying fixtures')
  for (const ustn of ['SGTX-E2E-COMPLETE-0001', 'SGTX-E2E-SETTLEMENT-BLOCKED-0001', 'SGTX-E2E-MULTI-BLOCKED-0001']) {
    const r = await client.execute(`SELECT closureState, deliveryAccepted, settlementComplete, financialReconciliationComplete, requiredPostClearanceObligationsComplete, evidencePackageSealed FROM TradeClosureState WHERE ustn = ?`, [ustn])
    if (r.rows.length > 0) {
      const row = r.rows[0] as any
      const allMet = row.deliveryAccepted && row.settlementComplete && row.financialReconciliationComplete && row.requiredPostClearanceObligationsComplete && row.evidencePackageSealed
      console.log(`[fixtures]   ${ustn}: closureState=${row.closureState} allConditionsMet=${allMet ? 'YES' : 'NO'}`)
    }
  }

  console.log('[fixtures] Done. 3 canonical E2E fixtures created:')
  console.log('[fixtures]   1. SGTX-E2E-COMPLETE-0001 — all 23 steps + 7 conditions pass → USTN_CLOSED')
  console.log('[fixtures]   2. SGTX-E2E-SETTLEMENT-BLOCKED-0001 — settlement incomplete → closureState=OPEN, blocker=SETTLEMENT_INCOMPLETE')
  console.log('[fixtures]   3. SGTX-E2E-MULTI-BLOCKED-0001 — 4 blockers → closureState=OPEN, blockers=SETTLEMENT_INCOMPLETE+FINANCIAL_RECONCILIATION_INCOMPLETE+POST_CLEARANCE_OPEN+EVIDENCE_NOT_SEALED')
  console.log('[fixtures]   Existing SGTX-PHASE7-* fixtures marked as HISTORICAL_FIXTURE')
}

main().catch((e) => { console.error('[fixtures] FATAL', e); process.exit(1) })
