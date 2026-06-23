# SGTX OPA Policy — fee.rego
# Blueprint Part 1.2 — Validates fee rate (1.5% fixed) and payer responsibility
# Authoritative source of truth for the SGTX fee gate.
# Simulated by src/lib/sgtx/governor/index.ts (feeGate + constitutionalRules).
#
# Constitutional fee rules (Part 1.3.2 fee_gate.wasm):
#   • Fee rate is FIXED at 1.5% (0.015) per country side
#   • Seller is responsible for the trade fee (non-custodial FeeLock split via PSP)
#   • Bound check: 0.1% ≤ rate ≤ 2.5% (constitutional, anything outside is rejected)
#   • Financing fee: 0.25% (separate policy)
#   • Optional services: 3% platform fee (separate policy)

package sgtx.fee

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Standard trade fee — 1.5% paid by seller, amount matches trade value × rate
# ────────────────────────────────────────────────────────────────────
allow {
  input.fee_rate == 0.015
  input.fee_payer == "seller"
  input.fee_amount == input.trade_value * 0.015
  within_constitutional_bounds(input.fee_rate)
}

# ────────────────────────────────────────────────────────────────────
# 2. Dual-side fee — both buyer and seller country fees collected (1.5% each)
# ────────────────────────────────────────────────────────────────────
allow {
  input.dual_side == true
  input.buyer_fee_amount == input.trade_value * 0.015
  input.seller_fee_amount == input.trade_value * 0.015
  input.buyer_fee_payer == "buyer"
  input.seller_fee_payer == "seller"
}

# ────────────────────────────────────────────────────────────────────
# 3. Special rate (must be approved via multisig + within 0.1%–2.5% bounds)
# ────────────────────────────────────────────────────────────────────
allow {
  input.special_rate == true
  input.multisig_approved == true
  within_constitutional_bounds(input.fee_rate)
  input.fee_amount == input.trade_value * input.fee_rate
}

# ────────────────────────────────────────────────────────────────────
# 4. Fee exemption — only for reserve attestation, requires GOV multisig
# ────────────────────────────────────────────────────────────────────
allow {
  input.fee_exempt == true
  input.exemption_reason == "reserve_attestation"
  input.multisig_approved == true
  input.approver_count >= 3
}

# ────────────────────────────────────────────────────────────────────
# Deny rules
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.fee_rate < 0.001
  msg := sprintf("Fee rate %.4f below constitutional minimum 0.10%%", [input.fee_rate])
}

deny[msg] {
  input.fee_rate > 0.025
  msg := sprintf("Fee rate %.4f above constitutional maximum 2.50%%", [input.fee_rate])
}

deny[msg] {
  input.fee_payer != "seller"
  input.dual_side != true
  input.special_rate != true
  input.fee_exempt != true
  msg := sprintf("Fee payer must be 'seller' (got %q)", [input.fee_payer])
}

deny[msg] {
  input.fee_amount != input.trade_value * input.fee_rate
  msg := sprintf(
    "Fee amount %.2f does not match trade_value %.2f × fee_rate %.4f",
    [input.fee_amount, input.trade_value, input.fee_rate],
  )
}

deny[msg] {
  input.special_rate == true
  input.multisig_approved != true
  msg := "Special rate requires multisig approval (≥3 Platform Governance Authority members)"
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
within_constitutional_bounds(rate) {
  rate >= 0.001
  rate <= 0.025
}
