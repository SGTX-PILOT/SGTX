# SGTX OPA Policy — reserve.rego
# Blueprint Part 1.2 — Reserve composition rules, minimum backing ratio (≥110%)
# Simulated by src/lib/sgtx/governor/index.ts (reserveRules + opaEvaluate).
#
# Reserve rules (Part 1.3.6 reserve_rules.wasm):
#   • Reserve composition MUST be: 50% USD, 25% EUR, ≥15% gold, ≤10% other
#   • Minimum backing ratio ≥ 110% — if drops below, freeze ALL new trades + alert CBE
#   • Quarterly attestation by external auditor (Big Four) is mandatory
#   • Failure to attest → trades frozen until attestation completed
#   • CBE alert is automatic when ratio < 110% (no human gate)

package sgtx.reserve

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Standard trade — reserve ratio healthy + attestation current
# ────────────────────────────────────────────────────────────────────
allow {
  input.reserve_ratio >= 1.10
  input.quarterly_attestation == true
  composition_valid(input.reserve_composition)
  attestation_within_window(input.last_attestation_date)
}

# ────────────────────────────────────────────────────────────────────
# 2. Reserve attestation action — only GOV role, multisig required
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "reserve.attest"
  input.actor_role == "GOV"
  input.multisig_approved == true
  input.attestation_report_signed == true
  input.auditor_tier == "BIG_FOUR"
}

# ────────────────────────────────────────────────────────────────────
# 3. Reserve composition update — multisig + constitution-compliant
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "reserve.composition.update"
  input.multisig_approved == true
  composition_valid(input.new_composition)
  input.new_ratio >= 1.10
}

# ────────────────────────────────────────────────────────────────────
# Deny rules — backing ratio
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.reserve_ratio < 1.10
  msg := sprintf(
    "Reserve backing ratio %.0f%% below constitutional minimum 110%% — new trades frozen, CBE alerted automatically",
    [input.reserve_ratio * 100],
  )
}

deny[msg] {
  input.quarterly_attestation != true
  msg := "Quarterly reserve attestation by external auditor (Big Four) is required — trades frozen until attested"
}

# ────────────────────────────────────────────────────────────────────
# Deny rules — composition
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.reserve_composition.usd != 50
  msg := sprintf("USD reserve must be 50%% (got %d%%)", [input.reserve_composition.usd])
}

deny[msg] {
  input.reserve_composition.eur != 25
  msg := sprintf("EUR reserve must be 25%% (got %d%%)", [input.reserve_composition.eur])
}

deny[msg] {
  input.reserve_composition.gold < 15
  msg := sprintf("Gold reserve must be ≥15%% (got %d%%)", [input.reserve_composition.gold])
}

deny[msg] {
  input.reserve_composition.other > 10
  msg := sprintf("Other reserves must be ≤10%% (got %d%%)", [input.reserve_composition.other])
}

# ────────────────────────────────────────────────────────────────────
# Deny rules — attestation
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.action == "reserve.attest"
  input.actor_role != "GOV"
  msg := "Reserve attestation requires GOV role"
}

deny[msg] {
  input.action == "reserve.attest"
  input.multisig_approved != true
  msg := "Reserve attestation requires multisig approval (≥3 Platform Governance Authority members)"
}

deny[msg] {
  input.action == "reserve.attest"
  input.auditor_tier != "BIG_FOUR"
  msg := "Reserve attestation must be performed by a Big Four auditor (PwC, Deloitte, EY, KPMG)"
}

deny[msg] {
  not attestation_within_window(input.last_attestation_date)
  msg := "Quarterly attestation window exceeded — last attestation is more than 90 days old"
}

# ────────────────────────────────────────────────────────────────────
# Side effects — CBE alert
# ────────────────────────────────────────────────────────────────────
cbe_alert_required {
  input.reserve_ratio < 1.10
}

freeze_new_trades {
  input.reserve_ratio < 1.10
}

freeze_new_trades {
  input.quarterly_attestation != true
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
composition_valid(c) {
  c.usd == 50
  c.eur == 25
  c.gold >= 15
  c.other <= 10
}

attestation_within_window(last_date) {
  time.parse_rfc3339_ns(last_date) > time.now_ns() - 90 * 24 * 60 * 60 * 1000000000
}
