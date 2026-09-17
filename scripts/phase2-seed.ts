/**
 * Phase 2 — Seed sample data covering all §8 test scenarios.
 *
 * Scenarios covered:
 *   1. Multiple HS classifications      → onions (0703.10) + (0703.20)
 *   2. Uncertain classification          → novel "bio-resin composite" (no rule)
 *   3. Tariff change                      → cotton (5208) old rate expired, new rate in force
 *   4. Preferential tariff                → textiles under EU-Egypt DCFTA (0% preferential)
 *   5. Origin qualification                → textiles qualifying under DCFTA tariff shift
 *   6. Failed origin                      → textiles with non-origin materials > threshold
 *   7. FTA expiry                          → "GAFTA-PAFTA-TEST-EXPIRED" expired 2020
 *   8. Quota                               → sugar (1701) TRQ under Egypt regime
 *   9. Anti-dumping                       → steel coils (7213) AD duty on origin CN
 *  10. Source version mismatch            → tariff rule with sourceId pointing to SUPERSEDED source
 *
 * Run: bun run scripts/phase2-seed.ts
 */
import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

function cuid() {
  // simple cuid-like id
  const s = 'abcdefghijklmnopqrstuvwxyz'
  const t = Date.now().toString(36)
  const r = Array.from({ length: 16 }, () =>
    s[Math.floor(Math.random() * s.length)]
  ).join('')
  return `c${t}${r}`
}

async function exec(sql: string, args: unknown[] = []) {
  await client.execute({ sql, args })
}

async function findOne(sql: string, args: unknown[] = []) {
  const r = await client.execute({ sql, args })
  return r.rows[0] as any | undefined
}

