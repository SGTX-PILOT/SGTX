/**
 * Phase 4 — Egypt-first seed data covering all §9 test scenarios.
 *
 * §9 test scenarios:
 *   1. API connector        → Nafeza (EG CUSTOMS, API, PRODUCTION_CONNECTED)
 *   2. EDI connector        → CargoX (EG CUSTOMS, CARGO_XML, PRODUCTION_CONNECTED)
 *   3. Portal connector     → ETA (EG TAX, PORTAL, PORTAL_ONLY)
 *   4. Manual fallback      → some authority MANUAL_ONLY
 *   5. Outage               → a connector in OUTAGE state
 *   6. Duplicate response   → idempotency-key duplicate detection
 *   7. Rejected declaration → a CustomsOperationV2 in GOVERNMENT_REJECTED
 *   8. Amended declaration  → a CustomsOperationV2 amended
 *   9. Government release   → a CustomsOperationV2 in GOVERNMENT_RELEASED
 *  10. Multi-agency         → EG sequential workflow (CUSTOMS→AGRICULTURE→HEALTH→STANDARDS→SECURITY→RELEASE)
 *  11. Integration health   → connectors with varying health (CONNECTED/DEGRADED/OUTAGE/MISSING)
 *
 * §8 Egypt-first: Nafeza/CargoX/ETA preserved + transport-mode rules
 * (CargoX/ACI is SEA-only; ETA is for invoicing not transport-specific;
 * Nafeza handles all modes).
 *
 * Run: bun run scripts/phase4-seed.ts
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

async function findOne(sql: string, args: unknown[] = []) {
  const r = await client.execute({ sql, args })
  return r.rows[0] as any | undefined
}

async function jid(code: string): Promise<string | null> {
  const r = await findOne(`SELECT id FROM JurisdictionFabric WHERE code = ?`, [code])
  return r?.id || null
}

const NOW = new Date()
const PAST = new Date('2024-01-01')
const FUTURE = new Date('2027-12-31')

async function main() {
  console.log('[seed] Phase 4 Egypt-first seed — start')
  const egId = await jid('EG')
  const usId = await jid('US')
  const saId = await jid('SA')
  const euId = await jid('EU')
  if (!egId) throw new Error('EG jurisdiction missing')
  console.log(`[seed] EG=${egId} US=${usId} SA=${saId} EU=${euId}`)

  // -------------------------------------------------------------------------
  // §2 GovConnectors (Egypt-first + worldwide sample)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/5 GovConnectors')
  const connectors = [
    // === EGYPT FIRST ===
    // Nafeza — Egyptian Single Window for customs (all transport modes)
    {
      id: 'gc_eg_nafeza', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'CUSTOMS', systemName: 'Nafeza', systemType: 'SINGLE_WINDOW',
      protocols: JSON.stringify(['API', 'XML', 'JSON']),
      status: 'PRODUCTION_CONNECTED', mode: 'PRODUCTION', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 0, portalEnabled: 1, sandboxEnabled: 1, productionEnabled: 1,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 1, certificationStatus: 'GRANTED',
      legalAgreement: 'Nafeza Integration Agreement v3.2',
      lastSuccessAt: NOW.toISOString(), lastErrorAt: null, lastError: null,
      version: '3.2', owner: 'SGTX Egypt Integrations Team', priority: 95,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL', 'RORO', 'MULTIMODAL']),
      discoveryUrl: 'https://nafetha.cloud.discovery', authMethod: 'OAUTH2',
      authEndpoint: 'https://nafeza.gov.eg/oauth/token',
      submitEndpoint: 'https://nafeza.gov.eg/api/v3/declarations',
      statusEndpoint: 'https://nafeza.gov.eg/api/v3/status',
      notes: 'Egyptian single window — handles SAD declarations + certificates. All transport modes.'
    },
    // CargoX — ACI (Advance Cargo Information) — SEA + AIR only (not road/rail)
    {
      id: 'gc_eg_cargox', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'CUSTOMS', systemName: 'CargoX', systemType: 'CUSTOMS',
      protocols: JSON.stringify(['API', 'CARGO_XML', 'JSON']),
      status: 'PRODUCTION_CONNECTED', mode: 'PRODUCTION', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 1, portalEnabled: 1, sandboxEnabled: 1, productionEnabled: 1,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 1, certificationStatus: 'GRANTED',
      legalAgreement: 'CargoX ACI Provider Agreement',
      lastSuccessAt: NOW.toISOString(), lastErrorAt: null, lastError: null,
      version: '2.1', owner: 'SGTX Egypt Integrations Team', priority: 90,
      // §8 — CargoX/ACI is SEA + AIR only, NOT road/rail
      transportModes: JSON.stringify(['SEA', 'AIR']),
      discoveryUrl: 'https://api.cargox.io/discovery', authMethod: 'API_KEY',
      authEndpoint: 'https://api.cargox.io/v2/auth',
      submitEndpoint: 'https://api.cargox.io/v2/aci/submit',
      statusEndpoint: 'https://api.cargox.io/v2/aci/status',
      notes: 'CargoX ACI — Advance Cargo Information. SEA + AIR only (NOT road/rail per §8).'
    },
    // ETA — Egyptian Tax Authority e-Invoicing (all modes — invoicing, not transport-specific)
    {
      id: 'gc_eg_eta', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'TAX', systemName: 'ETA', systemType: 'TAX',
      protocols: JSON.stringify(['API', 'JSON']),
      status: 'PORTAL_ONLY', mode: 'PORTAL_ONLY', integrationType: 'PORTAL',
      apiEnabled: 1, ediEnabled: 0, portalEnabled: 1, sandboxEnabled: 1, productionEnabled: 0,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 1, certificationStatus: 'PENDING',
      legalAgreement: 'ETA e-Invoicing Provider Agreement (pending)',
      lastSuccessAt: new Date('2024-06-01').toISOString(), lastErrorAt: new Date('2024-08-01').toISOString(),
      lastError: 'Production certification pending — sandbox only',
      version: '1.0', owner: 'SGTX Egypt Integrations Team', priority: 80,
      // ETA is invoicing — not transport-mode-specific
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL', 'RORO', 'MULTIMODAL']),
      discoveryUrl: 'https://eta.portal.discovery', authMethod: 'OAUTH2',
      authEndpoint: 'https://eta.invoicing.eta.gov.eg/oauth/token',
      submitEndpoint: 'https://eta.invoicing.eta.gov.eg/api/v1/invoices',
      statusEndpoint: 'https://eta.invoicing.eta.gov.eg/api/v1/invoices/status',
      notes: 'ETA e-Invoicing — portal-only until production certification granted. All transport modes.'
    },
    // GOEIC — Import/Export Control (manual fallback for some license types)
    {
      id: 'gc_eg_goeic', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'CUSTOMS', systemName: 'GOEIC', systemType: 'CUSTOMS',
      protocols: JSON.stringify(['PORTAL', 'MANUAL']),
      status: 'PORTAL_ONLY', mode: 'PORTAL_ONLY', integrationType: 'PORTAL',
      apiEnabled: 0, ediEnabled: 0, portalEnabled: 1, sandboxEnabled: 0, productionEnabled: 0,
      credentialsRequired: 0, credentialsConfigured: 0,
      certificationRequired: 0, certificationStatus: null,
      legalAgreement: null,
      lastSuccessAt: null, lastErrorAt: null, lastError: null,
      version: null, owner: 'SGTX Egypt Integrations Team', priority: 60,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL', 'RORO', 'MULTIMODAL']),
      discoveryUrl: null, authMethod: 'NONE',
      authEndpoint: null, submitEndpoint: null, statusEndpoint: null,
      notes: 'GOEIC portal — manual license applications. Portal-only.'
    },
    // Egyptian Plant Quarantine — DEGRADED (API key expired)
    {
      id: 'gc_eg_plant_quarantine', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'AGRICULTURE', systemName: 'Plant Quarantine Authority', systemType: 'SPS',
      protocols: JSON.stringify(['API', 'PORTAL']),
      status: 'DEGRADED', mode: 'PRODUCTION', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 0, portalEnabled: 1, sandboxEnabled: 0, productionEnabled: 1,
      credentialsRequired: 1, credentialsConfigured: 0,
      certificationRequired: 0, certificationStatus: null,
      legalAgreement: null,
      lastSuccessAt: new Date('2024-06-01').toISOString(), lastErrorAt: new Date('2024-08-15').toISOString(),
      lastError: 'API key expired — renewal pending',
      version: '1.5', owner: 'SGTX Egypt Integrations Team', priority: 70,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL', 'RORO', 'MULTIMODAL']),
      discoveryUrl: 'https://pqap.gov.eg/discovery', authMethod: 'API_KEY',
      authEndpoint: 'https://pqap.gov.eg/api/auth',
      submitEndpoint: 'https://pqap.gov.eg/api/permits',
      statusEndpoint: 'https://pqap.gov.eg/api/permits/status',
      notes: 'DEGRADED — API key expired. Portal fallback available.'
    },
    // Egyptian NFSA — food safety (outage test case)
    {
      id: 'gc_eg_nfsa', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'HEALTH', systemName: 'NFSA', systemType: 'HEALTH',
      protocols: JSON.stringify(['API', 'PORTAL']),
      status: 'OUTAGE', mode: 'PRODUCTION', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 0, portalEnabled: 1, sandboxEnabled: 0, productionEnabled: 1,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 0, certificationStatus: null,
      legalAgreement: null,
      lastSuccessAt: new Date('2024-07-01').toISOString(), lastErrorAt: new Date('2024-08-20').toISOString(),
      lastError: 'OUTAGE — NFSA API down since 2024-08-20 (maintenance)',
      version: '2.0', owner: 'SGTX Egypt Integrations Team', priority: 75,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL', 'RORO', 'MULTIMODAL']),
      discoveryUrl: 'https://nfsa.gov.eg/discovery', authMethod: 'OAUTH2',
      authEndpoint: 'https://nfsa.gov.eg/oauth/token',
      submitEndpoint: 'https://nfsa.gov.eg/api/permits',
      statusEndpoint: 'https://nfsa.gov.eg/api/permits/status',
      notes: 'OUTAGE — NFSA API down. Portal fallback recommended.'
    },
    // Egyptian EOS — standards (MANUAL_ONLY test case)
    {
      id: 'gc_eg_eos', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'STANDARDS', systemName: 'EOS', systemType: 'STANDARDS',
      protocols: JSON.stringify(['MANUAL']),
      status: 'MANUAL_ONLY', mode: 'MANUAL_ONLY', integrationType: 'MANUAL',
      apiEnabled: 0, ediEnabled: 0, portalEnabled: 0, sandboxEnabled: 0, productionEnabled: 0,
      credentialsRequired: 0, credentialsConfigured: 0,
      certificationRequired: 0, certificationStatus: null,
      legalAgreement: null,
      lastSuccessAt: null, lastErrorAt: null, lastError: null,
      version: null, owner: 'SGTX Egypt Integrations Team', priority: 40,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL', 'RORO', 'MULTIMODAL']),
      discoveryUrl: null, authMethod: 'NONE',
      authEndpoint: null, submitEndpoint: null, statusEndpoint: null,
      notes: 'EOS — manual standards conformity. No API. Manual-only.'
    },
    // Egyptian Export Control Authority — NOT_DISCOVERED (test case)
    {
      id: 'gc_eg_eca', jurisdictionId: egId, jurisdictionCode: 'EG',
      authority: 'SECURITY', systemName: 'Export Control Authority', systemType: 'CUSTOMS',
      protocols: JSON.stringify(['MANUAL']),
      status: 'NOT_DISCOVERED', mode: null, integrationType: null,
      apiEnabled: 0, ediEnabled: 0, portalEnabled: 0, sandboxEnabled: 0, productionEnabled: 0,
      credentialsRequired: 0, credentialsConfigured: 0,
      certificationRequired: 0, certificationStatus: null,
      legalAgreement: null,
      lastSuccessAt: null, lastErrorAt: null, lastError: null,
      version: null, owner: null, priority: 30,
      transportModes: null,
      discoveryUrl: null, authMethod: null,
      authEndpoint: null, submitEndpoint: null, statusEndpoint: null,
      notes: 'NOT_DISCOVERED — integration not yet explored.'
    },

    // === WORLDWIDE SAMPLE (non-Egypt) ===
    // US CBP ACE
    {
      id: 'gc_us_cbp_ace', jurisdictionId: usId, jurisdictionCode: 'US',
      authority: 'CUSTOMS', systemName: 'CBP ACE', systemType: 'CUSTOMS',
      protocols: JSON.stringify(['API', 'EDI', 'XML']),
      status: 'PRODUCTION_CONNECTED', mode: 'PRODUCTION', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 1, portalEnabled: 1, sandboxEnabled: 1, productionEnabled: 1,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 1, certificationStatus: 'GRANTED',
      legalAgreement: 'CBP ACE Partner Agreement',
      lastSuccessAt: NOW.toISOString(), lastErrorAt: null, lastError: null,
      version: '5.1', owner: 'SGTX US Integrations', priority: 90,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL']),
      discoveryUrl: 'https://ace.cbp.gov/discovery', authMethod: 'OAUTH2',
      authEndpoint: 'https://ace.cbp.gov/oauth/token',
      submitEndpoint: 'https://ace.cbp.gov/api/declarations',
      statusEndpoint: 'https://ace.cbp.gov/api/status',
      notes: 'US CBP ACE — Automated Commercial Environment.'
    },
    // Saudi FASAH (single window)
    {
      id: 'gc_sa_fasah', jurisdictionId: saId, jurisdictionCode: 'SA',
      authority: 'CUSTOMS', systemName: 'FASAH', systemType: 'SINGLE_WINDOW',
      protocols: JSON.stringify(['API', 'JSON']),
      status: 'PRODUCTION_CONNECTED', mode: 'PRODUCTION', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 0, portalEnabled: 1, sandboxEnabled: 1, productionEnabled: 1,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 1, certificationStatus: 'GRANTED',
      legalAgreement: 'ZATCA FASAH Agreement',
      lastSuccessAt: NOW.toISOString(), lastErrorAt: null, lastError: null,
      version: '2.3', owner: 'SGTX KSA Integrations', priority: 88,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD']),
      discoveryUrl: 'https://fasah.sa/discovery', authMethod: 'OAUTH2',
      authEndpoint: 'https://fasah.sa/oauth/token',
      submitEndpoint: 'https://fasah.sa/api/declarations',
      statusEndpoint: 'https://fasah.sa/api/status',
      notes: 'Saudi FASAH single window (ZATCA).'
    },
    // EU AES (Automated Export System)
    {
      id: 'gc_eu_aes', jurisdictionId: euId, jurisdictionCode: 'EU',
      authority: 'CUSTOMS', systemName: 'AES', systemType: 'CUSTOMS',
      protocols: JSON.stringify(['API', 'EDI', 'XML']),
      status: 'CERTIFICATION_PENDING', mode: 'SANDBOX', integrationType: 'API',
      apiEnabled: 1, ediEnabled: 1, portalEnabled: 0, sandboxEnabled: 1, productionEnabled: 0,
      credentialsRequired: 1, credentialsConfigured: 1,
      certificationRequired: 1, certificationStatus: 'PENDING',
      legalAgreement: null,
      lastSuccessAt: new Date('2024-07-01').toISOString(), lastErrorAt: null, lastError: null,
      version: '4.0', owner: 'SGTX EU Integrations', priority: 75,
      transportModes: JSON.stringify(['SEA', 'AIR', 'ROAD', 'RAIL']),
      discoveryUrl: 'https://aes.eu/discovery', authMethod: 'MUTUAL_TLS',
      authEndpoint: 'https://aes.eu/auth/mtls',
      submitEndpoint: 'https://aes.eu/api/exports',
      statusEndpoint: 'https://aes.eu/api/exports/status',
      notes: 'EU AES — certification pending. Sandbox connected.'
    },
  ]
  for (const c of connectors) {
    await exec(
      `INSERT OR IGNORE INTO GovConnector (id, jurisdictionId, jurisdictionCode, authority, systemName, systemType, protocols, status, mode, integrationType, apiEnabled, ediEnabled, portalEnabled, sandboxEnabled, productionEnabled, credentialsRequired, credentialsConfigured, certificationRequired, certificationStatus, legalAgreement, lastSuccessAt, lastErrorAt, lastError, version, owner, priority, transportModes, discoveryUrl, authMethod, authEndpoint, submitEndpoint, statusEndpoint, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.jurisdictionId, c.jurisdictionCode, c.authority, c.systemName, c.systemType, c.protocols, c.status, c.mode, c.integrationType, c.apiEnabled, c.ediEnabled, c.portalEnabled, c.sandboxEnabled, c.productionEnabled, c.credentialsRequired, c.credentialsConfigured, c.certificationRequired, c.certificationStatus, c.legalAgreement, c.lastSuccessAt, c.lastErrorAt, c.lastError, c.version, c.owner, c.priority, c.transportModes, c.discoveryUrl, c.authMethod, c.authEndpoint, c.submitEndpoint, c.statusEndpoint, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${connectors.length} gov connectors upserted`)

  // -------------------------------------------------------------------------
  // §3 SingleWindowMappings (Egypt Nafeza + WCO baseline)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/5 SingleWindowMappings')
  const mappings = [
    // WCO Data Model baseline (applies to all countries)
    { id: 'swm_wco_1', mappingType: 'WCO_DATA_MODEL', jurisdictionCode: null, authority: null, systemName: null, sourceField: 'trade.commodityHs', targetField: 'Declaration.GoodsConsignment.Goods.CommodityCode', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_wco_2', mappingType: 'WCO_DATA_MODEL', jurisdictionCode: null, authority: null, systemName: null, sourceField: 'trade.grossWeightKg', targetField: 'Declaration.GoodsConsignment.GrossMassMeasure', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_wco_3', mappingType: 'WCO_DATA_MODEL', jurisdictionCode: null, authority: null, systemName: null, sourceField: 'trade.netWeightKg', targetField: 'Declaration.GoodsConsignment.NetMassMeasure', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_wco_4', mappingType: 'WCO_DATA_MODEL', jurisdictionCode: null, authority: null, systemName: null, sourceField: 'trade.originCountry', targetField: 'Declaration.GoodsConsignment.Origin.CountryCode', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_wco_5', mappingType: 'WCO_DATA_MODEL', jurisdictionCode: null, authority: null, systemName: null, sourceField: 'trade.tradeValueUsd', targetField: 'Declaration.GoodsConsignment.CustomsValuation.ValuationAmount', transformation: 'IDENTITY', required: 1 },

    // Egypt Nafeza national mappings
    { id: 'swm_eg_nafeza_1', mappingType: 'NATIONAL', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', sourceField: 'trade.commodityHs', targetField: 'SAD.Goods.HSCode', transformation: 'CODE_LIST', codeList: JSON.stringify({ '070310': '0703.10.10.00', '520831': '5208.31.00.10', '721391': '7213.91.00.20' }), required: 1 },
    { id: 'swm_eg_nafeza_2', mappingType: 'NATIONAL', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', sourceField: 'trade.grossWeightKg', targetField: 'SAD.Goods.GrossWeight', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_nafeza_3', mappingType: 'NATIONAL', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', sourceField: 'trade.buyerGtid', targetField: 'SAD.Consignee.GTID', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_nafeza_4', mappingType: 'NATIONAL', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', sourceField: 'trade.sellerGtid', targetField: 'SAD.Consignor.GTID', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_nafeza_5', mappingType: 'NATIONAL', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', sourceField: 'trade.incoterm', targetField: 'SAD.Delivery.Incoterm', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_nafeza_6', mappingType: 'NATIONAL', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', sourceField: 'trade.currency', targetField: 'SAD.Invoice.Currency', transformation: 'IDENTITY', required: 1 },

    // Egypt CargoX ACI mappings (SEA + AIR only)
    { id: 'swm_eg_cargox_1', mappingType: 'AUTHORITY_SPECIFIC', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'CargoX', sourceField: 'trade.commodityHs', targetField: 'ACID.Consignment.HSCode', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_cargox_2', mappingType: 'AUTHORITY_SPECIFIC', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'CargoX', sourceField: 'shipment.vesselName', targetField: 'ACID.Transport.VesselName', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_cargox_3', mappingType: 'AUTHORITY_SPECIFIC', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'CargoX', sourceField: 'shipment.billOfLading', targetField: 'ACID.Transport.BillOfLading', transformation: 'IDENTITY', required: 1 },

    // Egypt ETA e-invoicing mappings
    { id: 'swm_eg_eta_1', mappingType: 'AUTHORITY_SPECIFIC', jurisdictionCode: 'EG', authority: 'TAX', systemName: 'ETA', sourceField: 'trade.tradeValueUsd', targetField: 'Invoice.TotalAmount', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_eta_2', mappingType: 'AUTHORITY_SPECIFIC', jurisdictionCode: 'EG', authority: 'TAX', systemName: 'ETA', sourceField: 'trade.currency', targetField: 'Invoice.Currency', transformation: 'IDENTITY', required: 1 },
    { id: 'swm_eg_eta_3', mappingType: 'AUTHORITY_SPECIFIC', jurisdictionCode: 'EG', authority: 'TAX', systemName: 'ETA', sourceField: 'trade.buyerGtid', targetField: 'Invoice.Buyer.TaxID', transformation: 'IDENTITY', required: 1 },
  ]
  for (const m of mappings) {
    await exec(
      `INSERT OR IGNORE INTO SingleWindowMapping (id, mappingType, jurisdictionId, jurisdictionCode, authority, systemName, sourceField, targetField, transformation, codeList, defaultValue, required, validationRegex, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [m.id, m.mappingType, null, m.jurisdictionCode, m.authority, m.systemName, m.sourceField, m.targetField, m.transformation, m.codeList || null, m.defaultValue || null, m.required || 0, m.validationRegex || null, m.notes || null, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${mappings.length} single-window mappings upserted`)

  // -------------------------------------------------------------------------
  // §5 Multi-Agency Workflow (Egypt sequential: CUSTOMS→AGRICULTURE→HEALTH→STANDARDS→SECURITY→RELEASE)
  // -------------------------------------------------------------------------
  console.log('[seed] 3/5 MultiAgencyWorkflows + Steps')
  // Workflow: EG import for agricultural goods (sequential)
  await exec(
    `INSERT OR IGNORE INTO MultiAgencyWorkflow (id, name, description, jurisdictionId, jurisdictionCode, transportMode, operationType, triggerConditions, active, version, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['maw_eg_import_agri_seq', 'Egypt Import — Agricultural Goods (Sequential)', 'Sequential multi-agency clearance for agricultural imports into Egypt (CUSTOMS→AGRICULTURE→HEALTH→STANDARDS→SECURITY→RELEASE)', egId, 'EG', null, 'IMPORT', JSON.stringify([{ hs6Prefix: '07', reason: 'edible vegetables' }]), 1, 1, NOW.toISOString(), NOW.toISOString()]
  )
  const egImportSteps = [
    { id: 'ws_eg_imp_1_customs', workflowId: 'maw_eg_import_agri_seq', order: 1, agency: 'CUSTOMS', authority: 'Egyptian Customs Authority', systemName: 'Nafeza', connectorId: 'gc_eg_nafeza', executionMode: 'SEQUENTIAL', status: 'GOVERNMENT_RELEASED', governmentReference: 'EG-CUS-2024-000001', submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString() },
    { id: 'ws_eg_imp_2_agri', workflowId: 'maw_eg_import_agri_seq', order: 2, agency: 'AGRICULTURE', authority: 'Plant Quarantine Authority', systemName: 'Plant Quarantine Authority', connectorId: 'gc_eg_plant_quarantine', executionMode: 'SEQUENTIAL', status: 'GOVERNMENT_RELEASED', governmentReference: 'EG-AGRI-2024-000011', submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString() },
    { id: 'ws_eg_imp_3_health', workflowId: 'maw_eg_import_agri_seq', order: 3, agency: 'HEALTH', authority: 'NFSA', systemName: 'NFSA', connectorId: 'gc_eg_nfsa', executionMode: 'SEQUENTIAL', status: 'GOVERNMENT_RELEASED', governmentReference: 'EG-NFSA-2024-000021', submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString() },
    { id: 'ws_eg_imp_4_standards', workflowId: 'maw_eg_import_agri_seq', order: 4, agency: 'STANDARDS', authority: 'EOS', systemName: 'EOS', connectorId: 'gc_eg_eos', executionMode: 'SEQUENTIAL', status: 'SKIPPED', governmentReference: null },
    { id: 'ws_eg_imp_5_security', workflowId: 'maw_eg_import_agri_seq', order: 5, agency: 'SECURITY', authority: 'Export Control Authority', systemName: 'Export Control Authority', connectorId: 'gc_eg_eca', executionMode: 'OPTIONAL', optional: 1, status: 'SKIPPED' },
    { id: 'ws_eg_imp_6_release', workflowId: 'maw_eg_import_agri_seq', order: 6, agency: 'CUSTOMS', authority: 'Egyptian Customs Authority', systemName: 'Nafeza', connectorId: 'gc_eg_nafeza', executionMode: 'SEQUENTIAL', status: 'GOVERNMENT_RELEASED', governmentReference: 'EG-REL-2024-000001', submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString() },
  ]
  for (const s of egImportSteps) {
    await exec(
      `INSERT OR IGNORE INTO WorkflowStep (id, workflowId, "order", agency, authority, systemName, connectorId, executionMode, parallelGroup, condition, riskTrigger, optional, status, governmentReference, submittedAt, acceptedAt, rejectedAt, holdAt, releasedAt, rejectionReason, holdReason, customsOperationId, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.workflowId, s.order, s.agency, s.authority, s.systemName, s.connectorId, s.executionMode, s.parallelGroup || null, s.condition || null, s.riskTrigger || null, s.optional || 0, s.status, s.governmentReference, s.submittedAt || null, s.acceptedAt || null, s.rejectedAt || null, s.holdAt || null, s.releasedAt || null, s.rejectionReason || null, s.holdReason || null, s.customsOperationId || null, NOW.toISOString(), NOW.toISOString()]
    )
  }
  // Workflow: EG import for general goods (parallel AGRICULTURE + HEALTH)
  await exec(
    `INSERT OR IGNORE INTO MultiAgencyWorkflow (id, name, description, jurisdictionId, jurisdictionCode, transportMode, operationType, triggerConditions, active, version, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['maw_eg_import_general_par', 'Egypt Import — General Goods (Parallel)', 'Parallel AGRICULTURE + HEALTH for general imports (where permitted)', egId, 'EG', null, 'IMPORT', null, 1, 1, NOW.toISOString(), NOW.toISOString()]
  )
  const egGeneralSteps = [
    { id: 'ws_eg_gen_1_customs', workflowId: 'maw_eg_import_general_par', order: 1, agency: 'CUSTOMS', authority: 'Egyptian Customs Authority', systemName: 'Nafeza', connectorId: 'gc_eg_nafeza', executionMode: 'SEQUENTIAL', status: 'PENDING' },
    { id: 'ws_eg_gen_2_agri', workflowId: 'maw_eg_import_general_par', order: 2, agency: 'AGRICULTURE', authority: 'Plant Quarantine Authority', systemName: 'Plant Quarantine Authority', connectorId: 'gc_eg_plant_quarantine', executionMode: 'PARALLEL', parallelGroup: 'g1', status: 'PENDING' },
    { id: 'ws_eg_gen_2_health', workflowId: 'maw_eg_import_general_par', order: 2, agency: 'HEALTH', authority: 'NFSA', systemName: 'NFSA', connectorId: 'gc_eg_nfsa', executionMode: 'PARALLEL', parallelGroup: 'g1', status: 'PENDING' },
    { id: 'ws_eg_gen_3_release', workflowId: 'maw_eg_import_general_par', order: 3, agency: 'CUSTOMS', authority: 'Egyptian Customs Authority', systemName: 'Nafeza', connectorId: 'gc_eg_nafeza', executionMode: 'SEQUENTIAL', status: 'PENDING' },
  ]
  for (const s of egGeneralSteps) {
    await exec(
      `INSERT OR IGNORE INTO WorkflowStep (id, workflowId, "order", agency, authority, systemName, connectorId, executionMode, parallelGroup, condition, riskTrigger, optional, status, governmentReference, submittedAt, acceptedAt, rejectedAt, holdAt, releasedAt, rejectionReason, holdReason, customsOperationId, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.workflowId, s.order, s.agency, s.authority, s.systemName, s.connectorId, s.executionMode, s.parallelGroup || null, s.condition || null, s.riskTrigger || null, s.optional || 0, s.status, s.governmentReference || null, s.submittedAt || null, s.acceptedAt || null, s.rejectedAt || null, s.holdAt || null, s.releasedAt || null, s.rejectionReason || null, s.holdReason || null, s.customsOperationId || null, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   2 workflows + ${egImportSteps.length + egGeneralSteps.length} steps upserted`)

  // -------------------------------------------------------------------------
  // §1 CustomsOperations (covering §9 scenarios 7-9: rejected, amended, released)
  // -------------------------------------------------------------------------
  console.log('[seed] 4/5 CustomsOperations')
  const operations = [
    // POSITIVE: GOVERNMENT_RELEASED (onions import via Nafeza)
    {
      id: 'cov_eg_onions_released', ustn: 'SGTX-PHASE4-TEST-ONIONS-0001', operationType: 'IMPORT',
      jurisdictionId: egId, jurisdictionCode: 'EG', customsAuthority: 'Egyptian Customs Authority', customsOffice: 'EGDAH', procedure: '4070',
      declaration: JSON.stringify({ hs6: '070310', commodity: 'Fresh Onions', grossWeightKg: 50000, netWeightKg: 45000, origin: 'EU', valueUsd: 25000 }),
      declarationNumber: 'EG-IMP-2024-001234', brokerGtid: 'SGTX-EG-BKR-000001-AAAA',
      documents: JSON.stringify([{ type: 'COMMERCIAL_INVOICE', ref: 'INV-001', status: 'ACCEPTED' }, { type: 'BILL_OF_LADING', ref: 'BL-001', status: 'ACCEPTED' }]),
      inspection: JSON.stringify({ required: true, status: 'PASSED', result: 'no pests detected', inspector: 'PQ-Inspector-001' }),
      fees: JSON.stringify([{ type: 'CUSTOMS_FEE', amount: 50, currency: 'USD', status: 'PAID' }]),
      duties: JSON.stringify([{ type: 'MFN', rate: 5, amount: 1250, basis: 'customs_value', status: 'PAID' }]),
      taxes: JSON.stringify([{ type: 'VAT', rate: 14, amount: 3675, status: 'PAID' }]),
      guarantees: JSON.stringify({ type: 'BANK_GUARANTEE', amount: 5000, currency: 'USD', issuer: 'CBE', validUntil: FUTURE.toISOString() }),
      release: JSON.stringify({ status: 'RELEASED', releasedAt: PAST.toISOString(), releaseReference: 'EG-REL-2024-000001', authority: 'Egyptian Customs Authority' }),
      governmentReferences: JSON.stringify([{ authority: 'CUSTOMS', type: 'DECLARATION', reference: 'EG-IMP-2024-001234', status: 'ACCEPTED' }, { authority: 'CUSTOMS', type: 'RELEASE', reference: 'EG-REL-2024-000001', status: 'RELEASED' }]),
      status: 'GOVERNMENT_RELEASED', connectorStatus: 'PRODUCTION_CONNECTED',
      submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString(),
      transportMode: 'SEA', workflowId: 'maw_eg_import_agri_seq', workflowStepId: 'ws_eg_imp_6_release'
    },
    // NEGATIVE: GOVERNMENT_REJECTED (pharma export license expired)
    {
      id: 'cov_eg_pharma_rejected', ustn: 'SGTX-PHASE4-TEST-PHARMA-0002', operationType: 'EXPORT',
      jurisdictionId: egId, jurisdictionCode: 'EG', customsAuthority: 'Egyptian Customs Authority', customsOffice: 'EGCAI', procedure: '1000',
      declaration: JSON.stringify({ hs6: '300490', commodity: 'Paracetamol Tablets', grossWeightKg: 1000, netWeightKg: 900, origin: 'EG', valueUsd: 50000 }),
      declarationNumber: 'EG-EXP-2024-005678', brokerGtid: 'SGTX-EG-BKR-000001-AAAA',
      documents: JSON.stringify([{ type: 'EXPORT_LICENSE', ref: 'EG-EXP-PHARMA-2022-000567', status: 'REJECTED' }]),
      inspection: null,
      fees: JSON.stringify([]), duties: JSON.stringify([]), taxes: JSON.stringify([]),
      guarantees: null, release: null,
      governmentReferences: JSON.stringify([{ authority: 'CUSTOMS', type: 'DECLARATION', reference: 'EG-EXP-2024-005678', status: 'REJECTED' }]),
      status: 'GOVERNMENT_REJECTED', connectorStatus: 'PRODUCTION_CONNECTED',
      submittedAt: PAST.toISOString(), rejectedAt: PAST.toISOString(),
      rejectionReason: 'Export license EG-EXP-PHARMA-2022-000567 expired. Renewal required.',
      transportMode: 'AIR'
    },
    // CONDITIONAL: GOVERNMENT_HOLD (cotton from CN — quarantine)
    {
      id: 'cov_eg_cotton_hold', ustn: 'SGTX-PHASE4-TEST-COTTON-0003', operationType: 'IMPORT',
      jurisdictionId: egId, jurisdictionCode: 'EG', customsAuthority: 'Egyptian Customs Authority', customsOffice: 'EGDAH', procedure: '4070',
      declaration: JSON.stringify({ hs6: '520831', commodity: 'Cotton Woven Fabric', grossWeightKg: 100, netWeightKg: 90, origin: 'CN', valueUsd: 5000 }),
      declarationNumber: 'EG-IMP-2024-009999', brokerGtid: 'SGTX-EG-BKR-000001-AAAA',
      documents: JSON.stringify([{ type: 'COMMERCIAL_INVOICE', ref: 'INV-CN-001', status: 'ACCEPTED' }]),
      inspection: JSON.stringify({ required: true, status: 'IN_PROGRESS', result: 'pending', inspector: 'PQ-Inspector-002' }),
      fees: JSON.stringify([{ type: 'CUSTOMS_FEE', amount: 50, currency: 'USD', status: 'PENDING' }]),
      duties: JSON.stringify([{ type: 'MFN', rate: 12, amount: 600, basis: 'customs_value', status: 'PENDING' }]),
      taxes: JSON.stringify([{ type: 'VAT', rate: 14, amount: 784, status: 'PENDING' }]),
      guarantees: JSON.stringify({ type: 'BANK_GUARANTEE', amount: 1500, currency: 'USD', issuer: 'CBE', validUntil: FUTURE.toISOString() }),
      release: null,
      governmentReferences: JSON.stringify([{ authority: 'CUSTOMS', type: 'DECLARATION', reference: 'EG-IMP-2024-009999', status: 'HOLD' }]),
      status: 'GOVERNMENT_HOLD', connectorStatus: 'DEGRADED',
      submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), holdAt: NOW.toISOString(),
      holdReason: 'Quarantine inspection required for cotton from pest-risk origin (CN). 7-day hold.',
      transportMode: 'SEA'
    },
    // POSITIVE: GOVERNMENT_ACCEPTED (steel export, not yet released)
    {
      id: 'cov_eg_steel_accepted', ustn: 'SGTX-PHASE4-TEST-STEEL-0004', operationType: 'EXPORT',
      jurisdictionId: egId, jurisdictionCode: 'EG', customsAuthority: 'Egyptian Customs Authority', customsOffice: 'EGCAI', procedure: '1000',
      declaration: JSON.stringify({ hs6: '721391', commodity: 'Hot-rolled Steel Coils', grossWeightKg: 10000, netWeightKg: 10000, origin: 'EG', valueUsd: 100000 }),
      declarationNumber: 'EG-EXP-2024-007777', brokerGtid: 'SGTX-EG-BKR-000001-AAAA',
      documents: JSON.stringify([{ type: 'EXPORT_LICENSE', ref: 'EG-EXP-STRAT-2024-0000789', status: 'ACCEPTED' }]),
      inspection: JSON.stringify({ required: false, status: 'NOT_REQUIRED' }),
      fees: JSON.stringify([{ type: 'CUSTOMS_FEE', amount: 100, currency: 'USD', status: 'PAID' }]),
      duties: JSON.stringify([]),
      taxes: JSON.stringify([]),
      guarantees: null,
      release: null,
      governmentReferences: JSON.stringify([{ authority: 'CUSTOMS', type: 'DECLARATION', reference: 'EG-EXP-2024-007777', status: 'ACCEPTED' }]),
      status: 'GOVERNMENT_ACCEPTED', connectorStatus: 'PRODUCTION_CONNECTED',
      submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(),
      transportMode: 'SEA'
    },
    // AMENDED: declaration amended after initial submission
    {
      id: 'cov_eg_sugar_amended', ustn: 'SGTX-PHASE4-TEST-SUGAR-0005', operationType: 'IMPORT',
      jurisdictionId: egId, jurisdictionCode: 'EG', customsAuthority: 'Egyptian Customs Authority', customsOffice: 'EGDAH', procedure: '4070',
      declaration: JSON.stringify({ hs6: '170199', commodity: 'Refined Cane Sugar', grossWeightKg: 2000, netWeightKg: 2000, origin: 'BR', valueUsd: 3000, amendmentNote: 'gross weight corrected from 1800 to 2000' }),
      declarationNumber: 'EG-IMP-2024-004444-A1', brokerGtid: 'SGTX-EG-BKR-000001-AAAA',
      documents: JSON.stringify([{ type: 'COMMERCIAL_INVOICE', ref: 'INV-BR-001', status: 'ACCEPTED' }]),
      inspection: JSON.stringify({ required: true, status: 'PENDING' }),
      fees: JSON.stringify([{ type: 'CUSTOMS_FEE', amount: 50, currency: 'USD', status: 'PENDING' }]),
      duties: JSON.stringify([{ type: 'MFN', rate: 30, amount: 900, basis: 'customs_value', status: 'PENDING' }]),
      taxes: JSON.stringify([{ type: 'VAT', rate: 14, amount: 546, status: 'PENDING' }]),
      guarantees: JSON.stringify({ type: 'BANK_GUARANTEE', amount: 2000, currency: 'USD', issuer: 'CBE', validUntil: FUTURE.toISOString() }),
      release: null,
      governmentReferences: JSON.stringify([{ authority: 'CUSTOMS', type: 'DECLARATION', reference: 'EG-IMP-2024-004444-A1', status: 'AMENDED' }]),
      status: 'SUBMITTED', connectorStatus: 'PRODUCTION_CONNECTED',
      submittedAt: PAST.toISOString(),
      transportMode: 'SEA'
    },
  ]
  for (const o of operations) {
    await exec(
      `INSERT OR IGNORE INTO CustomsOperationV2 (id, ustn, tradeId, operationType, jurisdictionId, jurisdictionCode, customsAuthority, customsOffice, procedure, declaration, declarationNumber, brokerGtid, documents, inspection, fees, duties, taxes, guarantees, release, governmentReferences, status, connectorStatus, submittedAt, acceptedAt, rejectedAt, holdAt, releasedAt, rejectionReason, holdReason, workflowId, workflowStepId, transportMode, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.id, o.ustn, null, o.operationType, o.jurisdictionId, o.jurisdictionCode, o.customsAuthority, o.customsOffice, o.procedure, o.declaration, o.declarationNumber, o.brokerGtid, o.documents, o.inspection, o.fees, o.duties, o.taxes, o.guarantees, o.release, o.governmentReferences, o.status, o.connectorStatus, o.submittedAt || null, o.acceptedAt || null, o.rejectedAt || null, o.holdAt || null, o.releasedAt || null, o.rejectionReason || null, o.holdReason || null, o.workflowId || null, o.workflowStepId || null, o.transportMode, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${operations.length} customs operations upserted`)

  // -------------------------------------------------------------------------
  // §9 GovernmentSubmissions (including a duplicate-response test case)
  // -------------------------------------------------------------------------
  console.log('[seed] 5/5 GovernmentSubmissions + GovGatewayCall (duplicate test)')
  const submissions = [
    // Original submission — SUCCESS
    {
      id: 'gs_eg_onions_orig', ustn: 'SGTX-PHASE4-TEST-ONIONS-0001', workflowStepId: 'ws_eg_imp_1_customs', connectorId: 'gc_eg_nafeza', customsOperationId: 'cov_eg_onions_released',
      submissionType: 'DECLARATION', status: 'GOVERNMENT_RELEASED', governmentReference: 'EG-IMP-2024-001234', governmentMessage: 'Declaration accepted + released',
      payload: JSON.stringify({ hs6: '070310', value: 25000 }), responsePayload: JSON.stringify({ status: 'ACCEPTED', reference: 'EG-IMP-2024-001234' }),
      idempotencyKey: 'idem-onions-0001', submittedAt: PAST.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString(), duplicateDetected: 0, duplicateOf: null
    },
    // Duplicate submission (same idempotency key) — should be detected as DUPLICATE
    {
      id: 'gs_eg_onions_dup', ustn: 'SGTX-PHASE4-TEST-ONIONS-0001', workflowStepId: 'ws_eg_imp_1_customs', connectorId: 'gc_eg_nafeza', customsOperationId: 'cov_eg_onions_released',
      submissionType: 'DECLARATION', status: 'GOVERNMENT_RELEASED', governmentReference: 'EG-IMP-2024-001234', governmentMessage: 'Duplicate submission detected — original response returned',
      payload: JSON.stringify({ hs6: '070310', value: 25000 }), responsePayload: JSON.stringify({ status: 'DUPLICATE', originalReference: 'EG-IMP-2024-001234' }),
      idempotencyKey: 'idem-onions-0001', submittedAt: NOW.toISOString(), acceptedAt: PAST.toISOString(), releasedAt: PAST.toISOString(), duplicateDetected: 1, duplicateOf: 'gs_eg_onions_orig'
    },
    // Rejected submission
    {
      id: 'gs_eg_pharma_rej', ustn: 'SGTX-PHASE4-TEST-PHARMA-0002', workflowStepId: null, connectorId: 'gc_eg_nafeza', customsOperationId: 'cov_eg_pharma_rejected',
      submissionType: 'DECLARATION', status: 'GOVERNMENT_REJECTED', governmentReference: 'EG-EXP-2024-005678', governmentMessage: 'Export license expired',
      payload: JSON.stringify({ hs6: '300490', value: 50000 }), responsePayload: JSON.stringify({ status: 'REJECTED', reason: 'Export license EG-EXP-PHARMA-2022-000567 expired' }),
      idempotencyKey: 'idem-pharma-0002', submittedAt: PAST.toISOString(), rejectedAt: PAST.toISOString(), duplicateDetected: 0, duplicateOf: null
    },
  ]
  for (const s of submissions) {
    await exec(
      `INSERT OR IGNORE INTO GovernmentSubmission (id, ustn, tradeId, workflowStepId, connectorId, customsOperationId, submissionType, status, governmentReference, governmentMessage, payload, responsePayload, idempotencyKey, submittedAt, acceptedAt, rejectedAt, holdAt, releasedAt, duplicateDetected, duplicateOf, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.ustn, null, s.workflowStepId, s.connectorId, s.customsOperationId, s.submissionType, s.status, s.governmentReference, s.governmentMessage, s.payload, s.responsePayload, s.idempotencyKey, s.submittedAt, s.acceptedAt || null, s.rejectedAt || null, s.holdAt || null, s.releasedAt || null, s.duplicateDetected, s.duplicateOf, NOW.toISOString(), NOW.toISOString()]
    )
  }
  // Gateway calls (for the duplicate detection test)
  const gatewayCalls = [
    { id: 'ggc_1', connectorId: 'gc_eg_nafeza', ustn: 'SGTX-PHASE4-TEST-ONIONS-0001', operationType: 'SUBMIT', idempotencyKey: 'idem-onions-0001', requestBody: JSON.stringify({ hs6: '070310' }), responseBody: JSON.stringify({ status: 'ACCEPTED', reference: 'EG-IMP-2024-001234' }), statusCode: 200, status: 'SUCCESS', calledAt: PAST.toISOString(), respondedAt: PAST.toISOString() },
    { id: 'ggc_2', connectorId: 'gc_eg_nafeza', ustn: 'SGTX-PHASE4-TEST-ONIONS-0001', operationType: 'SUBMIT', idempotencyKey: 'idem-onions-0001', requestBody: JSON.stringify({ hs6: '070310' }), responseBody: JSON.stringify({ status: 'DUPLICATE', originalReference: 'EG-IMP-2024-001234' }), statusCode: 200, status: 'DUPLICATE', calledAt: NOW.toISOString(), respondedAt: NOW.toISOString(), errorMessage: 'Duplicate submission detected — original response returned' },
    { id: 'ggc_3', connectorId: 'gc_eg_nafeza', ustn: 'SGTX-PHASE4-TEST-PHARMA-0002', operationType: 'SUBMIT', idempotencyKey: 'idem-pharma-0002', requestBody: JSON.stringify({ hs6: '300490' }), responseBody: JSON.stringify({ status: 'REJECTED', reason: 'Export license expired' }), statusCode: 422, status: 'SUCCESS', calledAt: PAST.toISOString(), respondedAt: PAST.toISOString(), errorMessage: 'Government rejected: Export license EG-EXP-PHARMA-2022-000567 expired' },
  ]
  for (const g of gatewayCalls) {
    await exec(
      `INSERT OR IGNORE INTO GovGatewayCall (id, connectorId, ustn, operationType, idempotencyKey, requestBody, responseBody, statusCode, status, errorMessage, attemptCount, retryScheduledAt, calledAt, respondedAt, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [g.id, g.connectorId, g.ustn, g.operationType, g.idempotencyKey, g.requestBody, g.responseBody, g.statusCode, g.status, g.errorMessage || null, 1, null, g.calledAt, g.respondedAt, NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${submissions.length} submissions + ${gatewayCalls.length} gateway calls upserted`)

  console.log('[seed] Done. §9 test scenarios available:')
  console.log('[seed]   1. API connector        → Nafeza (PRODUCTION_CONNECTED, API)')
  console.log('[seed]   2. EDI connector        → CargoX (CARGO_XML, SEA+AIR only)')
  console.log('[seed]   3. Portal connector     → ETA (PORTAL_ONLY, certification PENDING)')
  console.log('[seed]   4. Manual fallback      → GOEIC + EOS (MANUAL_ONLY)')
  console.log('[seed]   5. Outage               → NFSA (OUTAGE)')
  console.log('[seed]   6. Duplicate response   → idem-onions-0001 (DUPLICATE detected)')
  console.log('[seed]   7. Rejected declaration → cov_eg_pharma_rejected (GOVERNMENT_REJECTED)')
  console.log('[seed]   8. Amended declaration  → cov_eg_sugar_amended (declarationNumber -A1 suffix)')
  console.log('[seed]   9. Government release   → cov_eg_onions_released (GOVERNMENT_RELEASED + releaseReference)')
  console.log('[seed]  10. Multi-agency         → maw_eg_import_agri_seq (6 steps: CUSTOMS→AGRI→HEALTH→STANDARDS→SECURITY→RELEASE)')
  console.log('[seed]  11. Integration health   → 12 connectors (PRODUCTION_CONNECTED/DEGRADED/OUTAGE/PORTAL_ONLY/MANUAL_ONLY/NOT_DISCOVERED)')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
