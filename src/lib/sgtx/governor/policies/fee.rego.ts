// @ts-nocheck
// =============================================================================
// fee.rego — TS simulation (v17 Section 3.5 — OPA Rego #2)
// -----------------------------------------------------------------------------
// Fee validation: fee rate within 0.1%–2.5% constitutional bounds, FeeLock
// state machine (PENDING → ACTIVE → PARTIALLY_RELEASED | DISPUTED | CANCELLED).
//
// Original Rego:
//   package sgtx.fee
//   default allow = false
//   allow {
//     input.fee_rate >= 0.001
//     input.fee_rate <= 0.025
//     input.fee_payer == "seller"
//     input.fee_amount == input.trade_value * input.fee_rate
//   }
//   deny[msg] { input.fee_rate < 0.001; msg := "Fee rate below constitutional minimum (0.1%)" }
//   deny[msg] { input.fee_rate > 0.025; msg := "Fee rate above constitutional maximum (2.5%)" }
//
// FeeLock state machine (v17 Section 3.5 — Non-Custodial Control Plane):
//   PENDING              → fee instruction created, awaiting payer signature
//   ACTIVE               → payer signed, USTN minted, fee locked in escrow
//   PARTIALLY_RELEASED   → some sub-components released against milestone
//   DISPUTED             → payer raised a fee dispute
//   CANCELLED            → trade cancelled, fee instruction voided
//
// Validated transitions enforced here so OPA and the FeeLock microservice
// agree on the allowed paths.
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

export const MIN_FEE_RATE = 0.001; // 0.1%
export const MAX_FEE_RATE = 0.025; // 2.5%

const FEELOCK_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PARTIALLY_RELEASED", "DISPUTED", "CANCELLED"],
  PARTIALLY_RELEASED: ["DISPUTED", "CANCELLED"],
  DISPUTED: ["PARTIALLY_RELEASED", "CANCELLED"],
  CANCELLED: [],
};

export function evaluate(input: PolicyInput): PolicyResult {
  const conditions: any[] = [];

  // 1) Fee-rate bounds (constitutional)
  if (typeof input.fee_rate === "number") {
    if (input.fee_rate < MIN_FEE_RATE) {
      return {
        allow: false,
        deny_reason: "Fee rate below constitutional minimum (0.1%).",
        conditions: [
          {
            condition_id: "fee_below_min",
            label: `Fee rate ${(input.fee_rate * 100).toFixed(3)}% is below the 0.1% constitutional minimum.`,
            status: "unmet",
            action_url: "/admin/fees",
          },
        ],
      };
    }
    if (input.fee_rate > MAX_FEE_RATE) {
      return {
        allow: false,
        deny_reason: "Fee rate above constitutional maximum (2.5%).",
        conditions: [
          {
            condition_id: "fee_above_max",
            label: `Fee rate ${(input.fee_rate * 100).toFixed(3)}% is above the 2.5% constitutional maximum.`,
            status: "unmet",
            action_url: "/admin/fees",
          },
        ],
      };
    }
  }

  // 2) Payer assignment — seller pays trade fee
  if (input.fee_payer && input.fee_payer !== "seller") {
    return {
      allow: false,
      deny_reason: "Seller must pay the trade fee (constitution §3.5).",
      conditions: [
        {
          condition_id: "wrong_fee_payer",
          label: `fee_payer "${input.fee_payer}" rejected — only "seller" is constitutional.`,
          status: "unmet",
        },
      ],
    };
  }

  // 3) Fee amount matches trade_value × fee_rate (allow ±0.01 numeric tolerance)
  if (
    typeof input.trade_value === "number" &&
    typeof input.fee_rate === "number" &&
    typeof input.fee_amount === "number"
  ) {
    const expected = input.trade_value * input.fee_rate;
    if (Math.abs(input.fee_amount - expected) > 0.01) {
      return {
        allow: false,
        deny_reason: "Fee amount does not match trade_value × fee_rate.",
        conditions: [
          {
            condition_id: "fee_amount_mismatch",
            label: `Fee amount ${input.fee_amount} does not match expected ${expected.toFixed(2)} (trade_value × fee_rate).`,
            status: "unmet",
          },
        ],
      };
    }
  }

  // 4) FeeLock state-machine transition check
  if (input.feelock_current_state && input.feelock_target_state) {
    const allowed = FEELOCK_TRANSITIONS[input.feelock_current_state] || [];
    if (!allowed.includes(input.feelock_target_state)) {
      return {
        allow: false,
        deny_reason: `Invalid FeeLock transition ${input.feelock_current_state} → ${input.feelock_target_state}.`,
        conditions: [
          {
            condition_id: "invalid_feelock_transition",
            label: `FeeLock cannot transition from ${input.feelock_current_state} to ${input.feelock_target_state}. Allowed: ${allowed.join(", ") || "— (terminal state)"}.`,
            status: "unmet",
          },
        ],
      };
    }
  }

  return { allow: true, conditions };
}
