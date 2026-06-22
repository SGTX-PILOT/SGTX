# SGTX OPA Policy — distressed.rego
# Blueprint Part 1.2 — Price reasonableness, privacy notice acknowledgment
# Simulated by src/lib/sgtx/governor/index.ts (distressedCountryGate).
#
# Distressed cargo rules (Part 9 — Distressed Cargo Marketplace is BANNED;
# only the seller's CONSENTED financier and CONSENTED insurer may be invited):
#   • Cargo condition_score must be ≥ 20 (still salvageable)
#   • Remaining shelf life ≥ 2 days (enough for outreach + handover)
#   • Privacy notice MUST be acknowledged before accelerated outreach
#   • Price deviation ≤ 50% — anything larger requires explicit justification
#   • Only CONSENTED parties (financier, insurer) may be invited — NOT a marketplace
#   • Destination country must NOT be BLOCKED

package sgtx.distressed

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Standard distressed cargo declaration
# ────────────────────────────────────────────────────────────────────
allow {
  input.condition_score >= 20
  input.remaining_shelf_days >= 2
  input.privacy_notice_acknowledged == true
  input.price_deviation <= 0.50
  destination_not_blocked(input.destination_country)
  only_consented_parties_invited(input.invited_parties)
}

# ────────────────────────────────────────────────────────────────────
# 2. Price deviation > 50% — allowed only with explicit justification + multisig
# ────────────────────────────────────────────────────────────────────
allow {
  input.condition_score >= 20
  input.remaining_shelf_days >= 2
  input.privacy_notice_acknowledged == true
  input.price_deviation > 0.50
  input.justification_required == true
  input.justification_text != ""
  input.multisig_approved == true
  destination_not_blocked(input.destination_country)
}

# ────────────────────────────────────────────────────────────────────
# Deny rules
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.condition_score < 20
  msg := sprintf("Distressed cargo condition_score %d below minimum 20 — cargo is unsalvageable", [input.condition_score])
}

deny[msg] {
  input.remaining_shelf_days < 2
  msg := sprintf("Remaining shelf life %d days below minimum 2 — insufficient for outreach", [input.remaining_shelf_days])
}

deny[msg] {
  input.privacy_notice_acknowledged == false
  msg := "Privacy notice must be acknowledged before accelerated outreach (PDPL consent required)"
}

deny[msg] {
  input.price_deviation > 0.50
  input.justification_required != true
  msg := sprintf("Price deviation %.0f%% exceeds 50%% — explicit justification + multisig required", [input.price_deviation * 100])
}

deny[msg] {
  input.price_deviation > 0.50
  input.justification_required == true
  input.multisig_approved != true
  msg := "Distressed price deviation >50% requires multisig approval (≥3 Platform Governance Authority members)"
}

deny[msg] {
  destination_blocked(input.destination_country)
  msg := sprintf("Distressed cargo cannot be sold to BLOCKED jurisdiction %q", [input.destination_country])
}

deny[msg] {
  not only_consented_parties_invited(input.invited_parties)
  msg := "Only the seller's CONSENTED financier and CONSENTED insurer may be invited — SGTX is NOT a marketplace"
}

deny[msg] {
  count([p | p := input.invited_parties[_]; p.role == "MARKETPLACE_BUYER"]) > 0
  msg := "Inviting marketplace buyers to distressed cargo is forbidden (non-marketplace system)"
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
destination_not_blocked(cc) {
  data.sgtx.jurisdictions[cc].tier != "BLOCKED"
}

destination_blocked(cc) {
  data.sgtx.jurisdictions[cc].tier == "BLOCKED"
}

only_consented_parties_invited(parties) {
  count([p | p := parties[_]; p.role not in {"FINANCIER", "INSURER"; p.consented != true}]) == 0
}
