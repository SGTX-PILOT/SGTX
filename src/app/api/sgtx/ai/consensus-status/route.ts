import { NextResponse } from "next/server";
import { getConsensusStatus, getInferenceLog } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/ai/consensus-status
// Returns the multi-model consensus system configuration + recent inference stats.
export async function GET() {
  const status = getConsensusStatus();
  const recentInferences = getInferenceLog(50);

  // Aggregate stats by model
  const modelStats: Record<string, { calls: number; successes: number; avgLatencyMs: number }> = {};
  for (const rec of recentInferences) {
    const m = rec.model;
    if (!modelStats[m]) modelStats[m] = { calls: 0, successes: 0, avgLatencyMs: 0 };
    modelStats[m].calls++;
    if (rec.success) modelStats[m].successes++;
    modelStats[m].avgLatencyMs += rec.latency_ms;
  }
  for (const m of Object.keys(modelStats)) {
    modelStats[m].avgLatencyMs = modelStats[m].calls > 0 ? Math.round(modelStats[m].avgLatencyMs / modelStats[m].calls) : 0;
  }

  return NextResponse.json({
    ok: true,
    ...status,
    stats: {
      totalInferences: recentInferences.length,
      byModel: modelStats,
    },
  });
}
