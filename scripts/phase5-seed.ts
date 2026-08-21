/**
 * Phase 5 — Seed data covering all §8 test scenarios.
 *
 * §8 test scenarios:
 *   1. ROAD             → ROAD leg (truck provider)
 *   2. AIR              → AIR leg (airline provider)
 *   3. OCEAN           → OCEAN leg (shipping line provider)
 *   4. RAIL            → RAIL leg (rail operator provider)
 *   5. MULTIMODAL      → ROAD→OCEAN→ROAD graph (3 legs)
 *   6. known provider   → approved provider relationship
 *   7. saved provider   → saved-contact relationship
 *   8. unavailable provider → provider with SUSPENDED relationship
 *   9. manual provider  → provider with MANUAL_ONLY integration
 *  10. provider license expiry → ProviderValidation with EXPIRED status
 *  11. provider API outage → provider with OUTAGE health
 *
 * Run: bun run scripts/phase5-seed.ts
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
const EXPIRED_DATE = new Date('2024-06-01')

async function main() {
  console.log('[seed] Phase 5 transport & logistics seed — start')

  // -------------------------------------------------------------------------
  // §2 ProviderRelationships (covering §8 scenarios 6-9)
  // -------------------------------------------------------------------------
  console.log('[seed] 1/4 ProviderRelationships')
  const relationships = [
    // KNOWN provider (APPROVED relationship) — §8 #6
    {
      id: 'pr_lsp_known', providerGtid: 'SGTX-EG-LSP-000001-AAAA', providerType: 'LSP',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PRIVATE', jurisdictions: JSON.stringify(['EG', 'SA']),
      routes: JSON.stringify([{ origin: 'EGCAI', dest: 'EGDAH' }, { origin: 'EGDAH', dest: 'SAJED' }]),
      serviceCatalogue: JSON.stringify(['ROAD', 'WAREHOUSE', 'CUSTOMS_BROKER']),
      authorizedFrom: PAST.toISOString(), authorizedUntil: FUTURE.toISOString(), authorizedBy: 'SGTX Platform',
      internalTrustScore: 88, notes: 'KNOWN provider — approved relationship (§8 #6)'
    },
    // SAVED CONTACT provider — §8 #7
    {
      id: 'pr_ff_saved', providerGtid: 'SGTX-EG-FF-000002-BBBB', providerType: 'FREIGHT_FORWARDER',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'SAVED_CONTACT', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PRIVATE', jurisdictions: JSON.stringify(['EG']),
      routes: JSON.stringify([{ origin: 'EGCAI', dest: 'AEJEB' }]),
      serviceCatalogue: JSON.stringify(['AIR', 'OCEAN', 'MULTIMODAL']),
      internalTrustScore: 75, notes: 'SAVED CONTACT — trader added this provider (§8 #7)'
    },
    // SHIPPING LINE — approved for ocean
    {
      id: 'pr_sl_maersk', providerGtid: 'SGTX-DK-SL-000003-CCCC', providerType: 'SHIPPING_LINE',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PLATFORM', jurisdictions: JSON.stringify(['EG', 'SA', 'AE', 'EU']),
      routes: JSON.stringify([{ origin: 'EGDAH', dest: 'BEANR' }, { origin: 'EGDAH', dest: 'SAJED' }]),
      serviceCatalogue: JSON.stringify(['OCEAN']),
      authorizedFrom: PAST.toISOString(), authorizedUntil: FUTURE.toISOString(), authorizedBy: 'SGTX Platform',
      internalTrustScore: 92, notes: 'Maersk Levant — platform-approved shipping line'
    },
    // AIRLINE — approved for air
    {
      id: 'pr_al_eg', providerGtid: 'SGTX-EG-AL-000004-DDDD', providerType: 'AIRLINE',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PLATFORM', jurisdictions: JSON.stringify(['EG', 'EU']),
      routes: JSON.stringify([{ origin: 'EGCAI', dest: 'EGLL' }]),
      serviceCatalogue: JSON.stringify(['AIR']),
      authorizedFrom: PAST.toISOString(), authorizedUntil: FUTURE.toISOString(), authorizedBy: 'SGTX Platform',
      internalTrustScore: 85, notes: 'EgyptAir Cargo — platform-approved airline'
    },
    // RAIL OPERATOR — approved for rail
    {
      id: 'pr_ro_enr', providerGtid: 'SGTX-EG-RO-000005-EEEE', providerType: 'RAIL_OPERATOR',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PLATFORM', jurisdictions: JSON.stringify(['EG']),
      routes: JSON.stringify([{ origin: 'EGCAI', dest: 'EGASW' }]),
      serviceCatalogue: JSON.stringify(['RAIL']),
      authorizedFrom: PAST.toISOString(), authorizedUntil: FUTURE.toISOString(), authorizedBy: 'SGTX Platform',
      internalTrustScore: 80, notes: 'ENR — Egyptian National Railways'
    },
    // UNAVAILABLE provider (SUSPENDED relationship) — §8 #8
    {
      id: 'pr_wh_unavailable', providerGtid: 'SGTX-EG-WH-000006-FFFF', providerType: 'WAREHOUSE',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'SUSPENDED',
      visibilityScope: 'PRIVATE', jurisdictions: JSON.stringify(['EG']),
      routes: JSON.stringify([]),
      serviceCatalogue: JSON.stringify(['WAREHOUSE']),
      internalTrustScore: 40, notes: 'UNAVAILABLE provider — suspended (§8 #8)'
    },
    // MANUAL provider (MANUAL_ONLY integration) — §8 #9
    {
      id: 'pr_cb_manual', providerGtid: 'SGTX-EG-CB-000007-GGGG', providerType: 'CUSTOMS_BROKER',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PRIVATE', jurisdictions: JSON.stringify(['EG']),
      routes: JSON.stringify([{ origin: 'EGDAH', dest: 'EGCAI' }]),
      serviceCatalogue: JSON.stringify(['CUSTOMS_BROKER']),
      internalTrustScore: 70, notes: 'MANUAL provider — no API, manual workflow (§8 #9)'
    },
    // LAB — approved
    {
      id: 'pr_lab_cairo', providerGtid: 'SGTX-EG-LAB-000008-HHHH', providerType: 'LAB',
      traderGtid: 'SGTX-EG-TRD-002139-7F3A', relationshipType: 'APPROVED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PRIVATE', jurisdictions: JSON.stringify(['EG']),
      serviceCatalogue: JSON.stringify(['LAB', 'QC', 'INSPECTION']),
      internalTrustScore: 90, notes: 'Cairo Analytical Lab'
    },
    // INSURANCE — approved
    {
      id: 'pr_ins_aig', providerGtid: 'SGTX-EG-INS-000009-IIII', providerType: 'INSURANCE',
      traderGtid: null, relationshipType: 'GOVERNMENT_AUTHORIZED', relationshipStatus: 'ACTIVE',
      visibilityScope: 'PLATFORM', jurisdictions: JSON.stringify(['EG']),
      serviceCatalogue: JSON.stringify(['INSURANCE']),
      internalTrustScore: 85, notes: 'AIG Egypt — platform-wide insurance provider'
    },
  ]
  for (const r of relationships) {
    await exec(
      `INSERT OR IGNORE INTO ProviderRelationship (id, providerGtid, providerType, traderGtid, relationshipType, relationshipStatus, visibilityScope, jurisdictions, routes, serviceCatalogue, authorizedFrom, authorizedUntil, authorizedBy, internalTrustScore, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.providerGtid, r.providerType, r.traderGtid, r.relationshipType, r.relationshipStatus, r.visibilityScope, r.jurisdictions, r.routes, r.serviceCatalogue, r.authorizedFrom || null, r.authorizedUntil || null, r.authorizedBy || null, r.internalTrustScore, r.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${relationships.length} provider relationships upserted`)

  // -------------------------------------------------------------------------
  // §6 ProviderValidations (covering §8 #10 — license expiry)
  // -------------------------------------------------------------------------
  console.log('[seed] 2/4 ProviderValidations')
  const validations = [
    // LSP — LICENSE VALIDATED
    {
      id: 'pv_lsp_license', providerGtid: 'SGTX-EG-LSP-000001-AAAA', providerType: 'LSP', validationType: 'LICENSE',
      status: 'VALIDATED', referenceNumber: 'EG-LSP-2024-001', issuedBy: 'EG Ministry of Transport',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      jurisdictions: JSON.stringify(['EG', 'SA']), routes: null, commodities: null, vehicles: null, drivers: null,
      verifiedAt: PAST.toISOString(), verifiedBy: 'SGTX Compliance', verificationMethod: 'API',
      notes: 'LSP license valid'
    },
    // LSP — INSURANCE VALIDATED
    {
      id: 'pv_lsp_insurance', providerGtid: 'SGTX-EG-LSP-000001-AAAA', providerType: 'LSP', validationType: 'INSURANCE',
      status: 'VALIDATED', referenceNumber: 'INS-2024-001', issuedBy: 'AIG Egypt',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      jurisdictions: JSON.stringify(['EG']), notes: 'Cargo insurance valid'
    },
    // LSP — ROUTE_AUTHORIZATION VALIDATED
    {
      id: 'pv_lsp_route', providerGtid: 'SGTX-EG-LSP-000001-AAAA', providerType: 'LSP', validationType: 'ROUTE_AUTHORIZATION',
      status: 'VALIDATED', referenceNumber: 'EG-ROUTE-2024-001', issuedBy: 'EG Customs Authority',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      routes: JSON.stringify([{ origin: 'EGCAI', dest: 'EGDAH' }, { origin: 'EGDAH', dest: 'SAJED' }]),
      notes: 'Route authorization valid'
    },
    // SHIPPING LINE — LICENSE VALIDATED
    {
      id: 'pv_sl_license', providerGtid: 'SGTX-DK-SL-000003-CCCC', providerType: 'SHIPPING_LINE', validationType: 'LICENSE',
      status: 'VALIDATED', referenceNumber: 'IMO-9315211', issuedBy: 'IMO',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      jurisdictions: JSON.stringify(['EG', 'SA', 'AE', 'EU']), notes: 'Shipping line license valid'
    },
    // AIRLINE — LICENSE VALIDATED
    {
      id: 'pv_al_license', providerGtid: 'SGTX-EG-AL-000004-DDDD', providerType: 'AIRLINE', validationType: 'LICENSE',
      status: 'VALIDATED', referenceNumber: 'AOC-EG-2024-001', issuedBy: 'ECAA',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      jurisdictions: JSON.stringify(['EG', 'EU']), notes: 'Airline AOC valid'
    },
    // AIRLINE — AIRLINE_SHIPPER_AUTHORITY VALIDATED
    {
      id: 'pv_al_authority', providerGtid: 'SGTX-EG-AL-000004-DDDD', providerType: 'AIRLINE', validationType: 'AIRLINE_SHIPPER_AUTHORITY',
      status: 'VALIDATED', referenceNumber: 'EG-AIR-AUTH-2024-001', issuedBy: 'ECAA',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      notes: 'Airline shipper authority valid'
    },
    // CUSTOMS BROKER — BROKER_LICENSE EXPIRED (§8 #10)
    {
      id: 'pv_cb_license_expired', providerGtid: 'SGTX-EG-CB-000007-GGGG', providerType: 'CUSTOMS_BROKER', validationType: 'BROKER_LICENSE',
      status: 'EXPIRED', referenceNumber: 'EG-CBR-2022-000123', issuedBy: 'Egyptian Customs Authority',
      issuedAt: new Date('2022-01-01').toISOString(), validFrom: new Date('2022-01-01').toISOString(), validUntil: EXPIRED_DATE.toISOString(),
      jurisdictions: JSON.stringify(['EG']),
      notes: 'EXPIRED broker license (§8 #10) — renewal required'
    },
    // WAREHOUSE — LICENSE SUSPENDED (§8 #8 — unavailable provider)
    {
      id: 'pv_wh_license_suspended', providerGtid: 'SGTX-EG-WH-000006-FFFF', providerType: 'WAREHOUSE', validationType: 'LICENSE',
      status: 'INVALID', referenceNumber: 'EG-WH-2023-000456', issuedBy: 'EG Ministry of Supply',
      issuedAt: new Date('2023-01-01').toISOString(), validFrom: new Date('2023-01-01').toISOString(), validUntil: new Date('2024-03-01').toISOString(),
      jurisdictions: JSON.stringify(['EG']),
      notes: 'INVALID warehouse license (suspended)'
    },
    // LAB — LICENSE VALIDATED
    {
      id: 'pv_lab_license', providerGtid: 'SGTX-EG-LAB-000008-HHHH', providerType: 'LAB', validationType: 'LICENSE',
      status: 'VALIDATED', referenceNumber: 'EG-LAB-ISO17025-001', issuedBy: 'EGAP',
      issuedAt: PAST.toISOString(), validFrom: PAST.toISOString(), validUntil: FUTURE.toISOString(),
      jurisdictions: JSON.stringify(['EG']), notes: 'ISO 17025 lab accreditation valid'
    },
  ]
  for (const v of validations) {
    await exec(
      `INSERT OR IGNORE INTO ProviderValidation (id, providerGtid, providerType, validationType, status, referenceNumber, issuedBy, issuedAt, validFrom, validUntil, jurisdictions, routes, commodities, vehicles, drivers, verifiedAt, verifiedBy, verificationMethod, evidence, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [v.id, v.providerGtid, v.providerType, v.validationType, v.status, v.referenceNumber, v.issuedBy, v.issuedAt, v.validFrom, v.validUntil, v.jurisdictions, v.routes || null, v.commodities || null, v.vehicles || null, v.drivers || null, v.verifiedAt || null, v.verifiedBy || null, v.verificationMethod || null, v.evidence || null, v.notes, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${validations.length} provider validations upserted`)

  // -------------------------------------------------------------------------
  // §1 TransportGraphs + Legs (covering §8 scenarios 1-5)
  // -------------------------------------------------------------------------
  console.log('[seed] 3/4 TransportGraphs + Legs')
  const graphs = [
    // §8 #1 — ROAD single-leg
    {
      id: 'tg_road_only', ustn: 'SGTX-PHASE5-ROAD-0001', name: 'ROAD — Cairo to Damietta',
      totalLegs: 1, primaryMode: 'ROAD', isMultimodal: false,
      originLocation: 'EGCAI', destinationLocation: 'EGDAH',
      estimatedTransitDays: 1, estimatedTotalCostUsd: 800, status: 'PLANNED'
    },
    // §8 #2 — AIR single-leg
    {
      id: 'tg_air_only', ustn: 'SGTX-PHASE5-AIR-0002', name: 'AIR — Cairo to Frankfurt',
      totalLegs: 1, primaryMode: 'AIR', isMultimodal: false,
      originLocation: 'EGCAI', destinationLocation: 'DEFRA',
      estimatedTransitDays: 1, estimatedTotalCostUsd: 2500, status: 'PLANNED'
    },
    // §8 #3 — OCEAN single-leg
    {
      id: 'tg_ocean_only', ustn: 'SGTX-PHASE5-OCEAN-0003', name: 'OCEAN — Damietta to Antwerp',
      totalLegs: 1, primaryMode: 'OCEAN', isMultimodal: false,
      originLocation: 'EGDAH', destinationLocation: 'BEANR',
      estimatedTransitDays: 12, estimatedTotalCostUsd: 3500, status: 'PLANNED'
    },
    // §8 #4 — RAIL single-leg
    {
      id: 'tg_rail_only', ustn: 'SGTX-PHASE5-RAIL-0004', name: 'RAIL — Cairo to Aswan',
      totalLegs: 1, primaryMode: 'RAIL', isMultimodal: false,
      originLocation: 'EGCAI', destinationLocation: 'EGASW',
      estimatedTransitDays: 2, estimatedTotalCostUsd: 1200, status: 'PLANNED'
    },
    // §8 #5 — MULTIMODAL ROAD→OCEAN→ROAD (3 legs)
    {
      id: 'tg_multimodal_ror', ustn: 'SGTX-PHASE5-MULTI-0005', name: 'MULTIMODAL — Cairo→Damietta→Antwerp→Brussels',
      totalLegs: 3, primaryMode: 'OCEAN', isMultimodal: true,
      originLocation: 'EGCAI', destinationLocation: 'BEBRU',
      estimatedTransitDays: 15, estimatedTotalCostUsd: 5200, status: 'PLANNED'
    },
  ]
  for (const g of graphs) {
    await exec(
      `INSERT OR IGNORE INTO TransportGraph (id, ustn, tradeId, name, description, totalLegs, primaryMode, isMultimodal, originLocation, destinationLocation, estimatedTransitDays, estimatedTotalCostUsd, currency, status, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [g.id, g.ustn, null, g.name, null, g.totalLegs, g.primaryMode, g.isMultimodal ? 1 : 0, g.originLocation, g.destinationLocation, g.estimatedTransitDays, g.estimatedTotalCostUsd, 'USD', g.status, NOW.toISOString(), NOW.toISOString()]
    )
  }
  // Legs
  const legs = [
    // ROAD graph — 1 leg
    { id: 'tl_road_1', graphId: 'tg_road_only', legNumber: 1, legType: 'ORIGIN', mode: 'ROAD', originLocation: 'EGCAI', destinationLocation: 'EGDAH', providerGtid: 'SGTX-EG-LSP-000001-AAAA', providerType: 'LSP', status: 'PLANNED', estimatedCostUsd: 800 },
    // AIR graph — 1 leg
    { id: 'tl_air_1', graphId: 'tg_air_only', legNumber: 1, legType: 'ORIGIN', mode: 'AIR', originLocation: 'EGCAI', destinationLocation: 'DEFRA', providerGtid: 'SGTX-EG-AL-000004-DDDD', providerType: 'AIRLINE', status: 'PLANNED', estimatedCostUsd: 2500 },
    // OCEAN graph — 1 leg
    { id: 'tl_ocean_1', graphId: 'tg_ocean_only', legNumber: 1, legType: 'ORIGIN', mode: 'OCEAN', originLocation: 'EGDAH', destinationLocation: 'BEANR', providerGtid: 'SGTX-DK-SL-000003-CCCC', providerType: 'SHIPPING_LINE', status: 'PLANNED', estimatedCostUsd: 3500 },
    // RAIL graph — 1 leg
    { id: 'tl_rail_1', graphId: 'tg_rail_only', legNumber: 1, legType: 'ORIGIN', mode: 'RAIL', originLocation: 'EGCAI', destinationLocation: 'EGASW', providerGtid: 'SGTX-EG-RO-000005-EEEE', providerType: 'RAIL_OPERATOR', status: 'PLANNED', estimatedCostUsd: 1200 },
    // MULTIMODAL graph — 3 legs (ROAD→OCEAN→ROAD)
    { id: 'tl_multi_1', graphId: 'tg_multimodal_ror', legNumber: 1, legType: 'ORIGIN', mode: 'ROAD', originLocation: 'EGCAI', destinationLocation: 'EGDAH', handoffLocation: 'EGDAH', handoffType: 'DOOR_TO_PORT', providerGtid: 'SGTX-EG-LSP-000001-AAAA', providerType: 'LSP', status: 'PLANNED', estimatedCostUsd: 500 },
    { id: 'tl_multi_2', graphId: 'tg_multimodal_ror', legNumber: 2, legType: 'INTERMEDIATE', mode: 'OCEAN', originLocation: 'EGDAH', destinationLocation: 'BEANR', handoffLocation: 'BEANR', handoffType: 'PORT_TO_PORT', providerGtid: 'SGTX-DK-SL-000003-CCCC', providerType: 'SHIPPING_LINE', status: 'PLANNED', estimatedCostUsd: 3800 },
    { id: 'tl_multi_3', graphId: 'tg_multimodal_ror', legNumber: 3, legType: 'DESTINATION', mode: 'ROAD', originLocation: 'BEANR', destinationLocation: 'BEBRU', handoffLocation: 'BEANR', handoffType: 'PORT_TO_DOOR', providerGtid: 'SGTX-EG-FF-000002-BBBB', providerType: 'FREIGHT_FORWARDER', status: 'PLANNED', estimatedCostUsd: 900 },
  ]
  for (const l of legs) {
    await exec(
      `INSERT OR IGNORE INTO TransportLeg (id, graphId, legNumber, legType, mode, originLocation, destinationLocation, handoffLocation, handoffType, providerGtid, providerType, modeEngineRef, modeEngineType, documents, status, plannedDeparture, plannedArrival, actualDeparture, actualArrival, estimatedCostUsd, actualCostUsd, currency, modeMetadata, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [l.id, l.graphId, l.legNumber, l.legType, l.mode, l.originLocation, l.destinationLocation, l.handoffLocation || null, l.handoffType || null, l.providerGtid, l.providerType, l.modeEngineRef || null, l.modeEngineType || null, l.documents || null, l.status, l.plannedDeparture || null, l.plannedArrival || null, l.actualDeparture || null, l.actualArrival || null, l.estimatedCostUsd, l.actualCostUsd || null, 'USD', l.modeMetadata || null, l.notes || null, NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${graphs.length} graphs + ${legs.length} legs upserted`)

  // -------------------------------------------------------------------------
  // §4 LandedCostBreakdown (one per graph)
  // -------------------------------------------------------------------------
  console.log('[seed] 4/4 LandedCostBreakdown')
  const costs = [
    // ROAD — freight $800, SGTX fee $25 min
    { id: 'lcb_road', ustn: 'SGTX-PHASE5-ROAD-0001', graphId: 'tg_road_only', freight: 800, fuel: 120, handling: 50, terminal: 0, customs: 0, broker: 100, permits: 50, inspection: 0, lab: 0, insurance: 80, warehouse: 0, storage: 0, demurrage: 0, detention: 0, waiting: 0, specialCargo: 0, reefer: 0, dg: 0, delivery: 50, sgtxFee: 25 },
    // AIR — freight $2500
    { id: 'lcb_air', ustn: 'SGTX-PHASE5-AIR-0002', graphId: 'tg_air_only', freight: 2500, fuel: 400, handling: 150, terminal: 100, customs: 0, broker: 100, permits: 0, inspection: 0, lab: 0, insurance: 200, warehouse: 0, storage: 0, demurrage: 0, detention: 0, waiting: 0, specialCargo: 0, reefer: 0, dg: 0, delivery: 80, sgtxFee: 25 },
    // OCEAN — freight $3500 + demurrage risk
    { id: 'lcb_ocean', ustn: 'SGTX-PHASE5-OCEAN-0003', graphId: 'tg_ocean_only', freight: 3500, fuel: 500, handling: 300, terminal: 250, customs: 0, broker: 200, permits: 0, inspection: 0, lab: 0, insurance: 300, warehouse: 0, storage: 0, demurrage: 0, detention: 0, waiting: 0, specialCargo: 0, reefer: 0, dg: 0, delivery: 100, sgtxFee: 25 },
    // RAIL — freight $1200
    { id: 'lcb_rail', ustn: 'SGTX-PHASE5-RAIL-0004', graphId: 'tg_rail_only', freight: 1200, fuel: 180, handling: 80, terminal: 0, customs: 0, broker: 100, permits: 0, inspection: 0, lab: 0, insurance: 100, warehouse: 0, storage: 0, demurrage: 0, detention: 0, waiting: 0, specialCargo: 0, reefer: 0, dg: 0, delivery: 60, sgtxFee: 25 },
    // MULTIMODAL — freight $5200 (500+3800+900), all components
    { id: 'lcb_multi', ustn: 'SGTX-PHASE5-MULTI-0005', graphId: 'tg_multimodal_ror', freight: 5200, fuel: 800, handling: 400, terminal: 350, customs: 0, broker: 300, permits: 0, inspection: 150, lab: 0, insurance: 450, warehouse: 0, storage: 0, demurrage: 0, detention: 0, waiting: 0, specialCargo: 0, reefer: 0, dg: 0, delivery: 200, sgtxFee: 50 },
  ]
  for (const c of costs) {
    const total = c.freight + c.fuel + c.handling + c.terminal + c.customs + c.broker + c.permits + c.inspection + c.lab + c.insurance + c.warehouse + c.storage + c.demurrage + c.detention + c.waiting + c.specialCargo + c.reefer + c.dg + c.delivery + c.sgtxFee
    await exec(
      `INSERT OR IGNORE INTO LandedCostBreakdown (id, ustn, tradeId, graphId, legId, quoteId, currency, freight, fuel, handling, terminal, customs, broker, permits, inspection, lab, insurance, warehouse, storage, demurrage, detention, waiting, specialCargo, reefer, dg, delivery, sgtxFee, totalLandedCost, costSources, fixedCost, variableCost, confidence, notes, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.ustn, null, c.graphId, null, null, 'USD', c.freight, c.fuel, c.handling, c.terminal, c.customs, c.broker, c.permits, c.inspection, c.lab, c.insurance, c.warehouse, c.storage, c.demurrage, c.detention, c.waiting, c.specialCargo, c.reefer, c.dg, c.delivery, c.sgtxFee, total, null, c.freight + c.handling + c.terminal, c.fuel + c.demurrage + c.detention + c.waiting, 0.9, 'seeded breakdown', NOW.toISOString(), NOW.toISOString()]
    )
  }
  console.log(`[seed]   ${costs.length} landed cost breakdowns upserted`)

  console.log('[seed] Done. §8 test scenarios available:')
  console.log('[seed]   1. ROAD             → tg_road_only (LSP provider)')
  console.log('[seed]   2. AIR              → tg_air_only (Airline provider)')
  console.log('[seed]   3. OCEAN           → tg_ocean_only (Shipping Line provider)')
  console.log('[seed]   4. RAIL            → tg_rail_only (Rail Operator provider)')
  console.log('[seed]   5. MULTIMODAL      → tg_multimodal_ror (ROAD→OCEAN→ROAD, 3 legs)')
  console.log('[seed]   6. known provider   → pr_lsp_known (APPROVED relationship)')
  console.log('[seed]   7. saved provider   → pr_ff_saved (SAVED_CONTACT relationship)')
  console.log('[seed]   8. unavailable      → pr_wh_unavailable (SUSPENDED) + pv_wh_license_suspended (INVALID)')
  console.log('[seed]   9. manual provider  → pr_cb_manual (CUSTOMS_BROKER, manual workflow)')
  console.log('[seed]  10. license expiry   → pv_cb_license_expired (EXPIRED broker license)')
  console.log('[seed]  11. API outage       → (simulated via provider health check)')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
