# SGTX OPA Policy — permissions.rego
# Blueprint Part 1.2 — RBAC, dual-mode context, data scopes
# Authoritative source of truth for the SGTX Governor permission model.
# Simulated by src/lib/sgtx/governor/policies.ts (opaEvaluate).
#
# SGTX is a NON-MARKETPLACE system. This policy MUST NEVER include a
# "view recommended counterparties" permission. Matchmaking is forbidden.

package sgtx.permissions

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Trader with BUY mode can sign a contract as the buyer side
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "contract.sign"
  input.actor_trader_mode == "BUY"
  role_has_permission(input.actor_role, "contract.sign")
  not resource_already_signed_by_buyer(input.resource.ustn)
}

# ────────────────────────────────────────────────────────────────────
# 2. Trader with SELL mode can sign a contract as the seller side
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "contract.sign"
  input.actor_trader_mode == "SELL"
  role_has_permission(input.actor_role, "contract.sign")
  not resource_already_signed_by_seller(input.resource.ustn)
}

# ────────────────────────────────────────────────────────────────────
# 3. DUAL-mode traders can act on either side (rare, requires KYB tier ≥ ENHANCED)
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "contract.sign"
  input.actor_trader_mode == "DUAL"
  role_has_permission(input.actor_role, "contract.sign")
  input.actor_kyb_tier == "ENHANCED"
}

# ────────────────────────────────────────────────────────────────────
# 4. Trade creation requires BUY or DUAL mode + readiness score ≥ 70
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "trade.create"
  input.actor_trader_mode in {"BUY", "DUAL"}
  role_has_permission(input.actor_role, "trade.create")
  input.readiness_score >= 70
}

# ────────────────────────────────────────────────────────────────────
# 5. Fee collection — only OWNER or ADMIN
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "fee.collect"
  input.actor_role in {"OWNER", "ADMIN"}
}

# ────────────────────────────────────────────────────────────────────
# 6. Settlement approval — OWNER or ADMIN, requires dual control
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "settlement.approve"
  input.actor_role in {"OWNER", "ADMIN"}
  input.dual_control_confirmed == true
}

# ────────────────────────────────────────────────────────────────────
# 7. Data scope — a tenant can only read trades where they are a party
# ────────────────────────────────────────────────────────────────────
can_read_trade {
  input.resource.buyer_gtid == input.actor_gtid
}

can_read_trade {
  input.resource.seller_gtid == input.actor_gtid
}

can_read_trade {
  input.resource.provider_gtids[_] == input.actor_gtid
}

can_read_trade {
  input.actor_role == "GOV"
  input.actor_jurisdiction == input.resource.jurisdiction
}

# ────────────────────────────────────────────────────────────────────
# 8. Forbidden action — view recommended counterparties (marketplace, banned)
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.action == "view.recommended.counterparties"
  msg := "SGTX is a non-marketplace system. Recommended-counterparty matchmaking is forbidden."
}

# ────────────────────────────────────────────────────────────────────
# 9. Role insufficient for action
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  not role_has_permission(input.actor_role, input.action)
  msg := sprintf("Role %q lacks permission for action %q", [input.actor_role, input.action])
}

# ────────────────────────────────────────────────────────────────────
# 10. Wrong trader mode for action
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.action in {"quote.submit", "exw.lock", "packing.lock", "logistics.addenda.sign"}
  input.actor_trader_mode == "BUY"
  msg := sprintf("Action %q requires SELL mode — current mode is BUY", [input.action])
}

deny[msg] {
  input.action in {"trade.create", "quote.accept", "settlement.approve"}
  input.actor_trader_mode == "SELL"
  msg := sprintf("Action %q requires BUY mode — current mode is SELL", [input.action])
}

# ────────────────────────────────────────────────────────────────────
# Helper: role-permission matrix
# ────────────────────────────────────────────────────────────────────
role_has_permission(role, action) {
  permissions[role][action] == true
}

permissions := {
  "OWNER": {
    "contract.sign": true,
    "trade.create": true,
    "fee.collect": true,
    "financing.request": true,
    "settlement.approve": true,
    "dispute.file": true,
    "quote.submit": true,
    "quote.accept": true,
  },
  "ADMIN": {
    "contract.sign": true,
    "trade.create": true,
    "fee.collect": true,
    "financing.request": true,
    "settlement.approve": true,
    "quote.submit": true,
    "quote.accept": true,
  },
  "OPERATOR": {
    "contract.sign": true,
    "trade.create": true,
    "dispute.file": true,
    "quote.submit": true,
  },
  "GOV": {
    "compliance.review": true,
    "reserve.attest": true,
  },
}

# Helpers for already-signed checks (data lookups)
resource_already_signed_by_buyer(ustn) {
  data.sgtx.trades[ustn].buyer_signed == true
}

resource_already_signed_by_seller(ustn) {
  data.sgtx.trades[ustn].seller_signed == true
}
