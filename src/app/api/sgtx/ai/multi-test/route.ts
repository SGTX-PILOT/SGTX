import { NextRequest, NextResponse } from "next/server";
import { runMultiProviderConsensus, checkProviderHealth } from "@/lib/sgtx/ai/providers";

// POST /api/sgtx/ai/multi-test
// Test the multi-provider consensus system with a sample task.
// Body: { task: "governor_prescreen" | "dispute_root_cause" | "clause_forge", prompt: string }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { task, prompt } = body;

  const validTasks = ["governor_prescreen", "dispute_root_cause", "clause_forge", "credit_intelligence"];
  if (!validTasks.includes(task)) {
    return NextResponse.json({ error: `task must be one of: ${validTasks.join(", ")}` }, { status: 400 });
  }

  const systemPrompts: Record<string, string> = {
    governor_prescreen: 'You are the SGTX Governor Pre-Screen AI. Return JSON: {"verdict":"ALLOW|CONDITIONAL|DENY","conditions":[],"rationale":"one sentence"}.',
    dispute_root_cause: "You are the SGTX Causal Inference Engine. Provide root-cause analysis with contribution percentages.",
    clause_forge: "You are the SGTX Clause Forge AI. Draft a precise legal contract clause.",
    credit_intelligence: "You are the SGTX Credit Intelligence AI. Generate a risk summary.",
  };

  const result = await runMultiProviderConsensus({
    taskKey: task,
    systemPrompt: systemPrompts[task],
    userPrompt: prompt || "Evaluate: Frozen strawberries export from Egypt to Germany, $50,000, CIF incoterm.",
    maxTokens: 200,
    temperature: 0.3,
    requireVerdictConsensus: task === "governor_prescreen",
  });

  return NextResponse.json({
    ok: true,
    task,
    content: result.content,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    authority: result.authority,
    consensus: result.consensus,
  });
}
