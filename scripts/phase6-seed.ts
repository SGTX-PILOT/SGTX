/**
 * Phase 6 — Seed data covering all §10 test scenarios.
 *
 * §10 test scenarios:
 *   1. payment        → SETTLED GlobalPayment (SWIFT)
 *   2. split          → split payment into 3 parts (seller/broker/carrier)
 *   3. reconciliation → matched + discrepant records
 *   4. bank           → connected bank financier relationship
 *   5. LC             → LcLifecycle at PRESENTATION step
 *   6. guarantee      → ACTIVE customs guarantee
 *   7. financing      → TradeFinanceCase at DISBURSEMENT step
 *   8. insurance      → InsuranceLifecycle at CERTIFICATE step
 *   9. accounting     → POSTED accounting entries (AP, AR, FREIGHT, DUTY, TAX, INSURANCE)
 *  10. ERP            → CONNECTED SAP adapter
 *  11. failed payment → FAILED GlobalPayment
 *  12. duplicate payment → DUPLICATE GlobalPayment (same idempotencyKey)
 *  13. unmatched payment → UNRECONCILED GlobalPayment
 *  14. financier relationship restriction → REJECTED TradeFinanceCase (financier not in approved list)
 *
 * Run: bun run scripts/phase6-seed.ts
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
  console.log('[seed] Phase 6 financial & commercial seed — start')

  // -------------------------------------------------------------------------
  // §2b FinancierRelationships (covering §8 #4 bank + §8 #14 restriction)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/9 FinancierRelationships')
  const finRel = [
    // §8 #4 — connected bank (CBE)
    { id: 'fr_cbe', traderGtid: 'SGTX-EG-TRD-002139-7F3A', financierGtid: 'SGTX-EG-BNK-000001-CB01', financierType: 'CONNECTED_BANK', relationshipStatus: 'ACTIVE', creditLimitUsd: 500000, currentExposureUsd: 100000, internalTrustScore: 90, notes: 'CBE — connected bank' },
    // trader-added financier
    { id: 'fr_hsbc', traderGtid: 'SGTX-EG-TRD-002139-7F3A', financierGtid: 'SGTX-EG-BNK-000002-HS01', financierType: 'TRADER_ADDED_FINANCIER', relationshipStatus: 'ACTIVE', creditLimitUsd: 200000, currentExposureUsd: 0, internalTrustScore: 85, notes: 'HSBC — trader-added financier' },
    // approved financing entity
    { id: 'fr_ifc', traderGtid: 'SGTX-EG-TRD-002139-7F3A', financierGtid: 'SGTX-US-FIN-000003-IF01', financierType: 'APPROVED_FINANCING_ENTITY', relationshipStatus: 'ACTIVE', creditLimitUsd: 1000000, currentExposureUsd: 0, internalTrustScore: 88, notes: 'IFC — approved financing entity' },
  ]
  for (const r of finRel) {
    await exec(
      `INSERT OR IGNORE INTO FinancierRelationship (id, traderGtid, financierGtid, financierType, relationshipStatus, authorizedFrom, authorizedUntil, authorizedBy, creditLimitUsd, currentExposureUsd, internalTrustScore, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.traderGtid, r.financierGtid, r.financierType, r.relationshipStatus, PAST.toISOString(), FUTURE.toISOString(), 'SGTX Platform', r.creditLimitUsd, r.currentExposureUsd, r.internalTrustScore, r.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${finRel.length} financier relationships upserted`)

  // -------------------------------------------------------------------------
  // §1 GlobalPayments (covering §8 #1, #11, #12, #13)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/9 GlobalPayments')
  const payments = [
    // §8 #1 — SETTLED payment (SWIFT)
    { id: 'gp_settled_swift', paymentId: 'GP-20240115-00001', ustn: 'SGTX-PHASE6-PAY-0001', payerGtid: 'SGTX-EG-TRD-002139-7F3A', payeeGtid: 'SGTX-EG-SEL-000010-AAAA', paymentMethod: 'SWIFT', amountUsd: 25000, currency: 'USD', payerBankBic: 'CBEGEGCX', payeeBankBic: 'EBPKEGCX', status: 'SETTLED', idempotencyKey: 'idem-pay-0001', paymentReference: 'SWIFT-REF-001', reconciliationStatus: 'RECONCILED', initiatedAt: PAST.toISOString(), submittedAt: PAST.toISOString(), settledAt: PAST.toISOString(), notes: '§8 #1 — settled SWIFT payment' },
    // §8 #11 — FAILED payment (PSP)
    { id: 'gp_failed_psp', paymentId: 'GP-20240120-00002', ustn: 'SGTX-PHASE6-FAIL-0002', payerGtid: 'SGTX-EG-TRD-002139-7F3A', payeeGtid: 'SGTX-EG-SEL-000010-AAAA', paymentMethod: 'PSP', amountUsd: 5000, currency: 'USD', pspName: 'Paymob', status: 'FAILED', idempotencyKey: 'idem-pay-0002', failureReason: 'Insufficient funds', failureCode: 'NSF', initiatedAt: PAST.toISOString(), submittedAt: PAST.toISOString(), failedAt: PAST.toISOString(), notes: '§8 #11 — failed PSP payment' },
    // §8 #12 — DUPLICATE payment (same idempotencyKey as #1)
    { id: 'gp_duplicate', paymentId: 'GP-20240115-00003', ustn: 'SGTX-PHASE6-PAY-0001', payerGtid: 'SGTX-EG-TRD-002139-7F3A', payeeGtid: 'SGTX-EG-SEL-000010-AAAA', paymentMethod: 'SWIFT', amountUsd: 25000, currency: 'USD', status: 'DUPLICATE', idempotencyKey: 'idem-pay-0001', paymentReference: 'SWIFT-REF-001', initiatedAt: NOW.toISOString(), notes: '§8 #12 — duplicate payment (same idempotencyKey)' },
    // §8 #13 — UNRECONCILED payment (LOCAL_INSTANT)
    { id: 'gp_unreconciled', paymentId: 'GP-20240125-00004', ustn: 'SGTX-PHASE6-UNREC-0003', payerGtid: 'SGTX-EG-TRD-002139-7F3A', payeeGtid: 'SGTX-EG-SEL-000010-AAAA', paymentMethod: 'LOCAL_INSTANT', amountUsd: 3000, currency: 'USD', status: 'SETTLED', idempotencyKey: 'idem-pay-0004', paymentReference: 'INSTA-REF-004', reconciliationStatus: 'UNRECONCILED', initiatedAt: PAST.toISOString(), submittedAt: PAST.toISOString(), settledAt: PAST.toISOString(), notes: '§8 #13 — unreconciled payment' },
  ]
  for (const p of payments) {
    await exec(
      `INSERT OR IGNORE INTO GlobalPayment (id, paymentId, ustn, tradeId, payerGtid, payeeGtid, paymentMethod, amountUsd, currency, fxRate, amountLocal, payerBankBic, payerAccount, payeeBankBic, payeeAccount, pspName, settlementStructure, feeLockId, settlementInstructionId, status, idempotencyKey, paymentAttemptId, reconciliationStatus, reconciliationId, initiatedAt, submittedAt, settledAt, failedAt, failureReason, failureCode, paymentReference, attachments, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.paymentId, p.ustn, null, p.payerGtid, p.payeeGtid, p.paymentMethod, p.amountUsd, p.currency, null, null, p.payerBankBic || null, null, p.payeeBankBic || null, null, p.pspName || null, null, null, null, p.status, p.idempotencyKey, null, p.reconciliationStatus || 'UNRECONCILED', null, p.initiatedAt || null, p.submittedAt || null, p.settledAt || null, p.failedAt || null, p.failureReason || null, p.failureCode || null, p.paymentReference || null, null, p.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${payments.length} global payments upserted`)

  // -------------------------------------------------------------------------
  // §2 TradeFinanceCases (covering §8 #7 financing + §8 #14 restriction)
  // -------------------------------------------------------------------------
  console.log('[seed] 3/9 TradeFinanceCases')
  const cases = [
    // §8 #7 — financing at DISBURSEMENT (verified financier)
    { id: 'tfc_disbursement', caseId: 'TFC-20240115-00001', ustn: 'SGTX-PHASE6-FIN-0001', borrowerGtid: 'SGTX-EG-TRD-002139-7F3A', financierGtid: 'SGTX-EG-BNK-000001-CB01', financierType: 'CONNECTED_BANK', amountUsd: 100000, tenorDays: 90, apr: 8.5, status: 'DISBURSEMENT', collateralType: 'GOODS', collateralValueUsd: 150000, disbursementAmountUsd: 100000, disbursementDate: PAST.toISOString(), relationshipVerified: true, notes: '§8 #7 — financing case at DISBURSEMENT' },
    // §8 #14 — REJECTED (financier not in approved list — relationship restriction)
    { id: 'tfc_rejected', caseId: 'TFC-20240120-00002', ustn: 'SGTX-PHASE6-REJ-0002', borrowerGtid: 'SGTX-EG-TRD-002139-7F3A', financierGtid: 'SGTX-XX-BNK-999999-UNAP', financierType: 'CONNECTED_BANK', amountUsd: 50000, status: 'REJECTED', relationshipVerified: false, notes: '§8 #14 — REJECTED: financier not in trader approved list (relationship restriction)' },
  ]
  for (const c of cases) {
    await exec(
      `INSERT OR IGNORE INTO TradeFinanceCase (id, caseId, ustn, tradeId, borrowerGtid, financierGtid, financierType, financingRequestId, financingAgreementId, amountUsd, currency, tenorDays, apr, status, collateralType, collateralValueUsd, disbursementAmountUsd, disbursementDate, repaymentAmountUsd, repaymentDate, marginCallThreshold, marginCallTriggered, marginCallDate, relationshipVerified, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.caseId, c.ustn, null, c.borrowerGtid, c.financierGtid, c.financierType, null, null, c.amountUsd, 'USD', c.tenorDays || null, c.apr || null, c.status, c.collateralType || null, c.collateralValueUsd || null, c.disbursementAmountUsd || null, c.disbursementDate || null, null, null, null, c.marginCallTriggered || 0, null, c.relationshipVerified ? 1 : 0, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${cases.length} trade finance cases upserted`)

  // -------------------------------------------------------------------------
  // §3 LcLifecycle (covering §8 #5 LC)
  // -------------------------------------------------------------------------
  console.log('[seed] 4/9 LcLifecycles')
  await exec(
    `INSERT OR IGNORE INTO LcLifecycle (id, ustn, tradeId, lcId, lcNumber, currentStep, status, stepHistory, presentationDate, presentationBankGtid, discrepancies, discrepancyCount, paymentAmountUsd, paymentDate, reimbursementAmountUsd, reimbursementDate, applicantGtid, beneficiaryGtid, issuingBankGtid, advisingBankGtid, confirmingBankGtid, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['lcl_eg_1', 'SGTX-PHASE6-LC-0001', null, null, 'LC-EG-2024-00001', 'PRESENTATION', 'IN_PROGRESS', JSON.stringify([{ step: 'APPLICATION', status: 'COMPLETED', at: PAST.toISOString() }, { step: 'ISSUANCE', status: 'COMPLETED', at: PAST.toISOString() }, { step: 'ADVISING', status: 'COMPLETED', at: PAST.toISOString() }, { step: 'CONFIRMATION', status: 'COMPLETED', at: PAST.toISOString() }, { step: 'PRESENTATION', status: 'IN_PROGRESS', at: NOW.toISOString() }]), PAST.toISOString(), 'SGTX-EG-BNK-000001-CB01', null, 0, null, null, null, null, 'SGTX-EG-TRD-002139-7F3A', 'SGTX-EG-SEL-000010-AAAA', 'SGTX-EG-BNK-000001-CB01', 'SGTX-EG-BNK-000002-HS01', null, '§8 #5 — LC at PRESENTATION step', NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[seed]   1 LC lifecycle upserted')

  // -------------------------------------------------------------------------
  // §5 GuaranteeRecords (covering §8 #6 guarantee)
  // -------------------------------------------------------------------------
  console.log('[seed] 5/9 GuaranteeRecords')
  await exec(
    `INSERT OR IGNORE INTO GuaranteeRecord (id, guaranteeId, ustn, tradeId, guaranteeType, issuerGtid, issuerName, beneficiaryGtid, beneficiaryName, amountUsd, currency, coverageScope, status, issuedAt, validFrom, validUntil, releasedAt, callAmountUsd, calledAt, callReason, customsBondId, bankSettlementId, guaranteeNumber, attachments, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['gr_eg_customs_1', 'GR-20240115-00001', 'SGTX-PHASE6-GUAR-0001', null, 'CUSTOMS_GUARANTEE', 'SGTX-EG-BNK-000001-CB01', 'Central Bank of Egypt', 'SGTX-EG-CUS-000001-AAAA', 'Egyptian Customs Authority', 50000, 'USD', JSON.stringify(['duties', 'taxes', 'fees']), 'ACTIVE', PAST.toISOString(), PAST.toISOString(), FUTURE.toISOString(), null, null, null, null, null, null, 'BG-EG-2024-00001', null, '§8 #6 — active customs guarantee', NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[seed]   1 guarantee record upserted')

  // -------------------------------------------------------------------------
  // §6 InsuranceLifecycle (covering §8 #8 insurance)
  // -------------------------------------------------------------------------
  console.log('[seed] 6/9 InsuranceLifecycles')
  await exec(
    `INSERT OR IGNORE INTO InsuranceLifecycle (id, ustn, tradeId, policyId, claimId, insuranceType, insurerGtid, insuredGtid, coverageAmountUsd, premiumUsd, currency, currentStep, status, stepHistory, incidentDate, incidentDescription, claimAmountUsd, claimDate, surveyorGtid, surveyDate, surveyResult, settlementAmountUsd, settlementDate, recoveryAmountUsd, recoveryDate, policyNumber, certificateNumber, notes, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['il_eg_cargo_1', 'SGTX-PHASE6-INS-0001', null, null, null, 'CARGO', 'SGTX-EG-INS-000009-IIII', 'SGTX-EG-TRD-002139-7F3A', 100000, 500, 'USD', 'CERTIFICATE', 'ACTIVE', JSON.stringify([{ step: 'QUOTE', status: 'COMPLETED', at: PAST.toISOString() }, { step: 'BIND', status: 'COMPLETED', at: PAST.toISOString() }, { step: 'CERTIFICATE', status: 'COMPLETED', at: PAST.toISOString() }]), null, null, null, null, null, null, null, null, null, null, null, 'POL-EG-2024-00001', 'CERT-EG-2024-00001', '§8 #8 — insurance at CERTIFICATE step', NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[seed]   1 insurance lifecycle upserted')

  // -------------------------------------------------------------------------
  // §7 AccountingEntries (covering §8 #9 accounting)
  // -------------------------------------------------------------------------
  console.log('[seed] 7/9 AccountingEntries')
  const entries = [
    { id: 'ae_ar_1', entryId: 'AE-20240115-00001', ustn: 'SGTX-PHASE6-ACC-0001', category: 'AR', debitAccount: '1200-Accounts Receivable', creditAccount: '4000-Sales Revenue', amountUsd: 25000, description: 'Sales invoice INV-001', reference: 'INV-001', status: 'POSTED' },
    { id: 'ae_ap_1', entryId: 'AE-20240115-00002', ustn: 'SGTX-PHASE6-ACC-0001', category: 'AP', debitAccount: '5000-Cost of Goods Sold', creditAccount: '2000-Accounts Payable', amountUsd: 15000, description: 'Supplier invoice SUP-001', reference: 'SUP-001', status: 'POSTED' },
    { id: 'ae_freight_1', entryId: 'AE-20240115-00003', ustn: 'SGTX-PHASE6-ACC-0001', category: 'FREIGHT', debitAccount: '5100-Freight Expense', creditAccount: '2000-Accounts Payable', amountUsd: 3500, description: 'Ocean freight B/L-001', reference: 'BL-001', status: 'POSTED' },
    { id: 'ae_duty_1', entryId: 'AE-20240115-00004', ustn: 'SGTX-PHASE6-ACC-0001', category: 'DUTY', debitAccount: '5200-Customs Duty', creditAccount: '1000-Cash', amountUsd: 1250, description: 'Import duty MFN 5%', reference: 'CUS-EG-001', status: 'POSTED' },
    { id: 'ae_tax_1', entryId: 'AE-20240115-00005', ustn: 'SGTX-PHASE6-ACC-0001', category: 'TAX', debitAccount: '5300-VAT Expense', creditAccount: '1000-Cash', amountUsd: 3675, description: 'VAT 14%', reference: 'VAT-001', status: 'POSTED' },
    { id: 'ae_ins_1', entryId: 'AE-20240115-00006', ustn: 'SGTX-PHASE6-ACC-0001', category: 'INSURANCE', debitAccount: '5400-Insurance Expense', creditAccount: '1000-Cash', amountUsd: 500, description: 'Cargo insurance premium', reference: 'POL-001', status: 'POSTED' },
    { id: 'ae_draft_1', entryId: 'AE-20240115-00007', ustn: 'SGTX-PHASE6-ACC-0001', category: 'ACCRUAL', debitAccount: '5500-Accrued Expenses', creditAccount: '2000-Accounts Payable', amountUsd: 200, description: 'Demurrage accrual (pending)', reference: 'DM-001', status: 'DRAFT' },
  ]
  for (const e of entries) {
    await exec(
      `INSERT OR IGNORE INTO AccountingEntry (id, entryId, ustn, tradeId, category, debitAccount, creditAccount, amountUsd, currency, fxRate, amountLocal, description, reference, accountingDate, period, status, postedAt, postedBy, sourceType, sourceId, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [e.id, e.entryId, e.ustn, null, e.category, e.debitAccount, e.creditAccount, e.amountUsd, 'USD', null, null, e.description, e.reference, PAST.toISOString(), '2024-01', e.status, e.status === 'POSTED' ? PAST.toISOString() : null, 'SGTX Accounting', null, null, null, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${entries.length} accounting entries upserted`)

  // -------------------------------------------------------------------------
  // §8 ErpAdapters (covering §8 #10 ERP)
  // -------------------------------------------------------------------------
  console.log('[seed] 8/9 ErpAdapters')
  const erps = [
    // §8 #10 — CONNECTED SAP adapter
    { id: 'ea_sap_1', traderGtid: 'SGTX-EG-TRD-002139-7F3A', erpType: 'SAP', systemName: 'SAP S/4HANA', endpointUrl: 'https://sap.example.com/api', authMethod: 'OAUTH2', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', syncFrequency: 'DAILY', syncCategories: JSON.stringify(['AP', 'AR', 'INVENTORY', 'COGS']), notes: '§8 #10 — connected SAP adapter' },
    { id: 'ea_odoo_1', traderGtid: 'SGTX-EG-TRD-002139-7F3A', erpType: 'ODOO', systemName: 'Odoo Enterprise', endpointUrl: 'https://odoo.example.com/api', authMethod: 'API_KEY', status: 'CONFIGURED', lastSyncAt: null, lastSyncStatus: 'NEVER', syncFrequency: 'WEEKLY', syncCategories: JSON.stringify(['AP', 'AR']), notes: 'Odoo — configured but not connected' },
  ]
  for (const e of erps) {
    await exec(
      `INSERT OR IGNORE INTO ErpAdapter (id, traderGtid, erpType, systemName, endpointUrl, apiKey, apiSecret, authMethod, status, lastSyncAt, lastSyncStatus, lastError, syncFrequency, syncCategories, fieldMapping, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [e.id, e.traderGtid, e.erpType, e.systemName, e.endpointUrl, null, null, e.authMethod, e.status, e.lastSyncAt, e.lastSyncStatus, null, e.syncFrequency, e.syncCategories, null, e.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${erps.length} ERP adapters upserted`)

  // -------------------------------------------------------------------------
  // §9 ReconciliationRecords (covering §8 #3 reconciliation)
  // -------------------------------------------------------------------------
  console.log('[seed] 9/9 ReconciliationRecords')
  const recs = [
    // §8 #3 — MATCHED payment reconciliation
    { id: 'rr_matched_1', reconciliationId: 'REC-20240115-00001', ustn: 'SGTX-PHASE6-PAY-0001', reconciliationType: 'PAYMENT', sourceType: 'GlobalPayment', sourceId: 'gp_settled_swift', targetType: 'BANK_STATEMENT', targetReference: 'STMT-EG-2024-001', sourceAmountUsd: 25000, targetAmountUsd: 25000, differenceUsd: 0, status: 'MATCHED', matchedAt: PAST.toISOString(), reconciliationDate: PAST.toISOString(), period: '2024-01', notes: '§8 #3 — matched payment reconciliation' },
    // DISCREPANT payment reconciliation
    { id: 'rr_discrepant_1', reconciliationId: 'REC-20240125-00002', ustn: 'SGTX-PHASE6-UNREC-0003', reconciliationType: 'PAYMENT', sourceType: 'GlobalPayment', sourceId: 'gp_unreconciled', targetType: 'BANK_STATEMENT', targetReference: 'STMT-EG-2024-002', sourceAmountUsd: 3000, targetAmountUsd: 2950, differenceUsd: 50, status: 'DISCREPANT', discrepancyReason: 'Amount mismatch: $50 difference (bank fee not accounted)', reconciliationDate: PAST.toISOString(), period: '2024-01', notes: 'Discrepant — $50 bank fee' },
  ]
  for (const r of recs) {
    await exec(
      `INSERT OR IGNORE INTO ReconciliationRecord (id, reconciliationId, ustn, tradeId, reconciliationType, sourceType, sourceId, targetType, targetReference, sourceAmountUsd, targetAmountUsd, differenceUsd, status, matchedAt, discrepancyReason, resolvedBy, resolvedAt, resolutionNotes, reconciliationDate, period, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.reconciliationId, r.ustn, null, r.reconciliationType, r.sourceType, r.sourceId, r.targetType, r.targetReference, r.sourceAmountUsd, r.targetAmountUsd, r.differenceUsd, r.status, r.matchedAt || null, r.discrepancyReason || null, null, null, null, r.reconciliationDate, r.period, r.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${recs.length} reconciliation records upserted`)

  console.log('[seed] Done. §10 test scenarios available:')
  console.log('[seed]   1. payment              → gp_settled_swift (SETTLED, SWIFT, $25k)')
  console.log('[seed]   2. split               → (runtime via splitPayment API)')
  console.log('[seed]   3. reconciliation      → rr_matched_1 (MATCHED) + rr_discrepant_1 (DISCREPANT)')
  console.log('[seed]   4. bank                → fr_cbe (CONNECTED_BANK, $500k limit)')
  console.log('[seed]   5. LC                  → lcl_eg_1 (PRESENTATION step)')
  console.log('[seed]   6. guarantee           → gr_eg_customs_1 (ACTIVE, $50k)')
  console.log('[seed]   7. financing           → tfc_disbursement (DISBURSEMENT, $100k)')
  console.log('[seed]   8. insurance           → il_eg_cargo_1 (CERTIFICATE step)')
  console.log('[seed]   9. accounting          → 7 entries (AP/AR/FREIGHT/DUTY/TAX/INSURANCE/ACCRUAL)')
  console.log('[seed]  10. ERP                 → ea_sap_1 (CONNECTED SAP)')
  console.log('[seed]  11. failed payment      → gp_failed_psp (FAILED, NSF)')
  console.log('[seed]  12. duplicate payment   → gp_duplicate (DUPLICATE, same idempotencyKey)')
  console.log('[seed]  13. unmatched payment   → gp_unreconciled (UNRECONCILED)')
  console.log('[seed]  14. financier restriction → tfc_rejected (REJECTED — financier not in approved list)')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
