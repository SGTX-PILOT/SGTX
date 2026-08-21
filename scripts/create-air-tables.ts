/**
 * CREATE-AIR-TURSO-TABLES
 * ----------------------
 * Creates the 14 Prisma models for the Air Cargo Engine as physical
 * SQLite/libSQL tables on the Turso remote database, then seeds:
 *   - AirJurisdictionAdapter with 10 supported jurisdictions (EG=ACTIVE, the
 *     other 9 = NOT_YET_ACTIVE).
 *   - Airport with the 18 major cargo airports (CAI, DXB, JED, RUH, AUH, DOH,
 *     KWI, BAH, MCT, AMM, BGW, FRA, CDG, LHR, JFK, LAX, HKG, SIN).
 *
 * Why not `prisma db push`? Prisma db push would also drop/recreate shadow
 * tables and is harder to make idempotent on a shared Turso instance. This
 * script uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
 * so it can be safely re-run. Seeding uses `INSERT OR IGNORE` so re-runs
 * do not duplicate existing rows.
 *
 * Type mapping (Prisma -> SQLite/libSQL):
 *   String    -> TEXT
 *   Int       -> INTEGER
 *   Float     -> REAL
 *   Boolean   -> BOOLEAN   (SQLite type affinity = INTEGER; stored as 0/1)
 *   DateTime  -> DATETIME
 *
 * Defaults:
 *   @default(now())                 -> DEFAULT CURRENT_TIMESTAMP
 *   @default(false) / @default(true) -> DEFAULT 0 / DEFAULT 1
 *   @default("...") / @default(0)    -> DEFAULT literal
 *   @default(cuid())                 -> no DB default; id generated client-side
 *
 * Constraints:
 *   @id @default(cuid())  -> TEXT PRIMARY KEY
 *   @unique               -> UNIQUE column constraint
 *   @@unique([a, b, c])   -> UNIQUE(a, b, c) table constraint
 *   @@index([a, b])       -> CREATE INDEX ON table(a, b)
 *
 * IMPORTANT: A stale `DATABASE_URL=file:...` shell export can override .env.
 * To avoid that, we hard-code the Turso URL/token here and re-set
 * process.env.DATABASE_URL before instantiating the client. The shell
 * DATABASE_URL passed on the command line is still respected ONLY if it
 * starts with `libsql://`; otherwise we fall back to the hard-coded one.
 *
 * Usage:
 *   cd /home/z/my-project
 *   DATABASE_URL="libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=<TOKEN>" \
 *     bun run scripts/create-air-tables.ts
 */

import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Force Turso URL — ignore any stale shell `DATABASE_URL=file:...` export.
// ---------------------------------------------------------------------------
const TURSO_TOKEN =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";

// Honour a valid libsql:// URL passed via the shell, otherwise use the
// hard-coded Turso URL. This guarantees we never silently hit a local file
// even if the shell has a stale `DATABASE_URL=file:...` export.
const SHELL_URL = process.env.DATABASE_URL ?? "";
const TURSO_URL = SHELL_URL.startsWith("libsql://")
  ? SHELL_URL
  : `libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=${TURSO_TOKEN}`;

process.env.DATABASE_URL = TURSO_URL; // override stale shell export

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------
type DdlBlock = { table: string; create: string; indexes: string[] };

