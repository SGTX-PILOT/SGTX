# SGTX OPA Policy — broker.rego
# Blueprint Part 1.2 — Service quotation acceptance, physical handling prerequisites
# Simulated by src/lib/sgtx/governor/policies.ts.
#
# Customs Broker rules (Part 4):
#   • Customs Broker (CBR) requires an accepted service quotation before engagement
#   • Physical handling prerequisites (warehouse, lift equipment, trained staff) must be ready
#   • Broker must hold a valid license for the entry port's jurisdiction
#   • Service fee must be > 0 and agreed in writing
#   • Broker cannot act as both buyer's and seller's broker on the same USTN (conflict of interest)

package sgtx.broker

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Standard broker engagement — quotation accepted + physical handling ready
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "broker.engage"
  input.quotation_accepted == true
  input.physical_handling_ready == true
  input.broker_gtid != ""
  broker_licensed(input.broker_gtid, input.entry_port_country)
  input.service_fee > 0
  not broker_already_engaged_on_ustn(input.broker_gtid, input.ustn, input.representing_side)
}

# ────────────────────────────────────────────────────────────────────
# 2. Customs declaration submission — requires engaged broker
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "customs.declare"
  input.broker_engaged == true
  input.broker_gtid != ""
  input.declaration_data_complete == true
  input.hs_code != ""
  input.origin_country != ""
}

# ────────────────────────────────────────────────────────────────────
# Deny rules
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.quotation_accepted != true
  msg := "Service quotation must be accepted before broker engagement — fee, scope, SLA all agreed in writing"
}

deny[msg] {
  input.physical_handling_ready != true
  msg := "Physical handling prerequisites not ready — warehouse, lift equipment, trained staff required"
}

deny[msg] {
  input.broker_gtid == ""
  msg := "Broker GTID is required for broker engagement"
}

deny[msg] {
  not broker_licensed(input.broker_gtid, input.entry_port_country)
  msg := sprintf("Broker %q does not hold a valid license for entry port country %q", [input.broker_gtid, input.entry_port_country])
}

deny[msg] {
  input.service_fee <= 0
  msg := "Service fee must be greater than zero — pro-bono brokerage is forbidden (AML red flag)"
}

deny[msg] {
  broker_already_engaged_on_ustan(input.broker_gtid, input.ustn, opposing_side(input.representing_side))
  msg := sprintf("Broker %q cannot act for both sides of the same USTN — conflict of interest", [input.broker_gtid])
}

deny[msg] {
  input.action == "customs.declare"
  input.broker_engaged != true
  msg := "Customs declaration requires an engaged broker"
}

deny[msg] {
  input.action == "customs.declare"
  input.hs_code == ""
  msg := "HS code is required for customs declaration"
}

deny[msg] {
  input.action == "customs.declare"
  input.origin_country == ""
  msg := "Origin country is required for customs declaration"
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
broker_licensed(gtid, country) {
  data.sgtx.providers[gtid].type == "CBR"
  data.sgtx.providers[gtid].licenses[_] == country
  data.sgtx.providers[gtid].status == "ACTIVE"
}

broker_already_engaged_on_ustn(gtid, ustn, side) {
  data.sgtx.trades[ustn].broker_engagements[side].broker_gtid == gtid
}

opposing_side(side) := "SELLER" {
  side == "BUYER"
}

opposing_side(side) := "BUYER" {
  side == "SELLER"
}