// ---------------------------------------------------------------------------
// Helpers — lookup JurisdictionFabric by code
// ---------------------------------------------------------------------------
async function jid(code: string): Promise<string | null> {
  const r = await findOne(`SELECT id FROM JurisdictionFabric WHERE code = ?`, [code])
  return r?.id || null
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('[seed] Phase 2 sample data — start')

  const egId = await jid('EG')
  const euId = await jid('EU')
  const usId = await jid('US')
  const cnId = await jid('CN')
  const saId = await jid('SA')
  if (!egId) throw new Error('EG jurisdiction not found — run Phase 1 seed first')
  console.log(`[seed] EG=${egId} EU=${euId} US=${usId} CN=${cnId} SA=${saId}`)

  // -------------------------------------------------------------------------
  // 1. Regulatory Sources (backing for rules)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/7 Regulatory sources')
  const sources = [
    {
      id: 'rs_wco_hs_2022',
      jurisdictionId: null,
      sourceType: 'CUSTOMS_TARIFF',
      title: 'WCO Harmonized System 2022',
      officialUrl: 'http://www.wcoomd.org/en/topics/nomenclature',
      effectiveDate: '2022-01-01',
      legalStatus: 'IN_FORCE',
      verificationStatus: 'VERIFIED',
    },
    {
      id: 'rs_eg_tariff_2024',
      jurisdictionId: egId,
      sourceType: 'CUSTOMS_TARIFF',
      title: 'Egypt Customs Tariff Schedule 2024',
      officialUrl: 'https://www.customs.gov.eg/tariff',
      effectiveDate: '2024-01-01',
      legalStatus: 'IN_FORCE',
      verificationStatus: 'VERIFIED',
    },
    {
      id: 'rs_eg_tariff_2020_superseded',
      jurisdictionId: egId,
      sourceType: 'CUSTOMS_TARIFF',
      title: 'Egypt Customs Tariff Schedule 2020 (SUPERSEDED)',
      effectiveDate: '2020-01-01',
      expiryDate: '2023-12-31',
      legalStatus: 'SUPERSEDED',
      verificationStatus: 'STALE',
    },
    {
      id: 'rs_dcfta_origin',
      jurisdictionId: euId,
      sourceType: 'LAW',
      title: 'EU-Egypt DCFTA Rules of Origin Protocol',
      effectiveDate: '2004-06-01',
      legalStatus: 'IN_FORCE',
      verificationStatus: 'VERIFIED',
    },
    {
      id: 'rs_usmca',
      jurisdictionId: usId,
      sourceType: 'LAW',
      title: 'USMCA Agreement + Annex on Origin',
      effectiveDate: '2020-07-01',
      legalStatus: 'IN_FORCE',
      verificationStatus: 'VERIFIED',
    },
    {
      id: 'rs_gafta_expired',
      jurisdictionId: saId,
      sourceType: 'LAW',
      title: 'GAFTA (test) — expired 2020',
      effectiveDate: '2005-01-01',
      expiryDate: '2020-12-31',
      legalStatus: 'SUPERSEDED',
      verificationStatus: 'STALE',
    },
    {
      id: 'rs_eg_ad_steel',
      jurisdictionId: egId,
      sourceType: 'OFFICIAL_NOTICE',
      title: 'Egypt Anti-Dumping Notice — Hot-rolled steel from China',
      effectiveDate: '2023-04-15',
      legalStatus: 'IN_FORCE',
      verificationStatus: 'VERIFIED',
    },
    {
      id: 'rs_cites',
      jurisdictionId: null,
      sourceType: 'LAW',
      title: 'CITES Appendices 2023',
      effectiveDate: '2023-11-25',
      legalStatus: 'IN_FORCE',
      verificationStatus: 'VERIFIED',
    },
  ]
  for (const s of sources) {
    await exec(
      `INSERT OR IGNORE INTO RegulatorySource (id, jurisdictionId, sourceType, title, officialUrl, publicationDate, effectiveDate, expiryDate, authority, language, legalStatus, verificationStatus, lastChecked, description, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.id,
        s.jurisdictionId,
        s.sourceType,
        s.title,
        s.officialUrl || null,
        null,
        s.effectiveDate ? new Date(s.effectiveDate) : null,
        s.expiryDate ? new Date(s.expiryDate) : null,
        null,
        null,
        s.legalStatus,
        s.verificationStatus,
        new Date().toISOString(),
        null,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    )
  }
  console.log(`[seed]   ${sources.length} sources upserted`)

  // -------------------------------------------------------------------------
  // 2. Trade Agreements (incl. expired one for FTA-expiry test)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/7 Trade agreements')
  const agreements = [
    {
      id: 'ta_dcfta',
      agreementType: 'FTA',
      name: 'EU-Egypt Association Agreement (DCFTA)',
      shortName: 'EU-EG-DCFTA',
      parties: JSON.stringify(['EG', 'EU']),
      effectiveDate: new Date('2004-06-01'),
      expiryDate: null,
      productCoverage: JSON.stringify({ covered: ['*'], excluded: [] }),
      tariffTreatment: JSON.stringify({ stagingCategory: 'BILATERAL_STAGING' }),
      originRulesSummary: 'Tariff shift (CTH) or RVC >= 40%',
      quotas: null,
      exclusions: JSON.stringify([]),
      certification: JSON.stringify({ type: 'EUR_MED', body: 'Chamber of Commerce' }),
      cumulation: JSON.stringify({ bilateral: true, diagonal: true, full: false, cumulationParties: ['EG', 'EU'] }),
      directTransport: 1,
      legalStatus: 'IN_FORCE',
      sourceId: 'rs_dcfta_origin',
      confidenceScore: 0.95,
    },
    {
      id: 'ta_usmca',
      agreementType: 'FTA',
      name: 'USMCA (US-Mexico-Canada Agreement)',
      shortName: 'USMCA',
      parties: JSON.stringify(['US', 'MX', 'CA']),
      effectiveDate: new Date('2020-07-01'),
      expiryDate: null,
      productCoverage: JSON.stringify({ covered: ['*'], excluded: ['dairy_quotas'] }),
      tariffTreatment: JSON.stringify({ stagingCategory: 'USMCA_STAGING' }),
      originRulesSummary: 'Tariff shift + RVC >= 50% (TV) or 60% (build-up)',
      quotas: null,
      exclusions: JSON.stringify(['dairy']),
      certification: JSON.stringify({ type: 'CERTIFICATION_OF_ORIGIN', body: 'Exporter self-certification' }),
      cumulation: JSON.stringify({ bilateral: true, diagonal: true, full: true, cumulationParties: ['US', 'MX', 'CA'] }),
      directTransport: 1,
      legalStatus: 'IN_FORCE',
      sourceId: 'rs_usmca',
      confidenceScore: 0.95,
    },
    {
      id: 'ta_gafta_expired',
      agreementType: 'FTA',
      name: 'Greater Arab Free Trade Area (TEST EXPIRED)',
      shortName: 'GAFTA-TEST-EXPIRED',
      parties: JSON.stringify(['EG', 'SA', 'AE', 'JO']),
      effectiveDate: new Date('2005-01-01'),
      expiryDate: new Date('2020-12-31'),
      productCoverage: JSON.stringify({ covered: ['*'], excluded: [] }),
      tariffTreatment: JSON.stringify({ stagingCategory: 'FULL_ELIMINATION' }),
      originRulesSummary: 'Value added >= 40%',
      quotas: null,
      exclusions: JSON.stringify([]),
      certification: JSON.stringify({ type: 'COO_FORM_A', body: 'Arab Chambers of Commerce' }),
      cumulation: JSON.stringify({ bilateral: true, diagonal: false, full: false, cumulationParties: ['EG', 'SA', 'AE', 'JO'] }),
      directTransport: 1,
      legalStatus: 'SUPERSEDED',
      sourceId: 'rs_gafta_expired',
      confidenceScore: 0.9,
    },
    {
      id: 'ta_mercosur_eg',
      agreementType: 'PTA',
      name: 'Mercosur-Egypt PTA',
      shortName: 'MERCOSUR-EG',
      parties: JSON.stringify(['EG', 'BR', 'AR', 'UY', 'PY']),
      effectiveDate: new Date('2010-09-02'),
      expiryDate: null,
      productCoverage: JSON.stringify({ covered: ['*'], excluded: [] }),
      tariffTreatment: JSON.stringify({ stagingCategory: 'PARTIAL' }),
      originRulesSummary: 'Tariff shift CTH',
      quotas: null,
      exclusions: JSON.stringify([]),
      certification: JSON.stringify({ type: 'COO_FORM_A', body: 'Chamber of Commerce' }),
      cumulation: JSON.stringify({ bilateral: true, diagonal: false, full: false, cumulationParties: ['EG', 'BR', 'AR'] }),
      directTransport: 1,
      legalStatus: 'IN_FORCE',
      sourceId: null,
      confidenceScore: 0.85,
    },
  ]
  for (const a of agreements) {
    await exec(
      `INSERT OR IGNORE INTO TradeAgreement (id, agreementType, name, shortName, parties, effectiveDate, expiryDate, productCoverage, tariffTreatment, originRulesSummary, quotas, exclusions, certification, cumulation, directTransport, legalStatus, sourceId, confidenceScore, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        a.id, a.agreementType, a.name, a.shortName, a.parties, a.effectiveDate,
        a.expiryDate, a.productCoverage, a.tariffTreatment, a.originRulesSummary,
        a.quotas, a.exclusions, a.certification, a.cumulation, a.directTransport,
        a.legalStatus, a.sourceId, a.confidenceScore,
        new Date().toISOString(), new Date().toISOString(),
      ]
    )
  }
  console.log(`[seed]   ${agreements.length} agreements upserted`)

  // -------------------------------------------------------------------------
  // 3. Product Regulatory Profiles
  // -------------------------------------------------------------------------
  console.log('[seed] 3/7 Product regulatory profiles')
  const profiles = [
    {
      id: 'pp_onions',
      productName: 'Fresh Onions',
      productDescription: 'Fresh or chilled onions',
      hs6: '070310',
      nationalTariffCodes: JSON.stringify({ EG: '0703.10.10.00', SA: '0703.10.00' }),
      agricultureClassification: JSON.stringify({ category: 'vegetable', subcategory: 'bulb', perishable: true }),
      foodClassification: JSON.stringify({ category: 'fresh_produce', additives: false }),
      temperatureMinC: 0,
      temperatureMaxC: 4,
      shelfLifeDays: 30,
      packagingRequirements: JSON.stringify({ material: 'mesh_bag', marking: 'origin_label' }),
      status: 'ACTIVE',
      confidenceScore: 0.95,
      sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'pp_garlic',
      productName: 'Fresh Garlic',
      productDescription: 'Fresh or chilled garlic',
      hs6: '070320',
      nationalTariffCodes: JSON.stringify({ EG: '0703.20.10.00' }),
      agricultureClassification: JSON.stringify({ category: 'vegetable', subcategory: 'bulb', perishable: true }),
      foodClassification: JSON.stringify({ category: 'fresh_produce', additives: false }),
      temperatureMinC: -1,
      temperatureMaxC: 2,
      shelfLifeDays: 90,
      status: 'ACTIVE',
      confidenceScore: 0.95,
      sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'pp_cotton_textile',
      productName: 'Cotton Woven Fabric',
      productDescription: 'Cotton woven fabric, plain weave',
      hs6: '520831',
      nationalTariffCodes: JSON.stringify({ EG: '5208.31.00.10', EU: '52083100' }),
      material: 'cotton',
      composition: '100% cotton woven fabric',
      packagingRequirements: JSON.stringify({ material: 'rolls', marking: 'composition_label' }),
      labelingRequirements: JSON.stringify({ language: ['ar','en'], symbols: ['fiber_content'] }),
      status: 'ACTIVE',
      confidenceScore: 0.92,
      sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'pp_refined_sugar',
      productName: 'Refined Cane Sugar',
      productDescription: 'Refined cane sugar in solid form',
      hs6: '170199',
      nationalTariffCodes: JSON.stringify({ EG: '1701.99.10.00' }),
      foodClassification: JSON.stringify({ category: 'sweetener', additives: false }),
      agricultureClassification: JSON.stringify({ category: 'processed_sugar' }),
      status: 'ACTIVE',
      confidenceScore: 0.9,
      sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'pp_hot_rolled_steel',
      productName: 'Hot-rolled Steel Coils',
      productDescription: 'Hot-rolled steel products in coils',
      hs6: '721391',
      nationalTariffCodes: JSON.stringify({ EG: '7213.91.00.20' }),
      material: 'steel',
      dualUseClassification: null,
      strategicGoodsClassification: null,
      conformityRequirements: JSON.stringify({ standards: ['ISO 3573', 'EN 10025'] }),
      status: 'ACTIVE',
      confidenceScore: 0.93,
      sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'pp_python_skin',
      productName: 'Python Skin Handbag',
      productDescription: 'Handbag made of reptile leather (Python)',
      hs6: '420221',
      citesClassification: JSON.stringify({ appendix: 'II', specimenType: 'skin', annotation: 'ranched' }),
      status: 'ACTIVE',
      confidenceScore: 0.88,
      sourceId: 'rs_cites',
    },
    {
      id: 'pp_pharma_paracetamol',
      productName: 'Paracetamol Tablets 500mg',
      productDescription: 'Paracetamol (acetaminophen) tablets',
      hs6: '300490',
      casNumbers: JSON.stringify(['103-90-2']),
      pharmaClassification: JSON.stringify({ atcCode: 'N02BE01', schedule: 'OTC', prescriptionRequired: false }),
      chemicalClassification: JSON.stringify({ ghsClassification: [], reachRegistered: true }),
      shelfLifeDays: 1095,
      conformityRequirements: JSON.stringify({ standards: ['GMP', 'ISO 9001'] }),
      status: 'ACTIVE',
      confidenceScore: 0.95,
      sourceId: 'rs_wco_hs_2022',
    },
  ]
  for (const p of profiles) {
    await exec(
      `INSERT OR IGNORE INTO ProductRegulatoryProfile (id, productName, productDescription, hs6, nationalTariffCodes, alternateClassifications, composition, material, casNumbers, brand, model, serialRequired, serialRequirements, agricultureClassification, foodClassification, pharmaClassification, veterinaryClassification, chemicalClassification, dualUseClassification, dgClassification, strategicGoodsClassification, citesClassification, packagingRequirements, labelingRequirements, shelfLifeDays, temperatureMinC, temperatureMaxC, conformityRequirements, status, confidenceScore, sourceId, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id, p.productName, p.productDescription, p.hs6,
        p.nationalTariffCodes || null, null, p.composition || null, p.material || null,
        p.casNumbers || null, null, null, 0, null,
        p.agricultureClassification || null, p.foodClassification || null,
        p.pharmaClassification || null, p.veterinaryClassification || null,
        p.chemicalClassification || null, p.dualUseClassification || null,
        p.dgClassification || null, p.strategicGoodsClassification || null,
        p.citesClassification || null, p.packagingRequirements || null,
        p.labelingRequirements || null, p.shelfLifeDays || null,
        p.temperatureMinC ?? null, p.temperatureMaxC ?? null,
        p.conformityRequirements || null, p.status, p.confidenceScore || null,
        p.sourceId || null,
        new Date().toISOString(), new Date().toISOString(),
      ]
    )
  }
  console.log(`[seed]   ${profiles.length} product profiles upserted`)

  // -------------------------------------------------------------------------
  // 4. Classification Rules
  // -------------------------------------------------------------------------
  console.log('[seed] 4/7 Classification rules')
  const clsRules = [
    {
      id: 'cr_hs6_070310', classificationType: 'HS6', hsCode: '070310',
      jurisdictionId: null, productId: 'pp_onions', description: 'Onions & shallots, fresh/chilled',
      ruleLogic: JSON.stringify({ match: { hs6: '070310' } }), confidenceThreshold: 0.9,
      legalStatus: 'IN_FORCE', sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'cr_hs6_070320', classificationType: 'HS6', hsCode: '070320',
      jurisdictionId: null, productId: 'pp_garlic', description: 'Garlic, fresh/chilled',
      ruleLogic: JSON.stringify({ match: { hs6: '070320' } }), confidenceThreshold: 0.9,
      legalStatus: 'IN_FORCE', sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'cr_eg_070310_national', classificationType: 'HS_NATIONAL', hsCode: '0703.10.10.00',
      parentHsCode: '070310', jurisdictionId: egId, productId: 'pp_onions',
      description: 'Egypt national tariff — fresh onions for sowing',
      ruleLogic: JSON.stringify({ match: { hsNational: '0703.10.10.00' } }), confidenceThreshold: 0.85,
      legalStatus: 'IN_FORCE', sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'cr_hs6_520831', classificationType: 'HS6', hsCode: '520831',
      jurisdictionId: null, productId: 'pp_cotton_textile', description: 'Cotton woven fabric, plain weave',
      ruleLogic: JSON.stringify({ match: { hs6: '520831', material: 'cotton' } }), confidenceThreshold: 0.88,
      legalStatus: 'IN_FORCE', sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'cr_hs6_170199', classificationType: 'HS6', hsCode: '170199',
      jurisdictionId: null, productId: 'pp_refined_sugar', description: 'Refined cane sugar',
      ruleLogic: JSON.stringify({ match: { hs6: '170199' } }), confidenceThreshold: 0.88,
      legalStatus: 'IN_FORCE', sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'cr_hs6_721391', classificationType: 'HS6', hsCode: '721391',
      jurisdictionId: null, productId: 'pp_hot_rolled_steel', description: 'Hot-rolled steel coils',
      ruleLogic: JSON.stringify({ match: { hs6: '721391' } }), confidenceThreshold: 0.88,
      legalStatus: 'IN_FORCE', sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'cr_hs6_420221', classificationType: 'HS6', hsCode: '420221',
      jurisdictionId: null, productId: 'pp_python_skin', description: 'Trunks, suit-cases of leather',
      ruleLogic: JSON.stringify({ match: { hs6: '420221' } }), confidenceThreshold: 0.85,
      legalStatus: 'IN_FORCE', sourceId: 'rs_wco_hs_2022',
    },
    {
      id: 'cr_hs6_300490', classificationType: 'HS6', hsCode: '300490',
      jurisdictionId: null, productId: 'pp_pharma_paracetamol', description: 'Pharmaceutical medicaments, other',
      ruleLogic: JSON.stringify({ match: { hs6: '300490', cas: '103-90-2' } }), confidenceThreshold: 0.9,
      legalStatus: 'IN_FORCE', sourceId: 'rs_wco_hs_2022',
    },
  ]
  for (const c of clsRules) {
    await exec(
      `INSERT OR IGNORE INTO ClassificationRule (id, classificationType, hsCode, parentHsCode, jurisdictionId, productId, description, ruleLogic, legalReferences, confidenceThreshold, effectiveFrom, effectiveUntil, legalStatus, sourceId, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.id, c.classificationType, c.hsCode, c.parentHsCode || null, c.jurisdictionId,
        c.productId, c.description, c.ruleLogic, null, c.confidenceThreshold,
        new Date('2022-01-01'), null, c.legalStatus, c.sourceId,
        new Date().toISOString(), new Date().toISOString(),
      ]
    )
  }
  console.log(`[seed]   ${clsRules.length} classification rules upserted`)

  // -------------------------------------------------------------------------
  // 5. Tariff Rules (MFN + preferential + quota + AD + tariff-change)
  // -------------------------------------------------------------------------
  console.log('[seed] 5/7 Tariff rules')
  const tariffRules = [
    // --- Onions: MFN 5% in EG (no preferential) ---
    {
      id: 'tr_eg_onions_mfn', tariffType: 'MFN', hsCode: '0703.10.10.00', hs6: '070310',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_onions',
      rateAdValorem: 5, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    // --- Garlic: MFN 10% in EG ---
    {
      id: 'tr_eg_garlic_mfn', tariffType: 'MFN', hsCode: '0703.20.10.00', hs6: '070320',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_garlic',
      rateAdValorem: 10, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    // --- Cotton textile: MFN 12% in EG + preferential 0% under DCFTA (origin=EU) ---
    {
      id: 'tr_eg_cotton_mfn', tariffType: 'MFN', hsCode: '5208.31.00.10', hs6: '520831',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_cotton_textile',
      rateAdValorem: 12, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'tr_eg_cotton_pref_dcfta', tariffType: 'PREFERENTIAL', hsCode: '5208.31.00.10', hs6: '520831',
      jurisdictionId: egId, originCountry: 'EU', agreementId: 'ta_dcfta', productId: 'pp_cotton_textile',
      rateAdValorem: 0, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2004-06-01'), sourceId: 'rs_dcfta_origin',
      confidenceScore: 0.95,
    },
    // --- Tariff change: sugar — OLD rate (SUPERSEDED, expired 2023-12-31) ---
    {
      id: 'tr_eg_sugar_mfn_old', tariffType: 'MFN', hsCode: '1701.99.10.00', hs6: '170199',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_refined_sugar',
      rateAdValorem: 20, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'SUPERSEDED', effectiveFrom: new Date('2020-01-01'), effectiveUntil: new Date('2023-12-31'),
      sourceId: 'rs_eg_tariff_2020_superseded',
    },
    // --- Tariff change: sugar — NEW rate (IN_FORCE from 2024-01-01) ---
    {
      id: 'tr_eg_sugar_mfn_new', tariffType: 'MFN', hsCode: '1701.99.10.00', hs6: '170199',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_refined_sugar',
      rateAdValorem: 30, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    // --- Sugar: TRQ (tariff-rate quota) — 0% up to 50,000 kg, then MFN ---
    {
      id: 'tr_eg_sugar_quota', tariffType: 'QUOTA', hsCode: '1701.99.10.00', hs6: '170199',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_refined_sugar',
      rateAdValorem: 0, rateType: 'AD_VALOREM', currency: 'USD',
      quotaVolume: 50000, quotaUnit: 'KG', quotaUsed: 48000, quotaPeriod: 'CALENDAR_YEAR', quotaOpen: 1,
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    // --- Steel: MFN 10% + anti-dumping 17% on origin=CN ---
    {
      id: 'tr_eg_steel_mfn', tariffType: 'MFN', hsCode: '7213.91.00.20', hs6: '721391',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_hot_rolled_steel',
      rateAdValorem: 10, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    {
      id: 'tr_eg_steel_ad_china', tariffType: 'ANTI_DUMPING', hsCode: '7213.91.00.20', hs6: '721391',
      jurisdictionId: egId, originCountry: 'CN', agreementId: null, productId: 'pp_hot_rolled_steel',
      rateAdValorem: 17, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2023-04-15'), sourceId: 'rs_eg_ad_steel',
      legalReference: 'Egypt Anti-Dumping Notice No. 23/2023',
    },
    // --- Python skin: MFN 20% + cites appendix II restriction (handled as restriction, not tariff) ---
    {
      id: 'tr_eg_python_mfn', tariffType: 'MFN', hsCode: '4202.21.00.00', hs6: '420221',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_python_skin',
      rateAdValorem: 20, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
    // --- Pharma: MFN 5% ---
    {
      id: 'tr_eg_pharma_mfn', tariffType: 'MFN', hsCode: '3004.90.00.00', hs6: '300490',
      jurisdictionId: egId, originCountry: null, agreementId: null, productId: 'pp_pharma_paracetamol',
      rateAdValorem: 5, rateType: 'AD_VALOREM', currency: 'USD',
      legalStatus: 'IN_FORCE', effectiveFrom: new Date('2024-01-01'), sourceId: 'rs_eg_tariff_2024',
    },
  ]
  for (const t of tariffRules) {
    await exec(
      `INSERT OR IGNORE INTO TariffRule (id, tariffType, hsCode, hs6, jurisdictionId, originCountry, agreementId, productId, rateAdValorem, rateSpecific, rateSpecificUnit, rateCompound, rateType, currency, minRate, maxRate, quotaVolume, quotaUnit, quotaUsed, quotaPeriod, quotaOpen, sourceId, legalReference, confidenceScore, legalStatus, effectiveFrom, effectiveUntil, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        t.id, t.tariffType, t.hsCode, t.hs6, t.jurisdictionId, t.originCountry,
        t.agreementId, t.productId, t.rateAdValorem ?? null, null, null, null,
        t.rateType, t.currency, null, null, t.quotaVolume ?? null, t.quotaUnit ?? null,
        t.quotaUsed ?? 0, t.quotaPeriod ?? null, t.quotaOpen ?? 1,
        t.sourceId || null, t.legalReference || null, t.confidenceScore ?? null,
        t.legalStatus, t.effectiveFrom || null, t.effectiveUntil || null,
        new Date().toISOString(), new Date().toISOString(),
      ]
    )
  }
  console.log(`[seed]   ${tariffRules.length} tariff rules upserted`)

  // -------------------------------------------------------------------------
  // 6. Origin Rules (preferential + non-preferential + documentary)
  // -------------------------------------------------------------------------
  console.log('[seed] 6/7 Origin rules')
  const originRules = [
    // DCFTA — textile: tariff shift (CTH) rule
    {
      id: 'or_dcfta_cotton_ts', ruleType: 'TARIFF_SHIFT', hs6: '520831',
      jurisdictionId: egId, agreementId: 'ta_dcfta', productId: 'pp_cotton_textile',
      originCountry: 'EU', ruleCriteria: JSON.stringify({ criterion: 'tariff_shift', level: 'CTH' }),
      tariffShiftTarget: 'CTH', requiredDocuments: JSON.stringify(['EUR_MED']),
      certificationBody: 'Chamber of Commerce', legalStatus: 'IN_FORCE', sourceId: 'rs_dcfta_origin',
    },
    // DCFTA — textile: RVC fallback (>= 40%)
    {
      id: 'or_dcfta_cotton_rvc', ruleType: 'REGIONAL_VALUE_CONTENT', hs6: '520831',
      jurisdictionId: egId, agreementId: 'ta_dcfta', productId: 'pp_cotton_textile',
      originCountry: 'EU', ruleCriteria: JSON.stringify({ criterion: 'rvc' }),
      rvcThreshold: 40, rvcMethod: 'TRANSACTION_VALUE',
      requiredDocuments: JSON.stringify(['EUR_MED']),
      certificationBody: 'Chamber of Commerce', legalStatus: 'IN_FORCE', sourceId: 'rs_dcfta_origin',
    },
    // DCFTA — wholly obtained (agricultural)
    {
      id: 'or_dcfta_onions_wo', ruleType: 'WHOLLY_OBTAINED', hs6: '070310',
      jurisdictionId: egId, agreementId: 'ta_dcfta', productId: 'pp_onions',
      originCountry: 'EU', ruleCriteria: JSON.stringify({ criterion: 'wholly_obtained' }),
      requiredDocuments: JSON.stringify(['EUR_MED']),
      legalStatus: 'IN_FORCE', sourceId: 'rs_dcfta_origin',
    },
    // DCFTA — documentary: EUR_MED certificate required
    {
      id: 'or_dcfta_doc_eurmed', ruleType: 'CERTIFICATE_OF_ORIGIN', hs6: null,
      jurisdictionId: egId, agreementId: 'ta_dcfta', originCountry: 'EU',
      ruleCriteria: JSON.stringify({ docType: 'EUR_MED' }),
      requiredDocuments: JSON.stringify(['EUR_MED']),
      certificationBody: 'Chamber of Commerce', legalStatus: 'IN_FORCE', sourceId: 'rs_dcfta_origin',
    },
    // DCFTA — approved exporter
    {
      id: 'or_dcfta_approved_exporter', ruleType: 'APPROVED_EXPORTER', hs6: null,
      jurisdictionId: egId, agreementId: 'ta_dcfta', originCountry: 'EU',
      ruleCriteria: JSON.stringify({ authNumberFormat: 'EOREG_[0-9]+' }),
      requiredDocuments: JSON.stringify(['APPROVED_EXPORTER_AUTH']),
      legalStatus: 'IN_FORCE', sourceId: 'rs_dcfta_origin',
    },
    // DCFTA — direct transport / non-manipulation
    {
      id: 'or_dcfta_direct_transport', ruleType: 'DIRECT_SHIPMENT', hs6: null,
      jurisdictionId: egId, agreementId: 'ta_dcfta', originCountry: 'EU',
      ruleCriteria: JSON.stringify({ nonManipulation: true }),
      legalStatus: 'IN_FORCE', sourceId: 'rs_dcfta_origin',
    },
    // Non-preferential — substantial transformation (Egypt default)
    {
      id: 'or_eg_nonpref_st', ruleType: 'SUBSTANTIAL_TRANSFORMATION', hs6: null,
      jurisdictionId: egId, agreementId: null, originCountry: null,
      ruleCriteria: JSON.stringify({ criterion: 'substantial_transformation', level: 'CTH' }),
      tariffShiftTarget: 'CTH', legalStatus: 'IN_FORCE', sourceId: 'rs_eg_tariff_2024',
    },
    // Non-preferential — wholly obtained
    {
      id: 'or_eg_nonpref_wo', ruleType: 'WHOLLY_OBTAINED', hs6: null,
      jurisdictionId: egId, agreementId: null, originCountry: null,
      ruleCriteria: JSON.stringify({ criterion: 'wholly_obtained' }),
      legalStatus: 'IN_FORCE', sourceId: 'rs_eg_tariff_2024',
    },
    // GAFTA (EXPIRED) — RVC 40% (for FTA-expiry test)
    {
      id: 'or_gafta_rvc', ruleType: 'REGIONAL_VALUE_CONTENT', hs6: null,
      jurisdictionId: egId, agreementId: 'ta_gafta_expired', originCountry: 'SA',
      ruleCriteria: JSON.stringify({ criterion: 'rvc' }),
      rvcThreshold: 40, rvcMethod: 'TRANSACTION_VALUE',
      requiredDocuments: JSON.stringify(['COO_FORM_A']),
      legalStatus: 'SUPERSEDED', effectiveUntil: new Date('2020-12-31'),
      sourceId: 'rs_gafta_expired',
    },
  ]
  for (const o of originRules) {
    await exec(
      `INSERT OR IGNORE INTO OriginRule (id, ruleType, hsCode, hs6, jurisdictionId, agreementId, productId, originCountry, ruleCriteria, rvcThreshold, rvcMethod, tariffShiftTarget, requiredDocuments, certificationBody, effectiveFrom, effectiveUntil, legalStatus, sourceId, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        o.id, o.ruleType, o.hsCode || null, o.hs6 || null, o.jurisdictionId,
        o.agreementId, o.productId || null, o.originCountry, o.ruleCriteria,
        o.rvcThreshold ?? null, o.rvcMethod || null, o.tariffShiftTarget || null,
        o.requiredDocuments || null, o.certificationBody || null,
        o.effectiveFrom ? new Date(o.effectiveFrom) : new Date('2004-06-01'),
        o.effectiveUntil ? new Date(o.effectiveUntil) : null,
        o.legalStatus, o.sourceId || null,
        new Date().toISOString(), new Date().toISOString(),
      ]
    )
  }
  console.log(`[seed]   ${originRules.length} origin rules upserted`)

  // -------------------------------------------------------------------------
  // 7. Summary
  // -------------------------------------------------------------------------
  console.log('[seed] 7/7 Done. Test scenarios available:')
  console.log('[seed]   - multiple HS: 070310 (onions) + 070320 (garlic)')
  console.log('[seed]   - uncertain: "bio-resin composite" (no rule)')
  console.log('[seed]   - tariff change: sugar MFN 20%→30% (2020→2024)')
  console.log('[seed]   - preferential: cotton 520831 0% under DCFTA (origin=EU)')
  console.log('[seed]   - origin qualifying: cotton CTH shift')
  console.log('[seed]   - origin failed: cotton with non-origin materials > 60%')
  console.log('[seed]   - FTA expiry: GAFTA-TEST-EXPIRED (expired 2020)')
  console.log('[seed]   - quota: sugar 50,000kg TRQ (48,000 used)')
  console.log('[seed]   - anti-dumping: steel 721391 + 17% AD on origin=CN')
  console.log('[seed]   - source version mismatch: sugar old rule → SUPERSEDED source')
}

main().catch((e) => {
  console.error('[seed] FATAL', e)
  process.exit(1)
})
