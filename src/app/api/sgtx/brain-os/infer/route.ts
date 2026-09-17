import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { brainOrchestrator } from "@/lib/sgtx/brain-os/core/orchestrator";
import type { AuthorityLevel, InferenceRequest } from "@/lib/sgtx/brain-os/core/types";
import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";

const VALID_AUTHORITIES: ReadonlySet<AuthorityLevel> = new Set([
  "A0", "A1", "A2", "A3", "A4", "A5",
]);

// POST /api/sgtx/brain-os/infer
// Direct inference endpoint — routes an arbitrary prompt through the Brain OS
// provider router. Useful for testing, debugging, and admin prompts.
//
// Body:
//   {
//     systemPrompt: string,
//     userPrompt: string,
//     authority: AuthorityLevel,        // A0–A4 (A5 constitutionally blocked)
//     maxTokens?: number,                // default 1024
//     temperature?: number,              // default 0.3
//     responseFormat?: "text" | "json",  // default "text"
//     correlationId?: string,
//   }
//
// Returns: InferenceResult (content, provider, model, latencyMs, tokensIn/Out, costUsd, fallbackUsed)
export async function POST(req: NextRequest): Promise<Response> {
  try {
    await bootstrapBrainOS();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "JSON body required" },
        { status: 400 },
      );
    }

    const {
      systemPrompt,
      userPrompt,
      authority,
      maxTokens,
      temperature,
      responseFormat,
      correlationId,
      jsonSchema,
    } = body as Record<string, unknown>;

    if (typeof systemPrompt !== "string" || systemPrompt.length === 0) {
      return NextResponse.json(
        { error: "systemPrompt (non-empty string) required" },
        { status: 400 },
      );
    }
    if (typeof userPrompt !== "string" || userPrompt.length === 0) {
      return NextResponse.json(
        { error: "userPrompt (non-empty string) required" },
        { status: 400 },
      );
    }
    if (typeof authority !== "string" || !VALID_AUTHORITIES.has(authority as AuthorityLevel)) {
      return NextResponse.json(
        { error: "authority must be one of A0|A1|A2|A3|A4|A5" },
        { status: 400 },
      );
    }
    // Constitutional block: A5 = autonomous execution, never allowed.
    if (authority === "A5") {
      return NextResponse.json(
        {
          error: "Authority A5 (autonomous execution) is constitutionally blocked.",
          verdict: "DENY",
        },
        { status: 403 },
      );
    }

    const inferenceRequest: InferenceRequest = {
      systemPrompt,
      userPrompt,
      authority: authority as AuthorityLevel,
      maxTokens: typeof maxTokens === "number" ? maxTokens : 1024,
      temperature: typeof temperature === "number" ? temperature : 0.3,
      responseFormat: responseFormat === "json" ? "json" : "text",
      correlationId: typeof correlationId === "string" ? correlationId : undefined,
      jsonSchema:
        jsonSchema && typeof jsonSchema === "object"
          ? (jsonSchema as Record<string, unknown>)
          : undefined,
    };

    const result = await brainOrchestrator.infer(inferenceRequest);
    return NextResponse.json({
      ok: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[brain-os/infer POST] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Inference failed" },
      { status: 500 },
    );
  }
}
