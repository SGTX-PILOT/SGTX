// SGTX Part 11 — Add-on library barrel
// Re-exports all Part 11 add-on stubs so callers can `import { assessGnnRisk, ... } from "@/lib/sgtx/addons"`.

export {
  assessGnnRisk,
  getTradeGraphScore,
  type GnnRiskAssessment,
  type TradeGraphScore,
} from "./gnn";

export {
  signWithDilithium3,
  verifyDilithium3,
  getPqcPublicKey,
} from "./pqc";

export {
  generateReserveProof,
  generatePriceProof,
  verifyZkProof,
  getZkStats,
  type ReserveProof,
  type PriceProof,
} from "./zk";

export {
  runCausalAnalysis,
  type CausalFactor,
  type RootCause,
  type CausalAnalysisResult,
} from "./causal";

export {
  getFederatedModelStatus,
  submitLocalTrainingResults,
  type FederatedModelCard,
  type FederatedModelStatus,
} from "./federated";

// Add-on activation (Part 11.8)
export {
  listAddons,
  activateAddon,
  deactivateAddon,
  getAddonConfig,
  updateAddonConfig,
  ensureAddonsSeeded,
  ADDON_DESCRIPTORS,
} from "./activation";

// Self-healing (Part 11.4)
export {
  getClusterHealth,
  predictFailures,
  triggerHealingAction,
  getChaosTestResults,
  runChaosTest,
  getSelfHealingStats,
  getHealingHistory,
  getChaosHistory,
} from "./self-healing";

// Chaos engineering (Part 11.4)
export {
  runChaosExperiment,
  detectAnomaly,
  selfHeal,
} from "./chaos";

// Pentest (Part 11.5) — with aliases for routes that import different names
export {
  runScan as runPentest,
  getScanResults,
  getScanHistory,
  remediateFinding,
  getPentestStats,
} from "./pentest";

// Alias: routes import listPentestFindings and remediatePentestFinding
export { getScanResults as listPentestFindings } from "./pentest";
export { remediateFinding as remediatePentestFinding } from "./pentest";
