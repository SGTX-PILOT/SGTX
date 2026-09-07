// @ts-nocheck
// =============================================================================
// distressed.rego — TS simulation (v17 Section 3.5 — OPA Rego #4)
// -----------------------------------------------------------------------------
// Distressed cargo policy: distressed country gate (BLOCKED jurisdictions
// DENY), micro-contract fee (1.5% × country factor), privacy notice,
// price-deviation limit.
//
// Original Rego:
//   package sgtx.distressed
//   default allow = false
//   allow {
//     input.condition_score >= 20
//     input.remaining_shelf_days >= 2
//     input.privacy_notice_acknowledged == true
//     input.price_deviation <= 0.50
//   }
//   deny[msg] { input.privacy_notice_acknowledged == false; msg := "Privacy notice must be acknowledged for accelerated outreach" }
//   deny[msg] { input.price_deviation > 0.50; msg := "Distressed price deviation exceeds 50% — requires justification" }
//
// v17 §3.5 distressed_country_gate.wasm — country tier:
//   FULL       → factor 1.0×  → fee 1.5%
//   STANDARD   → factor 1.2×  → fee 1.8%
//   LIMITED    → factor 1.5×  → fee 2.25%
//   RESTRICTED → factor 2.0×  → fee 3.0% (caps at 2.5% constitutional max → DENY)
//   BLOCKED    → DENY (cannot sell distressed cargo to BLOCKED jurisdictions)
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

export const DISTRESSED_BASE_FEE_RATE = 0.015; // 1.5%
export const DISTRESSED_MAX_PRICE_DEVIATION = 0.5; // 50% below asking

const COUNTRY_FACTORS: Record<string, number> = {
  FULL: 1.0,
  STANDARD: 1.2,
  LIMITED: 1.5,
  RESTRICTED: 2.0,
};

export function evaluate(input: PolicyInput): PolicyResult {
  // 1) Country gate — BLOCKED jurisdictions deny outright
  if (input.jurisdiction_tier === "BLOCKED") {
    return {
      allow: false,
      deny_reason: `Distressed cargo cannot be sold to BLOCKED jurisdiction ${input.dest_country ?? ""}.`,
      conditions: [
        {
          condition_id: "distressed_blocked_jurisdiction",
          label: `Jurisdiction ${input.dest_country ?? "?"} is BLOCKED — distressed cargo sale prohibited.`,
          status: "unmet",
          action_url: "/compliance/jurisdictions",
        },
      ],
    };
  }

  // 2) Privacy notice acknowledgment (Accelerated Outreach)
  if (input.privacy_notice_acknowledged === false) {
    return {
      allow: false,
      deny_reason: "Privacy notice must be acknowledged for Accelerated Outreach.",
      conditions: [
        {
          condition_id: "privacy_notice_required",
          label: "Privacy notice must be acknowledged before Accelerated Outreach can be enabled.",
          status: "unmet",
          action_url: "/distressed/privacy",
        },
      ],
    };
  }

  // 3) Price deviation — must be ≤ 50% below asking
  if (typeof input.price_deviation === "number" && input.price_deviation > DISTRESSED_MAX_PRICE_DEVIATION) {
    return {
      allow: false,
      deny_reason: "Distressed price deviation exceeds 50% — requires justification.",
      conditions: [
        {
          condition_id: "price_deviation_excessive",
          label: `Price deviation ${Math.round(input.price_deviation * 100)}% exceeds the 50% threshold — written justification required.`,
          status: "unmet",
          action_url: "/distressed/justify",
        },
      ],
    };
  }

  // 4) Condition score & shelf life
  if (typeof input.condition_score === "number" && input.condition_score < 20) {
    return {
      allow: false,
      deny_reason: "Condition score below 20 — cargo deemed unsellable.",
      conditions: [
        {
          condition_id: "condition_score_too_low",
          label: `Condition score ${input.condition_score}/100 is below the 20-point floor — cargo is unfit for distressed sale.`,
          status: "unmet",
        },
      ],
    };
  }
  if (typeof input.remaining_shelf_days === "number" && input.remaining_shelf_days < 2) {
    return {
      allow: false,
      deny_reason: "Remaining shelf life below 2 days — insufficient for logistics.",
      conditions: [
        {
          condition_id: "shelf_life_too_short",
          label: `Remaining shelf life ${input.remaining_shelf_days}d is below the 2-day minimum.`,
          status: "unmet",
        },
      ],
    };
  }

  // 5) Micro-contract fee — country factor × base rate
  if (input.jurisdiction_tier) {
    const factor = COUNTRY_FACTORS[input.jurisdiction_tier] ?? 1.0;
    const microFeeRate = DISTRESSED_BASE_FEE_RATE * factor;
    if (microFeeRate > 0.025) {
      // Constitutional cap — RESTRICTED at 2.0× would yield 3.0%, denied.
      return {
        allow: false,
        deny_reason: `Distressed fee rate ${(microFeeRate * 100).toFixed(2)}% exceeds 2.5% constitutional cap.`,
        conditions: [
          {
            condition_id: "distressed_fee_cap_exceeded",
            label: `Distressed micro-contract fee ${(microFeeRate * 100).toFixed(2)}% would exceed the 2.5% constitutional cap — choose a different jurisdiction or reduce factor.`,
            status: "unmet",
          },
        ],
      };
    }
    return {
      allow: true,
      conditions: [
        {
          condition_id: "distressed_micro_fee",
          label: `Micro-contract distressed fee: ${DISTRESSED_BASE_FEE_RATE * 100}% × ${factor}× = ${(microFeeRate * 100).toFixed(2)}%`,
          status: "met",
        },
      ],
    };
  }

  return { allow: true };
}
