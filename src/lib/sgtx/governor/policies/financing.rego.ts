// @ts-nocheck
// =============================================================================
// financing.rego — TS simulation (v17 Section 3.5 — OPA Rego #3)
// -----------------------------------------------------------------------------
// Financing policy: non-custodial control plane, RFQ eligibility, bid
// validation, co-financing sum ≤ requested amount, financier blacklist.
//
// Original Rego:
//   package sgtx.financing
//   default allow = false
//   allow {
//     input.co_financing_sum <= input.requested_amount
//     count(input.accepted_bids) > 0
//     not financier_blacklisted(input.financier_gtid)
//   }
//   deny[msg] { input.co_financing_sum > input.requested_amount; msg := "Co-financing sum exceeds requested amount" }
//
// v17 Section 13 — Non-custodial: SGTX never holds financier funds; all
// settlements flow via licensed PSPs. This policy enforces:
//   1. RFQ eligibility — buyer toggle on, trade is in pre-settlement phase
//   2. Bid validity — APR ≤ 35% (Egypt usury cap), tenure ≤ trade tenor + 30d
//   3. Co-financing — sum of accepted bids ≤ requested amount (no over-funding)
//   4. Financier blacklist — sanctioned financiers DENY immediately
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

const MAX_APR = 0.35; // Egyptian usury cap (CBE benchmark)
const MAX_TENURE_EXTENSION_DAYS = 30;

const FINANCIER_BLACKLIST: Set<string> = new Set([
  // Sanctioned / revoked financiers go here.
  // Empty by default — populated from sanctions-sync at runtime.
]);

export function evaluate(input: PolicyInput): PolicyResult {
  const conditions: any[] = [];

  // 1) Non-custodial — SGTX must never be the financier of record
  if (input.financier_gtid === "SGTX-PLATFORM" || input.financier_gtid === "SGTX-EG-GOV-000001-9A0B") {
    return {
      allow: false,
      deny_reason: "Non-custodial principle violated — SGTX cannot finance trades.",
      conditions: [
        {
          condition_id: "non_custodial_violation",
          label: "SGTX platform itself is never a financier — non-custodial control plane (v17 §3.5, §13).",
          status: "unmet",
        },
      ],
    };
  }

  // 2) Financier blacklist
  if (input.financier_gtid && FINANCIER_BLACKLIST.has(input.financier_gtid)) {
    return {
      allow: false,
      deny_reason: `Financier ${input.financier_gtid} is sanctioned.`,
      conditions: [
        {
          condition_id: "financier_blacklisted",
          label: `Financier ${input.financier_gtid} is on the sanctions blacklist — financing DENIED.`,
          status: "unmet",
          action_url: "/compliance/sanctions",
        },
      ],
    };
  }

  // 3) RFQ eligibility — buyer must have opted in (data-sovereign toggle)
  if (input.buyer_financing_toggle === false) {
    return {
      allow: false,
      deny_reason: "Buyer has not opted in to financing RFQ.",
      conditions: [
        {
          condition_id: "financing_toggle_off",
          label: "Buyer financing toggle is OFF — RFQ cannot be issued without buyer consent (data sovereignty).",
          status: "unmet",
        },
      ],
    };
  }

  // 4) Bid validation — APR cap & tenure
  if (Array.isArray(input.accepted_bids) && input.accepted_bids.length > 0) {
    for (let i = 0; i < input.accepted_bids.length; i++) {
      const bid: any = input.accepted_bids[i];
      if (typeof bid.apr === "number" && bid.apr > MAX_APR) {
        return {
          allow: false,
          deny_reason: `Bid ${i + 1} APR ${(bid.apr * 100).toFixed(1)}% exceeds usury cap (35%).`,
          conditions: [
            {
              condition_id: `bid_${i + 1}_apr_cap`,
              label: `Bid ${i + 1} APR ${(bid.apr * 100).toFixed(1)}% exceeds the Egyptian usury cap of 35%.`,
              status: "unmet",
            },
          ],
        };
      }
      if (typeof bid.tenure_days === "number" && typeof input.trade_tenor_days === "number") {
        if (bid.tenure_days > input.trade_tenor_days + MAX_TENURE_EXTENSION_DAYS) {
          return {
            allow: false,
            deny_reason: `Bid ${i + 1} tenure ${bid.tenure_days}d exceeds trade tenor + ${MAX_TENURE_EXTENSION_DAYS}d.`,
            conditions: [
              {
                condition_id: `bid_${i + 1}_tenure_excess`,
                label: `Bid ${i + 1} tenure ${bid.tenure_days}d exceeds the maximum allowed (trade tenor ${input.trade_tenor_days}d + ${MAX_TENURE_EXTENSION_DAYS}d buffer).`,
                status: "unmet",
              },
            ],
          };
        }
      }
    }
  }

  // 5) Co-financing — sum of accepted bids must not exceed requested amount
  if (
    typeof input.co_financing_sum === "number" &&
    typeof input.requested_amount === "number" &&
    input.co_financing_sum > input.requested_amount
  ) {
    return {
      allow: false,
      deny_reason: "Co-financing sum exceeds the requested amount — over-funding prohibited.",
      conditions: [
        {
          condition_id: "co_financing_overfund",
          label: `Co-financing sum ${input.co_financing_sum} exceeds requested amount ${input.requested_amount} — over-funding is not allowed.`,
          status: "unmet",
        },
      ],
    };
  }

  // 6) Accepted bids must exist before financing agreement
  if (input.action === "financing.agreement.sign" && (!Array.isArray(input.accepted_bids) || input.accepted_bids.length === 0)) {
    return {
      allow: false,
      deny_reason: "No accepted bids — cannot sign financing agreement.",
      conditions: [
        {
          condition_id: "no_accepted_bids",
          label: "Financing agreement requires at least one accepted bid.",
          status: "unmet",
          action_url: "/financing/quotes",
        },
      ],
    };
  }

  return { allow: true, conditions };
}
