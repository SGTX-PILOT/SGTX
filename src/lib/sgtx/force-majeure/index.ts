// @ts-nocheck
/**
 * SGTX Add-On 22 — Force Majeure (canonical lib entry point)
 * ===========================================================================
 *
 * Canonical home for the Add-On 22 (Force Majeure) library, matching the
 * per-add-on directory convention used by every other SGTX add-on
 * (src/lib/sgtx/<addon-slug>/index.ts — see demurrage/, broker-liability/,
 * insurance-lifecycle/, valuation/, cold-chain/, inspection/, currency-risk/,
 * gov-sandbox/, fta/, security/, compliance-calendar/, cargo-insurance/,
 * trade-finance/, back-to-back-lc/, shippers-declaration/, terminal/,
 * payment-guarantee/, guarantee-engine/, grire/, lc-engine/).
 *
 * The implementation still lives at `../compliance/force-majeure.ts` so
 * existing imports continue to resolve unchanged (backward-compat shim).
 * This file RE-EXPORTS the entire public surface of that module — types,
 * interfaces, constants, and functions — so new code SHOULD import from
 * `@/lib/sgtx/force-majeure` (the conventional path) while legacy imports
 * from `@/lib/sgtx/compliance/force-majeure` keep working.
 *
 * IMPORTANT: Do not move the implementation here without auditing every
 * existing import path; the audit (CB-AUDIT) explicitly flagged the
 * inconsistency but instructed to PRESERVE backward-compat. This index.ts
 * is therefore a thin re-export barrel, not a copy.
 *
 * Re-exported surface (see ../compliance/force-majeure.ts for the full
 * JSDoc + decision policy):
 *   Types:  ForceMajeureEventType, ForceMajeureSeverity, ForceMajeureEvent,
 *           ForceMajeureFeed, TradeForceMajeureAssessment,
 *           AssessTradeForceMajeureInput
 *   Funcs:  registerForceMajeureFeed, _clearForceMajeureFeedsForTest,
 *           getActiveForceMajeureEvents, assessTradeForceMajeure
 *   Consts: SEEDED_FORCE_MAJEURE_EVENTS
 *
 * Add-On 22 API surface (no change in behavior):
 *   - GET  /api/sgtx/force-majeure/events
 *   - GET  /api/sgtx/force-majeure/claims?ustn=X
 *   - POST /api/sgtx/force-majeure/claim
 *   - GET  /api/sgtx/bonds/sufficiency-check  (Add-On 22 supplement)
 *
 * Backward-compat import paths that MUST keep resolving:
 *   - `@/lib/sgtx/compliance/force-majeure`             (legacy, unchanged)
 *   - `@/lib/sgtx/force-majeure` / `@/lib/sgtx/force-majeure/index` (new canonical)
 */

export * from "../compliance/force-majeure";

// Re-export types explicitly so consumers can do
//   `import type { ForceMajeureEvent } from "@/lib/sgtx/force-majeure";`
// even if a future stricter isolatedModules build does not surface types via
// `export *` from a non-type-only module.
export type {
  ForceMajeureEventType,
  ForceMajeureSeverity,
  ForceMajeureEvent,
  ForceMajeureFeed,
  TradeForceMajeureAssessment,
  AssessTradeForceMajeureInput,
} from "../compliance/force-majeure";
