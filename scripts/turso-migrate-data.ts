import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";

const sqlite = new PrismaClient();
const turso = createClient({
  url: "libsql://sgtx-fortleem.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA",
});

const MODELS = [
  "tenant", "employee", "trade", "buyerSubmission", "tradeContract", "shipment",
  "tradeContainer", "tradeDraft", "document", "documentRequirement", "activity",
  "timelineEvent", "tradeMessage", "invoice", "inboxItem", "dispute",
  "financingRequest", "financingBid", "financierPreference", "financingRfqLog",
  "financingAgreement", "financingAgreementAnnex", "financingRepayment",
  "deFiProtocol", "deFiPosition", "stablecoinStatus", "labTest", "qcInspection",
  "customsDeclaration", "serviceQuotation", "integrationHealth", "governorDecision",
  "loomVerificationToken", "jurisdiction", "suspiciousActivityReport",
  "savedContact", "tradeReadiness", "qesSignature", "qesRequest", "qesEnrollment",
  "deviceTrust", "sessionRiskEvent", "evidencePackage", "complianceScreening",
  "sessionAuditEvent", "shipQuoteRequest", "shipQuote", "opaPolicy",
  "tenantBusinessUnit", "tenantDepartment", "milestone", "insuranceClaim",
  "bookingConfirmation", "shipmentHold", "containerReleasePreadvice",
  "stuckTradeAlert", "latePaymentPenalty", "monthlyStatement", "qcActionPlan",
  "euPesticideProduct", "euPesticideResidue", "euPesticideMrl", "euPesticideSyncLog",
  "codexCommodity", "codexPesticide", "codexMrl", "codexSyncLog",
  "regionalPesticideMrl", "regionalPesticideSyncLog", "nowlunFreightRate",
  "nowlunPortStatus", "nowlunTransitData", "brainEvent", "agMarketPrice",
  "agMarketSyncLog", "globalMarketPrice", "agriCommodityPrice", "geopoliticalEvent",
  "portRealtimeStatus", "shippingSchedule", "worldwidePortRoute",
  "worldwideRoutesSyncLog", "fineTuningExample", "fineTuningJob",
  "vgmVerification", "dangerousGoodsDeclaration", "lot", "letterOfCredit",
  "certificateOfOrigin", "reeferTelemetry", "feeLock", "paymentAttempt",
  "pspAttempt", "settlementInstruction", "settlementConfirmation",
  "milestonePaymentSchedule", "deferredFee", "lateFeeEvent",
  "bankSettlementInstruction", "paymentAggregator", "financingRecommendation",
  "feeCalculation", "bankReconciliationFile", "palletDetail", "packingPlan",
  "packingList", "barcodePrintJob", "barcodeScan", "microContract",
  "distressedCargoListing", "distressedCargoOffer", "causalAttribution",
  "disputeEvidence", "disputeMediation", "disputeExpert", "settlementProposal",
  "arbitrationCase", "sgtxFeeDispute", "qcOverrideFlag", "disputePrediction",
  "triHistory", "triDispute", "coldChainAlert", "reInspectionRequest",
  "shipmentRiskAssessment", "containerReleaseAuthorisation",
  "documentCourierTracking", "roRoCargoManifest", "roRoCargoItem",
  "roRoVesselSchedule", "tenantCostCenter", "tenantApprovalGroup",
  "tenantApprovalPolicy", "roleJourneyCompletion", "readinessChecklist",
  "trustPassport", "trustPassportToken", "trustPassportRevocation",
  "gtidSequence", "gtidRevocationLog", "gtidResolutionLog", "tenantVerifiedId",
  "tenantOnboardingState", "tenantLifecycleHistory", "incotermServiceMapping",
  "providerServiceCatalogue", "providerPerformance", "countryPhysicalDocumentRequirement",
];

console.log(`Migrating ${MODELS.length} models from SQLite to Turso...`);

let totalMigrated = 0;
let totalFailed = 0;
const summary: string[] = [];

for (const model of MODELS) {
  try {
    // @ts-expect-error - dynamic model access
    const records = await sqlite[model].findMany();
    if (records.length === 0) continue;

    // Build INSERT statements
    const tableName = model.charAt(0).toUpperCase() + model.slice(1);
    let inserted = 0;

    for (const record of records) {
      const columns = Object.keys(record);
      const placeholders = columns.map(() => "?").join(", ");
      const sql = `INSERT OR IGNORE INTO "${tableName}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
      const values = columns.map(c => {
        const v = record[c];
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        return v;
      });
      try {
        await turso.execute({ sql, args: values });
        inserted++;
      } catch (e: any) {
        // Skip individual record errors (duplicate keys, etc.)
      }
    }

    totalMigrated += inserted;
    if (inserted > 0) {
      summary.push(`  ✅ ${model}: ${inserted}/${records.length}`);
    }
  } catch (e: any) {
    totalFailed++;
    summary.push(`  ❌ ${model}: ${e.message?.slice(0, 60)}`);
  }
}

console.log("\n=== Migration Summary ===");
console.log(summary.join("\n"));
console.log(`\nTotal records migrated: ${totalMigrated}`);
console.log(`Failed models: ${totalFailed}`);

// Verify
const tenantCount = await turso.execute("SELECT count(*) as c FROM Tenant");
console.log(`\nTurso Tenant count: ${tenantCount.rows[0].c}`);
const routeCount = await turso.execute("SELECT count(*) as c FROM WorldwidePortRoute");
console.log(`Turso WorldwidePortRoute count: ${routeCount.rows[0].c}`);

await sqlite.$disconnect();
await turso.close();
