// @ts-nocheck
// SGTX v17 §14.2 — AI condition assessment (HF ViT simulated)
//
// POST /api/sgtx/distressed/assess-condition
//   Body: { ustn, photos: string[], sensor_data: object }
//   Returns: { ok, condition_score, remaining_value_pct, recommendation,
//              confidence, detected_tags, photo_scores, sensor_score,
//              rationale }
//
// The model is a HuggingFace Visual Transformer fine-tuned on cargo damage
// images. This implementation is a deterministic rule-based heuristic that
// combines photo hashes (pseudo-embeddings) with sensor-data scoring.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { assessCondition, type SensorData } from "@/lib/sgtx/distressed/condition-assessment";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, photos, sensor_data } = body ?? {};

    if (!ustn) {
      return NextResponse.json(
        { error: "ustn is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(photos)) {
      return NextResponse.json(
        { error: "photos must be an array (of URLs or base64 strings)" },
        { status: 400 },
      );
    }
    const sensor: SensorData = {
      avgTempC: sensor_data?.avgTempC ?? sensor_data?.avg_temp_c,
      maxTempExcursionC: sensor_data?.maxTempExcursionC ?? sensor_data?.max_temp_excursion_c,
      avgHumidityPct: sensor_data?.avgHumidityPct ?? sensor_data?.avg_humidity_pct,
      maxShockG: sensor_data?.maxShockG ?? sensor_data?.max_shock_g,
      doorOpenings: sensor_data?.doorOpenings ?? sensor_data?.door_openings,
      predictedShelfLifeDays: sensor_data?.predictedShelfLifeDays ?? sensor_data?.predicted_shelf_life_days,
    };

    const result = await assessCondition(ustn, photos, sensor);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      condition_score: result.conditionScore,
      remaining_value_pct: result.remainingValuePct,
      recommendation: result.recommendation,
      confidence: result.confidence,
      detected_tags: result.detectedTags,
      photo_scores: result.photoScores,
      sensor_score: result.sensorScore,
      rationale: result.rationale,
      ustn,
    });
  } catch (e: any) {
    logger.error("[distressed/assess-condition]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
