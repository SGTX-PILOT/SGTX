// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §15 — Governor Gates API
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET  /api/sgtx/governor/gates
//      Lists every registered gate with metadata (gateId, phase, description,
//      severity). Optional `?phase=1|2|3|5` filters to a single phase.
//      Optional `?gateId=G3U5` returns a single gate's metadata.
//
// POST /api/sgtx/governor/gates
//      Validates all gates for a phase against a trade/quote/contract context.
//      Body:
//        {
//          phase: 1 | 2 | 3 | 5,
//          context: {
//            trade_id?:    string,
//            quote_id?:    string,
//            contract_id?: string,
//            ustn?:        string,
//            shipment_id?: string,
//            wizard_state?: any,   // optional pre-loaded state for Phase 1
//            phase2_input?: any,   // optional pre-loaded input for Phase 2
//          }
//        }
//      Response:
//        {
//          phase: 1 | 2 | 3 | 5,
//          gates: GateResult[],
//          critical_passed: number,
//          critical_total: number,
//          warnings: number,
//          overall_passed: boolean,
//        }
//
//      Optional `?gateId=G3U5` validates a single gate instead of all gates
//      for the phase. The response shape is the same (gates: [single result]).
//
// Auth: session required (middleware injects x-tenant-gtid). The route does
// NOT enforce IDOR isolation itself — the validators read by trade_id /
// quote_id / contract_id / ustn, and the middleware's tenant header is
// available for downstream audit but not enforced here (gate validation is
// read-only; the operator's RBAC on the underlying resources is enforced
// by the trade/quote/contract endpoints, not the gate validator).

import { NextRequest, NextResponse } from "next/server";
import {
  GOVERNOR_GATES,
  getGateById,
  getGatesByPhase,
  getGateCount,
  getPhaseGateCounts,
  validateGate,
  validateAllGatesForPhase,
  type GateContext,
} from "@/lib/sgtx/governor/gates-registry";

// GET /api/sgtx/governor/gates — list all gates (with metadata)
export async function GET(req: NextRequest) {
  const phaseParam = req.nextUrl.searchParams.get("phase");
  const gateIdParam = req.nextUrl.searchParams.get("gateId");

  // Single-gate lookup.
  if (gateIdParam) {
    const gate = getGateById(gateIdParam);
    if (!gate) {
      return NextResponse.json(
        { error: `Unknown gate: ${gateIdParam}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ gate });
  }

  // Phase filter.
  if (phaseParam) {
    const phaseNum = Number(phaseParam);
    if (![1, 2, 3, 5].includes(phaseNum)) {
      return NextResponse.json(
        { error: `Invalid phase ${phaseParam} — must be 1, 2, 3, or 5` },
        { status: 400 },
      );
    }
    const gates = getGatesByPhase(phaseNum as 1 | 2 | 3 | 5);
    return NextResponse.json({
      phase: phaseNum,
      count: gates.length,
      gates: gates.map((g) => ({
        gateId: g.gateId,
        phase: g.phase,
        description: g.description,
        severity: g.severity,
      })),
    });
  }

  // Full registry.
  const counts = getPhaseGateCounts();
  return NextResponse.json({
    total: getGateCount(),
    by_phase: counts,
    gates: GOVERNOR_GATES.map((g) => ({
      gateId: g.gateId,
      phase: g.phase,
      description: g.description,
      severity: g.severity,
    })),
  });
}

// POST /api/sgtx/governor/gates — validate gates for a phase
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body.phase === "undefined") {
    return NextResponse.json(
      { error: "phase (1|2|3|5) is required in the request body" },
      { status: 400 },
    );
  }
  const phaseNum = Number(body.phase);
  if (![1, 2, 3, 5].includes(phaseNum)) {
    return NextResponse.json(
      { error: `Invalid phase ${body.phase} — must be 1, 2, 3, or 5` },
      { status: 400 },
    );
  }

  // Build the gate context from the request body. We accept both snake_case
  // (per the documented API contract) and camelCase (per JS convention) for
  // resilience.
  const ctxInput = body.context || {};
  const ctx: GateContext = {
    trade_id:     ctxInput.trade_id     || ctxInput.tradeId,
    quote_id:     ctxInput.quote_id     || ctxInput.quoteId,
    contract_id:  ctxInput.contract_id || ctxInput.contractId,
    ustn:         ctxInput.ustn,
    shipment_id:  ctxInput.shipment_id || ctxInput.shipmentId,
    wizard_state: ctxInput.wizard_state || ctxInput.wizardState,
    phase2_input: ctxInput.phase2_input || ctxInput.phase2Input,
  };

  // Optional single-gate validation via ?gateId=G3U5
  const gateIdParam = req.nextUrl.searchParams.get("gateId");
  if (gateIdParam) {
    const gate = getGateById(gateIdParam);
    if (!gate) {
      return NextResponse.json(
        { error: `Unknown gate: ${gateIdParam}` },
        { status: 404 },
      );
    }
    if (gate.phase !== phaseNum) {
      return NextResponse.json(
        { error: `Gate ${gateIdParam} belongs to phase ${gate.phase}, not ${phaseNum}` },
        { status: 400 },
      );
    }
    const result = await validateGate(gateIdParam, ctx);
    return NextResponse.json({
      phase: phaseNum,
      gates: [result],
      critical_passed: result.passed && result.severity === "CRITICAL" ? 1 : 0,
      critical_total: result.severity === "CRITICAL" ? 1 : 0,
      warnings: result.severity === "WARNING" && !result.passed ? 1 : 0,
      overall_passed: result.passed || result.severity === "WARNING",
    });
  }

  // Default: validate all gates for the phase.
  try {
    const result = await validateAllGatesForPhase(phaseNum as 1 | 2 | 3 | 5, ctx);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Phase ${phaseNum} validation failed: ${e.message}` },
      { status: 500 },
    );
  }
}
