/**
 * Phase 7 — Seed data covering all §7 test scenarios.
 *
 * §7 test scenarios:
 *   1. normal completion    → ACCEPTED delivery + no claims + SEALED evidence + USTN_CLOSED
 *   2. rejected goods        → REJECTED delivery + DAMAGE claim + RETURN
 *   3. return               → ReturnRecord (REJECTION type) with parent/child USTN
 *   4. warranty              → WARRANTY claim
 *   5. insurance claim       → TEMPERATURE claim + insurance linkage
 *   6. customs post-clearance → REFUND action (PENDING_PAYMENT) + DRAWBACK (COMPLETED)
 *   7. refund               → REFUND post-clearance action
 *   8. drawback             → DRAWBACK post-clearance action
 *   9. partial settlement   → partial reconciliation (DISCREPANT)
 *  10. final evidence       → SEALED evidence package with 26 sections
 *  11. open dispute          → OPEN claim → trade NOT closed (closureState=OPEN)
 *
 * Run: bun run scripts/phase7-seed.ts
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
  console.log('[seed] Phase 7 post-trade completion seed — start')

  // -------------------------------------------------------------------------
  // §1 DeliveryAcceptance (covering §7 #1 normal + #2 rejected)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/6 DeliveryAcceptance')
  const deliveries = [
    // §7 #1 — normal completion (ACCEPTED)
    {
      id: 'da_normal_1', ustn: 'SGTX-PHASE7-NORMAL-0001', tradeId: null,
      receiverGtid: 'SGTX-EG-SEL-000010-AAAA', receiverName: 'European Importer GmbH', receiverSignature: 'sig-001',
      quantityDelivered: 50000, quantityUnit: 'KG', quantityAccepted: 50000, quantityRejected: 0,
      condition: 'GOOD', quality: 'ACCEPTABLE',
      temperatureMinC: 0, temperatureMaxC: 4, temperatureActualC: 2, temperatureCompliant: 1,
      podReference: 'POD-EG-001', documents: JSON.stringify([{ type: 'DELIVERY_NOTE', reference: 'DN-001' }]),
      photos: JSON.stringify([]),
      status: 'ACCEPTED', acceptanceTimestamp: PAST.toISOString(),
      deliveryLocation: 'EGBE', deliveryLat: 31.2, deliveryLng: 29.9,
      notes: '§7 #1 — normal completion (accepted)'
    },
    // §7 #2 — rejected goods (REJECTED → DAMAGE claim)
    {
      id: 'da_rejected_1', ustn: 'SGTX-PHASE7-REJECT-0002', tradeId: null,
      receiverGtid: 'SGTX-EG-SEL-000010-AAAA', receiverName: 'European Importer GmbH', receiverSignature: 'sig-002',
      quantityDelivered: 1000, quantityUnit: 'KG', quantityAccepted: 0, quantityRejected: 1000,
      condition: 'DAMAGED', conditionNotes: 'Goods wet — container leak', quality: 'REJECTED',
      podReference: 'POD-EG-002', documents: JSON.stringify([{ type: 'DAMAGE_REPORT', reference: 'DR-001' }]),
      photos: JSON.stringify(['photo-001.jpg', 'photo-002.jpg']),
      status: 'REJECTED', rejectionReason: 'Goods damaged in transit — container leak detected on arrival',
      deliveryLocation: 'EGBE',
      notes: '§7 #2 — rejected goods (damaged)'
    },
    // §7 #3 — partial acceptance (PARTIAL_ACCEPTANCE → SHORTAGE claim)
    {
      id: 'da_partial_1', ustn: 'SGTX-PHASE7-PARTIAL-0003', tradeId: null,
      receiverGtid: 'SGTX-EG-SEL-000010-AAAA', receiverName: 'European Importer GmbH', receiverSignature: 'sig-003',
      quantityDelivered: 5000, quantityUnit: 'KG', quantityAccepted: 4800, quantityRejected: 200,
      condition: 'PARTIAL', quality: 'CONDITIONAL',
      podReference: 'POD-EG-003', documents: JSON.stringify([]),
      status: 'PARTIAL_ACCEPTANCE', rejectionReason: 'Shortage of 200 kg (4% short)',
      deliveryLocation: 'EGBE',
      notes: '§7 #3 — partial acceptance (shortage)'
    },
  ]
  for (const d of deliveries) {
    await exec(
      `INSERT OR IGNORE INTO DeliveryAcceptance (id, ustn, tradeId, shipmentId, receiverGtid, receiverName, receiverSignature, quantityDelivered, quantityUnit, quantityAccepted, quantityRejected, condition, conditionNotes, quality, qualityNotes, temperatureMinC, temperatureMaxC, temperatureActualC, temperatureCompliant, podReference, documents, photos, status, acceptanceTimestamp, rejectionReason, deliveryLocation, deliveryLat, deliveryLng, claimId, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.id, d.ustn, d.tradeId, null, d.receiverGtid, d.receiverName, d.receiverSignature, d.quantityDelivered, d.quantityUnit, d.quantityAccepted, d.quantityRejected, d.condition, d.conditionNotes || null, d.quality, null, d.temperatureMinC || null, d.temperatureMaxC || null, d.temperatureActualC || null, d.temperatureCompliant || null, d.podReference, d.documents, d.photos, d.status, d.acceptanceTimestamp || null, d.rejectionReason || null, d.deliveryLocation, d.deliveryLat || null, d.deliveryLng || null, null, d.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${deliveries.length} delivery acceptances upserted`)

  // -------------------------------------------------------------------------
  // §2 TradeClaims (covering §7 #2 damage + #4 warranty + #5 insurance + #11 open dispute)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/6 TradeClaims')
  const claims = [
    // §7 #2 — DAMAGE claim (RESOLVED)
    {
      id: 'tc_damage_1', claimId: 'CLM-20240120-00001', ustn: 'SGTX-PHASE7-REJECT-0002', tradeId: null,
      parentUstn: null, claimType: 'DAMAGE', claimSeverity: 'MAJOR',
      claimDescription: 'Goods damaged in transit — container leak',
      claimedAmountUsd: 25000, currency: 'USD',
      claimantGtid: 'SGTX-EG-SEL-000010-AAAA', respondentGtid: 'SGTX-EG-LSP-000001-AAAA',
      evidence: JSON.stringify([{ type: 'PHOTO', reference: 'photo-001.jpg' }, { type: 'DAMAGE_REPORT', reference: 'DR-001' }]),
      status: 'RESOLVED', resolutionAmountUsd: 22000, resolutionNotes: 'Settled for 88% of claimed amount',
      deliveryAcceptanceId: 'da_rejected_1', returnId: 'ret_rejection_1',
      filedAt: PAST.toISOString(), reviewedAt: PAST.toISOString(), resolvedAt: PAST.toISOString(), closedAt: PAST.toISOString(),
      notes: '§7 #2 — damage claim (resolved)'
    },
    // §7 #4 — WARRANTY claim (OPEN)
    {
      id: 'tc_warranty_1', claimId: 'CLM-20240201-00002', ustn: 'SGTX-PHASE7-WARR-0004', tradeId: null,
      parentUstn: null, claimType: 'WARRANTY', claimSeverity: 'MINOR',
      claimDescription: 'Product failed within warranty period — replacement requested',
      claimedAmountUsd: 5000, currency: 'USD',
      claimantGtid: 'SGTX-EG-SEL-000010-AAAA', respondentGtid: 'SGTX-EG-MFR-000020-BBBB',
      evidence: JSON.stringify([{ type: 'WARRANTY_CERT', reference: 'WC-001' }]),
      status: 'OPEN',
      filedAt: PAST.toISOString(),
      notes: '§7 #4 — warranty claim (open)'
    },
    // §7 #5 — TEMPERATURE claim (UNDER_REVIEW + insurance linkage)
    {
      id: 'tc_temp_1', claimId: 'CLM-20240210-00003', ustn: 'SGTX-PHASE7-TEMP-0005', tradeId: null,
      parentUstn: null, claimType: 'TEMPERATURE', claimSeverity: 'MAJOR',
      claimDescription: 'Reefer container temperature excursion — goods spoiled',
      claimedAmountUsd: 15000, currency: 'USD',
      claimantGtid: 'SGTX-EG-SEL-000010-AAAA', respondentGtid: 'SGTX-DK-SL-000003-CCCC',
      evidence: JSON.stringify([{ type: 'TEMPERATURE_LOG', reference: 'TL-001' }, { type: 'INSPECTION_REPORT', reference: 'IR-001' }]),
      status: 'UNDER_REVIEW', insuranceClaimId: 'il_eg_cargo_1',
      filedAt: PAST.toISOString(), reviewedAt: PAST.toISOString(),
      notes: '§7 #5 — temperature claim (under review + insurance linked)'
    },
    // §7 #11 — open dispute (ESCALATED — trade NOT closed)
    {
      id: 'tc_escalated_1', claimId: 'CLM-20240301-00004', ustn: 'SGTX-PHASE7-DISPUTE-0011', tradeId: null,
      parentUstn: null, claimType: 'QUALITY', claimSeverity: 'CRITICAL',
      claimDescription: 'Quality dispute — goods do not match contract specifications',
      claimedAmountUsd: 40000, currency: 'USD',
      claimantGtid: 'SGTX-EG-SEL-000010-AAAA', respondentGtid: 'SGTX-EG-MFR-000020-BBBB',
      evidence: JSON.stringify([{ type: 'QC_REPORT', reference: 'QC-001' }]),
      status: 'ESCALATED',
      filedAt: PAST.toISOString(), reviewedAt: PAST.toISOString(),
      notes: '§7 #11 — open dispute (escalated — trade NOT closed)'
    },
  ]
  for (const c of claims) {
    await exec(
      `INSERT OR IGNORE INTO TradeClaim (id, claimId, ustn, tradeId, parentUstn, claimType, claimSeverity, claimDescription, claimedAmountUsd, claimedAmountLocal, currency, claimantGtid, respondentGtid, evidence, status, resolutionAmountUsd, resolutionNotes, deliveryAcceptanceId, returnId, insuranceClaimId, filedAt, reviewedAt, resolvedAt, closedAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.claimId, c.ustn, c.tradeId, c.parentUstn, c.claimType, c.claimSeverity, c.claimDescription, c.claimedAmountUsd, null, c.currency, c.claimantGtid, c.respondentGtid, c.evidence, c.status, c.resolutionAmountUsd || null, c.resolutionNotes || null, c.deliveryAcceptanceId || null, c.returnId || null, c.insuranceClaimId || null, c.filedAt || null, c.reviewedAt || null, c.resolvedAt || null, c.closedAt || null, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${claims.length} trade claims upserted`)

  // -------------------------------------------------------------------------
  // §3 ReturnRecords (covering §7 #3 return)
  // -------------------------------------------------------------------------
  console.log('[seed] 3/6 ReturnRecords')
  const returns = [
    // §7 #3 — REJECTION return (parent/child USTN)
    {
      id: 'ret_rejection_1', returnId: 'RET-20240120-00001', ustn: 'SGTX-PHASE7-RET-CHILD-0003', parentUstn: 'SGTX-PHASE7-REJECT-0002', parentTradeId: null,
      returnType: 'REJECTION', reason: 'Goods damaged — rejected at delivery',
      quantityReturned: 1000, quantityUnit: 'KG', goodsCondition: 'DAMAGED',
      returnOrigin: 'EGBE', returnDestination: 'EGCAI', transportMode: 'ROAD',
      reExportDeclaration: null, reImportDeclaration: null,
      status: 'COMPLETED', claimId: 'tc_damage_1', deliveryAcceptanceId: 'da_rejected_1',
      initiatedAt: PAST.toISOString(), shippedAt: PAST.toISOString(), receivedAt: PAST.toISOString(), completedAt: PAST.toISOString(),
      notes: '§7 #3 — rejection return (parent/child USTN)'
    },
    // §7 #4 — WARRANTY return (replacement)
    {
      id: 'ret_warranty_1', returnId: 'RET-20240201-00002', ustn: 'SGTX-PHASE7-RET-WARR-0004', parentUstn: 'SGTX-PHASE7-WARR-0004', parentTradeId: null,
      returnType: 'REPLACEMENT', reason: 'Warranty replacement — defective product',
      quantityReturned: 100, quantityUnit: 'UNIT', goodsCondition: 'DEFECTIVE',
      returnOrigin: 'EGBE', returnDestination: 'EGCAI', transportMode: 'AIR',
      status: 'IN_TRANSIT', claimId: 'tc_warranty_1',
      initiatedAt: PAST.toISOString(), shippedAt: PAST.toISOString(),
      notes: '§7 #4 — warranty replacement return (in transit)'
    },
  ]
  for (const r of returns) {
    await exec(
      `INSERT OR IGNORE INTO ReturnRecord (id, returnId, ustn, parentUstn, parentTradeId, returnType, reason, quantityReturned, quantityUnit, goodsCondition, returnOrigin, returnDestination, transportMode, reExportDeclaration, reImportDeclaration, status, claimId, deliveryAcceptanceId, initiatedAt, shippedAt, receivedAt, completedAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.returnId, r.ustn, r.parentUstn, r.parentTradeId, r.returnType, r.reason, r.quantityReturned, r.quantityUnit, r.goodsCondition, r.returnOrigin, r.returnDestination, r.transportMode, r.reExportDeclaration, r.reImportDeclaration, r.status, r.claimId, r.deliveryAcceptanceId || null, r.initiatedAt || null, r.shippedAt || null, r.receivedAt || null, r.completedAt || null, r.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${returns.length} return records upserted`)

  // -------------------------------------------------------------------------
  // §4 PostClearanceActions (covering §7 #6, #7, #8)
  // -------------------------------------------------------------------------
  console.log('[seed] 4/6 PostClearanceActions')
  const pcas = [
    // §7 #7 — REFUND (PENDING_PAYMENT)
    {
      id: 'pca_refund_1', actionId: 'PCA-20240201-00001', ustn: 'SGTX-PHASE7-REFUND-0007', tradeId: null,
      customsOperationId: null, actionType: 'REFUND',
      description: 'Customs duty refund — overpayment detected in post-clearance audit',
      customsAuthority: 'Egyptian Customs Authority', customsReference: 'CUS-EG-REF-001',
      amountUsd: 1250, currency: 'USD',
      status: 'PENDING_PAYMENT', resolution: 'APPROVED', resolutionNotes: 'Refund approved — pending payment',
      filedAt: PAST.toISOString(), reviewedAt: PAST.toISOString(), resolvedAt: PAST.toISOString(),
      notes: '§7 #7 — refund (pending payment)'
    },
    // §7 #8 — DRAWBACK (COMPLETED)
    {
      id: 'pca_drawback_1', actionId: 'PCA-20240205-00002', ustn: 'SGTX-PHASE7-DRAW-0008', tradeId: null,
      customsOperationId: null, actionType: 'DRAWBACK',
      description: 'Drawback — re-export of previously imported goods',
      customsAuthority: 'Egyptian Customs Authority', customsReference: 'CUS-EG-DBK-001',
      amountUsd: 3000, currency: 'USD',
      status: 'COMPLETED', resolution: 'COMPLETED', resolutionNotes: 'Drawback paid — re-export confirmed',
      filedAt: PAST.toISOString(), reviewedAt: PAST.toISOString(), resolvedAt: PAST.toISOString(),
      notes: '§7 #8 — drawback (completed)'
    },
    // §7 #6 — CUSTOMS_AUDIT (OPEN)
    {
      id: 'pca_audit_1', actionId: 'PCA-20240210-00003', ustn: 'SGTX-PHASE7-AUDIT-0006', tradeId: null,
      customsOperationId: null, actionType: 'CUSTOMS_AUDIT',
      description: 'Post-clearance customs audit — valuation verification',
      customsAuthority: 'Egyptian Customs Authority', customsReference: 'CUS-EG-AUD-001',
      amountUsd: null, currency: 'USD',
      status: 'OPEN',
      filedAt: PAST.toISOString(),
      notes: '§7 #6 — customs audit (open)'
    },
  ]
  for (const p of pcas) {
    await exec(
      `INSERT OR IGNORE INTO PostClearanceAction (id, actionId, ustn, tradeId, customsOperationId, actionType, description, customsAuthority, customsReference, amountUsd, currency, status, resolution, resolutionNotes, filedAt, reviewedAt, resolvedAt, accountingEntryId, reconciliationId, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.actionId, p.ustn, p.tradeId, p.customsOperationId, p.actionType, p.description, p.customsAuthority, p.customsReference, p.amountUsd, p.currency, p.status, p.resolution || null, p.resolutionNotes || null, p.filedAt || null, p.reviewedAt || null, p.resolvedAt || null, null, null, p.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${pcas.length} post-clearance actions upserted`)

  // -------------------------------------------------------------------------
  // §5 FinalEvidencePackages (covering §7 #10)
  // -------------------------------------------------------------------------
  console.log('[seed] 5/6 FinalEvidencePackages')
  await exec(
    `INSERT OR IGNORE INTO FinalEvidencePackage (id, packageId, ustn, tradeId, rfq, quotation, purchaseOrder, contract, invoice, packingList, licenses, permits, certificates, customs, transport, gps, iot, inspection, qc, governmentReferences, payment, bankConfirmation, settlement, accounting, delivery, claims, disputes, communications, governorDecisions, loomChain, packageHash, sealedAt, sealedBy, status, completenessScore, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['fep_normal_1', 'FEP-20240115-00001', 'SGTX-PHASE7-NORMAL-0001', null,
     JSON.stringify([{ ref: 'RFQ-001', date: '2024-01-01' }]),  // rfq
     JSON.stringify([{ ref: 'LQ2-001', amount: 800 }]),  // quotation
     JSON.stringify([{ ref: 'PO-001' }]),  // purchaseOrder
     JSON.stringify([{ ref: 'CONTRACT-001' }]),  // contract
     JSON.stringify([{ ref: 'INV-001', amount: 25000 }]),  // invoice
     JSON.stringify([{ ref: 'PL-001', packages: 100 }]),  // packingList
     JSON.stringify([{ ref: 'EG-IMP-2024-001234' }]),  // licenses
     JSON.stringify([{ ref: 'EG-SPS-2024-000345' }]),  // permits
     JSON.stringify([{ ref: 'EG-COO-2024-000123' }]),  // certificates
     JSON.stringify([{ ref: 'CUS-EG-001', status: 'RELEASED' }]),  // customs
     JSON.stringify([{ ref: 'BL-001', mode: 'SEA' }]),  // transport
     JSON.stringify([{ lat: 31.2, lng: 29.9, at: '2024-01-10' }]),  // gps
     JSON.stringify([{ sensor: 'temp', value: 2 }]),  // iot
     JSON.stringify([{ ref: 'INS-001', result: 'PASS' }]),  // inspection
     JSON.stringify([{ ref: 'QC-001', result: 'PASS' }]),  // qc
     JSON.stringify([{ ref: 'EG-REL-2024-000001' }]),  // governmentReferences
     JSON.stringify([{ ref: 'GP-001', amount: 25000 }]),  // payment
     JSON.stringify([{ ref: 'BC-001' }]),  // bankConfirmation
     JSON.stringify([{ ref: 'SET-001' }]),  // settlement
     JSON.stringify([{ ref: 'AE-001', period: '2024-01' }]),  // accounting
     JSON.stringify([{ ref: 'POD-EG-001', status: 'ACCEPTED' }]),  // delivery
     JSON.stringify([]),  // claims (no claims for normal completion)
     JSON.stringify([]),  // disputes
     JSON.stringify([{ ref: 'MSG-001' }]),  // communications
     JSON.stringify([{ ref: 'GOV-001', verdict: 'ALLOW' }]),  // governorDecisions
     JSON.stringify([{ hash: 'abc123', at: '2024-01-01' }]),  // loomChain
     'sha256_placeholder_hash_001', PAST.toISOString(), 'SGTX Closure Agent',
     'SEALED', 1.0, '§7 #10 — final evidence package (sealed, 100% complete)', NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[seed]   1 final evidence package upserted')

  // -------------------------------------------------------------------------
  // §6 TradeClosureStates (covering §7 #1 normal + #11 open dispute)
  // -------------------------------------------------------------------------
  console.log('[seed] 6/6 TradeClosureStates')
  const closures = [
    // §7 #1 — normal completion (USTN_CLOSED — all 7 conditions met)
    {
      id: 'tcs_normal_1', ustn: 'SGTX-PHASE7-NORMAL-0001', tradeId: null,
      deliveryAccepted: 1, settlementComplete: 1, financialReconciliationComplete: 1,
      activeCustomsObligationsComplete: 1, requiredPostClearanceObligationsComplete: 1,
      disputeClaimStateResolved: 1, evidencePackageSealed: 1,
      evidencePackageId: 'fep_normal_1',
      closureState: 'USTN_CLOSED', closedAt: PAST.toISOString(), closedBy: 'SGTX Closure Agent',
      closureChecklist: JSON.stringify([
        { condition: 'deliveryAccepted', met: true, notes: 'ACCEPTED at 2024-01-15' },
        { condition: 'settlementComplete', met: true, notes: 'All payments SETTLED' },
        { condition: 'financialReconciliationComplete', met: true, notes: 'All reconciliations MATCHED' },
        { condition: 'activeCustomsObligationsComplete', met: true, notes: 'Customs RELEASED' },
        { condition: 'requiredPostClearanceObligationsComplete', met: true, notes: 'No open post-clearance actions' },
        { condition: 'disputeClaimStateResolved', met: true, notes: 'No open claims' },
        { condition: 'evidencePackageSealed', met: true, notes: 'FEP-20240115-00001 sealed' },
      ]),
      notes: '§7 #1 — normal completion (USTN_CLOSED)'
    },
    // §7 #11 — open dispute (OPEN — trade NOT closed because of ESCALATED claim)
    {
      id: 'tcs_dispute_1', ustn: 'SGTX-PHASE7-DISPUTE-0011', tradeId: null,
      deliveryAccepted: 1, settlementComplete: 1, financialReconciliationComplete: 1,
      activeCustomsObligationsComplete: 1, requiredPostClearanceObligationsComplete: 1,
      disputeClaimStateResolved: 0, evidencePackageSealed: 1,
      evidencePackageId: null,
      closureState: 'OPEN', closedAt: null, closedBy: null,
      closureChecklist: JSON.stringify([
        { condition: 'deliveryAccepted', met: true, notes: 'ACCEPTED' },
        { condition: 'settlementComplete', met: true, notes: 'All SETTLED' },
        { condition: 'financialReconciliationComplete', met: true, notes: 'MATCHED' },
        { condition: 'activeCustomsObligationsComplete', met: true, notes: 'RELEASED' },
        { condition: 'requiredPostClearanceObligationsComplete', met: true, notes: 'No open actions' },
        { condition: 'disputeClaimStateResolved', met: false, notes: 'ESCALATED claim CLM-20240301-00004 — cannot close' },
        { condition: 'evidencePackageSealed', met: true, notes: 'Sealed' },
      ]),
      notes: '§7 #11 — open dispute (trade NOT closed — ESCALATED claim)'
    },
  ]
  for (const c of closures) {
    await exec(
      `INSERT OR IGNORE INTO TradeClosureState (id, ustn, tradeId, deliveryAccepted, settlementComplete, financialReconciliationComplete, activeCustomsObligationsComplete, requiredPostClearanceObligationsComplete, disputeClaimStateResolved, evidencePackageSealed, evidencePackageId, closureState, closedAt, closedBy, closureChecklist, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.ustn, c.tradeId, c.deliveryAccepted, c.settlementComplete, c.financialReconciliationComplete, c.activeCustomsObligationsComplete, c.requiredPostClearanceObligationsComplete, c.disputeClaimStateResolved, c.evidencePackageSealed, c.evidencePackageId, c.closureState, c.closedAt, c.closedBy, c.closureChecklist, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${closures.length} trade closure states upserted`)

  console.log('[seed] Done. §7 test scenarios available:')
  console.log('[seed]   1. normal completion    → tcs_normal_1 (USTN_CLOSED, all 7 conditions met)')
  console.log('[seed]   2. rejected goods        → da_rejected_1 (REJECTED) + tc_damage_1 (DAMAGE claim)')
  console.log('[seed]   3. return               → ret_rejection_1 (REJECTION, parent/child USTN)')
  console.log('[seed]   4. warranty             → tc_warranty_1 (WARRANTY claim) + ret_warranty_1 (REPLACEMENT)')
  console.log('[seed]   5. insurance claim      → tc_temp_1 (TEMPERATURE claim + insurance linked)')
  console.log('[seed]   6. customs post-clearance → pca_audit_1 (CUSTOMS_AUDIT, OPEN)')
  console.log('[seed]   7. refund               → pca_refund_1 (REFUND, PENDING_PAYMENT)')
  console.log('[seed]   8. drawback             → pca_drawback_1 (DRAWBACK, COMPLETED)')
  console.log('[seed]   9. partial settlement   → da_partial_1 (PARTIAL_ACCEPTANCE)')
  console.log('[seed]  10. final evidence       → fep_normal_1 (SEALED, 100% complete)')
  console.log('[seed]  11. open dispute        → tcs_dispute_1 (OPEN — ESCALATED claim blocks closure)')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
