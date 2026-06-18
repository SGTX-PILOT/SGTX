import { NextResponse } from "next/server";
import { getInferenceLog } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/ai/inference-log — recent AI inference records
export async function GET() {
  return NextResponse.json(getInferenceLog(50));
}
