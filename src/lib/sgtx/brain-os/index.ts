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
  learningModule,
} from "./capabilities/all-capabilities";

// --- Adapters (BRAIN-RESTORE) ----------------------------------------------
export { providerRouter } from "./adapters/provider-router";
export {
  zaiAdapter,
  localAdapter,
  staticFallbackAdapter,
  allAdapters,
  ZAIAdapter,
  LocalAdapter,
  StaticFallbackAdapter,
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
