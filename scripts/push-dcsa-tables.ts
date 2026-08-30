import { createClient } from '@libsql/client'

const TURSO_URL = 'libsql://sgtx-fortleem.aws-us-east-1.turso.io'
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA'

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

const DCSA_TABLES = [
  // DCSA eBL
  `CREATE TABLE IF NOT EXISTS DcsaElectronicBL (
    id TEXT PRIMARY KEY,
    eblId TEXT UNIQUE,
    ustn TEXT, shipmentId TEXT, tradeId TEXT,
    carrierGtid TEXT, shipperGtid TEXT, consigneeGtid TEXT, notifyPartyGtid TEXT,
    bookingId TEXT,
    siStatus TEXT DEFAULT 'DRAFT', siSubmittedAt TEXT, siAcceptedAt TEXT,
    tdStatus TEXT DEFAULT 'NOT_ISSUED', tdIssuedAt TEXT, tdSurrenderedAt TEXT,
    blNumber TEXT, blType TEXT DEFAULT 'ORIGINAL',
    pol TEXT, pod TEXT, placeOfReceipt TEXT, placeOfDelivery TEXT,
    vesselName TEXT, vesselImo TEXT, voyageNumber TEXT,
    cargoDescription TEXT, grossWeightKg REAL, netWeightKg REAL,
    numberOfPackages INTEGER, packageType TEXT, containerNumbers TEXT,
    dcsaVersion TEXT DEFAULT '3.0.0', isDCSACompliant INTEGER DEFAULT 0,
    platformId TEXT, platformTransferRef TEXT,
    carrierSignature TEXT, shipperSignature TEXT, consigneeEndorsement TEXT,
    rawPayload TEXT, createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ebl_ustn ON DcsaElectronicBL(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ebl_carrier ON DcsaElectronicBL(carrierGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ebl_si ON DcsaElectronicBL(siStatus)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ebl_td ON DcsaElectronicBL(tdStatus)`,
  
  // DCSA Tracking Event
  `CREATE TABLE IF NOT EXISTS DcsaTrackingEvent (
    id TEXT PRIMARY KEY,
    ustn TEXT, shipmentId TEXT, containerId TEXT, bookingId TEXT,
    eventType TEXT, eventLocation TEXT, eventLocationName TEXT,
    eventClassifier TEXT DEFAULT 'ACTUAL',
    eventDateTime TEXT, estimatedDateTime TEXT,
    transportType TEXT, vesselName TEXT, vesselImo TEXT, voyageNumber TEXT,
    dcsaVersion TEXT DEFAULT '2.0.0', isDCSACompliant INTEGER DEFAULT 0,
    source TEXT DEFAULT 'CARRIER_API', rawPayload TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_track_ustn ON DcsaTrackingEvent(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_track_container ON DcsaTrackingEvent(containerId)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_track_event ON DcsaTrackingEvent(eventType)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_track_date ON DcsaTrackingEvent(eventDateTime)`,
  
  // DCSA JIT Port Call
  `CREATE TABLE IF NOT EXISTS DcsaJitPortCall (
    id TEXT PRIMARY KEY,
    ustn TEXT, vesselImo TEXT, vesselName TEXT, voyageNumber TEXT,
    portUnlocode TEXT, terminalCode TEXT,
    requestedArrival TEXT, plannedArrival TEXT, estimatedArrival TEXT, actualArrival TEXT,
    requestedDeparture TEXT, plannedDeparture TEXT, estimatedDeparture TEXT, actualDeparture TEXT,
    berthId TEXT, berthWindowStart TEXT, berthWindowEnd TEXT,
    jitStatus TEXT DEFAULT 'REQUESTED',
    fuelSavingKg REAL, co2ReductionKg REAL, waitingTimeHours REAL,
    dcsaVersion TEXT DEFAULT '1.0.0', isDCSACompliant INTEGER DEFAULT 0,
    rawPayload TEXT, createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_jit_ustn ON DcsaJitPortCall(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_jit_vessel ON DcsaJitPortCall(vesselImo)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_jit_port ON DcsaJitPortCall(portUnlocode)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_jit_status ON DcsaJitPortCall(jitStatus)`,
  
  // DCSA Commercial Schedule
  `CREATE TABLE IF NOT EXISTS DcsaCommercialSchedule (
    id TEXT PRIMARY KEY,
    carrierGtid TEXT, vesselImo TEXT, vesselName TEXT, voyageNumber TEXT, serviceCode TEXT,
    polUnlocode TEXT, podUnlocode TEXT,
    departureTime TEXT, arrivalTime TEXT, cutoffTime TEXT, cyCutoffTime TEXT,
    scheduleStatus TEXT DEFAULT 'SCHEDULED', delayHours REAL, delayReason TEXT,
    dcsaVersion TEXT DEFAULT '1.0.0', isDCSACompliant INTEGER DEFAULT 0,
    rawPayload TEXT, createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_cs_carrier ON DcsaCommercialSchedule(carrierGtid)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_cs_vessel ON DcsaCommercialSchedule(vesselImo)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_cs_pol ON DcsaCommercialSchedule(polUnlocode)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_cs_pod ON DcsaCommercialSchedule(podUnlocode)`,
  
  // DCSA IoT Reading
  `CREATE TABLE IF NOT EXISTS DcsaIoTReading (
    id TEXT PRIMARY KEY,
    ustn TEXT, shipmentId TEXT, containerId TEXT,
    timestamp TEXT,
    lat REAL, lng REAL,
    setpointTempC REAL, actualTempC REAL, supplyAirTempC REAL, returnAirTempC REAL,
    humidityPct REAL, o2Pct REAL, co2Pct REAL,
    powerStatus TEXT, fuelLevelPct REAL, batteryVoltage REAL,
    doorOpen INTEGER DEFAULT 0, doorOpenCount INTEGER DEFAULT 0,
    shockGForce REAL, tiltAngle REAL,
    dcsaVersion TEXT DEFAULT '1.0.0', isDCSACompliant INTEGER DEFAULT 0,
    source TEXT DEFAULT 'CARRIER', deviceId TEXT, rawPayload TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_iot_ustn ON DcsaIoTReading(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_iot_container ON DcsaIoTReading(containerId)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_iot_time ON DcsaIoTReading(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_iot_source ON DcsaIoTReading(source)`,
  
  // DCSA Gate Move
  `CREATE TABLE IF NOT EXISTS DcsaGateMove (
    id TEXT PRIMARY KEY,
    ustn TEXT, shipmentId TEXT, containerId TEXT,
    moveType TEXT, direction TEXT,
    terminalCode TEXT, portUnlocode TEXT,
    moveDateTime TEXT, plannedDateTime TEXT,
    truckId TEXT, driverId TEXT,
    dcsaVersion TEXT DEFAULT '1.0.0', isDCSACompliant INTEGER DEFAULT 0,
    source TEXT DEFAULT 'TERMINAL_API', rawPayload TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_gate_ustn ON DcsaGateMove(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_gate_container ON DcsaGateMove(containerId)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_gate_type ON DcsaGateMove(moveType)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_gate_date ON DcsaGateMove(moveDateTime)`,
  
  // DCSA Load List & Bay Plan
  `CREATE TABLE IF NOT EXISTS DcsaLoadListBayPlan (
    id TEXT PRIMARY KEY,
    ustn TEXT, vesselImo TEXT, vesselName TEXT, voyageNumber TEXT,
    portUnlocode TEXT, planType TEXT,
    containers TEXT,
    dcsaVersion TEXT DEFAULT '1.0.0', isDCSACompliant INTEGER DEFAULT 0,
    planDate TEXT, rawPayload TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ll_ustn ON DcsaLoadListBayPlan(ustn)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ll_vessel ON DcsaLoadListBayPlan(vesselImo)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ll_port ON DcsaLoadListBayPlan(portUnlocode)`,
  `CREATE INDEX IF NOT EXISTS idx_dcsa_ll_type ON DcsaLoadListBayPlan(planType)`,
]

async function main() {
  console.log('Creating DCSA tables...')
  for (const sql of DCSA_TABLES) {
    try {
      await client.execute(sql)
      const label = sql.substring(0, 80).replace(/\n/g, ' ')
      console.log(`  ✓ ${label}...`)
    } catch (err: any) {
      console.error(`  ✗ Error: ${err.message}`)
      console.error(`    SQL: ${sql.substring(0, 120)}...`)
    }
  }
  console.log('DCSA tables created successfully.')
}

main().catch(console.error)
