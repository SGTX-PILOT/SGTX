import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/governor/policy-author — AI-Assisted Policy Authoring (blueprint 1.2)
// Body: { prompt: string } — natural language description of the desired policy
// Returns: { rego: string, explanation: string, testCases: string[] }
export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json({ error: "Prompt must be at least 10 characters" }, { status: 400 });
    }

    const aiRes = await callAI({
      agent: "general",
      authority: "A1",
      systemPrompt: `You are the SGTX OPA Policy Authoring Assistant. Given a natural language description, generate a valid Rego policy for the SGTX Governor. Follow these rules:
1. Package: package sgtx.permissions (or sgtx.fee, sgtx.financing, etc. based on the policy type)
2. Always start with: default allow = false
3. Use input.action, input.actor_gtid, input.actor_role, input.actor_trader_mode, input.resource, input.payload
4. Never include "view recommended counterparties" — SGTX is a non-marketplace system
5. Return JSON: {"rego": "package sgtx...\\n...", "explanation": "This policy...", "testCases": ["test_case_1", "test_case_2"]}`,
      userPrompt: `Generate a Rego policy for this requirement: "${prompt}". Return JSON only with rego, explanation, and testCases fields.`,
      fallbackKey: "policy_author",
    });

    // Try to parse the AI response as JSON
    let result;
    try {
      const m = aiRes.content.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : null;
    } catch {
      result = null;
    }

    if (!result) {
      // Fallback: generate a basic template
      result = {
        rego: `package sgtx.custom

default allow = false

# ${prompt}
allow {
  input.action == "custom_action"
  role_has_permission(input.actor_role, "custom_action")
}

# Helper: check role permission
role_has_permission(role, action) {
  # TODO: implement permission lookup
  true
}`,
        explanation: `This is a draft policy for: "${prompt}". Review and refine before deployment.`,
        testCases: ["Test with valid actor", "Test with invalid actor", "Test edge cases"],
      };
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sgtx/governor/policy-author/simulate — Impact simulation for policy changes (blueprint 1.2)
export async function PUT(req: NextRequest) {
  try {
    const { rego, testInput } = await req.json();
    if (!rego) return NextResponse.json({ error: "rego policy required" }, { status: 400 });

    // Simulate policy evaluation (in production this would call opa eval)
    const simulation = {
      evaluated: true,
      inputReceived: testInput || { action: "test", actor_role: "trader", actor_trader_mode: "BUY" },
      // Simulated verdict based on basic pattern matching
      verdict: rego.includes("default allow = false") ? "DENY (default)" : "ALLOW (default)",
      conditions: [],
      warnings: [] as string[],
      affectedActions: [] as string[],
    };

    // Extract action names from the rego policy
    const actionMatches = rego.matchAll(/input\.action\s*==\s*"([^"]+)"/g);
    for (const m of actionMatches) {
      simulation.affectedActions.push(m[1]);
    }

    if (simulation.affectedActions.length === 0) {
      simulation.warnings.push("No input.action checks found — policy may be too permissive");
    }
    if (!rego.includes("default allow = false")) {
      simulation.warnings.push("Missing 'default allow = false' — policy defaults to ALLOW which violates SGTX security principles");
    }

    return NextResponse.json({ ok: true, simulation });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
