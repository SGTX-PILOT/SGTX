import { NextRequest, NextResponse } from "next/server";
import {
  USTN_LIFECYCLE_STATUSES,
  USTN_TRANSITIONS,
  getUstnLifecycleInfo,
  isTransitionAllowed,
} from "@/lib/sgtx/ustn";
import { enforceUstnLifecycleGate } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/ustn/lifecycle
// Returns the complete USTN lifecycle state machine (16 statuses + transitions).
// Per blueprint 3.2.1 + 3.2.17 (Quick Reference Card), this is the authoritative
// reference for the USTN lifecycle.
//
// Optional query params:
//   ?status=IN_TRANSIT      — return info for a specific status
//   ?from=IN_TRANSIT&to=ARRIVED — check if a specific transition is allowed
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  // Single-status info
  if (status) {
    const info = getUstnLifecycleInfo(status);
    return NextResponse.json(info);
  }

  // Transition check
  if (from && to) {
    const allowed = isTransitionAllowed(from, to);
    const gate = enforceUstnLifecycleGate({ currentStatus: from, nextStatus: to });
    return NextResponse.json({
      from,
      to,
      allowed,
      gate_id: gate.gate_id,
      verdict: gate.verdict,
      decision_id: gate.decision_id,
      tenant_message: gate.tenant_message,
      conditions: gate.conditions,
    });
  }

  // Full state machine reference
  const statuses = USTN_LIFECYCLE_STATUSES.map(s => getUstnLifecycleInfo(s));
  return NextResponse.json({
    format: "SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}",
    validation_regex: "^SGTX-[A-Z]{2}-\\d{2}-[A-Z0-9]{3,4}-\\d+$",
    total_statuses: statuses.length,
    statuses,
    transitions: USTN_TRANSITIONS,
    healthy_timeline: [
      "INITIATED", "STAGE1_PENDING", "STAGE1_SETTLED", "CUSTOMS_SUBMITTED",
      "BOOKED", "LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED",
      "CUSTOMS_IMPORT", "DELIVERED", "SETTLED", "COMPLETED",
    ],
    special_statuses: ["DISPUTED", "DISTRESSED", "CANCELLED"],
    terminal_statuses: ["COMPLETED", "CANCELLED"],
    gates: {
      G1U8: "USTN status transition is allowed (A4 Governor)",
    },
  });
}
