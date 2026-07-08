/**
 * SGTX Workflow Phase Modules — Public API
 * =========================================
 *
 * Workflow-phase LOGIC modules that modify / enrich the standard SGTX
 * workflow phases (pre-loading, in-transit, pre-arrival, clearance,
 * post-clearance) with country-specific rules and milestones.
 *
 * SGTX is NOT a marketplace. These modules are deterministic logic
 * engines — no external API calls. Real filings against customs / port /
 * biosecurity authorities are performed via pluggable provider interfaces
 * (see `PreLoadingFilingProvider`) that the workflow engine invokes in a
 * controlled phase.
 *
 * Re-exports:
 *   • `assessPreLoading` (pre-loading.ts) — country-specific mandatory
 *     pre-loading filings (ACID, ENS, ISF, FASAH, AFAX, AEP, Siscomex,
 *     ICEGATE, TekSig, …).
 *   • `getCustomsMilestones` (customs-milestones.ts) — country-specific
 *     customs milestone list for the execution phase.
 */

export {
  assessPreLoading,
  hasPreLoadingRequirements,
  isPreLoadingStepApplicable,
  mockFilingReference,
  registerPreLoadingProvider,
  __clearPreLoadingProvidersForTest,
  PRE_LOADING_EU_COUNTRIES,
  ARAB_LEAGUE_COUNTRIES,
} from "./pre-loading";

export type {
  PreLoadingStep,
  PreLoadingResult,
  PreLoadingAssessmentInput,
  PreLoadingStepKind,
  PreLoadingFilingProvider,
  PreLoadingTransportMode,
} from "./pre-loading";

export {
  getCustomsMilestones,
  totalEstimatedDurationHours,
  isCbamHsCode,
} from "./customs-milestones";

export type {
  CustomsMilestone,
  CustomsMilestoneResult,
  CustomsMilestoneInput,
  CustomsMilestonePhase,
  CustomsTransportMode,
} from "./customs-milestones";
