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
