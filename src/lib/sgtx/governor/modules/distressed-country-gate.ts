// @ts-nocheck
// =============================================================================
// distressed_country_gate.wasm — 6th WasmEdge constitutional module (v17 §3.5)
// -----------------------------------------------------------------------------
// This is the dedicated TS module for `distressed_country_gate.wasm`.
// In production, this is a compiled WASM bundle executed by WasmEdge with a
// 50ms hard timeout. Here we simulate the module as a TypeScript function
// with the same input/output contract and 50ms timeout enforcement wrapper.
//
// Module metadata (also referenced in `wasm-modules.ts` registry):
//   name:           distressed_country_gate.wasm
//   version:        v2026.06.17-ria
//   loadedAt:       2026-06-17T08:00:00Z
//   status:         ACTIVE
//   signedBy:       SGTX-EG-GOV-000001-9A0B
//   description:    Distressed country gate — applies country-specific fee
//                   factor (1.0×–2.0×) to distressed cargo, blocks BLOCKED
//                   jurisdictions, conditional on RESTRICTED.
//
// Input:
//   {
//     seller_country,       // ISO-2
//     buyer_country,         // ISO-2
//     distressed_country,    // ISO-2 — the destination of the distressed cargo
//     ustn,                  // parent USTN
//     trade_value             // USD
//   }
//
// Output:
//   {
//     verdict:     "ALLOW" | "CONDITIONAL" | "DENY",
//     conditions?: PolicyCondition[],
//     reason:      string,
//     module_version: "v2026.06.17-ria",
//     evaluatedAt: ISO timestamp,
//     timedOut:    boolean,
//     durationMs:  number
//   }
//
// Decision logic:
//   1. If distressed_country is missing → ALLOW (no distressed gate applies).
//   2. Look up Jurisdiction by distressed_country code.
//   3. If countryCode not found in Jurisdiction table → CONDITIONAL with
//      "distressed_jurisdiction_unrated" condition (fail-closed).
//   4. If tier == "BLOCKED" → DENY (cannot sell distressed cargo to BLOCKED
//      jurisdictions per v17 §3.5).
//   5. If tier == "RESTRICTED" → CONDITIONAL with required enhanced due
//      diligence conditions.
//   6. If tier == "LIMITED" → CONDITIONAL with "pre-approved corridor only".
//   7. Otherwise → ALLOW, but mark factor on the condition.
// =============================================================================

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const MODULE_VERSION = "v2026.06.17-ria";
export const MODULE_NAME = "distressed_country_gate.wasm";
export const MODULE_TIMEOUT_MS = 50;

export type DistressedVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface DistressedCountryGateInput {
  seller_country?: string;
  buyer_country?: string;
  distressed_country?: string;
  ustn?: string;
  trade_value?: number;
}

export interface DistressedCountryGateCondition {
  condition_id: string;
  label: string;
  status: "met" | "unmet";
  action_url?: string;
}

export interface DistressedCountryGateResult {
  verdict: DistressedVerdict;
  conditions?: DistressedCountryGateCondition[];
  reason: string;
  module_version: typeof MODULE_VERSION;
  module_name: typeof MODULE_NAME;
  evaluatedAt: string;
  timedOut: boolean;
  durationMs: number;
}

const DISTRESSED_FACTORS: Record<string, number> = {
  FULL: 1.0,
  STANDARD: 1.2,
  LIMITED: 1.5,
  RESTRICTED: 2.0,
};

/**
 * Internal pure-function implementation of the gate logic.
 * No timeouts, no I/O side-effects beyond the DB lookup.
 */
