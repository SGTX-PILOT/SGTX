# SGTX OPA Policy — financing.rego
# Blueprint Part 1.2 — Financier preference filtering, co-financing sum ≤ requested amount
# Simulated by src/lib/sgtx/governor/policies.ts and src/lib/sgtx/financing/index.ts.
#
# Financing rules (Part 6):
#   • Financier preferences (jurisdiction, currency, max amount, min tenor) filter the bid list
#   • Co-financing: multiple financiers may share a single request, but the SUM of accepted bids
#     must be ≤ the requested amount (no over-funding)
#   • Financier must NOT be blacklisted
#   • Financier must hold a valid operating license for the trade jurisdiction
#   • DeFi financiers only allowed where jurisdiction permits defi_allowed=true

package sgtx.financing

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Single-financier financing request
# ────────────────────────────────────────────────────────────────────
allow {
  count(input.accepted_bids) == 1
  bid := input.accepted_bids[0]
  bid.amount <= input.requested_amount
  bid.amount >= input.minimum_bid_threshold
  financier_eligible(bid.financier_gtid, input)
  not financier_blacklisted(bid.financier_gtid)
}

# ────────────────────────────────────────────────────────────────────
# 2. Co-financing — multiple financiers, sum ≤ requested amount
# ────────────────────────────────────────────────────────────────────
allow {
  count(input.accepted_bids) > 1
  co_financing_sum(input.accepted_bids) <= input.requested_amount
  all_financiers_eligible(input.accepted_bids, input)
  no_blacklisted_financiers(input.accepted_bids)
  no_duplicate_financiers(input.accepted_bids)
}

# ────────────────────────────────────────────────────────────────────
# 3. DeFi financing — allowed only if jurisdiction permits
# ────────────────────────────────────────────────────────────────────
allow {
  input.financing_type == "DEFI"
  input.jurisdiction_defi_allowed == true
  bid := input.accepted_bids[0]
  bid.amount <= input.requested_amount
  defi_protocol_whitelisted(bid.protocol)
}

# ────────────────────────────────────────────────────────────────────
# Deny rules
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  co_financing_sum(input.accepted_bids) > input.requested_amount
  msg := sprintf(
    "Co-financing sum %.2f exceeds requested amount %.2f — over-funding is forbidden",
    [co_financing_sum(input.accepted_bids), input.requested_amount],
  )
}

deny[msg] {
  count(input.accepted_bids) == 0
  msg := "At least one accepted bid is required to disburse financing"
}

deny[msg] {
  bid := input.accepted_bids[_]
  financier_blacklisted(bid.financier_gtid)
  msg := sprintf("Financier %q is blacklisted", [bid.financier_gtid])
}

deny[msg] {
  bid := input.accepted_bids[_]
  not financier_eligible(bid.financier_gtid, input)
  msg := sprintf("Financier %q does not meet eligibility criteria for this request", [bid.financier_gtid])
}

deny[msg] {
  input.financing_type == "DEFI"
  input.jurisdiction_defi_allowed != true
  msg := "DeFi financing is not permitted in this jurisdiction"
}

deny[msg] {
  input.financing_type == "DEFI"
  bid := input.accepted_bids[_]
  not defi_protocol_whitelisted(bid.protocol)
  msg := sprintf("DeFi protocol %q is not whitelisted", [bid.protocol])
}

deny[msg] {
  has_duplicate_financier(input.accepted_bids)
  msg := "Duplicate financier detected in accepted bids — co-financing must be from distinct financiers"
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
co_financing_sum(bids) = sum {
  sum := sum([bid.amount | bid := bids[_]])
}

financier_blacklisted(gtid) {
  data.sgtx.blacklist.financiers[gtid] == true
}

financier_eligible(gtid, req) {
  prefs := data.sgtx.financiers[gtid].preferences
  req.jurisdiction in prefs.allowed_jurisdictions
  req.currency in prefs.allowed_currencies
  req.requested_amount <= prefs.max_amount
  req.tenor_days >= prefs.min_tenor_days
}

defi_protocol_whitelisted(protocol) {
  data.sgtx.defi_whitelist[protocol] == true
}

all_financiers_eligible(bids, req) {
  count([bid | bid := bids[_]; financier_eligible(bid.financier_gtid, req)]) == count(bids)
}

no_blacklisted_financiers(bids) {
  count([bid | bid := bids[_]; financier_blacklisted(bid.financier_gtid)]) == 0
}

no_duplicate_financiers(bids) {
  gtid_counts := {gtid: count([bid | bid := bids[_]; bid.financier_gtid == gtid]) |
    gtid := {bid.financier_gtid | bid := bids[_]}[_]
  }
  max([gtid_counts[k] | k := keys(gtid_counts)[_]]) == 1
}

has_duplicate_financier(bids) {
  gtid := bids[_].financier_gtid
  count([bid | bid := bids[_]; bid.financier_gtid == gtid]) > 1
}
