/**
 * CREATE-ROAD-TURSO-TABLES
 * ------------------------
 * Creates the 14 Prisma models for the International Road Corridor Engine as
 * physical SQLite/libSQL tables on the Turso remote database, then seeds the
 * JurisdictionAdapter table with the 10 supported jurisdictions.
 *
 * Why not `prisma db push`? Prisma db push would also drop/recreate shadow
 * tables and is harder to make idempotent on a shared Turso instance. This
 * script uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
 * so it can be safely re-run. Seeding uses `INSERT OR IGNORE` so re-runs
 * do not duplicate existing jurisdiction rows.
 *
 * Type mapping (Prisma → SQLite/libSQL):
 *   String    → TEXT
 *   Int       → INTEGER
 *   Float     → REAL
 *   Boolean   → BOOLEAN   (SQLite type affinity = INTEGER; stored as 0/1)
 *   DateTime  → DATETIME
 *
 * Defaults:
 *   @default(now())                → DEFAULT CURRENT_TIMESTAMP
 *   @default(false) / @default(true) → DEFAULT 0 / DEFAULT 1
 *   @default("...") / @default(0)   → DEFAULT literal
 *   @default(cuid())                → no DB default; id generated client-side
 *
 * Constraints:
 *   @id @default(cuid())           → TEXT PRIMARY KEY
 *   @unique                        → UNIQUE column constraint
 *   @@unique([a, b, c])            → UNIQUE(a, b, c) table constraint
 *   @@index([a, b])                → CREATE INDEX ON table(a, b)
 *
 * IMPORTANT: A stale `DATABASE_URL=file:...` shell export can override .env.
 * To avoid that, we hard-code the Turso URL/token here and re-set
 * process.env.DATABASE_URL before instantiating the client.
 *
 * Usage:
 *   cd /home/z/my-project
 *   DATABASE_URL="libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=<TOKEN>" \
 *     bun run scripts/create-road-tables.ts
 *
 * (The inline token below always wins to guarantee we hit Turso and not a
 *  local file, regardless of any stale shell `DATABASE_URL=file:...` export.)
 */

import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Force Turso URL — ignore any stale shell `DATABASE_URL=file:...` export.
// ---------------------------------------------------------------------------
const TURSO_TOKEN =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";
const TURSO_URL = `libsql://sgtx-fortleem.aws-us-east-1.turso.io?authToken=${TURSO_TOKEN}`;

process.env.DATABASE_URL = TURSO_URL; // override stale shell export

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------
type DdlBlock = { table: string; create: string; indexes: string[] };

