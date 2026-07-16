// SGTX Brain OS — Public API
// =============================================================================
// The Brain OS is the single orchestrating layer for ALL SGTX features.
// Every compliance module, AI module, and external integration is registered
// here and dispatched through the Brain.
//
// Sub-systems exposed (BRAIN-RESTORE):
//   * core/         — orchestrator, event-bus, module-registry, types
//   * learning/     — continuous learning loop
//   * capabilities/ — 36 capability module wrappers + registerAllCapabilities()
//   * adapters/     — provider router + ZAI/Local/Static model adapters
//   * storage/      — PostgresEventStore (BrainEvent persistence)
//   * crypto/       — PQCSigner (Ed25519 + Dilithium3 stub)
//   * self-healing/ — circuit breaker, retry policy, health monitor
//   * observability/— metrics, tracing, structured logging, aggregate health
//
// Usage:
//   import { brainOrchestrator, registerAllCapabilities } from "@/lib/sgtx/brain-os";
//   await registerAllCapabilities();
//   await brainOrchestrator.initialize();
//   const result = await brainOrchestrator.invoke("compliance.eudr", input);
// =============================================================================

// --- Core -------------------------------------------------------------------
export { brainOrchestrator } from "./core/orchestrator";
export { eventBus } from "./core/event-bus";
export { moduleRegistry } from "./core/module-registry";

// --- Learning ---------------------------------------------------------------
export { learningLoop } from "./learning/learning-loop";
export { worldwideRoutesLearner } from "./learning/worldwide-routes-learner";
export type {
  WorldwideRoutePrediction,
  WorldwideRouteObservation,
  WorldwideRouteLearningStats,
} from "./learning/worldwide-routes-learner";

// --- Fine-Tuning Pipeline (Task FT) ----------------------------------------
export { datasetCollector } from "./learning/dataset-collector";
export type {
  TrainingExample,
  DatasetStats,
  DatasetFilters,
  DatasetPage,
} from "./learning/dataset-collector";
export {
  scoreQuality,
  LABELABLE_CAPABILITIES,
  HIGH_QUALITY_THRESHOLD,
  DEFAULT_READY_FOR_FINE_TUNING_THRESHOLD,
} from "./learning/dataset-collector";

export { fineTuningExporter } from "./learning/fine-tuning-exporter";
export {
  exportToJSONL,
  generateTrainValSplit,
  exportForUnsloth,
  exportForAxolotl,
  exportForLlamaFactory,
  exportForHuggingFaceTRL,
  exportAllFormats,
  DEFAULT_BASE_MODEL,
  FRAMEWORK_VERSIONS,
} from "./learning/fine-tuning-exporter";
export type {
  JsonlFormat,
  JsonlExportOptions,
  ExportManifest,
  TrainValSplit,
  LlamaFactoryExport,
  AllFormatsExport,
} from "./learning/fine-tuning-exporter";

export { fineTuningJobManager } from "./learning/fine-tuning-job-manager";
export type {
  FineTuningFramework,
  FineTuningJobStatus,
  FineTuningMetrics,
  FineTuningJob,
  JobListFilters,
  JobListPage,
} from "./learning/fine-tuning-job-manager";

// --- Scheduler (Task 1-B) ---------------------------------------------------
export {
  dailyRoutesSyncCron,
  initDailyRoutesSyncCron,
  stopDailyRoutesSyncCron,
  startDailyRoutesSyncCron,
  getDailySyncStatus,
} from "./scheduler/daily-routes-sync";
export type { DailySyncStatus } from "./scheduler/daily-routes-sync";

// --- Scheduler (shipping schedules — 12h sync of carrier-published ETAs) ---
export {
  shippingSchedulesSyncCron,
  startShippingSchedulesSyncCron,
  stopShippingSchedulesSyncCron,
  getShippingSchedulesSyncStatus,
} from "./scheduler/shipping-schedules-sync";
export type { ShippingSchedulesSyncStatus } from "./scheduler/shipping-schedules-sync";

