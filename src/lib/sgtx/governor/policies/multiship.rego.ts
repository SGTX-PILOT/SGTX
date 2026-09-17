// @ts-nocheck
// =============================================================================
// multiship.rego — TS simulation (v17 Section 3.5 — OPA Rego #5)
// -----------------------------------------------------------------------------
// Multi-shipment policy: per-shipment USTN, per-shipment fee, schedule
// modification on unlocked shipments only.
//
// Original Rego:
//   package sgtx.multiship
//   default allow = false
//   allow {
//     count(input.shipments) > 0
//     all_shipments_locked(input.shipments)
//     all_fees_paid(input.shipments)
//   }
//   all_shipments_locked(ships) { count([s | s := ships[_]; s.locked == true]) == count(ships) }
//   all_fees_paid(ships)        { count([s | s := ships[_]; s.fee_paid == true]) == count(ships) }
//
// v17 §3.5 multi-shipment rules:
//   1. Each shipment gets its own USTN (per-shipment USTN, not contract USTN).
//   2. Each shipment has its own FeeLock (per-shipment fee, not contract fee).
//   3. Schedule modification (add/remove shipments, change dates) is only
//      permitted on UNLOCKED shipments. A locked shipment = FeeLock ACTIVE
//      → cannot be modified without going through the trade-change procedure
//      (signed amendment + governor re-approval).
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

interface Shipment {
  shipment_id: string;
  ustn?: string;
  locked?: boolean;
  feelock_state?: string;
  fee_paid?: boolean;
  schedule_window_start?: string;
  schedule_window_end?: string;
  requested_change?: "add" | "remove" | "modify_date" | "modify_quantity";
}

export function evaluate(input: PolicyInput): PolicyResult {
  const shipments: Shipment[] = Array.isArray(input.shipments) ? input.shipments : [];

  // 1) Must have at least one shipment
  if (shipments.length === 0) {
    return {
      allow: false,
      deny_reason: "Multi-shipment contract requires at least one shipment.",
      conditions: [
        {
          condition_id: "no_shipments",
          label: "Cannot create a multi-shipment contract with zero shipments.",
          status: "unmet",
        },
      ],
    };
  }

  // 2) Per-shipment USTN — every shipment must have a USTN before lock
  if (input.action === "multiship.contract.activate") {
    const missingUstn = shipments.find((s) => !s.ustn);
    if (missingUstn) {
      return {
        allow: false,
        deny_reason: `Shipment ${missingUstn.shipment_id} has no USTN.`,
        conditions: [
          {
            condition_id: "missing_per_shipment_ustn",
            label: `Shipment ${missingUstn.shipment_id} has no per-shipment USTN — USTN is mandatory before activation (v17 §3.5).`,
            status: "unmet",
          },
        ],
      };
    }
  }

  // 3) Schedule modification — locked shipments cannot be modified
  if (input.action === "multiship.schedule.modify") {
    for (const s of shipments) {
      if (s.requested_change && s.locked === true) {
        return {
          allow: false,
          deny_reason: `Shipment ${s.shipment_id} is LOCKED — schedule modification prohibited.`,
          conditions: [
            {
              condition_id: `locked_shipment_${s.shipment_id}`,
              label: `Shipment ${s.shipment_id} has FeeLock state "${s.feelock_state ?? "ACTIVE"}" — schedule modification requires a signed trade-change amendment + Governor re-approval.`,
              status: "unmet",
              action_url: `/trades/amend?shipment=${s.shipment_id}`,
            },
          ],
        };
      }
    }
  }

  // 4) All shipments must be locked (FeeLock ACTIVE) and all fees paid
  //    for the contract to be fully closed.
  if (input.action === "multiship.contract.close") {
    const unlocked = shipments.filter((s) => !s.locked);
    const unpaid = shipments.filter((s) => !s.fee_paid);
    if (unlocked.length > 0 || unpaid.length > 0) {
      const conditions: any[] = [];
      for (const s of unlocked) {
        conditions.push({
          condition_id: `shipment_not_locked_${s.shipment_id}`,
          label: `Shipment ${s.shipment_id} is not yet locked (FeeLock not ACTIVE).`,
          status: "unmet",
        });
      }
      for (const s of unpaid) {
        conditions.push({
          condition_id: `shipment_fee_unpaid_${s.shipment_id}`,
          label: `Shipment ${s.shipment_id} fee is not yet paid.`,
          status: "unmet",
        });
      }
      return {
        allow: false,
        deny_reason: "Multi-shipment contract cannot close — pending lock or fee.",
        conditions,
      };
    }
  }

  // 5) Non-overlapping schedule windows — shipments within the same contract
  //    must not have overlapping schedule windows (logistics feasibility).
  if (input.action === "multiship.schedule.modify" || input.action === "multiship.contract.create") {
    for (let i = 0; i < shipments.length; i++) {
      for (let j = i + 1; j < shipments.length; j++) {
        const a = shipments[i];
        const b = shipments[j];
        if (
          a.schedule_window_start && a.schedule_window_end &&
          b.schedule_window_start && b.schedule_window_end
        ) {
          const overlap =
            new Date(a.schedule_window_start) < new Date(b.schedule_window_end) &&
            new Date(b.schedule_window_start) < new Date(a.schedule_window_end);
          if (overlap) {
            return {
              allow: false,
              deny_reason: `Schedule windows of ${a.shipment_id} and ${b.shipment_id} overlap.`,
              conditions: [
                {
                  condition_id: "overlapping_schedule_windows",
                  label: `Shipments ${a.shipment_id} and ${b.shipment_id} have overlapping schedule windows — logistics cannot fulfil both.`,
                  status: "unmet",
                },
              ],
            };
          }
        }
      }
    }
  }

  return { allow: true };
}
