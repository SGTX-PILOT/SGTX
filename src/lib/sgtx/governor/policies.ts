// SGTX OPA Policy Engine (Blueprint Part 1.2)
// 7 policy categories as .rego source representations + hot-reload support.
// In production these are .rego files in /core/governor/policies/; here we store
// them in the OpaPolicy table for visualization and multisig-gated hot-reload.

export interface OpaPolicyDef {
  name: string;
  category: string;
  description: string;
  content: string;
}

export const OPA_POLICIES: OpaPolicyDef[] = [
  {
    name: "permissions.rego",
    category: "permissions",
    description: "RBAC, dual-mode context, data scopes. Never includes 'view recommended counterparties'.",
    content: `package sgtx.permissions

default allow = false

# Trader with BUY mode can sign contract as buyer
allow {
  input.action == "contract.sign"
  input.actor_trader_mode == "BUY"
  role_has_permission(input.actor_role, "contract.sign")
  not resource_already_signed_by_buyer(input.resource.ustn)
}

# Trader with SELL mode can sign contract as seller
allow {
  input.action == "contract.sign"
  input.actor_trader_mode == "SELL"
  role_has_permission(input.actor_role, "contract.sign")
  not resource_already_signed_by_seller(input.resource.ustn)
}

# Dual-mode context enforcement
allow {
  input.action == "trade.create"
  input.actor_trader_mode in {"BUY", "DUAL"}
  role_has_permission(input.actor_role, "trade.create")
  input.readiness_score >= 70
}

role_has_permission(role, action) {
  permissions[role][action]
}

permissions := {
  "OWNER": {"contract.sign": true, "trade.create": true, "fee.collect": true, "financing.request": true, "settlement.approve": true, "dispute.file": true},
  "ADMIN": {"contract.sign": true, "trade.create": true, "fee.collect": true, "financing.request": true, "settlement.approve": true},
  "OPERATOR": {"contract.sign": true, "trade.create": true, "dispute.file": true},
}`,
  },
  {
    name: "fee.rego",
    category: "fee",
    description: "Validates fee rate (0.1%–2.5%) and that seller pays trade fee.",
    content: `package sgtx.fee

default allow = false

allow {
  input.fee_rate >= 0.001
  input.fee_rate <= 0.025
  input.fee_payer == "seller"
  input.fee_amount == input.trade_value * input.fee_rate
}

deny[msg] {
  input.fee_rate < 0.001
  msg := "Fee rate below constitutional minimum (0.1%)"
}

deny[msg] {
  input.fee_rate > 0.025
  msg := "Fee rate above constitutional maximum (2.5%)"
}`,
  },
  {
    name: "financing.rego",
    category: "financing",
    description: "Financier preference filtering, co-financing sum ≤ requested amount.",
    content: `package sgtx.financing

default allow = false

allow {
  input.co_financing_sum <= input.requested_amount
  count(input.accepted_bids) > 0
  not financier_blacklisted(input.financier_gtid)
}

deny[msg] {
  input.co_financing_sum > input.requested_amount
  msg := "Co-financing sum exceeds requested amount"
}`,
  },
  {
    name: "distressed.rego",
    category: "distressed",
    description: "Price reasonableness, privacy notice acknowledgment.",
    content: `package sgtx.distressed

default allow = false

allow {
  input.condition_score >= 20
  input.remaining_shelf_days >= 2
  input.privacy_notice_acknowledged == true
  input.price_deviation <= 0.50
}

deny[msg] {
  input.privacy_notice_acknowledged == false
  msg := "Privacy notice must be acknowledged for accelerated outreach"
}

deny[msg] {
  input.price_deviation > 0.50
  msg := "Distressed price deviation exceeds 50% — requires justification"
}`,
  },
  {
    name: "multiship.rego",
    category: "multiship",
    description: "Per-shipment lock conditions, fee payment per shipment.",
    content: `package sgtx.multiship

default allow = false

allow {
  count(input.shipments) > 0
  all_shipments_locked(input.shipments)
  all_fees_paid(input.shipments)
}

all_shipments_locked(ships) {
  count([s | s := ships[_]; s.locked == true]) == count(ships)
}

all_fees_paid(ships) {
  count([s | s := ships[_]; s.fee_paid == true]) == count(ships)
}`,
  },
  {
    name: "logistics.rego",
    category: "logistics",
    description: "Addendum signing, container release confirmation.",
    content: `package sgtx.logistics

default allow = false

allow {
  input.addendum_signed == true
  input.container_release_confirmed == true
  input.carrier_gtid != ""
}

deny[msg] {
  input.addendum_signed == false
  msg := "Logistics addendum must be signed before container release"
}`,
  },
  {
    name: "broker.rego",
    category: "broker",
    description: "Service quotation acceptance, physical handling prerequisites.",
    content: `package sgtx.broker

default allow = false

allow {
  input.quotation_accepted == true
  input.physical_handling_ready == true
  input.broker_gtid != ""
  input.service_fee > 0
}

deny[msg] {
  input.quotation_accepted == false
  msg := "Service quotation must be accepted before broker engagement"
}`,
  },
];
