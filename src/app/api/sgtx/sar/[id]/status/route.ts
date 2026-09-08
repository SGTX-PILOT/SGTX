// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getFiuFilingStatus } from "@/lib/sgtx/sar/fiu-filing";

export const dynamic = "force-dynamic";

// GET /api/sgtx/sar/[id]/status — FIU filing status for a SAR (v17 §3.5)
//
// Returns the FIU filing status of a SAR:
//   {
//     "status": "DRAFT"|"APPROVED_FOR_FILING"|"FILING_IN_PROGRESS"|"FILED"|"ACK_RECEIVED"|"REJECTED"|"FILING_FAILED",
//     "filingId": "FIL-EG-...",
//     "filingReference": "FIU-EG-20260118-A4B2C6D8" | null,
//     "filedAt": <ISO-8601> | null,
//     "ackReceipt": "ACK-EG-..." | null,
//     "fiuAuthority": "Egyptian Money Laundering Combatting Unit (MLCU / EMLCU)" | null,
//     "loomHash": "sha256:..." | null,
//     "history": [
//       { "timestamp": "...", "event": "DRAFT_CREATED", "detail": "...", "actor": "A2_detector" },
//       ...
//     ]
//   }
//
// Public read endpoint — the SAR id acts as a capability token (only
// someone who has the SAR id can query its filing status). Rate-limited
// 50 req/min/IP via the middleware anonymous bucket.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "SAR id required" }, { status: 400 });
    }
    const status = await getFiuFilingStatus(id);
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: any) {
    logger.error("[api/sgtx/sar/[id]/status] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "SAR status query failed" }, { status: 500 });
  }
}