// --- Capabilities -----------------------------------------------------------
export { registerAllCapabilities, allBrainModules } from "./capabilities/all-capabilities";

// Re-export individual capability modules for direct access (testing, etc.)
export {
  eudrModule,
  forceMajeureModule,
  sanctionsModule,
  ucp600Module,
  arbitrationModule,
  certificatesModule,
  chinaCustomsModule,
  codexPesticidesModule,
  countryDocRulesModule,
  customsMilestonesModule,
  euPesticidesModule,
  fxControlsModule,
  gccCustomsModule,
  ics2EnsModule,
  multiRegionPesticidesModule,
  multiSourcePesticidesModule,
  nowlunModule,
  preLoadingModule,
  productComplianceModule,
  regionalPesticidesModule,
  usCustomsModule,
  marketBrainModule,
  intelligenceBrainModule,
  disputeRiskModule,
  dynamicFeeModule,
  portalIntelligenceModule,
  complianceGateModule,
  freightPricingModule,
  transitTimeModule,
  hsCodeDetectorModule,
  customsPricingModule,
  vesselTrackingModule,
  containerTrackingModule,
  perishableRequirementsModule,
  workflowValidationModule,
  worldwideRoutesModule,
  learningModule,
} from "./capabilities/all-capabilities";

// --- Adapters (MULTI-AI-1) -------------------------------------------------
// Multi-provider adapter chain: Gemini → OpenAI → Groq → Static (NO ZAI).
export { providerRouter } from "./adapters/provider-router";
export {
  geminiAdapter,
  openaiAdapter,
  groqAdapter,
  staticFallbackAdapter,
  allAdapters,
  GeminiAdapter,
  OpenAIAdapter,
  GroqAdapter,
  StaticFallbackAdapter,
  // Backward-compat aliases (ZAI→Gemini). Some legacy modules still import
  // these names; they resolve to the Gemini adapter / class.
  zaiAdapter,
  ZAIAdapter,
} from "./adapters/model-adapters";
export type { ModelAdapter } from "./adapters/model-adapters";

// --- Storage (BRAIN-RESTORE) -----------------------------------------------
export { PostgresEventStore, postgresEventStore } from "./storage/postgres-event-store";
export type { EventStoreFilter, EventStoreRow } from "./storage/postgres-event-store";

// --- Crypto (BRAIN-RESTORE) -------------------------------------------------
export { PQCSigner, pqcSigner } from "./crypto/pqc-signatures";
export type { SignatureAlgorithm, SignatureResult, VerifyResult } from "./crypto/pqc-signatures";

// --- Self-Healing (BRAIN-RESTORE) ------------------------------------------
export { circuitBreaker, CircuitBreaker, CircuitOpenError } from "./self-healing/circuit-breaker";
export type { CircuitState } from "./self-healing/circuit-breaker";
export { retry, retryOrThrow, retryOnTransient } from "./self-healing/retry-policy";
export type { RetryOptions, RetryResult, RetryFailure } from "./self-healing/retry-policy";
export { healthMonitor, HealthMonitor } from "./self-healing/health-monitor";
export type { ModuleHealth, HealthSnapshot } from "./self-healing/health-monitor";

// --- Observability (BRAIN-RESTORE) -----------------------------------------
export { metrics, MetricsRegistry } from "./observability/metrics";
export type { MetricType, Labels } from "./observability/metrics";
export { tracing, Tracer } from "./observability/tracing";
export type { Span, SpanStatus, SpanKind, SpanEvent, ActiveSpan } from "./observability/tracing";
export { logger, Logger } from "./observability/structured-logging";
export type { LogLevel, LogEntry } from "./observability/structured-logging";
export { health, HealthCheck } from "./observability/health";
export type { HealthStatus, ProbeResult, HealthReport } from "./observability/health";

// --- Types ------------------------------------------------------------------
export type * from "./core/types";
