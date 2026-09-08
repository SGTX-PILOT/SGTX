// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Resolve a USTN conflict (Sovereign Jurisdiction Supremacy)
// ═══════════════════════════════════════════════════════════════════════════════
//
// POST /api/sgtx/mutual-ustn/resolve
//   body: {
//     ustn: "USTN-EG-2024-00001",
//     conflicting_states: [
//       { nodeId: "NODE-CAIRO-01",     state: "ACCEPTED",  reason: "Issuing node — auto-accepted" },
//       { nodeId: "NODE-FRANKFURT-01", state: "REJECTED",  reason: "EU sanctions list hit" },
//       { nodeId: "NODE-DUBAI-01",     state: "ACCEPTED",  reason: "GCC cleared" }
//     ]
//   }
//
// When nodes disagree about the state of a USTN, the STRICTEST rule wins
// (per Sovereign Jurisdiction Supremacy, G3). Strictness ranking:
//   REJECTED (4) > PENDING (3) > ACCEPTED (2) > UNKNOWN (1)
//
// Returns: { ustn, resolvedState, authority, reason, consideredStates, principle }
//   - resolvedState: the strictest state among the conflicting states
//   - authority: the node whose strictest rule won (the first node in the
//     sorted-by-strictness list)
//   - reason: the reason from the winning node, or a generated reason
//   - consideredStates: the original conflicting states (preserved)
//   - principle: "Sovereign Jurisdiction Supremacy (G3) — strictest applicable
//     rule wins. Strictness ranking: REJECTED > PENDING > ACCEPTED > UNKNOWN"
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { resolveUstnConflict } from "@/lib/sgtx/mutual-ustn";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn: string = body?.ustn || "";
    const conflictingStates: Array<{ nodeId: string; state: string; reason?: string }> =
      body?.conflicting_states ||
      body?.conflictingStates ||
      body?.states ||
      [];

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "body.ustn must be a non-empty string",
          example: {
            ustn: "USTN-EG-2024-00001",
            conflicting_states: [
              { nodeId: "NODE-CAIRO-01", state: "ACCEPTED", reason: "Issuing node — auto-accepted" },
              { nodeId: "NODE-FRANKFURT-01", state: "REJECTED", reason: "EU sanctions list hit" },
            ],
          },
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(conflictingStates) || conflictingStates.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "body.conflicting_states must be a non-empty array of { nodeId, state, reason? } objects",
          example: {
            ustn: "USTN-EG-2024-00001",
            conflicting_states: [
              { nodeId: "NODE-CAIRO-01", state: "ACCEPTED", reason: "Issuing node — auto-accepted" },
              { nodeId: "NODE-FRANKFURT-01", state: "REJECTED", reason: "EU sanctions list hit" },
            ],
          },
        },
        { status: 400 },
      );
    }

    const result = resolveUstnConflict(ustn, conflictingStates);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/mutual-ustn/resolve] POST failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
