import { NextRequest, NextResponse } from "next/server";
import { resolveTriDispute } from "@/lib/sgtx/dispute";

// POST /api/sgtx/tri/dispute/resolve — Resolve a TRI dispute (Platform Governance Authority).
// Body: { triDisputeId, reviewedByGtid, decision: "RESOLVED"|"REJECTED",
//         triAfter?, reviewNotes?, governorDecisionId? }
// On RESOLVED, the TRI is recalculated automatically and stored as a new TriHistory row.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await resolveTriDispute(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