const SCHEMA: DdlBlock[] = [
  // ----- 1. RoadCorridor ------------------------------------------------
  {
    table: "RoadCorridor",
    create: `CREATE TABLE IF NOT EXISTS RoadCorridor (
  id                    TEXT PRIMARY KEY,
  ustn                  TEXT NOT NULL,
  corridorCode          TEXT NOT NULL,
  routeVersion          INTEGER NOT NULL DEFAULT 1,
  originCountry         TEXT NOT NULL,
  destinationCountry    TEXT NOT NULL,
  transitCountries      TEXT,
  status                TEXT NOT NULL DEFAULT 'DRAFT',
  plannedDeparture      DATETIME,
  plannedArrival        DATETIME,
  earliestDelivery      DATETIME,
  preferredDelivery     DATETIME,
  latestDelivery        DATETIME,
  routeDistance         INTEGER,
  routeDuration         INTEGER,
  approvedRouteGeometry TEXT,
  createdAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_roadcorridor_ustn   ON RoadCorridor(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_roadcorridor_status ON RoadCorridor(status)",
    ],
  },

  // ----- 2. RoadCorridorLeg ---------------------------------------------
  {
    table: "RoadCorridorLeg",
    create: `CREATE TABLE IF NOT EXISTS RoadCorridorLeg (
  id               TEXT PRIMARY KEY,
  corridorId       TEXT NOT NULL,
  ustn             TEXT NOT NULL,
  sequence         INTEGER NOT NULL,
  country          TEXT NOT NULL,
  origin           TEXT NOT NULL,
  destination      TEXT NOT NULL,
  transportMode    TEXT NOT NULL DEFAULT 'ROAD',
  equipmentType    TEXT,
  carrierGtid      TEXT,
  driverId         TEXT,
  vehicleId        TEXT,
  trailerId        TEXT,
  customsRegime    TEXT,
  plannedDeparture DATETIME,
  plannedArrival   DATETIME,
  actualDeparture  DATETIME,
  actualArrival    DATETIME,
  status           TEXT NOT NULL DEFAULT 'PENDING',
  routeGeometry    TEXT,
  ferryOperator    TEXT,
  ferryBookingRef  TEXT,
  ferryVessel      TEXT,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_roadcorridorleg_corridorid ON RoadCorridorLeg(corridorId)",
      "CREATE INDEX IF NOT EXISTS idx_roadcorridorleg_ustn        ON RoadCorridorLeg(ustn)",
    ],
  },

  // ----- 3. BorderCrossing ----------------------------------------------
  {
    table: "BorderCrossing",
    create: `CREATE TABLE IF NOT EXISTS BorderCrossing (
  id                     TEXT PRIMARY KEY,
  corridorId             TEXT NOT NULL,
  legId                  TEXT,
  countryFrom            TEXT NOT NULL,
  countryTo              TEXT NOT NULL,
  borderCode             TEXT NOT NULL,
  borderName             TEXT NOT NULL,
  customsAuthority       TEXT,
  immigrationAuthority   TEXT,
  transportAuthority     TEXT,
  requiredDocuments      TEXT,
  operatingHours         TEXT,
  routeRestrictions      TEXT,
  guaranteeRequirements  TEXT,
  inspectionRequirements TEXT,
  active                 BOOLEAN NOT NULL DEFAULT 1,
  source                 TEXT,
  sourceVersion          TEXT,
  effectiveFrom          DATETIME,
  effectiveUntil         DATETIME,
  createdAt              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_bordercrossing_corridorid ON BorderCrossing(corridorId)",
      "CREATE INDEX IF NOT EXISTS idx_bordercrossing_bordercode ON BorderCrossing(borderCode)",
    ],
  },

  // ----- 4. InternationalVehicle -----------------------------------------
  {
    table: "InternationalVehicle",
    create: `CREATE TABLE IF NOT EXISTS InternationalVehicle (
  id                            TEXT PRIMARY KEY,
  tenantGtid                    TEXT NOT NULL,
  tractorPlate                  TEXT NOT NULL,
  trailerPlate                  TEXT,
  vin                           TEXT,
  chassisNumber                 TEXT,
  registrationCountry           TEXT NOT NULL,
  vehicleType                   TEXT NOT NULL,
  trailerType                   TEXT,
  payloadCapacity               REAL,
  grossVehicleWeight            REAL,
  axleConfiguration             TEXT,
  reeferCapability              BOOLEAN NOT NULL DEFAULT 0,
  reeferUnitId                  TEXT,
  gpsDeviceId                   TEXT,
  insurancePolicy               TEXT,
  insuranceExpiry              DATETIME,
  roadworthinessCertificate     TEXT,
  inspectionExpiry              DATETIME,
  countryPermissions            TEXT,
  dangerousGoodsCapability      BOOLEAN NOT NULL DEFAULT 0,
  status                        TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_internationalvehicle_tenantgtid ON InternationalVehicle(tenantGtid)",
      "CREATE INDEX IF NOT EXISTS idx_internationalvehicle_tractorplate ON InternationalVehicle(tractorPlate)",
    ],
  },

  // ----- 5. VehicleJurisdictionPermission -------------------------------
  {
    table: "VehicleJurisdictionPermission",
    create: `CREATE TABLE IF NOT EXISTS VehicleJurisdictionPermission (
  id              TEXT PRIMARY KEY,
  vehicleId       TEXT NOT NULL,
  country         TEXT NOT NULL,
  permissionType  TEXT NOT NULL,
  referenceNumber TEXT,
  effectiveFrom   DATETIME,
  expiresAt       DATETIME,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  source          TEXT,
  documentId      TEXT,
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_vehiclejurisdictionpermission_vehicleid_country ON VehicleJurisdictionPermission(vehicleId, country)",
    ],
  },

  // ----- 6. InternationalDriverProfile ----------------------------------
  {
    table: "InternationalDriverProfile",
    create: `CREATE TABLE IF NOT EXISTS InternationalDriverProfile (
  id                          TEXT PRIMARY KEY,
  driverId                    TEXT NOT NULL UNIQUE,
  gtid                        TEXT,
  passportReference           TEXT,
  passportExpiry              DATETIME,
  nationality                 TEXT,
  drivingLicenseNumber        TEXT,
  licenceClass                TEXT,
  licenceCountry              TEXT,
  internationalAuthorization  TEXT,
  visaRequirements            TEXT,
  visaStatus                  TEXT,
  entryPermission             TEXT,
  workPermission              TEXT,
  countryPermissions          TEXT,
  dangerousGoodsCertificate   TEXT,
  dangerousGoodsExpiry        DATETIME,
  medicalCertificate          TEXT,
  medicalExpiry               DATETIME,
  deviceId                    TEXT,
  status                      TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_internationaldriverprofile_driverid ON InternationalDriverProfile(driverId)",
      "CREATE INDEX IF NOT EXISTS idx_internationaldriverprofile_gtid     ON InternationalDriverProfile(gtid)",
    ],
  },

  // ----- 7. DriverJurisdictionPermission -------------------------------
  {
    table: "DriverJurisdictionPermission",
    create: `CREATE TABLE IF NOT EXISTS DriverJurisdictionPermission (
  id              TEXT PRIMARY KEY,
  driverId        TEXT NOT NULL,
  country         TEXT NOT NULL,
  permissionType  TEXT NOT NULL,
  referenceNumber TEXT,
  effectiveFrom   DATETIME,
  expiresAt       DATETIME,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  source          TEXT,
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_driverjurisdictionpermission_driverid_country ON DriverJurisdictionPermission(driverId, country)",
    ],
  },

  // ----- 8. ShipmentSeal -----------------------------------------------
  {
    table: "ShipmentSeal",
    create: `CREATE TABLE IF NOT EXISTS ShipmentSeal (
  id               TEXT PRIMARY KEY,
  ustn             TEXT NOT NULL,
  corridorId       TEXT,
  sealNumber       TEXT NOT NULL,
  sealType         TEXT NOT NULL DEFAULT 'HIGH_SECURITY',
  authority        TEXT,
  appliedAt        DATETIME,
  appliedLocation  TEXT,
  appliedBy        TEXT,
  verifiedAt       DATETIME,
  verifiedLocation TEXT,
  removedAt        DATETIME,
  removedBy        TEXT,
  status           TEXT NOT NULL DEFAULT 'NOT_APPLIED',
  photoHash        TEXT,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_shipmentseal_ustn       ON ShipmentSeal(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_shipmentseal_sealnumber ON ShipmentSeal(sealNumber)",
    ],
  },

  // ----- 9. TransitGuarantee -------------------------------------------
  {
    table: "TransitGuarantee",
    create: `CREATE TABLE IF NOT EXISTS TransitGuarantee (
  id                      TEXT PRIMARY KEY,
  ustn                    TEXT NOT NULL,
  corridorId              TEXT,
  guaranteeType           TEXT NOT NULL,
  tirReference            TEXT,
  carnetReference         TEXT,
  holder                  TEXT,
  guaranteeAssociation    TEXT,
  customsOfficeDeparture  TEXT,
  transitOffices          TEXT,
  destinationCustoms      TEXT,
  sealNumber              TEXT,
  guaranteeAmount         REAL,
  currency                TEXT NOT NULL DEFAULT 'USD',
  validity                DATETIME,
  dischargeStatus         TEXT,
  exceptionStatus         TEXT,
  claimStatus             TEXT,
  status                  TEXT NOT NULL DEFAULT 'PENDING',
  createdAt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_transitguarantee_ustn ON TransitGuarantee(ustn)",
    ],
  },

  // ----- 10. CustomsOperation ------------------------------------------
  {
    table: "CustomsOperation",
    create: `CREATE TABLE IF NOT EXISTS CustomsOperation (
  id                  TEXT PRIMARY KEY,
  ustn                TEXT NOT NULL,
  corridorId          TEXT,
  country             TEXT NOT NULL,
  border              TEXT,
  customsOffice       TEXT,
  operationType       TEXT NOT NULL,
  declarationNumber   TEXT,
  governmentReference TEXT,
  brokerGtid          TEXT,
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  submissionTime      DATETIME,
  acceptanceTime      DATETIME,
  inspectionTime      DATETIME,
  releaseTime         DATETIME,
  expiryTime          DATETIME,
  rejectionReason     TEXT,
  amendmentStatus     TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_customsoperation_ustn                   ON CustomsOperation(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_customsoperation_country_operationtype ON CustomsOperation(country, operationType)",
    ],
  },

  // ----- 11. GovernmentReference ---------------------------------------
  {
    table: "GovernmentReference",
    create: `CREATE TABLE IF NOT EXISTS GovernmentReference (
  id                TEXT PRIMARY KEY,
  ustn              TEXT NOT NULL,
  country           TEXT NOT NULL,
  authority         TEXT NOT NULL,
  referenceType     TEXT NOT NULL,
  referenceNumber   TEXT NOT NULL,
  declarationType   TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  sourcePayloadHash TEXT,
  sourceTimestamp   DATETIME,
  effectiveFrom     DATETIME,
  expiresAt         DATETIME,
  createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(referenceType, referenceNumber, country)
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_governmentreference_ustn                 ON GovernmentReference(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_governmentreference_country_referencetype ON GovernmentReference(country, referenceType)",
    ],
  },

  // ----- 12. RoadIncident ----------------------------------------------
  {
    table: "RoadIncident",
    create: `CREATE TABLE IF NOT EXISTS RoadIncident (
  id                    TEXT PRIMARY KEY,
  ustn                  TEXT NOT NULL,
  corridorId            TEXT,
  incidentType          TEXT NOT NULL,
  description           TEXT,
  latitude              REAL,
  longitude             REAL,
  vehicleId             TEXT,
  driverId              TEXT,
  severity              TEXT NOT NULL DEFAULT 'MEDIUM',
  status                TEXT NOT NULL DEFAULT 'OPEN',
  photoHashes           TEXT,
  iotData               TEXT,
  governmentReferences  TEXT,
  insuranceInfo         TEXT,
  aiEscalationLevel     TEXT,
  resolvedAt            DATETIME,
  createdAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_roadincident_ustn          ON RoadIncident(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_roadincident_incidenttype   ON RoadIncident(incidentType)",
      "CREATE INDEX IF NOT EXISTS idx_roadincident_status         ON RoadIncident(status)",
    ],
  },

  // ----- 13. GovernmentReconciliationEvent -----------------------------
  {
    table: "GovernmentReconciliationEvent",
    create: `CREATE TABLE IF NOT EXISTS GovernmentReconciliationEvent (
  id                   TEXT PRIMARY KEY,
  ustn                 TEXT NOT NULL,
  governmentReference  TEXT NOT NULL,
  country              TEXT NOT NULL,
  reconciliationType   TEXT NOT NULL,
  expectedValue        TEXT,
  actualValue          TEXT,
  status               TEXT NOT NULL DEFAULT 'OPEN',
  resolvedAt           DATETIME,
  resolvedBy           TEXT,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_governmentreconciliationevent_ustn   ON GovernmentReconciliationEvent(ustn)",
      "CREATE INDEX IF NOT EXISTS idx_governmentreconciliationevent_status ON GovernmentReconciliationEvent(status)",
    ],
  },

  // ----- 14. JurisdictionAdapter ---------------------------------------
  {
    table: "JurisdictionAdapter",
    create: `CREATE TABLE IF NOT EXISTS JurisdictionAdapter (
  id               TEXT PRIMARY KEY,
  countryCode      TEXT NOT NULL UNIQUE,
  adapterName      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'NOT_YET_ACTIVE',
  capabilities     TEXT,
  apiEndpoint      TEXT,
  portalUrl        TEXT,
  operatingMode    TEXT NOT NULL DEFAULT 'MANUAL_REQUIRED',
  lastHealthCheck  DATETIME,
  healthStatus     TEXT,
  version          TEXT,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_jurisdictionadapter_countrycode ON JurisdictionAdapter(countryCode)",
    ],
  },
];

// ---------------------------------------------------------------------------
// JurisdictionAdapter seed data — 10 jurisdictions per spec.
// EG is the only ACTIVE adapter; the rest are NOT_YET_ACTIVE.
// ---------------------------------------------------------------------------
const JURISDICTION_SEED: {
  countryCode: string;
  adapterName: string;
  status: "ACTIVE" | "NOT_YET_ACTIVE";
  operatingMode: "API" | "MANUAL_REQUIRED";
  healthStatus: "HEALTHY" | "UNKNOWN";
  capabilities: string[];
}[] = [
  {
    countryCode: "EG",
    adapterName: "Egypt Customs Gateway (Nafeza)",
    status: "ACTIVE",
    operatingMode: "API",
    healthStatus: "HEALTHY",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION", "IMPORT_DECLARATION", "INSPECTION", "RELEASE", "UCR"],
  },
  {
    countryCode: "JO",
    adapterName: "Jordan Customs Adapter (ASYCUDA)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "SA",
    adapterName: "Saudi Customs Adapter (FASAH)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION", "IMPORT_DECLARATION"],
  },
  {
    countryCode: "AE",
    adapterName: "UAE Customs Adapter (Mirsal 2)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "KW",
    adapterName: "Kuwait Customs Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "QA",
    adapterName: "Qatar Customs Adapter (Al-Nadeeb)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "BH",
    adapterName: "Bahrain Customs Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "OM",
    adapterName: "Oman Customs Adapter (Bayan)",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "IQ",
    adapterName: "Iraq Customs Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
  },
  {
    countryCode: "LY",
    adapterName: "Libya Customs Adapter",
    status: "NOT_YET_ACTIVE",
    operatingMode: "MANUAL_REQUIRED",
    healthStatus: "UNKNOWN",
    capabilities: ["EXPORT_DECLARATION", "TRANSIT_DECLARATION"],
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

  // ----- Seed JurisdictionAdapter ---------------------------------------
  console.log("\n--- Seeding JurisdictionAdapter ---");
  let seedInserted = 0;
  let seedSkipped = 0;
  let seedFailed = 0;
  const seedInsertSql = `INSERT OR IGNORE INTO JurisdictionAdapter
    (id, countryCode, adapterName, status, capabilities, operatingMode, healthStatus, version, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

  for (const j of JURISDICTION_SEED) {
    try {
      const res = await client.execute({
        sql: seedInsertSql,
        args: [
          randomUUID(),
          j.countryCode,
          j.adapterName,
          j.status,
          JSON.stringify(j.capabilities),
          j.operatingMode,
          j.healthStatus,
          "1.0.0",
        ],
      });
      if (res.rowsAffected > 0) {
        seedInserted++;
        console.log(`  ✓ seeded ${j.countryCode} (${j.status})`);
      } else {
        seedSkipped++;
        console.log(`  · skipped ${j.countryCode} (already present)`);
      }
    } catch (err) {
      seedFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ table: "JurisdictionAdapter", phase: "seed", sql: seedInsertSql, error: msg });
      console.error(`  ✗ seed ${j.countryCode} → ${msg}`);
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

  // ----- Verify JurisdictionAdapter row count --------------------------
  let jurisdictionCount = 0;
  let activeCount = 0;
  try {
    const res = await client.execute(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS a FROM JurisdictionAdapter"
    );
    jurisdictionCount = Number((res.rows[0] as any)?.n ?? 0);
    activeCount = Number((res.rows[0] as any)?.a ?? 0);
  } catch (err) {
    console.error("✗ Failed to count JurisdictionAdapter rows:", err instanceof Error ? err.message : err);
  }

  console.log("\n======================== SUMMARY ========================");
  console.log(`Models targeted      : ${SCHEMA.length}`);
  console.log(`Tables created OK    : ${tablesOk}`);
  console.log(`Tables FAILED        : ${tablesFailed}`);
  console.log(`Indexes created OK   : ${indexesOk}`);
  console.log(`Indexes FAILED       : ${indexesFailed}`);
  console.log(`Verified on Turso    : ${verified}/${SCHEMA.length}`);
  if (missing.length) console.log(`Missing from Turso   : ${missing.join(", ")}`);
  console.log(`--- JurisdictionAdapter seed ---`);
  console.log(`Seed rows inserted   : ${seedInserted}`);
  console.log(`Seed rows skipped    : ${seedSkipped} (already existed)`);
  console.log(`Seed rows FAILED     : ${seedFailed}`);
  console.log(`Total adapter rows   : ${jurisdictionCount}`);
  console.log(`Active adapters      : ${activeCount}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - [${f.phase}] ${f.table}: ${f.error}`);
    }
  }
  console.log("========================================================");

  client.close();
  process.exit(
    tablesFailed === 0 && missing.length === 0 && seedFailed === 0 ? 0 : 1
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
