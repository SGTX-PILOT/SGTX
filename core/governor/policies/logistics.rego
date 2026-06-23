# SGTX OPA Policy — logistics.rego
# Blueprint Part 1.2 — Addendum signing, container release confirmation
# Simulated by src/lib/sgtx/governor/policies.ts.
#
# Logistics rules (Part 4):
#   • Logistics Service Provider (LSP) must sign a logistics addendum before any pickup
#   • Container release requires carrier confirmation (loaded + sealed)
#   • Carrier GTID must be present and active
#   • Bill of Lading (B/L) cannot be issued until container release confirmed
#   • Addendum covers: liability, transit window, insurance, demurrage

package sgtx.logistics

default allow = false

# ────────────────────────────────────────────────────────────────────
# 1. Container release — addendum signed + carrier confirmed
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "container.release"
  input.addendum_signed == true
  input.container_release_confirmed == true
  input.carrier_gtid != ""
  carrier_active(input.carrier_gtid)
  input.bl_type != ""
}

# ────────────────────────────────────────────────────────────────────
# 2. B/L issuance — requires container release + carrier confirmation
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "bl.issue"
  input.container_release_confirmed == true
  input.addendum_signed == true
  input.carrier_gtid != ""
  input.bl_type in {"ORIGINAL", "EB_L"}
  input.consignee_gtid != ""
}

# ────────────────────────────────────────────────────────────────────
# 3. Gate-out (container leaves terminal) — requires B/L issued + customs cleared
# ────────────────────────────────────────────────────────────────────
allow {
  input.action == "gate.out"
  input.bl_issued == true
  input.customs_cleared == true
  input.addendum_signed == true
}

# ────────────────────────────────────────────────────────────────────
# Deny rules
# ────────────────────────────────────────────────────────────────────
deny[msg] {
  input.addendum_signed != true
  msg := "Logistics addendum must be signed before container release — covers liability, transit, insurance, demurrage"
}

deny[msg] {
  input.action == "container.release"
  input.container_release_confirmed != true
  msg := "Carrier must confirm container is loaded + sealed before release"
}

deny[msg] {
  input.carrier_gtid == ""
  msg := "Carrier GTID is required for logistics actions"
}

deny[msg] {
  not carrier_active(input.carrier_gtid)
  msg := sprintf("Carrier %q is not an active logistics provider", [input.carrier_gtid])
}

deny[msg] {
  input.action == "bl.issue"
  input.container_release_confirmed != true
  msg := "B/L cannot be issued before container release is confirmed"
}

deny[msg] {
  input.action == "bl.issue"
  input.bl_type not in {"ORIGINAL", "EB_L"}
  msg := sprintf("B/L type %q invalid — must be ORIGINAL or EB_L (eB/L)", [input.bl_type])
}

deny[msg] {
  input.action == "bl.issue"
  input.consignee_gtid == ""
  msg := "B/L issuance requires a consignee GTID"
}

deny[msg] {
  input.action == "gate.out"
  input.bl_issued != true
  msg := "Gate-out requires B/L to be issued first"
}

deny[msg] {
  input.action == "gate.out"
  input.customs_cleared != true
  msg := "Gate-out requires customs clearance"
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────
carrier_active(gtid) {
  data.sgtx.providers[gtid].type in {"SHIP", "LSP"}
  data.sgtx.providers[gtid].status == "ACTIVE"
}
