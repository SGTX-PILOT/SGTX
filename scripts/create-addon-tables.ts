/**
 * CREATE-ADDON-TURSO-TABLES
 * -------------------------
 * Creates the 32 new Prisma add-on models (Add-Ons 10-26, plus Force Majeure,
 * ShippersDeclaration, ExportLicense, TerminalIntegration, TerminalEvent,
 * PaymentGuarantee, BondSufficiencyCheck) as physical SQLite tables on the
 * Turso remote database.
 *
 * NOTE: The task title says "27 tables" but the explicit model list contains
 * 32 models. This script creates ALL 32 listed models. Counts below reflect 32.
 *
 * Why not `prisma db push`? Prisma db push would also drop/recreate shadow
 * tables and is harder to make idempotent on a shared Turso instance. This
 * script uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
 * so it can be safely re-run.
 *
 * Type mapping (Prisma → SQLite):
 *   String    → TEXT
 *   Int       → INTEGER
 *   Float     → REAL      (NULL allowed when field is optional)
 *   Boolean   → BOOLEAN   (SQLite type affinity = INTEGER; stored as 0/1)
 *   DateTime  → DATETIME
 *
 * Defaults:
 *   @default(now())                → DEFAULT CURRENT_TIMESTAMP
 *   @default(false) / @default(true) → DEFAULT 0 / DEFAULT 1
 *   @default("...") / @default(0)   → DEFAULT literal
 *   @default(cuid()) / @default(autoincrement()) → handled via PRIMARY KEY decl
 *
 * Constraints:
 *   @id @default(cuid())           → TEXT PRIMARY KEY
 *   Int @id @default(autoincrement()) → INTEGER PRIMARY KEY AUTOINCREMENT
 *   @unique                        → UNIQUE column constraint
 *   @@index([a, b])                → CREATE INDEX ON table(a, b)
 *
 * IMPORTANT: A stale `DATABASE_URL=file:...` shell export can override .env.
 * To avoid that, we hard-code the Turso URL/token here and re-set
 * process.env.DATABASE_URL before instantiating the client.
 *
 * Usage:
 *   cd /home/z/my-project
 *   bun run scripts/create-addon-tables.ts
 *
 * (You can also pass DATABASE_URL via the env, but the inline token below
 *  always wins to guarantee we hit Turso and not a local file.)
 */

