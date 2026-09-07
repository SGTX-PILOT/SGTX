// @ts-nocheck
// =============================================================================
// logistics.rego — TS simulation (v17 Section 3.5 — OPA Rego #6)
// -----------------------------------------------------------------------------
// Logistics policy: Mode A/B/C, incoterm-mandatory services, non-marketplace
// guardrails.
//
// Original Rego:
//   package sgtx.logistics
//   default allow = false
//   allow {
//     input.addendum_signed == true
//     input.container_release_confirmed == true
//     input.carrier_gtid != ""
//   }
//   deny[msg] { input.addendum_signed == false; msg := "Logistics addendum must be signed before container release" }
//
// v17 §6 / §3.5 logistics modes:
//   Mode A — Seller arranges (FOB-ish, seller picks LSP, buyer reviews)
//   Mode B — Buyer arranges (CIF-ish, buyer picks LSP, seller adds addendum)
//   Mode C — Platform RFQ to LSP pool (recommended; transparent)
//
// Non-marketplace guardrails (v17 §11):
//   • SGTX never recommends specific LSPs — buyer/seller choose freely.
//   • RFQ results show only capability match + price transparency.
//   • No kickbacks, no ranking by commission, no "preferred provider" badge.
//
// Incoterm-mandatory services — Incoterms 2020 rules:
//   EXW  → buyer handles all (no seller services required)
//   FOB  → seller handles origin clearance + loading; buyer handles freight + destination
//   CIF  → seller handles freight + insurance to named port; buyer handles destination
//   DDP  → seller handles all (door-to-door, including destination clearance)
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

const INCOTERM_MANDATORY_SELLER_SERVICES: Record<string, string[]> = {
  EXW: [],
  FCA: ["origin-loading"],
  FOB: ["origin-clearance", "origin-loading"],
  CFR: ["origin-clearance", "origin-loading", "ocean-freight"],
  CIF: ["origin-clearance", "origin-loading", "ocean-freight", "insurance"],
  DAP: ["origin-clearance", "origin-loading", "main-carriage", "destination-on-carriage"],
  DDP: ["origin-clearance", "origin-loading", "main-carriage", "destination-on-carriage", "destination-clearance", "duty-payment"],
};

const ALLOWED_MODES = new Set(["A", "B", "C"]);

export function evaluate(input: PolicyInput): PolicyResult {
  // 1) Logistics mode must be A, B, or C
  if (input.logistics_mode && !ALLOWED_MODES.has(input.logistics_mode)) {
    return {
      allow: false,
      deny_reason: `Logistics mode "${input.logistics_mode}" is invalid — must be A, B, or C.`,
      conditions: [
        {
          condition_id: "invalid_logistics_mode",
          label: `Logistics mode "${input.logistics_mode}" is invalid. Valid modes: A (seller arranges), B (buyer arranges), C (platform RFQ).`,
          status: "unmet",
        },
      ],
    };
  }

  // 2) Mode-B/C addendum — must be signed before container release
  if (input.action === "logistics.container.release" && input.addendum_signed === false) {
    return {
      allow: false,
      deny_reason: "Logistics addendum must be signed before container release.",
      conditions: [
        {
          condition_id: "addendum_not_signed",
          label: "Logistics addendum must be signed by both parties before container release is authorised.",
          status: "unmet",
          action_url: "/logistics/addendum",
        },
      ],
    };
  }

  // 3) Container release requires a confirmed carrier GTID
  if (input.action === "logistics.container.release" && !input.carrier_gtid) {
    return {
      allow: false,
      deny_reason: "Carrier GTID required for container release.",
      conditions: [
        {
          condition_id: "no_carrier_gtid",
          label: "A carrier GTID is required before container release can be confirmed.",
          status: "unmet",
        },
      ],
    };
  }

  // 4) Incoterm-mandatory services — seller must provide required services
  if (input.incoterm && Array.isArray(input.provided_services)) {
    const required = INCOTERM_MANDATORY_SELLER_SERVICES[input.incoterm] || [];
    const missing = required.filter((svc) => !input.provided_services!.includes(svc));
    if (missing.length > 0) {
      return {
        allow: false,
        deny_reason: `Incoterm ${input.incoterm} requires seller services: ${missing.join(", ")}.`,
        conditions: [
          {
            condition_id: "missing_incoterm_services",
            label: `Incoterms 2020 "${input.incoterm}" requires the seller to provide: ${missing.join(", ")}.`,
            status: "unmet",
            action_url: "/logistics/services",
          },
        ],
      };
    }
  }

  // 5) Non-marketplace guardrail — RFQ results must NOT include "recommended"
  //    rankings by commission, kickback, or "preferred provider" flags.
  if (input.action === "logistics.rfq.publish" && Array.isArray(input.rfq_results)) {
    for (let i = 0; i < input.rfq_results.length; i++) {
      const result: any = input.rfq_results[i];
      if (result.recommended === true || result.preferred === true || result.kickback_pct > 0) {
        return {
          allow: false,
          deny_reason: `RFQ result ${i + 1} violates non-marketplace guardrail.`,
          conditions: [
            {
              condition_id: "non_marketplace_violation",
              label: `RFQ result ${i + 1} contains a non-marketplace flag (recommended/preferred/kickback). SGTX never recommends specific LSPs (v17 §11 non-marketplace principle).`,
              status: "unmet",
            },
          ],
        };
      }
    }
  }

  // 6) Mode-A: seller-arranged — carrier_gtid must be set by seller
  //    Mode-B: buyer-arranged — carrier_gtid must be set by buyer
  //    Mode-C: platform RFQ — buyer selects from capability-matched pool
  if (input.action === "logistics.carrier.select") {
    if (input.logistics_mode === "A" && input.carrier_set_by !== "seller") {
      return {
        allow: false,
        deny_reason: "Mode A requires the seller to select the carrier.",
        conditions: [
          {
            condition_id: "mode_a_carrier_wrong_party",
            label: "Logistics Mode A (seller arranges) requires the seller to select the carrier.",
            status: "unmet",
          },
        ],
      };
    }
    if (input.logistics_mode === "B" && input.carrier_set_by !== "buyer") {
      return {
        allow: false,
        deny_reason: "Mode B requires the buyer to select the carrier.",
        conditions: [
          {
            condition_id: "mode_b_carrier_wrong_party",
            label: "Logistics Mode B (buyer arranges) requires the buyer to select the carrier.",
            status: "unmet",
          },
        ],
      };
    }
  }

  return { allow: true };
}
