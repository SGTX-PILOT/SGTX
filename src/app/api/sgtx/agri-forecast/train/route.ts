import { NextResponse } from "next/server";
import { getDailyTrainingData } from "@/lib/sgtx/compliance/agri-commodity-forecast";
import { learningLoop } from "@/lib/sgtx/brain-os/learning/learning-loop";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST() {
  try {
    const trainingData = await getDailyTrainingData();
    // Record training as feedback for the learning loop
    await learningLoop.recordFeedback({
      decisionId: `daily-training-${new Date().toISOString().split("T")[0]}`,
      actualOutcome: "success",
      outcomeDetails: trainingData.recommendation,
      expectedOutcome: "Daily training completed",
      feedbackSource: "system",
    });
    return NextResponse.json({ ok: true, trainingData });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
export async function GET() {
  return NextResponse.json({ ok: true, trainingData: await getDailyTrainingData() });
}