const SCHEMA: DdlBlock[] = [
  // ----- 1. AirCargoShipment ---------------------------------------------
  {
    table: "AirCargoShipment",
    create: `CREATE TABLE IF NOT EXISTS AirCargoShipment (
  id                  TEXT PRIMARY KEY,
  ustn                TEXT NOT NULL,
  shipperGtid         TEXT,
  consigneeGtid       TEXT,
  forwarderGtid       TEXT,
  originAirport       TEXT NOT NULL,
  destinationAirport  TEXT NOT NULL,
  transitAirports     TEXT,
  serviceType         TEXT,
  bookingStatus       TEXT NOT NULL DEFAULT 'DRAFT',
  cargoStatus         TEXT NOT NULL DEFAULT 'PENDING',
  customsStatus       TEXT NOT NULL DEFAULT 'PENDING',
  securityStatus      TEXT NOT NULL DEFAULT 'PENDING',
  deliveryStatus      TEXT NOT NULL DEFAULT 'PENDING',
  totalPieces         INTEGER NOT NULL DEFAULT 0,
  totalGrossWeight    REAL NOT NULL DEFAULT 0,
  totalVolume         REAL,
  chargeableWeight    REAL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  plannedDeparture    DATETIME,
  plannedArrival       DATETIME,
  deliveryWindow      TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_aircargoshipment_ustn       ON AirCargoShipment(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_aircargoshipment_bookingstatus ON AirCargoShipment(bookingStatus)",
      "CREATE INDEX IF NOT EXISTS idx_aircargoshipment_origin_dest ON AirCargoShipment(originAirport, destinationAirport)",
    ],
  },

  // ----- 2. AirFlightLeg -------------------------------------------------
  {
    table: "AirFlightLeg",
    create: `CREATE TABLE IF NOT EXISTS AirFlightLeg (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  sequence            INTEGER NOT NULL,
  flightNumber        TEXT,
  operatingAirline    TEXT,
  marketingAirline   TEXT,
  originAirport       TEXT NOT NULL,
  destinationAirport  TEXT NOT NULL,
  scheduledDeparture  DATETIME,
  scheduledArrival    DATETIME,
  estimatedDeparture DATETIME,
  estimatedArrival   DATETIME,
  actualDeparture    DATETIME,
  actualArrival       DATETIME,
  bookingReference   TEXT,
  allocatedWeight     REAL,
  allocatedVolume    REAL,
  aircraftType       TEXT,
  cargoCapacity      REAL,
  status             TEXT NOT NULL DEFAULT 'SCHEDULED',
  createdAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airflightleg_shipmentid ON AirFlightLeg(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_airflightleg_ustn       ON AirFlightLeg(ustn)",
    ],
  },

  // ----- 3. Airport ------------------------------------------------------
  {
    table: "Airport",
    create: `CREATE TABLE IF NOT EXISTS Airport (
  id                       TEXT PRIMARY KEY,
  iataCode                 TEXT NOT NULL UNIQUE,
  icaoCode                 TEXT,
  country                  TEXT NOT NULL,
  airportName              TEXT NOT NULL,
  cargoTerminals            TEXT,
  hasCustoms                BOOLEAN NOT NULL DEFAULT 1,
  ghaList                   TEXT,
  securityFacilities        TEXT,
  coldChainFacilities      BOOLEAN NOT NULL DEFAULT 0,
  dgCapability             BOOLEAN NOT NULL DEFAULT 0,
  liveAnimalCapability     BOOLEAN NOT NULL DEFAULT 0,
  pharmaCapability         BOOLEAN NOT NULL DEFAULT 0,
  oversizedCapability      BOOLEAN NOT NULL DEFAULT 0,
  operatingHours           TEXT,
  cargoCutoffMins          INTEGER,
  customsCutoffMins        INTEGER,
  securityCutoffMins      INTEGER,
  airlineCutoffMins       INTEGER,
  buildupCutoffMins       INTEGER,
  source                   TEXT,
  sourceVersion            TEXT,
  effectiveFrom            DATETIME,
  effectiveUntil          DATETIME,
  createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airport_iatacode ON Airport(iataCode)",
      "CREATE INDEX IF NOT EXISTS idx_airport_country  ON Airport(country)",
    ],
  },

  // ----- 4. AirWaybill ---------------------------------------------------
  {
    table: "AirWaybill",
    create: `CREATE TABLE IF NOT EXISTS AirWaybill (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  awbType             TEXT NOT NULL,
  awbNumber           TEXT NOT NULL,
  airlinePrefix       TEXT,
  serial              TEXT,
  shipper             TEXT,
  consignee           TEXT,
  origin              TEXT NOT NULL,
  destination        TEXT NOT NULL,
  pieces              INTEGER NOT NULL DEFAULT 0,
  grossWeight         REAL NOT NULL DEFAULT 0,
  chargeableWeight    REAL,
  volume              REAL,
  commodity           TEXT,
  rate                REAL,
  charges             REAL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  eAwbStatus          TEXT NOT NULL DEFAULT 'PAPER',
  documentHash        TEXT,
  version             INTEGER NOT NULL DEFAULT 1,
  issuedAt            DATETIME,
  amendedAt          DATETIME,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE,
  UNIQUE (awbType, awbNumber)
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airwaybill_shipmentid ON AirWaybill(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_airwaybill_ustn       ON AirWaybill(ustn)",
    ],
  },

  // ----- 5. CargoPiece ---------------------------------------------------
  {
    table: "CargoPiece",
    create: `CREATE TABLE IF NOT EXISTS CargoPiece (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  pieceId             TEXT NOT NULL,
  mawbNumber          TEXT,
  hawbNumber          TEXT,
  packageType         TEXT,
  sscc                TEXT,
  length              REAL,
  width               REAL,
  height              REAL,
  actualWeight       REAL,
  commodity           TEXT,
  hsCode              TEXT,
  lot                 TEXT,
  serialNumber        TEXT,
  securityState       TEXT NOT NULL DEFAULT 'PENDING',
  customsState        TEXT NOT NULL DEFAULT 'PENDING',
  currentLocation     TEXT,
  currentUld          TEXT,
  temperatureMin      REAL,
  temperatureMax      REAL,
  dgFlag              BOOLEAN NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'EXPECTED',
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_cargopiece_shipmentid ON CargoPiece(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_cargopiece_ustn       ON CargoPiece(ustn)",
    ],
  },

  // ----- 6. UldAssignment ------------------------------------------------
  {
    table: "UldAssignment",
    create: `CREATE TABLE IF NOT EXISTS UldAssignment (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  uldId               TEXT NOT NULL,
  uldOwner            TEXT,
  uldType             TEXT,
  uldSerial           TEXT,
  tareWeight          REAL,
  maxGrossWeight      REAL,
  dimensions          TEXT,
  aircraftCompatible  TEXT,
  condition           TEXT NOT NULL DEFAULT 'SERVICEABLE',
  location            TEXT,
  buildUpState        TEXT NOT NULL DEFAULT 'NOT_STARTED',
  breakdownState      TEXT NOT NULL DEFAULT 'NOT_STARTED',
  totalPieces         INTEGER NOT NULL DEFAULT 0,
  totalWeight         REAL NOT NULL DEFAULT 0,
  utilizationPct      REAL,
  buildPlan           TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_uldassignment_shipmentid ON UldAssignment(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_uldassignment_uldid     ON UldAssignment(uldId)",
    ],
  },

  // ----- 7. AirSecurityRecord -------------------------------------------
  {
    table: "AirSecurityRecord",
    create: `CREATE TABLE IF NOT EXISTS AirSecurityRecord (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  screeningType      TEXT,
  screeningFacility  TEXT,
  screeningOperator   TEXT,
  securityDeclaration TEXT,
  securityStatus      TEXT NOT NULL DEFAULT 'PENDING',
  screeningTimestamp  DATETIME,
  reScreenRequired    BOOLEAN NOT NULL DEFAULT 0,
  reScreenReason      TEXT,
  source              TEXT,
  eCsdStatus          TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  eCsdReference       TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airsecurityrecord_shipmentid    ON AirSecurityRecord(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_airsecurityrecord_securitystatus ON AirSecurityRecord(securityStatus)",
    ],
  },

  // ----- 8. AirDgRecord --------------------------------------------------
  {
    table: "AirDgRecord",
    create: `CREATE TABLE IF NOT EXISTS AirDgRecord (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  unNumber            TEXT NOT NULL,
  properShippingName  TEXT,
  dgClass             TEXT,
  division            TEXT,
  packingGroup        TEXT,
  quantity            REAL,
  unit                TEXT,
  netQuantity         REAL,
  packageType         TEXT,
  packingInstruction  TEXT,
  handlingCode        TEXT,
  lithiumBatteryInfo  TEXT,
  radioactiveData     TEXT,
  aircraftLimitation  TEXT,
  operatorRestrictions TEXT,
  originRestrictions  TEXT,
  destinationRestrictions TEXT,
  declarationStatus   TEXT NOT NULL DEFAULT 'PENDING',
  eDgdStatus          TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  eDgdReference       TEXT,
  dgVersion           TEXT,
  effectiveFrom       DATETIME,
  validationResult    TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airdgrecord_shipmentid ON AirDgRecord(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_airdgrecord_unnumber  ON AirDgRecord(unNumber)",
    ],
  },

  // ----- 9. AirCustomsOperation -----------------------------------------
  {
    table: "AirCustomsOperation",
    create: `CREATE TABLE IF NOT EXISTS AirCustomsOperation (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  country             TEXT NOT NULL,
  airport             TEXT,
  operationType       TEXT NOT NULL,
  declarationNumber   TEXT,
  governmentReference TEXT,
  brokerGtid          TEXT,
  mawbNumber          TEXT,
  hawbNumbers         TEXT,
  manifestReference   TEXT,
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  submissionTime      DATETIME,
  acceptanceTime      DATETIME,
  inspectionTime      DATETIME,
  releaseTime         DATETIME,
  rejectionReason     TEXT,
  amendmentStatus     TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_aircustomsoperation_shipmentid        ON AirCustomsOperation(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_aircustomsoperation_country_optype    ON AirCustomsOperation(country, operationType)",
    ],
  },

  // ----- 10. AirIrregularity --------------------------------------------
  {
    table: "AirIrregularity",
    create: `CREATE TABLE IF NOT EXISTS AirIrregularity (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  irregularityType    TEXT NOT NULL,
  description         TEXT,
  flightNumber        TEXT,
  airport             TEXT,
  severity            TEXT NOT NULL DEFAULT 'MEDIUM',
  status              TEXT NOT NULL DEFAULT 'OPEN',
  aiEscalationLevel   TEXT,
  resolvedAt          DATETIME,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airirregularity_shipmentid        ON AirIrregularity(shipmentId)",
      "CREATE INDEX IF NOT EXISTS idx_airirregularity_irregularitytype  ON AirIrregularity(irregularityType)",
    ],
  },

  // ----- 11. AirCargoIotEvent -------------------------------------------
  {
    table: "AirCargoIotEvent",
    create: `CREATE TABLE IF NOT EXISTS AirCargoIotEvent (
  id                  TEXT PRIMARY KEY,
  shipmentId          TEXT NOT NULL,
  ustn                TEXT NOT NULL,
  deviceId            TEXT,
  eventType           TEXT NOT NULL,
  value               REAL,
  unit                TEXT,
  latitude            REAL,
  longitude           REAL,
  airport             TEXT,
  uldId              TEXT,
  flightNumber        TEXT,
  anomaly             BOOLEAN NOT NULL DEFAULT 0,
  anomalyType         TEXT,
  recordedAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipmentId) REFERENCES AirCargoShipment(id) ON DELETE CASCADE
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_aircargoiotevent_shipmentid_recorded ON AirCargoIotEvent(shipmentId, recordedAt)",
      "CREATE INDEX IF NOT EXISTS idx_aircargoiotevent_ustn                 ON AirCargoIotEvent(ustn)",
    ],
  },

  // ----- 12. AirCargoBooking --------------------------------------------
  {
    table: "AirCargoBooking",
    create: `CREATE TABLE IF NOT EXISTS AirCargoBooking (
  id                  TEXT PRIMARY KEY,
  ustn                TEXT NOT NULL,
  shipmentId          TEXT,
  airlineGtid         TEXT,
  forwarderGtid       TEXT,
  originAirport       TEXT NOT NULL,
  destinationAirport  TEXT NOT NULL,
  flightNumber        TEXT,
  flightDate          DATETIME,
  serviceLevel        TEXT,
  totalPieces         INTEGER NOT NULL DEFAULT 0,
  totalWeight         REAL NOT NULL DEFAULT 0,
  totalVolume         REAL,
  chargeableWeight    REAL,
  dgFlag              BOOLEAN NOT NULL DEFAULT 0,
  pharmaFlag          BOOLEAN NOT NULL DEFAULT 0,
  temperatureSetPoint REAL,
  specialHandling     TEXT,
  deliveryWindow      TEXT,
  status              TEXT NOT NULL DEFAULT 'REQUESTED',
  bookingReference    TEXT,
  allotmentReference  TEXT,
  quotedRate          REAL,
  quotedCurrency      TEXT NOT NULL DEFAULT 'USD',
  confirmedAt         DATETIME,
  cancelledAt         DATETIME,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_aircargobooking_ustn        ON AirCargoBooking(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_aircargobooking_airlinegtid ON AirCargoBooking(airlineGtid)",
      "CREATE INDEX IF NOT EXISTS idx_aircargobooking_status      ON AirCargoBooking(status)",
    ],
  },

  // ----- 13. AirReconciliationEvent -------------------------------------
  {
    table: "AirReconciliationEvent",
    create: `CREATE TABLE IF NOT EXISTS AirReconciliationEvent (
  id                  TEXT PRIMARY KEY,
  ustn                TEXT NOT NULL,
  reconciliationType TEXT NOT NULL,
  expectedValue       TEXT,
  actualValue         TEXT,
  status              TEXT NOT NULL DEFAULT 'OPEN',
  resolvedAt          DATETIME,
  resolvedBy          TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airreconciliationevent_ustn   ON AirReconciliationEvent(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_airreconciliationevent_status ON AirReconciliationEvent(status)",
    ],
  },

  // ----- 14. AirJurisdictionAdapter -------------------------------------
  {
    table: "AirJurisdictionAdapter",
    create: `CREATE TABLE IF NOT EXISTS AirJurisdictionAdapter (
  id                  TEXT PRIMARY KEY,
  countryCode         TEXT NOT NULL UNIQUE,
  adapterName         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'NOT_YET_ACTIVE',
  capabilities        TEXT,
  airportCodes        TEXT,
  apiEndpoint         TEXT,
  portalUrl           TEXT,
  operatingMode       TEXT NOT NULL DEFAULT 'MANUAL_REQUIRED',
  lastHealthCheck     DATETIME,
  healthStatus        TEXT,
  version             TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_airjurisdictionadapter_countrycode ON AirJurisdictionAdapter(countryCode)",
    ],
  },
];

// ---------------------------------------------------------------------------
// AirJurisdictionAdapter seed data — 10 jurisdictions per spec.
// EG is the only ACTIVE adapter; the rest are NOT_YET_ACTIVE.
// ---------------------------------------------------------------------------
const AIR_JURISDICTION_SEED: {
  countryCode: string;
  adapterName: string;
  status: "ACTIVE" | "NOT_YET_ACTIVE";
  operatingMode: "API" | "MANUAL_REQUIRED";
  healthStatus: "HEALTHY" | "UNKNOWN";
  capabilities: string[];
  airportCodes: string[];
  version: string;
}[] = [
  {
    countryCode: "EG",
    adapterName: "Egypt Air Cargo Adapter (Nafeza / ACI Air)",
    status: "ACTIVE",
    operatingMode: "API",
    healthStatus: "HEALTHY",
    capabilities: [
      "EXPORT_DECLARATION",
      "IMPORT_DECLARATION",
      "TRANSIT_DECLARATION",
      "MANIFEST",
      "ACI_AIR",
      "SECURITY_FILING",
      "RELEASE",
    ],
    airportCodes: ["CAI", "ALY", "HRG", "SSH"],
    version: "1.0.0",
  },
  {
    countryCode: "JO",
    adapterName: "Jordan Air Cargo Adapter (ASYCUDA)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["AMM", "AQJ"],
    version: "0.1.0",
  },
  {
    countryCode: "SA",
    adapterName: "Saudi Air Cargo Adapter (FASAH / SITA)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: [
      "EXPORT_DECLARATION",
      "IMPORT_DECLARATION",
      "TRANSIT_DECLARATION",
      "MANIFEST",
    ],
    airportCodes: ["JED", "RUH", "DMM", "MED"],
    version: "0.1.0",
  },
  {
    countryCode: "AE",
    adapterName: "UAE Air Cargo Adapter (Mirsal 2 / Dubai Trade)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: [
      "EXPORT_DECLARATION",
      "IMPORT_DECLARATION",
      "TRANSIT_DECLARATION",
      "MANIFEST",
      "ACI_AIR",
    ],
    airportCodes: ["DXB", "AUH", "SHJ", "FJR"],
    version: "0.1.0",
  },
  {
    countryCode: "KW",
    adapterName: "Kuwait Air Cargo Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["KWI"],
    version: "0.1.0",
  },
  {
    countryCode: "QA",
    adapterName: "Qatar Air Cargo Adapter (Al-Nadeeb)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["DOH"],
    version: "0.1.0",
  },
  {
    countryCode: "BH",
    adapterName: "Bahrain Air Cargo Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["BAH"],
    version: "0.1.0",
  },
  {
    countryCode: "OM",
    adapterName: "Oman Air Cargo Adapter (Bayan)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["MCT", "SLL"],
    version: "0.1.0",
  },
  {
    countryCode: "IQ",
    adapterName: "Iraq Air Cargo Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["BGW", "BSR", "EBL"],
    version: "0.1.0",
  },
  {
    countryCode: "LY",
    adapterName: "Libya Air Cargo Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "IMPORT_DECLARATION", "TRANSIT_DECLARATION"],
    airportCodes: ["TIP", "MJI"],
    version: "0.1.0",
  },
];

// ---------------------------------------------------------------------------
// Airport seed data — 18 major cargo airports per spec.
// ---------------------------------------------------------------------------
const AIRPORT_SEED: {
  iataCode: string;
  icaoCode: string;
  country: string;
  airportName: string;
  hasCustoms: boolean;
  coldChainFacilities: boolean;
  dgCapability: boolean;
  liveAnimalCapability: boolean;
  pharmaCapability: boolean;
  oversizedCapability: boolean;
  cargoCutoffMins: number;
  customsCutoffMins: number;
  securityCutoffMins: number;
  airlineCutoffMins: number;
  buildupCutoffMins: number;
}[] = [
  // EG — Cairo
  {
    iataCode: "CAI", icaoCode: "HECA", country: "EG",
    airportName: "Cairo International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // AE — Dubai
  {
    iataCode: "DXB", icaoCode: "OMDB", country: "AE",
    airportName: "Dubai International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // SA — Jeddah
  {
    iataCode: "JED", icaoCode: "OEJN", country: "SA",
    airportName: "King Abdulaziz International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // SA — Riyadh
  {
    iataCode: "RUH", icaoCode: "OERK", country: "SA",
    airportName: "King Khalid International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // AE — Abu Dhabi
  {
    iataCode: "AUH", icaoCode: "OMAA", country: "AE",
    airportName: "Abu Dhabi International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // QA — Doha
  {
    iataCode: "DOH", icaoCode: "OTHH", country: "QA",
    airportName: "Hamad International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // KW — Kuwait
  {
    iataCode: "KWI", icaoCode: "OKBK", country: "KW",
    airportName: "Kuwait International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: false,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // BH — Bahrain
  {
    iataCode: "BAH", icaoCode: "OBBI", country: "BH",
    airportName: "Bahrain International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: false,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // OM — Muscat
  {
    iataCode: "MCT", icaoCode: "OOMS", country: "OM",
    airportName: "Muscat International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: false,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // JO — Amman
  {
    iataCode: "AMM", icaoCode: "OJAI", country: "JO",
    airportName: "Queen Alia International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: false,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // IQ — Baghdad
  {
    iataCode: "BGW", icaoCode: "ORBI", country: "IQ",
    airportName: "Baghdad International Airport",
    hasCustoms: true, coldChainFacilities: false, dgCapability: true,
    liveAnimalCapability: false, pharmaCapability: false, oversizedCapability: false,
    cargoCutoffMins: 300, customsCutoffMins: 420, securityCutoffMins: 240,
    airlineCutoffMins: 360, buildupCutoffMins: 420,
  },
  // DE — Frankfurt
  {
    iataCode: "FRA", icaoCode: "EDDF", country: "DE",
    airportName: "Frankfurt am Main Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 180, customsCutoffMins: 300, securityCutoffMins: 150,
    airlineCutoffMins: 240, buildupCutoffMins: 300,
  },
  // FR — Paris CDG
  {
    iataCode: "CDG", icaoCode: "LFPG", country: "FR",
    airportName: "Paris Charles de Gaulle Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 180, customsCutoffMins: 300, securityCutoffMins: 150,
    airlineCutoffMins: 240, buildupCutoffMins: 300,
  },
  // GB — London Heathrow
  {
    iataCode: "LHR", icaoCode: "EGLL", country: "GB",
    airportName: "London Heathrow Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 180, customsCutoffMins: 300, securityCutoffMins: 150,
    airlineCutoffMins: 240, buildupCutoffMins: 300,
  },
  // US — New York JFK
  {
    iataCode: "JFK", icaoCode: "KJFK", country: "US",
    airportName: "John F. Kennedy International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // US — Los Angeles
  {
    iataCode: "LAX", icaoCode: "KLAX", country: "US",
    airportName: "Los Angeles International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 240, customsCutoffMins: 360, securityCutoffMins: 180,
    airlineCutoffMins: 300, buildupCutoffMins: 360,
  },
  // HK — Hong Kong
  {
    iataCode: "HKG", icaoCode: "VHHH", country: "HK",
    airportName: "Hong Kong International Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 180, customsCutoffMins: 300, securityCutoffMins: 150,
    airlineCutoffMins: 240, buildupCutoffMins: 300,
  },
  // SG — Singapore
  {
    iataCode: "SIN", icaoCode: "WSSS", country: "SG",
    airportName: "Singapore Changi Airport",
    hasCustoms: true, coldChainFacilities: true, dgCapability: true,
    liveAnimalCapability: true, pharmaCapability: true, oversizedCapability: true,
    cargoCutoffMins: 180, customsCutoffMins: 300, securityCutoffMins: 150,
    airlineCutoffMins: 240, buildupCutoffMins: 300,
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const client = createClient({ url: TURSO_URL });

  // Sanity-check connectivity
  try {
    const ping = await client.execute("SELECT 1 AS ok");
    if (ping.rows[0]?.ok !== 1) throw new Error("SELECT 1 returned unexpected value");
    console.log("✓ Turso connection OK");
    console.log(`  endpoint: ${TURSO_URL.replace(/authToken=[^&]*/, "authToken=***")}`);
  } catch (err) {
    console.error("✗ Turso connection FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let tablesOk = 0;
  let tablesFailed = 0;
  let indexesOk = 0;
  let indexesFailed = 0;
  const failures: { table: string; phase: "table" | "index" | "seed"; sql: string; error: string }[] = [];

  for (const block of SCHEMA) {
    // Create table
    try {
      await client.execute(block.create);
      tablesOk++;
      console.log(`✓ table  ${block.table}`);
    } catch (err) {
      tablesFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: block.table, phase: "table", sql: block.create, error: msg });
      console.error(`✗ table  ${block.table} → ${msg}`);
      continue; // skip indexes if the table failed
    }

    // Create indexes
    for (const idxSql of block.indexes) {
      try {
        await client.execute(idxSql);
        indexesOk++;
        console.log(`  ✓ index ${idxSql.match(/ON\s+(\w+)\s*\(([^)]+)\)/)?.[0] ?? idxSql}`);
      } catch (err) {
        indexesFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ table: block.table, phase: "index", sql: idxSql, error: msg });
        console.error(`  ✗ index ${block.table} → ${msg}`);
      }
    }
  }

  // ----- Seed AirJurisdictionAdapter ------------------------------------
  console.log("\n--- Seeding AirJurisdictionAdapter ---");
  let jurInserted = 0;
  let jurSkipped = 0;
  let jurFailed = 0;
  const jurInsertSql = `INSERT OR IGNORE INTO AirJurisdictionAdapter
    (id, countryCode, adapterName, status, capabilities, airportCodes, operatingMode, healthStatus, version, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

  for (const j of AIR_JURISDICTION_SEED) {
    try {
      const res = await client.execute({
        sql: jurInsertSql,
        args: [
          randomUUID(),
          j.countryCode,
          j.adapterName,
          j.status,
          JSON.stringify(j.capabilities),
          JSON.stringify(j.airportCodes),
          j.operatingMode,
          j.healthStatus,
          j.version,
        ],
      });
      if (res.rowsAffected > 0) {
        jurInserted++;
        console.log(`  ✓ seeded ${j.countryCode} (${j.status})`);
      } else {
        jurSkipped++;
        console.log(`  · skipped ${j.countryCode} (already present)`);
      }
    } catch (err) {
      jurFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: "AirJurisdictionAdapter", phase: "seed", sql: jurInsertSql, error: msg });
      console.error(`  ✗ seed ${j.countryCode} → ${msg}`);
    }
  }

  // ----- Seed Airport ---------------------------------------------------
  console.log("\n--- Seeding Airport ---");
  let apInserted = 0;
  let apSkipped = 0;
  let apFailed = 0;
  const apInsertSql = `INSERT OR IGNORE INTO Airport
    (id, iataCode, icaoCode, country, airportName, hasCustoms,
     coldChainFacilities, dgCapability, liveAnimalCapability,
     pharmaCapability, oversizedCapability,
     cargoCutoffMins, customsCutoffMins, securityCutoffMins,
     airlineCutoffMins, buildupCutoffMins,
     createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

  for (const a of AIRPORT_SEED) {
    try {
      const res = await client.execute({
        sql: apInsertSql,
        args: [
          randomUUID(),
          a.iataCode,
          a.icaoCode,
          a.country,
          a.airportName,
          a.hasCustoms ? 1 : 0,
          a.coldChainFacilities ? 1 : 0,
          a.dgCapability ? 1 : 0,
          a.liveAnimalCapability ? 1 : 0,
          a.pharmaCapability ? 1 : 0,
          a.oversizedCapability ? 1 : 0,
          a.cargoCutoffMins,
          a.customsCutoffMins,
          a.securityCutoffMins,
          a.airlineCutoffMins,
          a.buildupCutoffMins,
        ],
      });
      if (res.rowsAffected > 0) {
        apInserted++;
        console.log(`  ✓ seeded ${a.iataCode} (${a.country}) — ${a.airportName}`);
      } else {
        apSkipped++;
        console.log(`  · skipped ${a.iataCode} (already present)`);
      }
    } catch (err) {
      apFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: "Airport", phase: "seed", sql: apInsertSql, error: msg });
      console.error(`  ✗ seed ${a.iataCode} → ${msg}`);
    }
  }

  // ----- Verification pass: confirm each table actually exists ----------
  console.log("\n--- Verification ---");
  const existingTables = new Set<string>();
  try {
    const res = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
    );
    for (const row of res.rows) {
      if (typeof row.name === "string") existingTables.add(row.name);
    }
  } catch (err) {
    console.error("✗ Failed to read sqlite_master:", err instanceof Error ? err.message : err);
  }

  let verified = 0;
  const missing: string[] = [];
  for (const block of SCHEMA) {
    if (existingTables.has(block.table)) {
      verified++;
    } else {
      missing.push(block.table);
    }
  }

  // ----- Verify AirJurisdictionAdapter row count -----------------------
  let jurCount = 0;
  let jurActive = 0;
  try {
    const res = await client.execute(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS a FROM AirJurisdictionAdapter"
    );
    jurCount = Number((res.rows[0] as any)?.n ?? 0);
    jurActive = Number((res.rows[0] as any)?.a ?? 0);
  } catch (err) {
    console.error("✗ Failed to count AirJurisdictionAdapter rows:", err instanceof Error ? err.message : err);
  }

  // ----- Verify Airport row count --------------------------------------
  let apCount = 0;
  try {
    const res = await client.execute("SELECT COUNT(*) AS n FROM Airport");
    apCount = Number((res.rows[0] as any)?.n ?? 0);
  } catch (err) {
    console.error("✗ Failed to count Airport rows:", err instanceof Error ? err.message : err);
  }

  console.log("\n======================== SUMMARY ========================");
  console.log(`Models targeted      : ${SCHEMA.length}`);
  console.log(`Tables created OK    : ${tablesOk}`);
  console.log(`Tables FAILED        : ${tablesFailed}`);
  console.log(`Indexes created OK   : ${indexesOk}`);
  console.log(`Indexes FAILED       : ${indexesFailed}`);
  console.log(`Verified on Turso    : ${verified}/${SCHEMA.length}`);
  if (missing.length) console.log(`Missing from Turso   : ${missing.join(", ")}`);
  console.log(`--- AirJurisdictionAdapter seed ---`);
  console.log(`Seed rows inserted   : ${jurInserted}`);
  console.log(`Seed rows skipped    : ${jurSkipped} (already existed)`);
  console.log(`Seed rows FAILED     : ${jurFailed}`);
  console.log(`Total adapter rows   : ${jurCount}`);
  console.log(`Active adapters      : ${jurActive}`);
  console.log(`--- Airport seed ---`);
  console.log(`Seed rows inserted   : ${apInserted}`);
  console.log(`Seed rows skipped    : ${apSkipped} (already existed)`);
  console.log(`Seed rows FAILED     : ${apFailed}`);
  console.log(`Total airport rows   : ${apCount}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - [${f.phase}] ${f.table}: ${f.error}`);
    }
  }
  console.log("========================================================");

  client.close();
  process.exit(
    tablesFailed === 0 && missing.length === 0 && jurFailed === 0 && apFailed === 0 ? 0 : 1
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
