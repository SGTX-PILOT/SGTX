/**
 * Phase 8 — Seed data covering all §11 test scenarios + the §6 example
 * (Egypt → UAE, Agricultural, Reefer, Road).
 *
 * §11 test scenarios:
 *   1. missing integration     → IntegrationCatalog with NOT_DISCOVERED
 *   2. connected integration    → IntegrationCatalog with PRODUCTION_CONNECTED
 *   3. portal-only              → IntegrationCatalog with PORTAL_ONLY
 *   4. manual-only              → IntegrationCatalog with MANUAL_ONLY
 *   5. expired certificate      → IntegrationCatalog with certification=EXPIRED
 *   6. API outage                → IntegrationCatalog with OUTAGE
 *   7. new government requirement → IntegrationGapRecord with REQUIRED_MISSING
 *   8. new trade lane           → TradeLaneReadiness for EG→AE
 *   9. country activation       → CountryReadiness for EG
 *  10. priority calculation     → IntegrationGapRecord with computed priority
 *
 * §6 example: Egypt → UAE, Agricultural, Reefer, Road
 * - Egypt customs (export) — PRODUCTION_CONNECTED (Nafeza)
 * - Egypt SPS (phytosanitary) — DEGRADED (plant quarantine)
 * - Egypt tax (ETA) — PORTAL_ONLY
 * - Egypt insurance — CONNECTED
 * - Egypt trucking — CONNECTED
 * - Jordan transit — MISSING
 * - Saudi transit — PARTIAL (FASAH)
 * - UAE customs — MISSING
 * - UAE SPS — MISSING
 * - Customs broker — MANUAL_ONLY
 *
 * Run: bun run scripts/phase8-seed.ts
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
  console.log('[seed] Phase 8 worldwide integration catalog seed — start')

  // -------------------------------------------------------------------------
  // §1 IntegrationCatalog (covering §11 scenarios 1-6 + §6 example)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/5 IntegrationCatalog')
  const catalog = [
    // === EGYPT ===
    // §11 #2 — CONNECTED (Nafeza customs API)
    { id: 'cat_eg_nafeza_api', connectorId: 'CAT-20240101-00001', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Nafeza', procedure: 'EXPORT', transportMode: null, integrationType: 'API', purpose: 'Egypt single-window customs declarations', officialUrl: 'https://nafeza.gov.eg', apiUrl: 'https://nafeza.gov.eg/api/v3', portalUrl: 'https://nafeza.gov.eg/portal', documentationUrl: 'https://nafeza.gov.eg/docs', sandboxUrl: 'https://nafeza-sandbox.gov.eg', authentication: 'OAUTH2', certificateRequirement: 'Production certificate required', legalAgreement: 'Nafeza Integration Agreement v3.2', certification: 'GRANTED', productionRequirements: JSON.stringify(['OAUTH2 credentials', 'Production certificate', 'Signed agreement']), status: 'PRODUCTION_CONNECTED', priority: 95, owner: 'SGTX Egypt Integrations', version: '3.2', notes: '§11 #2 — connected Egypt customs API' },
    // §11 #5 — EXPIRED certificate (Egypt SPS — plant quarantine)
    { id: 'cat_eg_sps_phyto', connectorId: 'CAT-20240101-00002', jurisdictionCode: 'EG', authority: 'SPS', systemName: 'Plant Quarantine Authority', procedure: 'PHYTOSANITARY', transportMode: null, integrationType: 'API', purpose: 'Phytosanitary certificate issuance', officialUrl: 'https://pqap.gov.eg', apiUrl: 'https://pqap.gov.eg/api', portalUrl: 'https://pqap.gov.eg/portal', documentationUrl: 'https://pqap.gov.eg/docs', sandboxUrl: 'https://pqap-sandbox.gov.eg', authentication: 'API_KEY', certificateRequirement: 'API key certificate', legalAgreement: null, certification: 'EXPIRED', productionRequirements: JSON.stringify(['API key renewal']), status: 'DEGRADED', priority: 70, owner: 'SGTX Egypt Integrations', version: '1.5', notes: '§11 #5 — expired certificate (degraded)' },
    // §11 #3 — PORTAL_ONLY (Egypt tax — ETA)
    { id: 'cat_eg_eta_portal', connectorId: 'CAT-20240101-00003', jurisdictionCode: 'EG', authority: 'TAX', systemName: 'ETA', procedure: 'INVOICE', transportMode: null, integrationType: 'PORTAL', purpose: 'Egypt e-invoicing', officialUrl: 'https://eta.invoicing.eta.gov.eg', apiUrl: null, portalUrl: 'https://eta.invoicing.eta.gov.eg', documentationUrl: 'https://eta.invoicing.eta.gov.eg/docs', sandboxUrl: 'https://eta-sandbox.gov.eg', authentication: 'OAUTH2', certificateRequirement: 'Production cert pending', legalAgreement: 'ETA agreement pending', certification: 'PENDING', productionRequirements: JSON.stringify(['Certification pending']), status: 'PORTAL_ONLY', priority: 80, owner: 'SGTX Egypt Integrations', version: '1.0', notes: '§11 #3 — portal-only (ETA)' },
    // Egypt insurance — CONNECTED
    { id: 'cat_eg_insurance', connectorId: 'CAT-20240101-00004', jurisdictionCode: 'EG', authority: 'INSURANCE', systemName: 'AIG Egypt', procedure: 'CARGO_INSURANCE', transportMode: null, integrationType: 'API', purpose: 'Cargo insurance', officialUrl: 'https://aig.com.eg', apiUrl: 'https://aig.com.eg/api', portalUrl: 'https://aig.com.eg/portal', documentationUrl: 'https://aig.com.eg/docs', sandboxUrl: null, authentication: 'API_KEY', certificateRequirement: null, legalAgreement: 'AIG provider agreement', certification: 'NOT_REQUIRED', productionRequirements: JSON.stringify([]), status: 'PRODUCTION_CONNECTED', priority: 70, owner: 'SGTX Egypt Integrations', version: '2.0', notes: 'Egypt insurance — connected' },
    // Egypt trucking — CONNECTED
    { id: 'cat_eg_trucking', connectorId: 'CAT-20240101-00005', jurisdictionCode: 'EG', authority: 'TRANSPORT', systemName: 'Delta Freight', procedure: 'ROAD_TRANSPORT', transportMode: 'ROAD', integrationType: 'API', purpose: 'Road trucking', officialUrl: 'https://deltafreight.com', apiUrl: 'https://deltafreight.com/api', portalUrl: null, documentationUrl: 'https://deltafreight.com/docs', sandboxUrl: 'https://sandbox.deltafreight.com', authentication: 'API_KEY', certificateRequirement: null, legalAgreement: 'Delta Freight agreement', certification: 'NOT_REQUIRED', productionRequirements: JSON.stringify([]), status: 'PRODUCTION_CONNECTED', priority: 75, owner: 'SGTX Egypt Integrations', version: '1.0', notes: 'Egypt trucking — connected' },
    // §11 #4 — MANUAL_ONLY (Egypt customs broker)
    { id: 'cat_eg_broker', connectorId: 'CAT-20240101-00006', jurisdictionCode: 'EG', authority: 'BROKER', systemName: 'GOEIC Broker Portal', procedure: 'CUSTOMS_BROKERAGE', transportMode: null, integrationType: 'MANUAL', purpose: 'Customs broker manual submission', officialUrl: 'https://goeic.gov.eg', apiUrl: null, portalUrl: 'https://goeic.gov.eg/portal', documentationUrl: null, sandboxUrl: null, authentication: 'NONE', certificateRequirement: null, legalAgreement: null, certification: 'NOT_REQUIRED', productionRequirements: JSON.stringify([]), status: 'MANUAL_ONLY', priority: 40, owner: 'SGTX Egypt Integrations', version: null, notes: '§11 #4 — manual-only (customs broker)' },
    // §11 #6 — API OUTAGE (Egypt NFSA)
    { id: 'cat_eg_nfsa_outage', connectorId: 'CAT-20240101-00007', jurisdictionCode: 'EG', authority: 'HEALTH', systemName: 'NFSA', procedure: 'FOOD_SAFETY', transportMode: null, integrationType: 'API', purpose: 'Food safety permits', officialUrl: 'https://nfsa.gov.eg', apiUrl: 'https://nfsa.gov.eg/api', portalUrl: 'https://nfsa.gov.eg/portal', documentationUrl: 'https://nfsa.gov.eg/docs', sandboxUrl: null, authentication: 'OAUTH2', certificateRequirement: 'Production cert', legalAgreement: 'NFSA agreement', certification: 'GRANTED', productionRequirements: JSON.stringify(['OAUTH2 credentials']), status: 'OUTAGE', priority: 75, owner: 'SGTX Egypt Integrations', version: '2.0', notes: '§11 #6 — API outage (NFSA)' },
    // §11 #1 — MISSING (Egypt export control — NOT_DISCOVERED)
    { id: 'cat_eg_export_control', connectorId: 'CAT-20240101-00008', jurisdictionCode: 'EG', authority: 'SECURITY', systemName: 'Export Control Authority', procedure: 'EXPORT_CONTROL', transportMode: null, integrationType: 'MANUAL', purpose: 'Export control license', officialUrl: null, apiUrl: null, portalUrl: null, documentationUrl: null, sandboxUrl: null, authentication: 'NONE', certificateRequirement: null, legalAgreement: null, certification: 'NOT_REQUIRED', productionRequirements: JSON.stringify([]), status: 'NOT_DISCOVERED', priority: 30, owner: null, version: null, notes: '§11 #1 — missing (not discovered)' },

    // === JORDAN (transit) ===
    // Jordan customs transit — MISSING (no connector)
    // (No catalog entry — represents a required integration that doesn't exist)

    // === SAUDI ARABIA (transit) ===
    // Saudi FASAH — PARTIAL (sandbox connected)
    { id: 'cat_sa_fasah', connectorId: 'CAT-20240101-00009', jurisdictionCode: 'SA', authority: 'CUSTOMS', systemName: 'FASAH', procedure: 'TRANSIT', transportMode: 'ROAD', integrationType: 'API', purpose: 'Saudi single-window customs', officialUrl: 'https://fasah.sa', apiUrl: 'https://fasah.sa/api', portalUrl: 'https://fasah.sa/portal', documentationUrl: 'https://fasah.sa/docs', sandboxUrl: 'https://sandbox.fasah.sa', authentication: 'OAUTH2', certificateRequirement: 'Production cert', legalAgreement: 'ZATCA agreement', certification: 'PENDING', productionRequirements: JSON.stringify(['Certification pending']), status: 'SANDBOX_CONNECTED', priority: 88, owner: 'SGTX KSA Integrations', version: '2.3', notes: 'Saudi FASAH — sandbox connected (partial)' },

    // === UAE (destination) ===
    // UAE customs — MISSING (no connector discovered yet)
    { id: 'cat_ae_customs_missing', connectorId: 'CAT-20240101-00010', jurisdictionCode: 'AE', authority: 'CUSTOMS', systemName: 'Dubai Customs', procedure: 'IMPORT', transportMode: null, integrationType: 'API', purpose: 'UAE customs import', officialUrl: 'https://dx.gov.ae', apiUrl: null, portalUrl: 'https://dx.gov.ae/portal', documentationUrl: null, sandboxUrl: null, authentication: 'OAUTH2', certificateRequirement: 'Production cert', legalAgreement: null, certification: 'REQUIRED', productionRequirements: JSON.stringify(['Discovery required']), status: 'NOT_DISCOVERED', priority: 85, owner: null, version: null, notes: 'UAE customs — not discovered (missing)' },
  ]
  for (const c of catalog) {
    await exec(
      `INSERT OR IGNORE INTO IntegrationCatalog (id, connectorId, jurisdictionCode, authority, systemName, procedure, transportMode, integrationType, purpose, officialUrl, apiUrl, ediUrl, portalUrl, documentationUrl, sandboxUrl, authentication, certificateRequirement, legalAgreement, certification, productionRequirements, status, priority, owner, lastVerifiedAt, version, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.connectorId, c.jurisdictionCode, c.authority, c.systemName, c.procedure, c.transportMode, c.integrationType, c.purpose, c.officialUrl, c.apiUrl, null, c.portalUrl, c.documentationUrl, c.sandboxUrl, c.authentication, c.certificateRequirement, c.legalAgreement, c.certification, c.productionRequirements, c.status, c.priority, c.owner, PAST.toISOString(), c.version, c.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${catalog.length} catalog entries upserted`)

  // -------------------------------------------------------------------------
  // §4 IntegrationGapRecords (covering §11 #7, #10)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/5 IntegrationGapRecords')
  const gaps = [
    // §11 #7 — REQUIRED_MISSING (Jordan transit)
    { id: 'igr_jo_transit', gapId: 'GAP-20240101-00001', jurisdictionCode: 'JO', authority: 'CUSTOMS', procedure: 'TRANSIT', transportMode: 'ROAD', systemName: null, required: 1, apiAvailable: 0, ediAvailable: 0, portalAvailable: 0, documentationAvailable: 0, credentialsRequired: 1, sandboxRequired: 0, certificationRequired: 1, legalAgreementRequired: 1, status: 'MISSING', priority: 85, affectedTradeLanes: JSON.stringify(['TLR-EG-AE-ROAD']), affectedUstns: JSON.stringify([]), owner: null, nextAction: 'Discover Jordan transit integration', dueDate: PAST.toISOString(), source: 'AUTOMATIC_DISCOVERY', evidence: JSON.stringify([]), notes: '§11 #7 — required missing (Jordan transit)' },
    // §11 #10 — priority calculation (UAE customs — MISSING, high priority)
    { id: 'igr_ae_customs', gapId: 'GAP-20240101-00002', jurisdictionCode: 'AE', authority: 'CUSTOMS', procedure: 'IMPORT', transportMode: null, systemName: 'Dubai Customs', required: 1, apiAvailable: 0, ediAvailable: 0, portalAvailable: 1, documentationAvailable: 0, credentialsRequired: 1, sandboxRequired: 1, certificationRequired: 1, legalAgreementRequired: 1, status: 'MISSING', priority: 90, affectedTradeLanes: JSON.stringify(['TLR-EG-AE-ROAD']), affectedUstns: JSON.stringify([]), owner: null, nextAction: 'Contact Dubai Customs for API access', dueDate: PAST.toISOString(), source: 'AUTOMATIC_DISCOVERY', evidence: JSON.stringify([]), notes: '§11 #10 — high priority (UAE customs missing)' },
    // UAE SPS — MISSING
    { id: 'igr_ae_sps', gapId: 'GAP-20240101-00003', jurisdictionCode: 'AE', authority: 'SPS', procedure: 'PHYTOSANITARY', transportMode: null, systemName: null, required: 1, apiAvailable: 0, ediAvailable: 0, portalAvailable: 0, documentationAvailable: 0, credentialsRequired: 0, sandboxRequired: 0, certificationRequired: 0, legalAgreementRequired: 0, status: 'MISSING', priority: 80, affectedTradeLanes: JSON.stringify(['TLR-EG-AE-ROAD']), affectedUstns: JSON.stringify([]), owner: null, nextAction: 'Discover UAE SPS authority', dueDate: null, source: 'AUTOMATIC_DISCOVERY', evidence: JSON.stringify([]), notes: 'UAE SPS — missing' },
    // Saudi transit — PARTIAL (FASAH sandbox)
    { id: 'igr_sa_transit', gapId: 'GAP-20240101-00004', jurisdictionCode: 'SA', authority: 'CUSTOMS', procedure: 'TRANSIT', transportMode: 'ROAD', systemName: 'FASAH', required: 1, apiAvailable: 1, ediAvailable: 0, portalAvailable: 1, documentationAvailable: 1, credentialsRequired: 1, sandboxRequired: 1, certificationRequired: 1, legalAgreementRequired: 1, status: 'PARTIAL', priority: 60, affectedTradeLanes: JSON.stringify(['TLR-EG-AE-ROAD']), affectedUstns: JSON.stringify([]), owner: 'SGTX KSA Integrations', nextAction: 'Complete FASAH production certification', dueDate: FUTURE.toISOString(), source: 'AUTOMATIC_DISCOVERY', evidence: JSON.stringify(['sandbox-connected']), notes: 'Saudi transit — partial (sandbox)' },
    // Egypt SPS — PARTIAL (degraded, expired cert)
    { id: 'igr_eg_sps', gapId: 'GAP-20240101-00005', jurisdictionCode: 'EG', authority: 'SPS', procedure: 'PHYTOSANITARY', transportMode: null, systemName: 'Plant Quarantine Authority', required: 1, apiAvailable: 1, ediAvailable: 0, portalAvailable: 1, documentationAvailable: 1, credentialsRequired: 1, sandboxRequired: 0, certificationRequired: 1, legalAgreementRequired: 0, status: 'PARTIAL', priority: 70, affectedTradeLanes: JSON.stringify(['TLR-EG-AE-ROAD']), affectedUstns: JSON.stringify([]), owner: 'SGTX Egypt Integrations', nextAction: 'Renew API key certificate', dueDate: PAST.toISOString(), source: 'AUTOMATIC_DISCOVERY', evidence: JSON.stringify(['expired-cert']), notes: 'Egypt SPS — partial (expired cert)' },
  ]
  for (const g of gaps) {
    await exec(
      `INSERT OR IGNORE INTO IntegrationGapRecord (id, gapId, jurisdictionCode, authority, procedure, transportMode, systemName, required, apiAvailable, ediAvailable, portalAvailable, documentationAvailable, credentialsRequired, sandboxRequired, certificationRequired, legalAgreementRequired, status, priority, affectedTradeLanes, affectedUstns, owner, nextAction, dueDate, source, evidence, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [g.id, g.gapId, g.jurisdictionCode, g.authority, g.procedure, g.transportMode, g.systemName, g.required, g.apiAvailable, g.ediAvailable, g.portalAvailable, g.documentationAvailable, g.credentialsRequired, g.sandboxRequired, g.certificationRequired, g.legalAgreementRequired, g.status, g.priority, g.affectedTradeLanes, g.affectedUstns, g.owner, g.nextAction, g.dueDate, g.source, g.evidence, g.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${gaps.length} gap records upserted`)

  // -------------------------------------------------------------------------
  // §8 CountryReadiness (covering §11 #9 — Egypt activation)
  // -------------------------------------------------------------------------
  console.log('[seed] 3/5 CountryReadiness')
  const egReadiness = [
    { dimension: 'CUSTOMS', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
    { dimension: 'TAX', readinessLevel: 'MANUAL', connectedCount: 0, partialCount: 0, manualCount: 1, missingCount: 0, readinessScore: 0.2 },
    { dimension: 'SPS', readinessLevel: 'PARTIAL', connectedCount: 0, partialCount: 1, manualCount: 0, missingCount: 0, readinessScore: 0.5 },
    { dimension: 'TBT', readinessLevel: 'MANUAL', connectedCount: 0, partialCount: 0, manualCount: 1, missingCount: 0, readinessScore: 0.2 },
    { dimension: 'TRANSPORT', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
    { dimension: 'SECURITY', readinessLevel: 'MISSING', connectedCount: 0, partialCount: 0, manualCount: 0, missingCount: 1, readinessScore: 0.0 },
    { dimension: 'INSURANCE', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
    { dimension: 'BROKER', readinessLevel: 'MANUAL', connectedCount: 0, partialCount: 0, manualCount: 1, missingCount: 0, readinessScore: 0.2 },
    { dimension: 'PAYMENT', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
    { dimension: 'LICENSES', readinessLevel: 'PARTIAL', connectedCount: 0, partialCount: 1, manualCount: 0, missingCount: 0, readinessScore: 0.5 },
    { dimension: 'PERMITS', readinessLevel: 'PARTIAL', connectedCount: 0, partialCount: 1, manualCount: 0, missingCount: 0, readinessScore: 0.5 },
    { dimension: 'CERTIFICATES', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
    { dimension: 'GOVERNMENT_APIS', readinessLevel: 'PARTIAL', connectedCount: 3, partialCount: 1, manualCount: 2, missingCount: 1, readinessScore: 0.65 },
    { dimension: 'ERP', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
    { dimension: 'ACCOUNTING', readinessLevel: 'CONNECTED', connectedCount: 1, partialCount: 0, manualCount: 0, missingCount: 0, readinessScore: 1.0 },
  ]
  for (const r of egReadiness) {
    await exec(
      `INSERT OR IGNORE INTO CountryReadiness (id, countryCode, countryName, dimension, readinessLevel, connectedCount, partialCount, manualCount, missingCount, readinessScore, lastAssessedAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`cr_eg_${r.dimension.toLowerCase()}`, 'EG', 'Egypt', r.dimension, r.readinessLevel, r.connectedCount, r.partialCount, r.manualCount, r.missingCount, r.readinessScore, NOW.toISOString(), null, NOW.toISOString(), NOW.toISOString()]
    )
  }
  // UAE — mostly MISSING (new trade lane)
  const aeReadiness = [
    { dimension: 'CUSTOMS', readinessLevel: 'MISSING', connectedCount: 0, partialCount: 0, manualCount: 0, missingCount: 1, readinessScore: 0.0 },
    { dimension: 'SPS', readinessLevel: 'MISSING', connectedCount: 0, partialCount: 0, manualCount: 0, missingCount: 1, readinessScore: 0.0 },
  ]
  for (const r of aeReadiness) {
    await exec(
      `INSERT OR IGNORE INTO CountryReadiness (id, countryCode, countryName, dimension, readinessLevel, connectedCount, partialCount, manualCount, missingCount, readinessScore, lastAssessedAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`cr_ae_${r.dimension.toLowerCase()}`, 'AE', 'United Arab Emirates', r.dimension, r.readinessLevel, r.connectedCount, r.partialCount, r.manualCount, r.missingCount, r.readinessScore, NOW.toISOString(), '§11 #8 — new trade lane (UAE not ready)', NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${egReadiness.length + aeReadiness.length} country readiness rows upserted`)

  // -------------------------------------------------------------------------
  // §9 TradeLaneReadiness (covering §11 #8 — new trade lane EG→AE)
  // -------------------------------------------------------------------------
  console.log('[seed] 4/5 TradeLaneReadiness')
  await exec(
    `INSERT OR IGNORE INTO TradeLaneReadiness (id, laneId, originCountry, destinationCountry, transitCountries, commodity, hs6, transportMode, regulatoryReadiness, documentReadiness, customsReadiness, transportReadiness, governmentConnectivity, manualTouchpoints, missingIntegrations, blockers, overallReadiness, lastAssessedAt, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['tlr_eg_ae_road', 'TLR-20240101-00001', 'EG', 'AE', JSON.stringify(['JO', 'SA']), 'Agricultural (Onions)', '070310', 'ROAD',
     'PARTIAL', 'MISSING', 'PARTIAL', 'CONNECTED', 'PARTIAL',
     2, 3, JSON.stringify(['Jordan transit MISSING', 'UAE customs MISSING', 'UAE SPS MISSING']),
     0.45, NOW.toISOString(),
     '§11 #8 — new trade lane EG→AE (agricultural reefer road). §6 example.',
     NOW.toISOString(), NOW.toISOString()]
  )
  console.log('[seed]   1 trade lane readiness upserted (EG→AE)')

  // -------------------------------------------------------------------------
  // §10 IntegrationAlerts (covering §11 scenarios)
  // -------------------------------------------------------------------------
  console.log('[seed] 5/5 IntegrationAlerts')
  const alerts = [
    // §11 #5 — CERTIFICATE_EXPIRES (Egypt SPS)
    { id: 'ia_cert_expires', alertId: 'ALT-20240101-00001', alertType: 'CERTIFICATE_EXPIRES', severity: 'WARN', jurisdictionCode: 'EG', authority: 'SPS', systemName: 'Plant Quarantine Authority', connectorId: 'CAT-20240101-00002', laneId: null, title: 'Certificate expired — Egypt SPS Plant Quarantine', description: 'API key certificate expired. Renewal required.', actionRequired: 'Renew API key certificate', dueDate: PAST.toISOString(), status: 'OPEN', source: 'AUTOMATIC', notes: '§11 #5 — certificate expires' },
    // §11 #6 — CONNECTOR_OUTAGE (Egypt NFSA)
    { id: 'ia_outage', alertId: 'ALT-20240101-00002', alertType: 'CONNECTOR_OUTAGE', severity: 'CRITICAL', jurisdictionCode: 'EG', authority: 'HEALTH', systemName: 'NFSA', connectorId: 'CAT-20240101-00007', laneId: null, title: 'NFSA API outage', description: 'NFSA API down since 2024-08-20 (maintenance)', actionRequired: 'Use portal fallback', dueDate: null, status: 'OPEN', source: 'AUTOMATIC', notes: '§11 #6 — API outage' },
    // §11 #7 — REQUIRED_MISSING (Jordan transit)
    { id: 'ia_required_missing', alertId: 'ALT-20240101-00003', alertType: 'REQUIRED_MISSING', severity: 'CRITICAL', jurisdictionCode: 'JO', authority: 'CUSTOMS', systemName: null, connectorId: null, laneId: 'TLR-20240101-00001', title: 'Required integration missing — Jordan transit customs', description: 'No connector discovered for Jordan transit customs (ROAD mode). Trade lane EG→AE is blocked.', actionRequired: 'Discover Jordan customs transit integration', dueDate: PAST.toISOString(), status: 'OPEN', source: 'AUTOMATIC_DISCOVERY', notes: '§11 #7 — required missing' },
    // §11 #8 — LANE_NON_READY (EG→AE)
    { id: 'ia_lane_nonready', alertId: 'ALT-20240101-00004', alertType: 'LANE_NON_READY', severity: 'WARN', jurisdictionCode: null, authority: null, systemName: null, connectorId: null, laneId: 'TLR-20240101-00001', title: 'Trade lane EG→AE not ready', description: 'Overall readiness 0.45 — below 0.5 threshold. 3 missing integrations, 2 manual touchpoints.', actionRequired: 'Resolve missing integrations for Jordan transit + UAE customs + UAE SPS', dueDate: null, status: 'OPEN', source: 'AUTOMATIC', notes: '§11 #8 — lane non-ready' },
    // §11 #1 — CONNECTOR_DEPRECATED (example)
    { id: 'ia_deprecated', alertId: 'ALT-20240101-00005', alertType: 'CONNECTOR_DEPRECATED', severity: 'INFO', jurisdictionCode: 'EG', authority: 'CUSTOMS', systemName: 'Old Nafeza v2', connectorId: 'CAT-20240101-00001', laneId: null, title: 'Nafeza v2 API deprecated', description: 'Nafeza v2 API deprecated — migrate to v3', actionRequired: 'Migrate to v3 API', dueDate: FUTURE.toISOString(), status: 'OPEN', source: 'AUTOMATIC', notes: '§11 #1 — connector deprecated' },
  ]
  for (const a of alerts) {
    await exec(
      `INSERT OR IGNORE INTO IntegrationAlert (id, alertId, alertType, severity, jurisdictionCode, authority, systemName, connectorId, laneId, title, description, actionRequired, dueDate, status, acknowledgedBy, acknowledgedAt, resolvedBy, resolvedAt, resolutionNotes, affectedUstns, source, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.id, a.alertId, a.alertType, a.severity, a.jurisdictionCode, a.authority, a.systemName, a.connectorId, a.laneId, a.title, a.description, a.actionRequired, a.dueDate, a.status, null, null, null, null, null, JSON.stringify([]), a.source, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${alerts.length} alerts upserted`)

  console.log('[seed] Done. §11 test scenarios available:')
  console.log('[seed]   1. missing integration     → cat_eg_export_control (NOT_DISCOVERED)')
  console.log('[seed]   2. connected integration    → cat_eg_nafeza_api (PRODUCTION_CONNECTED)')
  console.log('[seed]   3. portal-only              → cat_eg_eta_portal (PORTAL_ONLY)')
  console.log('[seed]   4. manual-only              → cat_eg_broker (MANUAL_ONLY)')
  console.log('[seed]   5. expired certificate      → cat_eg_sps_phyto (certification=EXPIRED) + ia_cert_expires')
  console.log('[seed]   6. API outage               → cat_eg_nfsa_outage (OUTAGE) + ia_outage')
  console.log('[seed]   7. new government requirement → igr_jo_transit (REQUIRED_MISSING) + ia_required_missing')
  console.log('[seed]   8. new trade lane          → tlr_eg_ae_road (EG→AE, overall 0.45) + ia_lane_nonready')
  console.log('[seed]   9. country activation      → EG (15 dimensions: 7 CONNECTED + 4 PARTIAL + 3 MANUAL + 1 MISSING)')
  console.log('[seed]  10. priority calculation    → igr_ae_customs (priority=90) + igr_jo_transit (priority=85)')
  console.log('[seed]   §6 example: Egypt→UAE Agricultural Reefer Road')
  console.log('[seed]     EG customs: CONNECTED | EG SPS: PARTIAL (expired cert) | EG tax: PORTAL_ONLY')
  console.log('[seed]     EG insurance: CONNECTED | EG trucking: CONNECTED | EG broker: MANUAL_ONLY')
  console.log('[seed]     JO transit: MISSING | SA transit: PARTIAL (sandbox)')
  console.log('[seed]     AE customs: MISSING | AE SPS: MISSING')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
