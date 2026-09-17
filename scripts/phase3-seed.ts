/**
 * Phase 3 — Seed sample data covering positive + negative cases (§9).
 *
 * §9 requires "positive and negative cases for every subsystem".
 *
 * Subsystem          | Positive (ALLOW)                    | Negative (BLOCK/COND)
 * -------------------|-------------------------------------|----------------------
 * 1 License          | ISSUED import license (onions EG)   | EXPIRED export license (pharma)
 * 2 Permit           | ISSUED SPS permit (onions)          | MISSING food permit (sugar)
 * 3 Certificate      | ISSUED COO + EUR1 (cotton)          | EXPIRED phytosanitary (garlic)
 * 4 SPS              | plant-health rule (onions, summer)  | quarantine rule (cotton, EU→EG)
 * 5 TBT              | labeling rule (textiles)            | mandatory registration (pharma)
 * 6 Controlled goods | CITES Appendix II (python skin)     | CITES Appendix I (BLOCK) + CWC Sched 1 (BLOCK)
 * 7 Sanctions        | clean entity "Honest Trading Co"    | OFAC match "Sanctioned Entity Ltd"
 * 8 Connectors       | CONNECTED license/EG                | MISSING sanctions/SA + DEGRADED SPS/EG
 *
 * Run: bun run scripts/phase3-seed.ts
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

async function exec(sql: string, args: unknown[] = []) {
  // libsql hrana only accepts: string | number | bigint | boolean | null | Uint8Array
  // Convert Date → ISO string, undefined → null
  const safeArgs = args.map((a) => {
    if (a instanceof Date) return a.toISOString()
    if (a === undefined) return null
    return a
  })
  await client.execute({ sql, args: safeArgs })
}

async function findOne(sql: string, args: unknown[] = []) {
  const r = await client.execute({ sql, args })
  return r.rows[0] as any | undefined
}

async function jid(code: string): Promise<string | null> {
  const r = await findOne(`SELECT id FROM JurisdictionFabric WHERE code = ?`, [code])
  return r?.id || null
}

const NOW = new Date()
const PAST = new Date('2023-01-01')
const FUTURE = new Date('2027-12-31')
const EXPIRED_DATE = new Date('2024-01-01')

async function main() {
  console.log('[seed] Phase 3 sample data — start')
  const egId = await jid('EG')
  const euId = await jid('EU')
  const usId = await jid('US')
  const cnId = await jid('CN')
  const saId = await jid('SA')
  if (!egId) throw new Error('EG jurisdiction missing')
  console.log(`[seed] EG=${egId} EU=${euId} US=${usId} CN=${cnId} SA=${saId}`)

  // -------------------------------------------------------------------------
  // §1 TradeLicenses
  // -------------------------------------------------------------------------
  console.log('[seed] 1/8 TradeLicenses')
  const licenses = [
    // POSITIVE: ISSUED import license for onions into EG
    {
      id: 'tl_eg_onions_import_issued', licenseType: 'IMPORT', hs6: '070310', productName: 'Fresh Onions',
      jurisdictionId: egId, originCountry: 'EU', destCountry: 'EG', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingAuthority: 'Egyptian General Authority for Import & Export Control',
      licenseNumber: 'EG-IMP-2024-001234', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      quantityAuthorized: 50000, quantityUnit: 'KG',
      conditions: JSON.stringify(['Annual quota allocation', 'Must clear via approved port']),
      endUserStatement: false, endUseCertificate: false,
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_license_gov_api',
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid import license'
    },
    // NEGATIVE: EXPIRED export license for pharma
    {
      id: 'tl_eg_pharma_export_expired', licenseType: 'EXPORT', hs6: '300490', productName: 'Paracetamol Tablets',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'US', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingAuthority: 'Egyptian Drug Authority',
      licenseNumber: 'EG-EXP-PHARMA-2022-000567', state: 'EXPIRED', validFrom: new Date('2022-01-01'), validUntil: EXPIRED_DATE,
      quantityAuthorized: 100000, quantityUnit: 'TABLET',
      conditions: JSON.stringify(['GMP certificate required']),
      endUserStatement: true, endUseCertificate: true,
      sourceId: 'rs_eg_tariff_2024', connectorId: null,
      appliedAt: new Date('2021-10-01'), issuedAt: new Date('2022-01-01'), expiresAt: EXPIRED_DATE,
      notes: 'NEGATIVE — expired export license (renewal required)'
    },
    // POSITIVE: ISSUED strategic goods export license (steel to non-CN)
    {
      id: 'tl_eg_steel_strategic_issued', licenseType: 'STRATEGIC_GOODS', hs6: '721391', productName: 'Hot-rolled Steel Coils',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'US', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingAuthority: 'Export Control Authority',
      licenseNumber: 'EG-EXP-STRAT-2024-0000789', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      conditions: JSON.stringify(['End-user certificate on file', 'No re-export to sanctioned jurisdictions']),
      endUserStatement: true, endUseCertificate: true,
      sourceId: 'rs_eg_ad_steel', connectorId: null,
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid strategic goods license'
    },
  ]
  for (const l of licenses) {
    await exec(
      `INSERT OR IGNORE INTO TradeLicense (id, licenseType, hs6, productName, jurisdictionId, originCountry, destCountry, applicantGtid, issuingAuthority, licenseNumber, state, validFrom, validUntil, quantityAuthorized, quantityUnit, conditions, endUserStatement, endUseCertificate, sourceId, connectorId, appliedAt, issuedAt, expiresAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [l.id, l.licenseType, l.hs6, l.productName, l.jurisdictionId, l.originCountry, l.destCountry, l.applicantGtid, l.issuingAuthority, l.licenseNumber, l.state, l.validFrom, l.validUntil, l.quantityAuthorized, l.quantityUnit, l.conditions, l.endUserStatement?1:0, l.endUseCertificate?1:0, l.sourceId, l.connectorId, l.appliedAt, l.issuedAt, l.expiresAt, l.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${licenses.length} trade licenses upserted`)

  // -------------------------------------------------------------------------
  // §2 TradePermits
  // -------------------------------------------------------------------------
  console.log('[seed] 2/8 TradePermits')
  const permits = [
    // POSITIVE: ISSUED SPS permit for onions
    {
      id: 'tp_eg_onions_sps_issued', permitType: 'SPS', hs6: '070310', productName: 'Fresh Onions',
      jurisdictionId: egId, originCountry: 'EU', destCountry: 'EG', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingAuthority: 'Central Administration of Plant Quarantine',
      permitNumber: 'EG-SPS-2024-000345', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      scopeNotes: 'Phytosanitary import permit — bulbs',
      conditions: JSON.stringify(['Pre-shipment inspection', 'Fumigation on arrival if pest detected']),
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_sps_portal',
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid SPS permit'
    },
    // POSITIVE: ISSUED pharma permit for paracetamol
    {
      id: 'tp_eg_pharma_pharma_issued', permitType: 'PHARMA', hs6: '300490', productName: 'Paracetamol Tablets',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'US', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingAuthority: 'Egyptian Drug Authority',
      permitNumber: 'EG-PHARMA-2024-000456', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      scopeNotes: 'Pharmaceutical export permit — OTC paracetamol',
      conditions: JSON.stringify(['GMP certificate valid', 'Stability data on file']),
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_permit_portal',
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid pharma permit'
    },
    // NEGATIVE: REQUIRED-but-not-applied food permit for sugar import
    {
      id: 'tp_eg_sugar_food_required', permitType: 'FOOD', hs6: '170199', productName: 'Refined Cane Sugar',
      jurisdictionId: egId, originCountry: 'BR', destCountry: 'EG', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingAuthority: 'National Food Safety Authority (NFSA)',
      permitNumber: null, state: 'REQUIRED', validFrom: null, validUntil: null,
      scopeNotes: 'Food import permit required for all refined sugar imports',
      conditions: JSON.stringify(['Laboratory analysis of lead content', 'Country-of-origin health certificate']),
      sourceId: 'rs_eg_tariff_2024', connectorId: null,
      appliedAt: null, issuedAt: null, expiresAt: null, notes: 'NEGATIVE — required permit not yet applied for'
    },
  ]
  for (const p of permits) {
    await exec(
      `INSERT OR IGNORE INTO TradePermit (id, permitType, hs6, productName, jurisdictionId, originCountry, destCountry, applicantGtid, issuingAuthority, permitNumber, state, validFrom, validUntil, scopeNotes, conditions, sourceId, connectorId, appliedAt, issuedAt, expiresAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.permitType, p.hs6, p.productName, p.jurisdictionId, p.originCountry, p.destCountry, p.applicantGtid, p.issuingAuthority, p.permitNumber, p.state, p.validFrom, p.validUntil, p.scopeNotes, p.conditions, p.sourceId, p.connectorId, p.appliedAt, p.issuedAt, p.expiresAt, p.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${permits.length} trade permits upserted`)

  // -------------------------------------------------------------------------
  // §3 RegulatoryCertificates
  // -------------------------------------------------------------------------
  console.log('[seed] 3/8 RegulatoryCertificates')
  const certs = [
    // POSITIVE: ISSUED COO (non-preferential) for cotton
    {
      id: 'rc_eg_cotton_coo_issued', certificateType: 'COO', hs6: '520831', productName: 'Cotton Woven Fabric',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'EU', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingBody: 'Egyptian Chamber of Commerce',
      certificateNumber: 'EG-COO-2024-000123', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      scopeNotes: 'Non-preferential certificate of origin', attachments: JSON.stringify(['coo-original.pdf']),
      sourceId: 'rs_dcfta_origin', connectorId: 'cc_eg_cert_portal',
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid COO'
    },
    // POSITIVE: ISSUED EUR1 for cotton under DCFTA
    {
      id: 'rc_eg_cotton_eur1_issued', certificateType: 'EUR1', hs6: '520831', productName: 'Cotton Woven Fabric',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'EU', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingBody: 'Egyptian Chamber of Commerce (EUR.1 issuer)',
      certificateNumber: 'EG-EUR1-2024-000078', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      scopeNotes: 'EUR.1 movement certificate under EU-EG DCFTA',
      attachments: JSON.stringify(['eur1-original.pdf']),
      sourceId: 'rs_dcfta_origin', connectorId: 'cc_eg_cert_portal',
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid EUR.1'
    },
    // NEGATIVE: EXPIRED phytosanitary for garlic
    {
      id: 'rc_eg_garlic_phyto_expired', certificateType: 'PHYTOSANITARY', hs6: '070320', productName: 'Fresh Garlic',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'EU', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingBody: 'Central Administration of Plant Quarantine',
      certificateNumber: 'EG-PHYTO-2023-000456', state: 'EXPIRED', validFrom: new Date('2023-01-01'), validUntil: EXPIRED_DATE,
      scopeNotes: 'Phytosanitary certificate — garlic bulbs',
      attachments: JSON.stringify(['phyto-2023.pdf']),
      sourceId: 'rs_eg_tariff_2024', connectorId: null,
      appliedAt: new Date('2022-12-01'), issuedAt: new Date('2023-01-01'), expiresAt: EXPIRED_DATE, notes: 'NEGATIVE — expired phytosanitary certificate'
    },
    // POSITIVE: ISSUED insurance for high-value cotton
    {
      id: 'rc_eg_cotton_insurance_issued', certificateType: 'INSURANCE', hs6: '520831', productName: 'Cotton Woven Fabric',
      jurisdictionId: egId, originCountry: 'EG', destCountry: 'EU', applicantGtid: 'SGTX-EG-TRD-002139-7F3A',
      issuingBody: 'AIG Egypt',
      certificateNumber: 'INS-2024-009876', state: 'ISSUED', validFrom: PAST, validUntil: FUTURE,
      scopeNotes: 'Cargo insurance — marine all-risks',
      attachments: JSON.stringify(['policy.pdf']),
      sourceId: null, connectorId: null,
      appliedAt: PAST, issuedAt: PAST, expiresAt: FUTURE, notes: 'POSITIVE — valid cargo insurance'
    },
  ]
  for (const c of certs) {
    await exec(
      `INSERT OR IGNORE INTO RegulatoryCertificate (id, certificateType, hs6, productName, jurisdictionId, originCountry, destCountry, applicantGtid, issuingBody, certificateNumber, state, validFrom, validUntil, scopeNotes, attachments, sourceId, connectorId, appliedAt, issuedAt, expiresAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.certificateType, c.hs6, c.productName, c.jurisdictionId, c.originCountry, c.destCountry, c.applicantGtid, c.issuingBody, c.certificateNumber, c.state, c.validFrom, c.validUntil, c.scopeNotes, c.attachments, c.sourceId, c.connectorId, c.appliedAt, c.issuedAt, c.expiresAt, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${certs.length} certificates upserted`)

  // -------------------------------------------------------------------------
  // §4 SpsRequirements
  // -------------------------------------------------------------------------
  console.log('[seed] 4/8 SpsRequirements')
  const spsRules = [
    // POSITIVE: plant health rule for onions (EG, summer season)
    {
      id: 'sps_eg_onions_ph', spsCategory: 'PLANT_HEALTH', hs6: '070310', commodity: 'onions',
      originCountry: 'EU', destCountry: 'EG', seasonFrom: '04', seasonTo: '10',
      intendedUse: 'HUMAN_CONSUMPTION', transportMode: 'SEA', jurisdictionId: egId,
      requirementText: 'Phytosanitary inspection required for all fresh onion imports',
      mandatoryActions: JSON.stringify(['Pre-shipment inspection', 'Fumigation if pest detected']),
      samplingRequired: true, labTestRequired: false, treatmentRequired: 'FUMIGATION', inspectionRequired: true,
      quarantineDays: 3, mrlStandards: JSON.stringify([{ substance: 'chlorpyrifos', limitMgKg: 0.05 }]),
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_sps_portal',
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // POSITIVE: food safety rule for sugar (EG)
    {
      id: 'sps_eg_sugar_fs', spsCategory: 'FOOD_SAFETY', hs6: '170199', commodity: 'refined sugar',
      originCountry: 'BR', destCountry: 'EG', seasonFrom: null, seasonTo: null,
      intendedUse: 'HUMAN_CONSUMPTION', transportMode: 'SEA', jurisdictionId: egId,
      requirementText: 'Lead content lab analysis required for all sugar imports',
      mandatoryActions: JSON.stringify(['Laboratory analysis of lead < 1 mg/kg']),
      samplingRequired: true, labTestRequired: true, treatmentRequired: 'NONE', inspectionRequired: true,
      quarantineDays: 0, mrlStandards: JSON.stringify([{ substance: 'lead', limitMgKg: 1.0 }]),
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_sps_portal',
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // NEGATIVE: quarantine rule for cotton (origin=CN to EG — pest risk)
    {
      id: 'sps_eg_cotton_q', spsCategory: 'QUARANTINE', hs6: '520831', commodity: 'cotton fabric',
      originCountry: 'CN', destCountry: 'EG', seasonFrom: null, seasonTo: null,
      intendedUse: 'INDUSTRIAL', transportMode: 'SEA', jurisdictionId: egId,
      requirementText: 'Mandatory 7-day quarantine for cotton products from pest-risk origins',
      mandatoryActions: JSON.stringify(['Fumigation on arrival', 'Quarantine hold 7 days']),
      samplingRequired: true, labTestRequired: true, treatmentRequired: 'FUMIGATION', inspectionRequired: true,
      quarantineDays: 7, mrlStandards: JSON.stringify([]),
      sourceId: 'rs_eg_tariff_2024', connectorId: null,
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
  ]
  for (const s of spsRules) {
    await exec(
      `INSERT OR IGNORE INTO SpsRequirement (id, spsCategory, hs6, commodity, originCountry, destCountry, seasonFrom, seasonTo, intendedUse, transportMode, jurisdictionId, requirementText, mandatoryActions, samplingRequired, labTestRequired, treatmentRequired, inspectionRequired, quarantineDays, mrlStandards, sourceId, connectorId, legalStatus, effectiveFrom, effectiveUntil, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.spsCategory, s.hs6, s.commodity, s.originCountry, s.destCountry, s.seasonFrom, s.seasonTo, s.intendedUse, s.transportMode, s.jurisdictionId, s.requirementText, s.mandatoryActions, s.samplingRequired?1:0, s.labTestRequired?1:0, s.treatmentRequired, s.inspectionRequired?1:0, s.quarantineDays, s.mrlStandards, s.sourceId, s.connectorId, s.legalStatus, s.effectiveFrom, s.effectiveUntil, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${spsRules.length} SPS rules upserted`)

  // -------------------------------------------------------------------------
  // §5 TbtRequirements
  // -------------------------------------------------------------------------
  console.log('[seed] 5/8 TbtRequirements')
  const tbtRules = [
    // POSITIVE: labeling rule for textiles (EG)
    {
      id: 'tbt_eg_textiles_labeling', tbtCategory: 'LABELING', hs6: '520831', productName: 'Cotton Woven Fabric',
      jurisdictionId: egId, standardReference: 'GSO 9', standardBody: 'GSO',
      requirementText: 'Arabic + English fiber content labeling required',
      mandatoryStandards: JSON.stringify(['GSO 9:2015']),
      labelingRules: JSON.stringify({ language: ['ar', 'en'], symbols: ['fiber_content', 'care_label'], warnings: [] }),
      testingRequired: false, registrationRequired: false, conformityBody: 'Egyptian Organization for Standardization',
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_tbt_portal',
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // NEGATIVE: mandatory registration for pharma (EG)
    {
      id: 'tbt_eg_pharma_registration', tbtCategory: 'PRODUCT_REGISTRATION', hs6: '300490', productName: 'Paracetamol Tablets',
      jurisdictionId: egId, standardReference: 'EDA Drug Registration', standardBody: 'EDA',
      requirementText: 'Pharmaceutical product registration with EDA required before import/export',
      mandatoryStandards: JSON.stringify(['GMP', 'WHO-cGMP', 'Stability ICH Q1A']),
      labelingRules: JSON.stringify({ language: ['ar', 'en'], symbols: [], warnings: ['store_below_25c'] }),
      testingRequired: true, registrationRequired: true, conformityBody: 'Egyptian Drug Authority',
      sourceId: 'rs_eg_tariff_2024', connectorId: null,
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // POSITIVE: EMC for electrical (HS 85 — but we'll tie to a generic electronics profile)
    {
      id: 'tbt_eg_electronics_emc', tbtCategory: 'EMC', hs6: '850440', productName: 'Power supply units',
      jurisdictionId: egId, standardReference: 'EN 55032', standardBody: 'EN',
      requirementText: 'EMC compliance required for all electronic imports',
      mandatoryStandards: JSON.stringify(['EN 55032', 'EN 55035']),
      labelingRules: JSON.stringify({ language: ['ar', 'en'], symbols: ['ce_mark'], warnings: [] }),
      testingRequired: true, registrationRequired: false, conformityBody: 'NTRA Egypt',
      sourceId: 'rs_eg_tariff_2024', connectorId: 'cc_eg_tbt_portal',
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
  ]
  for (const t of tbtRules) {
    await exec(
      `INSERT OR IGNORE INTO TbtRequirement (id, tbtCategory, hs6, productName, jurisdictionId, standardReference, standardBody, requirementText, mandatoryStandards, labelingRules, testingRequired, registrationRequired, conformityBody, sourceId, connectorId, legalStatus, effectiveFrom, effectiveUntil, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.tbtCategory, t.hs6, t.productName, t.jurisdictionId, t.standardReference, t.standardBody, t.requirementText, t.mandatoryStandards, t.labelingRules, t.testingRequired?1:0, t.registrationRequired?1:0, t.conformityBody, t.sourceId, t.connectorId, t.legalStatus, t.effectiveFrom, t.effectiveUntil, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${tbtRules.length} TBT rules upserted`)

  // -------------------------------------------------------------------------
  // §6 ControlledGoodsControls
  // -------------------------------------------------------------------------
  console.log('[seed] 6/8 ControlledGoodsControls')
  const controls = [
    // POSITIVE: CITES Appendix II for python skin (ENHANCED_DD)
    {
      id: 'cgc_cites_python_ii', controlCategory: 'CITES', hs6: '420221', productName: 'Python Skin Handbag',
      casNumbers: null, controlListEntry: 'CITES Appendix II — Python reticulatus',
      jurisdictionId: egId,
      exportLicenseRequired: true, importLicenseRequired: true, transitControlRequired: true,
      endUserStatementRequired: false, endUseCertificateRequired: false, reExportControl: true,
      severity: 'ENHANCED_DD', sourceId: 'rs_cites', connectorId: null,
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // NEGATIVE: CITES Appendix I (BLOCK — commercial trade prohibited)
    {
      id: 'cgc_cites_rhino_i', controlCategory: 'CITES', hs6: '420221', productName: 'Rhino Horn Handbag (BLOCKED)',
      casNumbers: null, controlListEntry: 'CITES Appendix I — Rhinocerotidae spp.',
      jurisdictionId: egId,
      exportLicenseRequired: true, importLicenseRequired: true, transitControlRequired: true,
      endUserStatementRequired: true, endUseCertificateRequired: true, reExportControl: true,
      severity: 'BLOCK', sourceId: 'rs_cites', connectorId: null,
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // NEGATIVE: CWC Schedule 1 chemical (BLOCK)
    {
      id: 'cgc_cwc_sarin_s1', controlCategory: 'CHEMICALS', hs6: '292419', productName: 'Sarin precursor (BLOCKED)',
      casNumbers: JSON.stringify(['7783-60-0']), controlListEntry: 'CWC Schedule 1 — Sarin precursor',
      jurisdictionId: egId,
      exportLicenseRequired: true, importLicenseRequired: true, transitControlRequired: true,
      endUserStatementRequired: true, endUseCertificateRequired: true, reExportControl: true,
      severity: 'BLOCK', sourceId: 'rs_cites', connectorId: null,
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
    // POSITIVE: DUAL_USE for advanced semiconductor (ENHANCED_DD)
    {
      id: 'cgc_dualuse_semicon', controlCategory: 'DUAL_USE', hs6: '854231', productName: 'Advanced semiconductor',
      casNumbers: null, controlListEntry: 'EU Dual-use 3A001 — electronic components',
      jurisdictionId: egId,
      exportLicenseRequired: true, importLicenseRequired: false, transitControlRequired: true,
      endUserStatementRequired: true, endUseCertificateRequired: true, reExportControl: true,
      severity: 'ENHANCED_DD', sourceId: 'rs_cites', connectorId: null,
      legalStatus: 'IN_FORCE', effectiveFrom: PAST, effectiveUntil: FUTURE
    },
  ]
  for (const c of controls) {
    await exec(
      `INSERT OR IGNORE INTO ControlledGoodsControl (id, controlCategory, hs6, productName, casNumbers, controlListEntry, jurisdictionId, exportLicenseRequired, importLicenseRequired, transitControlRequired, endUserStatementRequired, endUseCertificateRequired, reExportControl, severity, sourceId, connectorId, legalStatus, effectiveFrom, effectiveUntil, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.controlCategory, c.hs6, c.productName, c.casNumbers, c.controlListEntry, c.jurisdictionId, c.exportLicenseRequired?1:0, c.importLicenseRequired?1:0, c.transitControlRequired?1:0, c.endUserStatementRequired?1:0, c.endUseCertificateRequired?1:0, c.reExportControl?1:0, c.severity, c.sourceId, c.connectorId, c.legalStatus, c.effectiveFrom, c.effectiveUntil, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${controls.length} controlled goods controls upserted`)

  // -------------------------------------------------------------------------
  // §7 SanctionsScreening (pre-seed a few sanctioned entities for fuzzy matching)
  // -------------------------------------------------------------------------
  console.log('[seed] 7/8 SanctionsScreening')
  const sanctioned = [
    // NEGATIVE: OFAC exact match
    {
      id: 'ss_ofac_1', screeningType: 'ENTITY', screenedValue: 'Sanctioned Entity Ltd',
      matchedEntity: 'Sanctioned Entity Ltd', matchedList: 'OFAC', matchScore: 1.0,
      ownershipPct: null, uboChainDepth: null, networkHits: 0,
      jurisdictionCode: 'EG', verdict: 'BLOCK',
      reason: 'Exact match on OFAC SDN list', evidence: JSON.stringify(['OFAC SDN: 12345']),
      connectorId: 'cc_global_sanctions_ofac', screenedAt: NOW.toISOString()
    },
    // NEGATIVE: UN fuzzy match
    {
      id: 'ss_un_1', screeningType: 'ENTITY', screenedValue: 'Sanctioned Trading Co',
      matchedEntity: 'Sanctioned Trading Corporation', matchedList: 'UN_SANCTIONS', matchScore: 0.88,
      ownershipPct: null, uboChainDepth: null, networkHits: 1,
      jurisdictionCode: 'EG', verdict: 'ENHANCED_DD',
      reason: 'Fuzzy match (0.88) on UN sanctions list + 1 connected flagged entity',
      evidence: JSON.stringify(['UN Consolidated List: UNSC-001']),
      connectorId: 'cc_global_sanctions_un', screenedAt: NOW.toISOString()
    },
    // NEGATIVE: vessel BLOCK
    {
      id: 'ss_vessel_1', screeningType: 'VESSEL', screenedValue: 'MV Blocklisted',
      matchedEntity: 'MV Blocklisted', matchedList: 'OFAC', matchScore: 1.0,
      ownershipPct: null, uboChainDepth: null, networkHits: 0,
      jurisdictionCode: 'EG', verdict: 'BLOCK',
      reason: 'Vessel on OFAC maritime list', evidence: JSON.stringify(['OFAC Vessel: V-999']),
      connectorId: 'cc_global_sanctions_ofac', screenedAt: NOW.toISOString()
    },
  ]
  for (const s of sanctioned) {
    await exec(
      `INSERT OR IGNORE INTO SanctionsScreening (id, screeningType, screenedValue, matchedEntity, matchedList, matchScore, ownershipPct, uboChainDepth, networkHits, jurisdictionCode, verdict, reason, evidence, connectorId, screenedAt, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.screeningType, s.screenedValue, s.matchedEntity, s.matchedList, s.matchScore, s.ownershipPct, s.uboChainDepth, s.networkHits, s.jurisdictionCode, s.verdict, s.reason, s.evidence, s.connectorId, s.screenedAt, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${sanctioned.length} sanctions screening records upserted`)

  // -------------------------------------------------------------------------
  // §8 ComplianceConnectors (the admin "missing connectors" view source)
  // -------------------------------------------------------------------------
  console.log('[seed] 8/8 ComplianceConnectors')
  const connectors = [
    // EG — most connected (mostly CONNECTED)
    { id: 'cc_eg_license_gov_api', subsystem: 'LICENSE', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt GOEIC Import/Export License API', connectorType: 'GOV_API', endpointUrl: 'https://api.goeic.gov.eg/v1/licenses', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'OAUTH2', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 95, confidenceScore: 0.95, notes: 'Live GOEIC API' },
    { id: 'cc_eg_permit_portal', subsystem: 'PERMIT', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt Nafeza Permit Portal', connectorType: 'GOV_PORTAL', endpointUrl: 'https://nafeza.gov.eg', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'API_KEY', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 90, confidenceScore: 0.9, notes: 'Single-window customs' },
    { id: 'cc_eg_cert_portal', subsystem: 'CERTIFICATE', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt Chamber of Commerce Certificates', connectorType: 'GOV_PORTAL', endpointUrl: 'https://chamber.org.eg/certs', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'BASIC', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'PARTIAL', coveragePct: 80, confidenceScore: 0.85, notes: 'Partial — some cert types manual' },
    { id: 'cc_eg_sps_portal', subsystem: 'SPS', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt Plant Quarantine Authority', connectorType: 'GOV_PORTAL', endpointUrl: 'https://pqap.gov.eg', apiKeyRequired: 1, apiKeyConfigured: 0, authMethod: 'API_KEY', status: 'DEGRADED', lastSyncAt: new Date('2024-06-01').toISOString(), lastSyncStatus: 'FAILED', lastError: 'API key expired', coveragePct: 40, confidenceScore: 0.5, notes: 'DEGRADED — renewal pending' },
    { id: 'cc_eg_tbt_portal', subsystem: 'TBT', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt Organization for Standardization (EOS)', connectorType: 'GOV_PORTAL', endpointUrl: 'https://eos.org.eg', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 85, confidenceScore: 0.88, notes: 'Public portal' },
    { id: 'cc_eg_controlled_goods', subsystem: 'CONTROLLED_GOODS', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt Export Control Authority', connectorType: 'MANUAL', endpointUrl: null, apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'MISSING', lastSyncAt: null, lastSyncStatus: 'NEVER', lastError: null, coveragePct: 0, confidenceScore: null, notes: 'MISSING — manual review required' },
    { id: 'cc_eg_sanctions', subsystem: 'SANCTIONS', jurisdictionId: egId, jurisdictionCode: 'EG', connectorName: 'Egypt Central Bank Sanctions List', connectorType: 'OFFICIAL_LIST', endpointUrl: 'https://cbe.org.eg/sanctions', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 75, confidenceScore: 0.8, notes: 'Monthly update' },

    // SA — partial coverage
    { id: 'cc_sa_license', subsystem: 'LICENSE', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi Zakat & Customs License API', connectorType: 'GOV_API', endpointUrl: 'https://api.zatca.gov.sa/licenses', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'OAUTH2', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 88, confidenceScore: 0.9, notes: 'ZATCA FASAH' },
    { id: 'cc_sa_permit', subsystem: 'PERMIT', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi SFDA Permit Portal', connectorType: 'GOV_PORTAL', endpointUrl: 'https://sfda.gov.sa/permits', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'API_KEY', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 85, confidenceScore: 0.88, notes: 'SFDA' },
    { id: 'cc_sa_certificate', subsystem: 'CERTIFICATE', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi Chambers Certificates', connectorType: 'GOV_PORTAL', endpointUrl: 'https://mci.gov.sa/certs', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'DEGRADED', lastSyncAt: new Date('2024-08-01').toISOString(), lastSyncStatus: 'PARTIAL', lastError: 'RSS feed stale', coveragePct: 60, confidenceScore: 0.7, notes: 'DEGRADED — feed stale' },
    { id: 'cc_sa_sps', subsystem: 'SPS', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi Quarantine Service', connectorType: 'GOV_PORTAL', endpointUrl: 'https://sfda.gov.sa/sps', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'API_KEY', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 82, confidenceScore: 0.85, notes: 'SFDA SPS' },
    { id: 'cc_sa_tbt', subsystem: 'TBT', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi Standards Organization (SASO)', connectorType: 'GOV_PORTAL', endpointUrl: 'https://saso.gov.sa', apiKeyRequired: 1, apiKeyConfigured: 1, authMethod: 'API_KEY', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 90, confidenceScore: 0.9, notes: 'SABER system' },
    { id: 'cc_sa_controlled_goods', subsystem: 'CONTROLLED_GOODS', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi Defense Controls', connectorType: 'MANUAL', endpointUrl: null, apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'MISSING', lastSyncAt: null, lastSyncStatus: 'NEVER', coveragePct: 0, confidenceScore: null, notes: 'MISSING — defense export controls manual' },
    { id: 'cc_sa_sanctions', subsystem: 'SANCTIONS', jurisdictionId: saId, jurisdictionCode: 'SA', connectorName: 'Saudi National Risk Unit', connectorType: 'OFFICIAL_LIST', endpointUrl: null, apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'MISSING', lastSyncAt: null, lastSyncStatus: 'NEVER', coveragePct: 0, confidenceScore: null, notes: 'MISSING — relies on UN/OFAC + local CTR' },

    // Global sanctions sources (no jurisdictionCode = global)
    { id: 'cc_global_sanctions_ofac', subsystem: 'SANCTIONS', jurisdictionId: null, jurisdictionCode: null, connectorName: 'OFAC SDN List', connectorType: 'OFFICIAL_LIST', endpointUrl: 'https://www.treasury.gov/ofac/downloads/sdn.csv', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 100, confidenceScore: 0.98, notes: 'Daily sync' },
    { id: 'cc_global_sanctions_un', subsystem: 'SANCTIONS', jurisdictionId: null, jurisdictionCode: null, connectorName: 'UN Consolidated Sanctions List', connectorType: 'OFFICIAL_LIST', endpointUrl: 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 100, confidenceScore: 0.98, notes: 'Daily sync' },
    { id: 'cc_global_sanctions_eu', subsystem: 'SANCTIONS', jurisdictionId: null, jurisdictionCode: null, connectorName: 'EU Consolidated Financial Sanctions List', connectorType: 'OFFICIAL_LIST', endpointUrl: 'https://webgate.ec.europa.eu/fsd/fsf', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'CONNECTED', lastSyncAt: NOW.toISOString(), lastSyncStatus: 'SUCCESS', coveragePct: 100, confidenceScore: 0.97, notes: 'Weekly sync' },
    { id: 'cc_global_sanctions_uk', subsystem: 'SANCTIONS', jurisdictionId: null, jurisdictionCode: null, connectorName: 'UK OFSI Consolidated List', connectorType: 'OFFICIAL_LIST', endpointUrl: 'https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets', apiKeyRequired: 0, apiKeyConfigured: 0, authMethod: 'NONE', status: 'DEGRADED', lastSyncAt: new Date('2024-07-01').toISOString(), lastSyncStatus: 'PARTIAL', lastError: 'Last download partial', coveragePct: 80, confidenceScore: 0.8, notes: 'DEGRADED — partial last sync' },
  ]
  for (const c of connectors) {
    await exec(
      `INSERT OR IGNORE INTO ComplianceConnector (id, subsystem, jurisdictionId, jurisdictionCode, connectorName, connectorType, endpointUrl, apiKeyRequired, apiKeyConfigured, authMethod, status, lastSyncAt, lastSyncStatus, lastError, coveragePct, confidenceScore, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.subsystem, c.jurisdictionId, c.jurisdictionCode, c.connectorName, c.connectorType, c.endpointUrl, c.apiKeyRequired?1:0, c.apiKeyConfigured?1:0, c.authMethod, c.status, c.lastSyncAt, c.lastSyncStatus, c.lastError || null, c.coveragePct, c.confidenceScore, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${connectors.length} compliance connectors upserted`)

  console.log('[seed] Done. §9 test scenarios available:')
  console.log('[seed]   License: + ISSUED (onions) / - EXPIRED (pharma export)')
  console.log('[seed]   Permit:  + ISSUED SPS (onions) / - REQUIRED-not-applied FOOD (sugar)')
  console.log('[seed]   Cert:    + ISSUED COO+EUR1 (cotton) / - EXPIRED PHYTO (garlic)')
  console.log('[seed]   SPS:     + plant-health rule (onions, summer) / - quarantine 7d (cotton CN→EG)')
  console.log('[seed]   TBT:     + labeling (textiles) / - mandatory registration (pharma)')
  console.log('[seed]   Controlled: + CITES II (python ENHANCED_DD) / - CITES I (rhino BLOCK) + CWC S1 (BLOCK)')
  console.log('[seed]   Sanctions: + clean entity (no match) / - OFAC exact (BLOCK) + UN fuzzy (ENHANCED_DD)')
  console.log('[seed]   Connectors: + 5 CONNECTED EG / - 1 MISSING (EG controlled goods) + 1 DEGRADED (EG SPS)')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