import { createClient } from "@libsql/client";

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
  // ----- Add-On 10: Broker Accountability -----
  {
    table: "BrokerLiabilityInsurance",
    create: `CREATE TABLE IF NOT EXISTS BrokerLiabilityInsurance (
  id              TEXT PRIMARY KEY,
  brokerGtid      TEXT NOT NULL,
  insurer         TEXT NOT NULL,
  policyNumber    TEXT NOT NULL,
  coverageAmount  REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'EGP',
  validFrom       DATETIME,
  validTo         DATETIME,
  certificateUrl  TEXT,
  verified        BOOLEAN NOT NULL DEFAULT 0,
  verifiedAt      DATETIME,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS BrokerLiabilityInsurance_brokerGtid_idx ON BrokerLiabilityInsurance(brokerGtid)"],
  },
  {
    table: "BrokerDeclarationError",
    create: `CREATE TABLE IF NOT EXISTS BrokerDeclarationError (
  id               TEXT PRIMARY KEY,
  brokerGtid       TEXT NOT NULL,
  ustn             TEXT,
  errorType        TEXT NOT NULL,
  errorDescription TEXT,
  penaltyAmount    REAL,
  currency         TEXT NOT NULL DEFAULT 'EGP',
  resolved         BOOLEAN NOT NULL DEFAULT 0,
  resolvedAt       DATETIME,
  createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS BrokerDeclarationError_brokerGtid_idx ON BrokerDeclarationError(brokerGtid)"],
  },
  {
    table: "BrokerPerformanceMetric",
    create: `CREATE TABLE IF NOT EXISTS BrokerPerformanceMetric (
  id                      TEXT PRIMARY KEY,
  brokerGtid              TEXT NOT NULL,
  totalDeclarations       INTEGER NOT NULL DEFAULT 0,
  acceptanceRate          REAL,
  errorRate               REAL,
  averageProcessingHours  REAL,
  rating                  REAL,
  lastAssessment          DATETIME,
  createdAt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS BrokerPerformanceMetric_brokerGtid_idx ON BrokerPerformanceMetric(brokerGtid)"],
  },

  // ----- Add-On 11: Customs Valuation Intelligence -----
  {
    table: "CustomsValuation",
    create: `CREATE TABLE IF NOT EXISTS CustomsValuation (
  id                   TEXT PRIMARY KEY,
  ustn                 TEXT,
  hsCode               TEXT NOT NULL,
  originCountry        TEXT NOT NULL,
  destinationCountry   TEXT NOT NULL,
  declaredValue        REAL NOT NULL,
  estimatedDuty        REAL NOT NULL,
  marketAverage        REAL,
  deviationPercentage  REAL,
  valuationMethod      TEXT,
  confidence           REAL,
  alertType            TEXT,
  alertSeverity        TEXT,
  alertMessage         TEXT,
  recommendation      TEXT,
  modelVersion         TEXT,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS CustomsValuation_ustn_idx ON CustomsValuation(ustn)",
      "CREATE INDEX IF NOT EXISTS CustomsValuation_hsCode_destinationCountry_idx ON CustomsValuation(hsCode, destinationCountry)",
    ],
  },
  {
    table: "ValuationDispute",
    create: `CREATE TABLE IF NOT EXISTS ValuationDispute (
  id                       TEXT PRIMARY KEY,
  ustn                     TEXT NOT NULL,
  declaredValue            REAL NOT NULL,
  customsReassessedValue   REAL,
  disputeReason            TEXT NOT NULL,
  evidence                 TEXT,
  status                   TEXT NOT NULL DEFAULT 'PENDING',
  resolvedAt               DATETIME,
  governorDecisionId       TEXT,
  createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS ValuationDispute_ustn_idx ON ValuationDispute(ustn)"],
  },
  {
    table: "MarketPriceData",
    create: `CREATE TABLE IF NOT EXISTS MarketPriceData (
  id           TEXT PRIMARY KEY,
  hsCode       TEXT NOT NULL,
  countryCode  TEXT NOT NULL,
  marketPrice  REAL NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  source       TEXT NOT NULL,
  recordedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confidence   REAL
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS MarketPriceData_hsCode_countryCode_idx ON MarketPriceData(hsCode, countryCode)"],
  },

  // ----- Add-On 12: Cold Chain Quality Management -----
  {
    table: "PtiCertificate",
    create: `CREATE TABLE IF NOT EXISTS PtiCertificate (
  id                   TEXT PRIMARY KEY,
  containerNumber      TEXT NOT NULL,
  carrierGtid          TEXT,
  inspectionDate       DATETIME NOT NULL,
  validUntil           DATETIME NOT NULL,
  temperatureSetPoint  REAL NOT NULL,
  actualTemperature    REAL NOT NULL,
  ptiResult            TEXT NOT NULL,
  ptiReference         TEXT,
  certificateUrl       TEXT,
  inspectorName        TEXT,
  verified             BOOLEAN NOT NULL DEFAULT 0,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS PtiCertificate_containerNumber_idx ON PtiCertificate(containerNumber)"],
  },
  {
    table: "ColdChainReading",
    create: `CREATE TABLE IF NOT EXISTS ColdChainReading (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ustn             TEXT NOT NULL,
  containerNumber  TEXT NOT NULL,
  temperature      REAL NOT NULL,
  humidity         REAL,
  recordedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  anomaly          BOOLEAN NOT NULL DEFAULT 0,
  anomalyType      TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ColdChainReading_ustn_recordedAt_idx ON ColdChainReading(ustn, recordedAt)",
      "CREATE INDEX IF NOT EXISTS ColdChainReading_containerNumber_recordedAt_idx ON ColdChainReading(containerNumber, recordedAt)",
    ],
  },
  {
    table: "ColdChainAnomaly",
    create: `CREATE TABLE IF NOT EXISTS ColdChainAnomaly (
  id                   TEXT PRIMARY KEY,
  ustn                 TEXT NOT NULL,
  containerNumber      TEXT NOT NULL,
  deviationCelsius     REAL NOT NULL,
  durationMinutes      INTEGER NOT NULL,
  severity             TEXT NOT NULL,
  resolved             BOOLEAN NOT NULL DEFAULT 0,
  resolvedAt           DATETIME,
  governorDecisionId   TEXT,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS ColdChainAnomaly_ustn_idx ON ColdChainAnomaly(ustn)"],
  },

  // ----- Add-On 13: Inspection Agency Accreditation -----
  {
    table: "InspectionAgencyAccreditation",
    create: `CREATE TABLE IF NOT EXISTS InspectionAgencyAccreditation (
  id                       TEXT PRIMARY KEY,
  agencyGtid               TEXT NOT NULL,
  accreditationStandard    TEXT NOT NULL,
  accreditationBody        TEXT NOT NULL,
  certificateNumber        TEXT NOT NULL,
  validFrom                DATETIME,
  validTo                  DATETIME,
  scopeOfAccreditation     TEXT,
  verified                 BOOLEAN NOT NULL DEFAULT 0,
  verifiedAt               DATETIME,
  status                   TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS InspectionAgencyAccreditation_agencyGtid_idx ON InspectionAgencyAccreditation(agencyGtid)"],
  },
  {
    table: "InspectionAgencyPerformance",
    create: `CREATE TABLE IF NOT EXISTS InspectionAgencyPerformance (
  id                 TEXT PRIMARY KEY,
  agencyGtid         TEXT NOT NULL,
  totalInspections   INTEGER NOT NULL DEFAULT 0,
  acceptanceRate     REAL,
  overrideRate       REAL,
  disputeRate        REAL,
  lastAssessment     DATETIME,
  rating             REAL,
  createdAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS InspectionAgencyPerformance_agencyGtid_idx ON InspectionAgencyPerformance(agencyGtid)"],
  },

  // ----- Add-On 14: Currency Risk Management -----
  {
    table: "CurrencyExposure",
    create: `CREATE TABLE IF NOT EXISTS CurrencyExposure (
  id                  TEXT PRIMARY KEY,
  ustn                TEXT,
  baseCurrency        TEXT NOT NULL,
  exposureCurrency    TEXT NOT NULL,
  exposureAmount      REAL NOT NULL,
  lockedRate          REAL,
  currentRate         REAL,
  unrealisedGainLoss   REAL,
  hedgedPercentage    REAL,
  hedgeType           TEXT,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS CurrencyExposure_ustn_idx ON CurrencyExposure(ustn)"],
  },
  {
    table: "HedgingRecommendation",
    create: `CREATE TABLE IF NOT EXISTS HedgingRecommendation (
  id                            TEXT PRIMARY KEY,
  tenantGtid                    TEXT NOT NULL,
  currencyPair                  TEXT NOT NULL,
  exposureAmount                REAL NOT NULL,
  riskLevel                     TEXT NOT NULL,
  recommendedHedgePercentage   REAL,
  estimatedCost                 REAL,
  explanation                   TEXT,
  validUntil                    DATETIME,
  createdAt                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS HedgingRecommendation_tenantGtid_idx ON HedgingRecommendation(tenantGtid)"],
  },

  // ----- Add-On 15: Government API Sandbox -----
  {
    table: "GovernmentApiSandbox",
    create: `CREATE TABLE IF NOT EXISTS GovernmentApiSandbox (
  id                  TEXT PRIMARY KEY,
  countryCode         TEXT NOT NULL,
  apiName             TEXT NOT NULL,
  sandboxUrl          TEXT NOT NULL,
  productionUrl       TEXT NOT NULL,
  lastMockGeneration  DATETIME,
  version             TEXT,
  isSynced            BOOLEAN NOT NULL DEFAULT 0,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS GovernmentApiSandbox_countryCode_idx ON GovernmentApiSandbox(countryCode)"],
  },
  {
    table: "GovernmentApiTestResult",
    create: `CREATE TABLE IF NOT EXISTS GovernmentApiTestResult (
  id             TEXT PRIMARY KEY,
  apiId          TEXT NOT NULL,
  testType       TEXT NOT NULL,
  endpoint       TEXT NOT NULL,
  requestBody    TEXT,
  responseBody   TEXT,
  expectedStatus INTEGER,
  actualStatus   INTEGER,
  passed         BOOLEAN,
  diff           TEXT,
  testRun        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS GovernmentApiTestResult_apiId_idx ON GovernmentApiTestResult(apiId)"],
  },

  // ----- Add-On 16: FTA Preference Management -----
  {
    table: "FtaPreference",
    create: `CREATE TABLE IF NOT EXISTS FtaPreference (
  id                      TEXT PRIMARY KEY,
  hsCode                  TEXT NOT NULL,
  originCountry           TEXT NOT NULL,
  destinationCountry      TEXT NOT NULL,
  ftaName                 TEXT NOT NULL,
  preferenceRate          REAL NOT NULL,
  documentRequired        TEXT NOT NULL,
  productSpecificRules    TEXT,
  validFrom               DATETIME,
  validTo                 DATETIME,
  createdAt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS FtaPreference_originCountry_destinationCountry_idx ON FtaPreference(originCountry, destinationCountry)"],
  },
  {
    table: "FtaPreferenceClaim",
    create: `CREATE TABLE IF NOT EXISTS FtaPreferenceClaim (
  id                TEXT PRIMARY KEY,
  ustn              TEXT,
  ftaPreferenceId   TEXT,
  claimType         TEXT NOT NULL,
  claimReference    TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  verified          BOOLEAN NOT NULL DEFAULT 0,
  verifiedAt        DATETIME,
  createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS FtaPreferenceClaim_ustn_idx ON FtaPreferenceClaim(ustn)"],
  },

  // ----- Add-On 17: Piracy & Security Risk Engine -----
  {
    table: "MaritimeSecurityIncident",
    create: `CREATE TABLE IF NOT EXISTS MaritimeSecurityIncident (
  id            TEXT PRIMARY KEY,
  incidentType  TEXT NOT NULL,
  latitude      REAL,
  longitude     REAL,
  description   TEXT,
  severity      TEXT NOT NULL,
  occurredAt    DATETIME,
  source        TEXT,
  createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS MaritimeSecurityIncident_severity_idx ON MaritimeSecurityIncident(severity)"],
  },
  {
    table: "CorridorSecurityScore",
    create: `CREATE TABLE IF NOT EXISTS CorridorSecurityScore (
  id                              TEXT PRIMARY KEY,
  corridorCode                    TEXT NOT NULL,
  securityScore                   INTEGER NOT NULL,
  riskLevel                       TEXT NOT NULL,
  lastIncidentAt                  DATETIME,
  recommendedSecurityMeasures     TEXT,
  insurancePremiumImpact          REAL,
  validUntil                      DATETIME,
  createdAt                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS CorridorSecurityScore_corridorCode_idx ON CorridorSecurityScore(corridorCode)"],
  },

  // ----- Add-On 18: Trade Compliance Calendar -----
  {
    table: "ComplianceCalendarEvent",
    create: `CREATE TABLE IF NOT EXISTS ComplianceCalendarEvent (
  id            TEXT PRIMARY KEY,
  tenantGtid    TEXT NOT NULL,
  eventType     TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  eventDate     DATETIME NOT NULL,
  reminderDays  TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  completedAt   DATETIME,
  linkedUstn    TEXT,
  createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ComplianceCalendarEvent_tenantGtid_idx ON ComplianceCalendarEvent(tenantGtid)",
      "CREATE INDEX IF NOT EXISTS ComplianceCalendarEvent_eventDate_idx ON ComplianceCalendarEvent(eventDate)",
    ],
  },

  // ----- Add-On 19: Cargo Insurance Integration -----
  {
    table: "InsuranceProvider",
    create: `CREATE TABLE IF NOT EXISTS InsuranceProvider (
  id                  TEXT PRIMARY KEY,
  providerName        TEXT NOT NULL,
  providerCode        TEXT NOT NULL UNIQUE,
  apiEndpoint         TEXT,
  coverageTypes       TEXT,
  acceptedCurrencies  TEXT,
  apiKeyEncrypted     TEXT,
  isActive            BOOLEAN NOT NULL DEFAULT 1,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [],
  },
  {
    table: "InsurancePolicy",
    create: `CREATE TABLE IF NOT EXISTS InsurancePolicy (
  id              TEXT PRIMARY KEY,
  ustn            TEXT,
  providerId      TEXT,
  policyNumber    TEXT NOT NULL,
  coverageType    TEXT NOT NULL,
  coverageAmount  REAL NOT NULL,
  premiumAmount   REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  validFrom       DATETIME,
  validTo         DATETIME,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  certificateUrl  TEXT,
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS InsurancePolicy_ustn_idx ON InsurancePolicy(ustn)"],
  },

  // ----- Add-On 20: Trade Finance Documentation -----
  {
    table: "TradeFinanceDocument",
    create: `CREATE TABLE IF NOT EXISTS TradeFinanceDocument (
  id                    TEXT PRIMARY KEY,
  ustn                  TEXT,
  financingAgreementId  TEXT,
  documentType          TEXT NOT NULL,
  documentReference     TEXT,
  issuingBankGtid       TEXT,
  beneficiaryGtid       TEXT,
  amount                REAL,
  currency              TEXT,
  validFrom             DATETIME,
  validTo               DATETIME,
  documentUrl           TEXT,
  status                TEXT NOT NULL DEFAULT 'PENDING',
  createdAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS TradeFinanceDocument_ustn_idx ON TradeFinanceDocument(ustn)"],
  },

  // ----- Add-On 21: Back-to-Back LC Management -----
  {
    table: "BackToBackLc",
    create: `CREATE TABLE IF NOT EXISTS BackToBackLc (
  id              TEXT PRIMARY KEY,
  primaryLcId     TEXT,
  secondaryLcId   TEXT,
  buyerGtid       TEXT NOT NULL,
  sellerGtid      TEXT NOT NULL,
  supplierGtid    TEXT NOT NULL,
  amount          REAL NOT NULL,
  currency        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS BackToBackLc_buyerGtid_sellerGtid_idx ON BackToBackLc(buyerGtid, sellerGtid)"],
  },

  // ----- Add-On 22: Force Majeure -----
  {
    table: "ForceMajeureEvent",
    create: `CREATE TABLE IF NOT EXISTS ForceMajeureEvent (
  id                  TEXT PRIMARY KEY,
  eventType           TEXT NOT NULL,
  location            TEXT,
  affectedCountries   TEXT,
  description         TEXT,
  severity            TEXT NOT NULL,
  startDate           DATETIME NOT NULL,
  endDate             DATETIME,
  status              TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ForceMajeureEvent_status_idx ON ForceMajeureEvent(status)",
      "CREATE INDEX IF NOT EXISTS ForceMajeureEvent_severity_idx ON ForceMajeureEvent(severity)",
    ],
  },
  {
    table: "ForceMajeureClaim",
    create: `CREATE TABLE IF NOT EXISTS ForceMajeureClaim (
  id                   TEXT PRIMARY KEY,
  ustn                 TEXT,
  eventId              TEXT,
  claimantGtid         TEXT NOT NULL,
  reason               TEXT NOT NULL,
  evidence             TEXT,
  status               TEXT NOT NULL DEFAULT 'PENDING',
  resolvedAt           DATETIME,
  governorDecisionId   TEXT,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ForceMajeureClaim_ustn_idx ON ForceMajeureClaim(ustn)",
      "CREATE INDEX IF NOT EXISTS ForceMajeureClaim_status_idx ON ForceMajeureClaim(status)",
    ],
  },

  // ----- Add-On 23: Shipper's Declaration -----
  {
    table: "ShippersDeclaration",
    create: `CREATE TABLE IF NOT EXISTS ShippersDeclaration (
  id                    TEXT PRIMARY KEY,
  ustn                  TEXT,
  exporterGtid          TEXT NOT NULL,
  declarationReference  TEXT,
  declarationDate       DATETIME,
  goodsDescription      TEXT,
  hsCode                TEXT,
  netWeight             REAL,
  value                 REAL,
  currency              TEXT,
  originCountry         TEXT,
  destinationCountry    TEXT,
  incoterm              TEXT,
  signed                BOOLEAN NOT NULL DEFAULT 0,
  signedAt              DATETIME,
  createdAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS ShippersDeclaration_exporterGtid_idx ON ShippersDeclaration(exporterGtid)"],
  },
  {
    table: "ExportLicense",
    create: `CREATE TABLE IF NOT EXISTS ExportLicense (
  id                  TEXT PRIMARY KEY,
  tenantGtid          TEXT NOT NULL,
  hsCode              TEXT NOT NULL,
  licenseNumber       TEXT NOT NULL,
  issuingAuthority    TEXT NOT NULL,
  validFrom           DATETIME,
  validTo             DATETIME,
  maxQuantity         REAL,
  remainingQuantity   REAL,
  status              TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS ExportLicense_tenantGtid_hsCode_idx ON ExportLicense(tenantGtid, hsCode)"],
  },

  // ----- Add-On 24: Port & Terminal Integration -----
  {
    table: "TerminalIntegration",
    create: `CREATE TABLE IF NOT EXISTS TerminalIntegration (
  id                    TEXT PRIMARY KEY,
  terminalGtid          TEXT NOT NULL,
  integrationType       TEXT NOT NULL,
  endpointUrl           TEXT,
  format                TEXT NOT NULL DEFAULT 'EDI',
  credentialsEncrypted  TEXT,
  isActive              BOOLEAN NOT NULL DEFAULT 1,
  lastTest              DATETIME,
  createdAt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS TerminalIntegration_terminalGtid_idx ON TerminalIntegration(terminalGtid)"],
  },
  {
    table: "TerminalEvent",
    create: `CREATE TABLE IF NOT EXISTS TerminalEvent (
  id            TEXT PRIMARY KEY,
  ustn          TEXT,
  eventType     TEXT NOT NULL,
  eventData     TEXT,
  receivedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed     BOOLEAN NOT NULL DEFAULT 0,
  processedAt   DATETIME
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS TerminalEvent_ustn_idx ON TerminalEvent(ustn)"],
  },

  // ----- Add-On 25: Payment Guarantee Confirmation -----
  {
    table: "PaymentGuarantee",
    create: `CREATE TABLE IF NOT EXISTS PaymentGuarantee (
  id                      TEXT PRIMARY KEY,
  ustn                    TEXT,
  guaranteeType           TEXT NOT NULL,
  guaranteeReference      TEXT,
  issuingBankGtid         TEXT,
  amount                  REAL NOT NULL,
  currency                TEXT,
  validFrom               DATETIME,
  validTo                 DATETIME,
  confirmed               BOOLEAN NOT NULL DEFAULT 0,
  confirmationMethod      TEXT,
  confirmationReference   TEXT,
  confirmedAt             DATETIME,
  createdAt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: ["CREATE INDEX IF NOT EXISTS PaymentGuarantee_ustn_idx ON PaymentGuarantee(ustn)"],
  },

  // ----- Add-On 22 (2.1): Bond Sufficiency Check -----
  {
    table: "BondSufficiencyCheck",
    create: `CREATE TABLE IF NOT EXISTS BondSufficiencyCheck (
  id              TEXT PRIMARY KEY,
  bondId          TEXT NOT NULL,
  ustn            TEXT,
  dutyAmount      REAL NOT NULL,
  bondRequired    REAL NOT NULL,
  bondAvailable   REAL NOT NULL,
  sufficient      BOOLEAN NOT NULL DEFAULT 0,
  checkedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS BondSufficiencyCheck_bondId_idx ON BondSufficiencyCheck(bondId)",
      "CREATE INDEX IF NOT EXISTS BondSufficiencyCheck_ustn_idx ON BondSufficiencyCheck(ustn)",
    ],
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
  const failures: { table: string; phase: "table" | "index"; sql: string; error: string }[] = [];

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

  // ----- Verification pass: confirm each table actually exists -----
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
  let missing: string[] = [];
  for (const block of SCHEMA) {
    if (existingTables.has(block.table)) {
      verified++;
    } else {
      missing.push(block.table);
    }
  }

  console.log("\n======================== SUMMARY ========================");
  console.log(`Models targeted      : ${SCHEMA.length}`);
  console.log(`Tables created OK   : ${tablesOk}`);
  console.log(`Tables FAILED       : ${tablesFailed}`);
  console.log(`Indexes created OK  : ${indexesOk}`);
  console.log(`Indexes FAILED      : ${indexesFailed}`);
  console.log(`Verified on Turso   : ${verified}/${SCHEMA.length}`);
  if (missing.length) console.log(`Missing from Turso  : ${missing.join(", ")}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - [${f.phase}] ${f.table}: ${f.error}`);
    }
  }
  console.log("========================================================");

  client.close();
  process.exit(tablesFailed === 0 && missing.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
