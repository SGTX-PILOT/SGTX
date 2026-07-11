import { NextRequest, NextResponse } from "next/server";
import { learningLoop } from "@/lib/sgtx/brain-os/learning/learning-loop";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const feedback = await learningLoop.recordFeedback(body);
    return NextResponse.json({ ok: true, feedback });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    accuracy: learningLoop.getAccuracyMetrics(),
    knowledgeBase: learningLoop.getKnowledgeBase(),
    recentFeedback: learningLoop.getFeedback().slice(-10),
  });
}
