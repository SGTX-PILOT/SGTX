# SGTX OPA Policy — multiship.rego
# Blueprint Part 1.2 — Per-shipment lock conditions, fee payment per shipment
# Simulated by src/lib/sgtx/governor/policies.ts.
#
# Multi-shipment rules (Part 5):
#   • A single USTN may include multiple shipments (split delivery)
#   • Each shipment must be INDEPENDENTLY locked (incoterm + packing list signed)
#   • Fee must be paid PER SHIPMENT (not just once for the USTN)
#   • All shipments must have a valid carrier GTID before execution
#   • A shipment cannot be released until its own lock + fee conditions are met

package sgtx.multiship

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. All shipments locked + all fees paid → allowed to execute
# ────────────────────────────────────────────────────────────────────
allow {
  count(input.shipments) > 0
  all_shipments_locked(input.shipments)
  all_fees_paid(input.shipments)
  all_carriers_assigned(input.shipments)
}

# ────────────────────────────────────────────────────────────────────
# 2. Partial execution — only specific shipments with conditions met
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "shipment.execute.partial"
  shipment := input.shipments[input.target_shipment_id]
  shipment.locked == true
  shipment.fee_paid == true
  shipment.carrier_gtid != ""
}

# ────────────────────────────────────────────────────────────────────
# Deny rules
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  count(input.shipments) == 0
  msg := "Multi-shipment trade requires at least one shipment"
}

deny[msg] {
  s := input.shipments[_]
  s.locked != true
  msg := sprintf("Shipment %q is not locked — incoterm + packing list must be signed first", [s.shipment_id])
}

deny[msg] {
  s := input.shipments[_]
  s.fee_paid != true
  msg := sprintf("Shipment %q fee not paid — fee is required PER SHIPMENT (not per USTN)", [s.shipment_id])
}

deny[msg] {
  s := input.shipments[_]
  s.carrier_gtid == ""
  msg := sprintf("Shipment %q has no carrier assigned — assign a carrier GTID before execution", [s.shipment_id])
}

deny[msg] {
  s := input.shipments[_]
  s.incoterm == ""
  msg := sprintf("Shipment %q has no incoterm — incoterm is required for each shipment", [s.shipment_id])
}

deny[msg] {
  s := input.shipments[_]
  s.packing_list_signed != true
  msg := sprintf("Shipment %q packing list not signed — packing list signature required for lock", [s.shipment_id])
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
all_shipments_locked(ships) {
  count([s | s := ships[_]; s.locked == true]) == count(ships)
}

all_fees_paid(ships) {
  count([s | s := ships[_]; s.fee_paid == true]) == count(ships)
}

all_carriers_assigned(ships) {
  count([s | s := ships[_]; s.carrier_gtid != ""]) == count(ships)
}
