import { NextRequest, NextResponse } from "next/server";
import { runStrideScan, getThreatModel } from "@/lib/sgtx/security";

// POST /api/sgtx/security/threat-model/scan — trigger a STRIDE rescan
//
// Blueprint Part 14.1 — re-runs the STRIDE analysis across all assets and
// returns the scan summary (assets scanned, threats identified, mitigations
// applied, coverage score, scan duration).
//
// Body (optional):
//   { triggeredBy?: string }  — defaults to "admin"
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const triggeredBy = (body?.triggeredBy as string) || "admin";

    const scan = runStrideScan();
    const threatModel = getThreatModel();

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      scan,
      triggeredBy,
      threatModelSummary: {
        totalAssets: threatModel.totalAssets,
        totalThreats: threatModel.totalThreats,
        mitigatedThreats: threatModel.mitigatedThreats,
        openThreats: threatModel.openThreats,
        criticalThreats: threatModel.criticalThreats,
        coverageScore: threatModel.coverageScore,
        lastUpdated: threatModel.lastUpdated,
      },
    });
  } catch (e: any) {
    console.error("[security/threat-model/scan POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "STRIDE scan failed" },
      { status: 500 },
    );
  }
}
