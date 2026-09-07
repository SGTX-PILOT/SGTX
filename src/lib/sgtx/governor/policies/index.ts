// @ts-nocheck
// =============================================================================
// OPA Rego policies — TS simulation aggregator (v17 §3.5)
// -----------------------------------------------------------------------------
// Exports all 7 OPA Rego policy modules and an `evaluateAllPolicies`
// aggregator that runs every policy against the same input.
//
// Decision merger logic:
//   • If any policy returns ALLOW=false, the overall verdict is DENY.
//   • Conditions from every policy are merged (some may already be "met").
//   • deny_reasons are concatenated so the Governor's tenant-message
//     generator can pick the most actionable one.
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";
import { evaluate as permissionsPolicy } from "./permissions.rego";
import { evaluate as feePolicy } from "./fee.rego";
import { evaluate as financingPolicy } from "./financing.rego";
import { evaluate as distressedPolicy } from "./distressed.rego";
import { evaluate as multishipPolicy } from "./multiship.rego";
import { evaluate as logisticsPolicy } from "./logistics.rego";
import { evaluate as brokerPolicy } from "./broker.rego";

export const POLICY_NAMES = [
  "permissions.rego",
  "fee.rego",
  "financing.rego",
  "distressed.rego",
  "multiship.rego",
  "logistics.rego",
  "broker.rego",
] as const;

export type PolicyName = (typeof POLICY_NAMES)[number];

export const POLICIES: Record<PolicyName, (input: PolicyInput) => PolicyResult> = {
  "permissions.rego": permissionsPolicy,
  "fee.rego": feePolicy,
  "financing.rego": financingPolicy,
  "distressed.rego": distressedPolicy,
  "multiship.rego": multishipPolicy,
  "logistics.rego": logisticsPolicy,
  "broker.rego": brokerPolicy,
};

export interface AggregatePolicyResult {
  results: Record<PolicyName, PolicyResult>;
  overallAllow: boolean;
  failed: PolicyName[];
  /** The most actionable deny_reason (first non-undefined). */
  primaryDenyReason?: string;
  /** All deny reasons concatenated, for audit / debug. */
  allDenyReasons: string[];
  /** Merged conditions across all policies. */
  conditions: PolicyResult["conditions"];
  /** Evaluated at (ISO timestamp). */
  evaluatedAt: string;
}

/**
 * Run all 7 OPA Rego policies against `input` and merge the results.
 *
 * The Governor's WasmEdge/OPA pipeline calls this once per decision and
 * treats any DENY as final (no override possible — even AI Consult cannot
 * override a DENY, per v17 §1.4 AI Authority Ladder).
 */
export function evaluateAllPolicies(input: PolicyInput): AggregatePolicyResult {
  const evaluatedAt = new Date().toISOString();
  const results: Record<PolicyName, PolicyResult> = {} as any;
  const allDenyReasons: string[] = [];
  const failed: PolicyName[] = [];
  const conditions: PolicyResult["conditions"] = [];

  for (const name of POLICY_NAMES) {
    let result: PolicyResult;
    try {
      result = POLICIES[name](input);
    } catch (err: any) {
      // A policy that throws is treated as a fail-closed DENY — this is the
      // OPA default behaviour (`default allow = false`) and prevents a
      // misconfigured policy from accidentally allowing an action.
      result = {
        allow: false,
        deny_reason: `policy ${name} threw: ${err?.message ?? String(err)}`,
        conditions: [
          {
            condition_id: `policy_threw_${name.replace(/\./g, "_")}`,
            label: `Policy ${name} failed to evaluate — fail-closed DENY.`,
            status: "unmet",
          },
        ],
      };
    }
    results[name] = result;
    if (!result.allow) {
      failed.push(name);
      if (result.deny_reason) allDenyReasons.push(`[${name}] ${result.deny_reason}`);
    }
    if (result.conditions && result.conditions.length > 0) {
      conditions.push(...result.conditions);
    }
  }

  return {
    results,
    overallAllow: failed.length === 0,
    failed,
    primaryDenyReason: allDenyReasons[0],
    allDenyReasons,
    conditions,
    evaluatedAt,
  };
}

/**
 * Convenience: evaluate a single named policy.
 */
export function evaluatePolicy(name: PolicyName, input: PolicyInput): PolicyResult {
  const fn = POLICIES[name];
  if (!fn) throw new Error(`Unknown OPA Rego policy: ${name}`);
  return fn(input);
}

export { permissionsPolicy, feePolicy, financingPolicy, distressedPolicy, multishipPolicy, logisticsPolicy, brokerPolicy };
export type { PolicyInput, PolicyResult, PolicyCondition } from "./types";
