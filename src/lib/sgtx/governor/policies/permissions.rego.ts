// @ts-nocheck
// =============================================================================
// permissions.rego — TS simulation (v17 Section 3.5 — OPA Rego #1)
// -----------------------------------------------------------------------------
// RBAC + dual-mode + data-scope policy.
//
// Original Rego (preserved for traceability):
//   package sgtx.permissions
//   default allow = false
//   allow {
//     input.action == "contract.sign"
//     input.actor_trader_mode == "BUY"
//     role_has_permission(input.actor_role, "contract.sign")
//     not resource_already_signed_by_buyer(input.resource.ustn)
//   }
//   allow {
//     input.action == "contract.sign"
//     input.actor_trader_mode == "SELL"
//     role_has_permission(input.actor_role, "contract.sign")
//     not resource_already_signed_by_seller(input.resource.ustn)
//   }
//   allow {
//     input.action == "trade.create"
//     input.actor_trader_mode in {"BUY", "DUAL"}
//     role_has_permission(input.actor_role, "trade.create")
//     input.readiness_score >= 70
//   }
//   permissions := { OWNER: {...}, ADMIN: {...}, OPERATOR: {...} }
//
// Non-marketplace principle: never suggest "view recommended counterparties".
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

const PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    "contract.sign",
    "trade.create",
    "fee.collect",
    "financing.request",
    "settlement.approve",
    "dispute.file",
    "logistics.quote.create",
    "logistics.quote.select",
    "logistics.fallback.activate",
  ],
  ADMIN: [
    "contract.sign",
    "trade.create",
    "fee.collect",
    "financing.request",
    "settlement.approve",
    "logistics.quote.create",
    "logistics.quote.select",
  ],
  OPERATOR: ["contract.sign", "trade.create", "dispute.file"],
};

export function evaluate(input: PolicyInput): PolicyResult {
  const action = input.action;
  const role = input.actor_role ?? "OPERATOR";
  const traderMode = input.actor_trader_mode;

  // 1) RBAC check
  const allowedPerms = PERMISSIONS[role];
  if (!allowedPerms || !allowedPerms.includes(action)) {
    return {
      allow: false,
      deny_reason: `Role "${role}" lacks permission for "${action}".`,
      conditions: [
        {
          condition_id: "insufficient_role",
          label: `Role "${role}" is not authorised for action "${action}".`,
          status: "unmet",
          action_url: "/admin/permissions",
        },
      ],
    };
  }

  // 2) Dual-mode context — contract.sign must match trader_mode
  if (action === "contract.sign") {
    if (traderMode === "BUY" && input.resource_already_signed_by_buyer) {
      return {
        allow: false,
        deny_reason: "Buyer side already signed.",
        conditions: [
          {
            condition_id: "duplicate_buyer_signature",
            label: "Buyer has already signed this contract.",
            status: "unmet",
          },
        ],
      };
    }
    if (traderMode === "SELL" && input.resource_already_signed_by_seller) {
      return {
        allow: false,
        deny_reason: "Seller side already signed.",
        conditions: [
          {
            condition_id: "duplicate_seller_signature",
            label: "Seller has already signed this contract.",
            status: "unmet",
          },
        ],
      };
    }
    if (!traderMode) {
      return {
        allow: false,
        deny_reason: "Trader mode required for contract signing.",
        conditions: [
          {
            condition_id: "no_trader_mode",
            label: "Trader mode (BUY/SELL/DUAL) must be set before contract signing.",
            status: "unmet",
            action_url: "/switch-mode",
          },
        ],
      };
    }
  }

  // 3) Trade creation — BUY or DUAL only + readiness ≥ 70
  if (action === "trade.create") {
    if (traderMode && !["BUY", "DUAL"].includes(traderMode)) {
      return {
        allow: false,
        deny_reason: "Trade creation is a buyer-side action.",
        conditions: [
          {
            condition_id: "wrong_mode_for_create",
            label: "Only BUY or DUAL mode can create a trade request.",
            status: "unmet",
            action_url: "/switch-mode",
          },
        ],
      };
    }
    if (typeof input.readiness_score === "number" && input.readiness_score < 70) {
      return {
        allow: false,
        deny_reason: `Trade readiness ${input.readiness_score}% is below required 70%.`,
        conditions: [
          {
            condition_id: "readiness_below_threshold",
            label: `Trade readiness score ${input.readiness_score}% is below required 70%.`,
            status: "unmet",
            action_url: "/admin/readiness",
          },
        ],
      };
    }
  }

  return { allow: true };
}
