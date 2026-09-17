import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getFeedbackLoop } from "@/lib/sgtx/brain-os";
import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";

interface FeedbackRequestBody {
  decisionId?: unknown;
  actualOutcome?: unknown;
  outcomeDetails?: unknown;
  expectedOutcome?: unknown;
  feedbackSource?: unknown;
  deviationScore?: unknown;
  metadata?: unknown;
}

const VALID_OUTCOMES = new Set(["success", "failure", "partial"]);
const VALID_SOURCES = new Set(["system", "human", "outcome-monitor"]);

// POST /api/sgtx/brain-os/feedback
// Records explicit outcome feedback for a Brain decision. Used by:
//   • human reviewers (correct / incorrect decision)
//   • outcome monitors (system-generated feedback)
//   • integration tests
//
// Body:
//   {
//     decisionId: string,
//     actualOutcome: "success" | "failure" | "partial",
//     outcomeDetails: string,
//     expectedOutcome: string,
//     feedbackSource?: "system" | "human" | "outcome-monitor",   // default "human"
//     deviationScore?: number,                                    // default computed
//     metadata?: Record<string, any>,
//   }
//
// Returns: { ok: true, feedback: LearningFeedback }
export async function POST(req: NextRequest): Promise<Response> {
  try {
    await bootstrapBrainOS();

    const body = (await req.json().catch(() => null)) as FeedbackRequestBody | null;
    if (!body) {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }

    if (typeof body.decisionId !== "string" || body.decisionId.length === 0) {
      return NextResponse.json(
        { error: "decisionId (non-empty string) required" },
        { status: 400 },
      );
    }
    if (
      typeof body.actualOutcome !== "string" ||
      !VALID_OUTCOMES.has(body.actualOutcome)
    ) {
      return NextResponse.json(
        { error: "actualOutcome must be one of success|failure|partial" },
        { status: 400 },
      );
    }
    if (typeof body.outcomeDetails !== "string") {
      return NextResponse.json(
        { error: "outcomeDetails (string) required" },
        { status: 400 },
      );
    }
    if (typeof body.expectedOutcome !== "string") {
      return NextResponse.json(
        { error: "expectedOutcome (string) required" },
        { status: 400 },
      );
    }

    const source =
      typeof body.feedbackSource === "string" && VALID_SOURCES.has(body.feedbackSource)
        ? (body.feedbackSource as "system" | "human" | "outcome-monitor")
        : "human";

    const deviationScore =
      typeof body.deviationScore === "number" ? body.deviationScore : undefined;
    const metadata =
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : undefined;

    const feedbackLoop = await getFeedbackLoop();
    const feedback = await feedbackLoop.recordFeedback({
      decisionId: body.decisionId,
      actualOutcome: body.actualOutcome as "success" | "failure" | "partial",
      outcomeDetails: body.outcomeDetails,
      expectedOutcome: body.expectedOutcome,
      feedbackSource: source,
      deviationScore,
      metadata,
    });

    return NextResponse.json({ ok: true, feedback }, { status: 201 });
  } catch (e: any) {
    logger.error("[brain-os/feedback POST] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to record feedback" },
      { status: 500 },
    );
  }
}
