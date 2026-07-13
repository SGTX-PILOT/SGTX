// GET  /api/sgtx/ai/providers         — return per-provider health + config snapshot
// GET  /api/sgtx/ai/providers?health=true — include live probe of every provider
// POST /api/sgtx/ai/providers         — test a single provider with a custom prompt
//
// Body (POST): { provider: "gemini"|"openrouter"|"groq"|"huggingface"|"static",
//                systemPrompt: string, userPrompt: string,
//                model?: string, maxTokens?: number, temperature?: number }

import { NextResponse } from "next/server";
import {
  getProviderHealth,
  getAIProviderStatus,
  callProviderByName,
  type AIProvider,
} from "@/lib/sgtx/ai/multi-provider";
import { getMultiProviderStatus, checkProviderHealth } from "@/lib/sgtx/ai/providers";

/** Force dynamic rendering — this route always reflects live env / health state. */
export const dynamic = "force-dynamic";

/** Whitelisted provider names accepted by the POST test endpoint. */
const TESTABLE_PROVIDERS = new Set<AIProvider>([
  "gemini",
  "openrouter",
  "groq",
  "huggingface",
  "static",
]);

/**
 * GET /api/sgtx/ai/providers
 *
 * Returns a structured per-provider health map plus the multi-provider config
 * snapshot. When `?health=true` is supplied, additionally performs a live
 * "Say OK" probe against every provider and includes latency + errors under
 * the `liveHealth` key.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const healthCheck = url.searchParams.get("health") === "true";

    const providers = getProviderHealth();
    const status = getAIProviderStatus();
    const config = getMultiProviderStatus();

    const base = {
      ok: true,
      providers,
      status,
      config,
    };

    if (!healthCheck) {
      return NextResponse.json(base);
    }

    const liveHealth = await checkProviderHealth();
    return NextResponse.json({ ...base, liveHealth });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to read provider health" },
      { status: 500 }
    );
  }
}

/** Body shape for the POST test endpoint. */
interface ProviderTestBody {
  provider?: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * POST /api/sgtx/ai/providers
 *
 * Exercise a single provider with the caller-supplied prompts and return the
 * raw result plus measured latency. Intended for ad-hoc smoke tests from the
 * admin UI / ops dashboard. Returns 400 on bad input, 500 on unexpected error.
 */
export async function POST(req: Request) {
  let body: ProviderTestBody;
  try {
    body = (await req.json()) as ProviderTestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const provider = body.provider as AIProvider | undefined;
  if (!provider || !TESTABLE_PROVIDERS.has(provider)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown or untestable provider '${provider ?? ""}'. Allowed: ${[...TESTABLE_PROVIDERS].join(", ")}`,
      },
      { status: 400 }
    );
  }

  const systemPrompt = body.systemPrompt ?? "You are a connectivity test.";
  const userPrompt = body.userPrompt ?? "Reply with the single word OK.";

  try {
    const result = await callProviderByName(provider, systemPrompt, userPrompt, {
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      model: body.model,
    });
    return NextResponse.json({
      ok: true,
      provider,
      result: {
        content: result.content,
        model: result.model,
        latency_ms: result.latency_ms,
        fallback_used: result.fallback_used,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        provider,
        error: e?.message || "Provider call failed",
        latency_ms: 0,
      },
      { status: 502 }
    );
  }
}