async function runGateLogic(
  input: DistressedCountryGateInput,
): Promise<DistressedCountryGateResult> {
  const evaluatedAt = new Date().toISOString();
  const start = Date.now();

  // 1) No distressed country provided → gate does not apply.
  if (!input.distressed_country) {
    return {
      verdict: "ALLOW",
      reason: "No distressed country supplied — gate not applicable.",
      module_version: MODULE_VERSION,
      module_name: MODULE_NAME,
      evaluatedAt,
      timedOut: false,
      durationMs: Date.now() - start,
    };
  }

  // 2) Look up Jurisdiction.
  const jur = await db.jurisdiction.findUnique({
    where: { countryCode: input.distressed_country },
  });

  // 3) Unrated — fail-closed CONDITIONAL.
  if (!jur) {
    return {
      verdict: "CONDITIONAL",
      conditions: [
        {
          condition_id: `distressed_jurisdiction_unrated_${input.distressed_country}`,
          label: `Jurisdiction ${input.distressed_country} is not rated in the Jurisdiction table — manual compliance review required before distressed cargo can be sold.`,
          status: "unmet",
          action_url: "/compliance/jurisdictions",
        },
      ],
      reason: `Distressed destination ${input.distressed_country} is unrated — manual compliance review required.`,
      module_version: MODULE_VERSION,
      module_name: MODULE_NAME,
      evaluatedAt,
      timedOut: false,
      durationMs: Date.now() - start,
    };
  }

  // 4) BLOCKED → DENY.
  if (jur.tier === "BLOCKED") {
    return {
      verdict: "DENY",
      conditions: [
        {
          condition_id: "distressed_blocked_jurisdiction",
          label: `Distressed cargo cannot be sold to BLOCKED jurisdiction ${input.distressed_country}.`,
          status: "unmet",
          action_url: "/compliance/jurisdictions",
        },
      ],
      reason: `BLOCKED jurisdiction ${input.distressed_country} — distressed cargo sale prohibited (v17 §3.5).`,
      module_version: MODULE_VERSION,
      module_name: MODULE_NAME,
      evaluatedAt,
      timedOut: false,
      durationMs: Date.now() - start,
    };
  }

  // 5) RESTRICTED → CONDITIONAL + EDD requirements.
  if (jur.tier === "RESTRICTED") {
    return {
      verdict: "CONDITIONAL",
      conditions: [
        {
          condition_id: `distressed_restricted_${input.distressed_country}`,
          label: `Jurisdiction ${input.distressed_country} is RESTRICTED — enhanced due diligence required (sanctions screening, EDD questionnaire, compliance officer sign-off).`,
          status: "unmet",
          action_url: "/compliance/edd",
        },
        {
          condition_id: `distressed_factor_${input.distressed_country}`,
          label: `Distressed cargo fee factor: 1.5% × 2.0× = 3.0% — exceeds 2.5% constitutional cap. Reduce factor or pick a different jurisdiction.`,
          status: "unmet",
        },
      ],
      reason: `RESTRICTED jurisdiction ${input.distressed_country} — EDD + fee-cap violation.`,
      module_version: MODULE_VERSION,
      module_name: MODULE_NAME,
      evaluatedAt,
      timedOut: false,
      durationMs: Date.now() - start,
    };
  }

  // 6) LIMITED → CONDITIONAL — pre-approved corridor only.
  if (jur.tier === "LIMITED") {
    return {
      verdict: "CONDITIONAL",
      conditions: [
        {
          condition_id: `distressed_limited_${input.distressed_country}`,
          label: `Jurisdiction ${input.distressed_country} is LIMITED — distressed cargo only permitted via pre-approved corridor.`,
          status: "unmet",
          action_url: "/corridor",
        },
        {
          condition_id: `distressed_factor_${input.distressed_country}`,
          label: `Distressed cargo fee factor: 1.5% × 1.5× = 2.25% (within bounds).`,
          status: "met",
        },
      ],
      reason: `LIMITED jurisdiction ${input.distressed_country} — pre-approved corridor required.`,
      module_version: MODULE_VERSION,
      module_name: MODULE_NAME,
      evaluatedAt,
      timedOut: false,
      durationMs: Date.now() - start,
    };
  }

  // 7) FULL or STANDARD — ALLOW, factor note attached.
  const factor = DISTRESSED_FACTORS[jur.tier] ?? 1.0;
  const feeRate = 0.015 * factor;
  return {
    verdict: "ALLOW",
    conditions:
      factor > 1.0
        ? [
            {
              condition_id: `distressed_factor_${input.distressed_country}`,
              label: `Distressed cargo fee factor: 1.5% × ${factor}× = ${(feeRate * 100).toFixed(2)}% (within bounds).`,
              status: "met",
            },
          ]
        : undefined,
    reason: `Jurisdiction ${input.distressed_country} tier=${jur.tier} — ALLOW with factor ${factor}×.`,
    module_version: MODULE_VERSION,
    module_name: MODULE_NAME,
    evaluatedAt,
    timedOut: false,
    durationMs: Date.now() - start,
  };
}

/**
 * Public entrypoint: run the distressed country gate with 50ms hard timeout.
 *
 * If the gate exceeds 50ms, the module is treated as failed — the verdict
 * becomes DENY (fail-closed) and `timedOut: true` is set on the result.
 * This mirrors the WasmEdge 50ms hard timeout behaviour in production.
 */
export async function runDistressedCountryGate(
  input: DistressedCountryGateInput,
): Promise<DistressedCountryGateResult> {
  const start = Date.now();
  const evaluatedAt = new Date().toISOString();

  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`distressed_country_gate exceeded ${MODULE_TIMEOUT_MS}ms hard timeout`)),
      MODULE_TIMEOUT_MS,
    );
  });

  try {
    const result = await Promise.race([
      runGateLogic(input),
      timeoutPromise,
    ]);
    return result;
  } catch (err: any) {
    timedOut = true;
    logger.error(
      `[distressed_country_gate] constitutional violation — ${err?.message ?? String(err)}`,
      { ustn: input.ustn, distressed_country: input.distressed_country },
    );
    return {
      verdict: "DENY",
      conditions: [
        {
          condition_id: "distressed_country_gate_timeout",
          label: `Constitutional module distressed_country_gate.wasm exceeded the ${MODULE_TIMEOUT_MS}ms hard timeout — treated as DENY (fail-closed, v17 §1.3.4).`,
          status: "unmet",
        },
      ],
      reason: `Module timed out at ${MODULE_TIMEOUT_MS}ms — fail-closed DENY.`,
      module_version: MODULE_VERSION,
      module_name: MODULE_NAME,
      evaluatedAt,
      timedOut: true,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Quick synchronous sanity check — used by /api/sgtx/health to verify the
 * module loads without running the full Governor pipeline.
 */
export function getDistressedCountryGateMetadata() {
  return {
    name: MODULE_NAME,
    version: MODULE_VERSION,
    timeoutMs: MODULE_TIMEOUT_MS,
    description:
      "Distressed country gate — applies country-specific fee factor (1.0×–2.0×) " +
      "to distressed cargo, blocks BLOCKED jurisdictions, conditional on RESTRICTED/LIMITED.",
    factors: DISTRESSED_FACTORS,
  };
}
