// SGTX Brain OS — Public API
// =============================================================================
// The Brain OS is the single orchestrating layer for ALL SGTX features.
// Every compliance module, AI module, and external integration is registered
// here and dispatched through the Brain.
//
// Usage:
//   import { brainOrchestrator, registerAllCapabilities } from "@/lib/sgtx/brain-os";
//   await registerAllCapabilities();
//   await brainOrchestrator.initialize();
//   const result = await brainOrchestrator.invoke("compliance.eudr", input);
// =============================================================================

export { brainOrchestrator } from "./core/orchestrator";
export { eventBus } from "./core/event-bus";
export { moduleRegistry } from "./core/module-registry";
export { learningLoop } from "./learning/learning-loop";
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

export type * from "./core/types";
