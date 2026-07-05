import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getThreatModel } from "@/lib/sgtx/security";

// GET /api/sgtx/security/threat-model — STRIDE + MITRE ATT&CK threat model
//
// Blueprint Part 14.1 (STRIDE) + 14.2 (MITRE ATT&CK coverage matrix).
// Returns the full threat model:
//   - 8 STRIDE-analyzed assets (Governor, FeeLock, Release API, etc.)
//   - 48 STRIDE threats (6 per asset × 8 assets)
//   - 14 MITRE ATT&CK technique mappings (TA0001-TA0040)
//   - Coverage score (mitigated/total)
export async function GET() {
  try {
    const threatModel = getThreatModel();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...threatModel,
    });
  } catch (e: any) {
    logger.error("[security/threat-model GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch threat model" },
      { status: 500 },
    );
  }
}
