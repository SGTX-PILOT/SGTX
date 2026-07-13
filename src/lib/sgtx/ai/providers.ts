// SGTX Multi-Provider AI System (Blueprint Part 1.4 — AI Authority Ladder)
// ============================================================
// Four AI providers working together for consensus and best-performance routing:
//
// 1. GLM (ZhipuAI)             — Primary, general purpose, multilingual
//    Models: glm-4-plus, glm-4-air, glm-4-flash
//    Best for: general chat, advisory, multilingual (EN/AR/ZH)
//
// 2. HuggingFace Router API    — Secondary, large open-source models
//    Models: meta-llama/Llama-3.1-70B-Instruct, Qwen/Qwen2.5-72B-Instruct
//    Best for: complex reasoning, legal clauses, compliance analysis
//
// 3. OpenAI API                — Tertiary, premium models (geo-blocked from HK)
//    Models: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-mini, o3-mini
//    Best for: complex reasoning, code generation, safety analysis
//    Status: Key valid but OpenAI geo-blocks HK IP — works from US/EU
//
// 4. Groq API                  — Quaternary, ultra-fast inference (geo-blocked from HK)
//    Models: llama-3.3-70b-versatile, llama-3.1-8b-instant
//    Best for: real-time chat, quick responses, high-throughput
//    Status: Key valid but Groq geo-blocks HK IP — works from US/EU
//
// Authority-based routing:
//   A1 (Advisory)    → Single best model for the task (rate-limit efficient)
//   A2 (Constraining) → 2-model consensus (primary + best secondary)
//   A3 (Escalation)   → 3-4 model consensus (all available providers in parallel)
//
// Task-to-model routing (best model for each task):
//   Governor prescreen     → GLM (fast) + Llama-70B (thorough) consensus
//   Dispute root cause     → Llama-70B (best reasoning) + GLM + Qwen-72B consensus
//   Clause forge (legal)   → Llama-70B (best for legal text) + GLM consensus
//   Chat/quick responses   → GLM (fastest, multilingual)
//   Price band             → GLM (market knowledge)
//   Health summary         → GLM (concise)
//   Credit risk            → Llama-70B (thorough analysis) + GLM consensus

import { createHash } from "crypto";

// ============ Types ============
export type AIProviderName = "glm" | "huggingface" | "openai" | "openrouter" | "groq";
export type AuthorityLevel = "A0" | "A1" | "A2" | "A3" | "A4" | "A5";

export interface ProviderResult {
  provider: AIProviderName;
  model: string;
  content: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface ConsensusResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  authority: AuthorityLevel;
  consensus: {
    providersUsed: string[];
    providersSucceeded: number;
    providersFailed: number;
    agreementScore: number;
    verdict?: string;
    dissentingOpinions: string[];
    allOutputs: ProviderResult[];
  };
}

// ============ Provider configurations ============
const PROVIDER_CONFIG = {
  glm: {
    name: "glm" as AIProviderName,
    models: {
      primary: "glm-4-plus",
      fast: "glm-4-air",
      fastest: "glm-4-flash",
    },
    available: true, // verified working
  },
  huggingface: {
    name: "huggingface" as AIProviderName,
    models: {
      primary: "meta-llama/Llama-3.1-70B-Instruct", // best for reasoning
      secondary: "Qwen/Qwen2.5-72B-Instruct", // best for multilingual
      fast: "meta-llama/Llama-3.1-8B-Instruct", // fast for simple tasks
    },
    available: true, // verified working
  },
  groq: {
    name: "groq" as AIProviderName,
    models: {
      primary: "llama-3.3-70b-versatile",
      fast: "llama-3.1-8b-instant",
    },
    available: false, // Key valid but Groq geo-blocks this server's IP (47.57.232.232 — Cloudflare 403 Forbidden)
  },
  openai: {
    name: "openai" as AIProviderName,
    models: {
      primary: "gpt-4o", // best overall model
      fast: "gpt-4o-mini", // fast and cheap
      reasoning: "o3-mini", // for complex reasoning tasks
    },
    available: false, // Key valid but OpenAI geo-blocks HK IP — will work from US/EU
  },
  openrouter: {
    name: "openrouter" as AIProviderName,
    models: {
      primary: "openai/gpt-4o-mini", // fast + cheap default
      anthropic: "anthropic/claude-3.5-sonnet", // premium reasoning
      google: "google/gemini-flash-1.5", // Google Flash via OpenRouter
      mistral: "mistralai/mistral-large", // Mistral flagship
    },
    available: true, // OpenAI-compatible gateway — works wherever outbound HTTPS is allowed
  },
};

// ============ Task-to-Model Routing ============
// Each AI agent is routed to the best model for its specific task type.
interface TaskRouting {
  agentName: string;
  authority: AuthorityLevel;
  // For A1 (single model): which provider+model to use
  primaryProvider: AIProviderName;
  primaryModel: string;
  // For A2/A3 (consensus): which providers to run in parallel
  consensusProviders?: { provider: AIProviderName; model: string }[];
  fallbackKey: string;
}

const TASK_ROUTING: Record<string, TaskRouting> = {
  // A1 Advisory — single best model per task
  inbox_summary: {
    agentName: "inbox_summary_generator",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "inbox_summary",
  },
  health_summary: {
    agentName: "health_summary_generator",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "health_summary",
  },
  why_matters: {
    agentName: "why_matters_generator",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-air", // faster for short responses
    fallbackKey: "why_matters",
  },
  chat: {
    agentName: "operations_assistant",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "chat",
  },
  trade_room: {
    agentName: "trade_room_assistant",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "chat",
  },
  price_band: {
    agentName: "price_band_advisor",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "price_band",
  },
  loading_guide: {
    agentName: "loading_guide_generator",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "loading_guide",
  },
  tenant_message: {
    agentName: "tenant_message_generator",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "tenant_message",
  },
  detect_hs_code: {
    agentName: "hs_code_detector",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "chat",
  },
  // A2 Constraining — 2-model consensus
  governor_prescreen: {
    agentName: "governor_prescreen",
    authority: "A2",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    consensusProviders: [
      { provider: "glm", model: "glm-4-plus" },
      { provider: "huggingface", model: "meta-llama/Llama-3.1-70B-Instruct" },
    ],
    fallbackKey: "governor_prescreen",
  },
  clause_forge: {
    agentName: "clause_forge",
    authority: "A2",
    primaryProvider: "huggingface", // Llama-70B is best for legal text
    primaryModel: "meta-llama/Llama-3.1-70B-Instruct",
    consensusProviders: [
      { provider: "huggingface", model: "meta-llama/Llama-3.1-70B-Instruct" },
      { provider: "glm", model: "glm-4-plus" },
    ],
    fallbackKey: "contract_clause",
  },
  credit_intelligence: {
    agentName: "credit_intelligence_risk_summarizer",
    authority: "A2",
    primaryProvider: "huggingface", // Llama-70B for thorough risk analysis
    primaryModel: "meta-llama/Llama-3.1-70B-Instruct",
    consensusProviders: [
      { provider: "huggingface", model: "meta-llama/Llama-3.1-70B-Instruct" },
      { provider: "glm", model: "glm-4-plus" },
    ],
    fallbackKey: "chat",
  },
  defi_risk_summary: {
    agentName: "defi_risk_summary",
    authority: "A1",
    primaryProvider: "glm",
    primaryModel: "glm-4-plus",
    fallbackKey: "defi_risk_summary",
  },
  // A3 Escalation — 3-model consensus
  dispute_root_cause: {
    agentName: "dispute_causal_analyzer",
    authority: "A3",
    primaryProvider: "huggingface", // Llama-70B best for causal reasoning
    primaryModel: "meta-llama/Llama-3.1-70B-Instruct",
    consensusProviders: [
      { provider: "huggingface", model: "meta-llama/Llama-3.1-70B-Instruct" },
      { provider: "glm", model: "glm-4-plus" },
      { provider: "huggingface", model: "Qwen/Qwen2.5-72B-Instruct" },
    ],
    fallbackKey: "dispute_root_cause",
  },
};

// ============ GLM (ZhipuAI) Provider ============
// Supports two modes:
// 1. User's own API key (ZAI_API_KEY in .env) — portable, works on any system
// 2. z-ai SDK config file (/etc/.z-ai-config) — sandbox built-in, works here
// Mode 1 takes priority when ZAI_API_KEY is set in .env

let _zaiInstance: any = null; // ZAI removed
async function getZAI(): Promise<never> {
  // ZAI SDK was removed from this build — Mode 2 path is intentionally disabled.
  // Throwing preserves the previous runtime behavior (caller catches and returns failure).
  throw new Error("ZAI SDK removed — set ZAI_API_KEY to use GLM via the OpenAI-compatible endpoint");
}

async function callGLM(model: string, systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<ProviderResult> {
  const start = Date.now();

  // Mode 1: User's own API key from .env (portable — works on any system)
  const envApiKey = process.env.ZAI_API_KEY;
  const envBaseUrl = process.env.ZAI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  if (envApiKey) {
    try {
      const res = await fetch(`${envBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${envApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: opts.maxTokens ?? 400,
          temperature: opts.temperature ?? 0.4,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          provider: "glm",
          model,
          content: data.choices?.[0]?.message?.content || "",
          latencyMs: Date.now() - start,
          success: true,
        };
      }
      // User's key failed (e.g., insufficient balance) — fall through to Mode 2
    } catch {
      // Network error — fall through to Mode 2
    }
  }

  // Mode 2: z-ai SDK config file (sandbox built-in — works on this server)
  try {
    await getZAI(); // always throws — ZAI SDK removed
    throw new Error("ZAI SDK removed — Mode 2 unreachable");
  } catch (e: any) {
    return { provider: "glm", model, content: "", latencyMs: Date.now() - start, success: false, error: e.message };
  }
}

// ============ HuggingFace Router Provider ============
async function callHuggingFace(model: string, systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.HF_API_TOKEN;
    if (!apiKey) throw new Error("HF_API_TOKEN not configured");
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HF ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      provider: "huggingface",
      model,
      content: data.choices?.[0]?.message?.content || "",
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (e: any) {
    return { provider: "huggingface", model, content: "", latencyMs: Date.now() - start, success: false, error: e.message };
  }
}

// ============ Groq Provider ============
async function callGroq(model: string, systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not configured");
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      provider: "groq",
      model,
      content: data.choices?.[0]?.message?.content || "",
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (e: any) {
    return { provider: "groq", model, content: "", latencyMs: Date.now() - start, success: false, error: e.message };
  }
}

// ============ OpenAI Provider ============
async function callOpenAI(model: string, systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      provider: "openai",
      model,
      content: data.choices?.[0]?.message?.content || "",
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (e: any) {
    return { provider: "openai", model, content: "", latencyMs: Date.now() - start, success: false, error: e.message };
  }
}

// ============ OpenRouter Provider ============
/**
 * Call OpenRouter (https://openrouter.ai) — an OpenAI-compatible gateway that
 * routes to 100+ models (OpenAI, Anthropic, Google, Mistral, etc.) through a
 * single API. Default model `openai/gpt-4o-mini`. Sends `HTTP-Referer` and
 * `X-Title` headers for OpenRouter attribution. Returns a `ProviderResult`
 * with `success: false` and `error` populated on failure (never throws).
 */
async function callOpenRouter(model: string, systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sgtx.io",
        "X-Title": "SGTX Brain AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data: any = await res.json();
    return {
      provider: "openrouter",
      model,
      content: data.choices?.[0]?.message?.content || "",
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (e: any) {
    return { provider: "openrouter", model, content: "", latencyMs: Date.now() - start, success: false, error: e.message };
  }
}

// ============ Unified provider caller ============
/**
 * Unified entry point that dispatches to a specific provider implementation
 * by name. Used by the consensus runner and the health-check endpoint.
 * Returns a `ProviderResult` with `success: false` on failure (never throws).
 */
export async function callProvider(provider: AIProviderName, model: string, systemPrompt: string, userPrompt: string, opts?: { maxTokens?: number; temperature?: number }): Promise<ProviderResult> {
  switch (provider) {
    case "glm": return callGLM(model, systemPrompt, userPrompt, opts);
    case "huggingface": return callHuggingFace(model, systemPrompt, userPrompt, opts);
    case "openai": return callOpenAI(model, systemPrompt, userPrompt, opts);
    case "openrouter": return callOpenRouter(model, systemPrompt, userPrompt, opts);
    case "groq": return callGroq(model, systemPrompt, userPrompt, opts);
  }
}

// ============ Text similarity (Jaccard on word sets) ============
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

// ============ Verdict extraction ============
function extractVerdict(content: string): string | null {
  const match = content.match(/"verdict"\s*:\s*"(ALLOW|CONDITIONAL|DENY)"/i);
  if (match) return match[1].toUpperCase();
  const lower = content.toLowerCase();
  if (lower.includes("deny")) return "DENY";
  if (lower.includes("conditional")) return "CONDITIONAL";
  if (lower.includes("allow")) return "ALLOW";
  return null;
}

function mostConservativeVerdict(verdicts: string[]): string {
  const rank: Record<string, number> = { DENY: 3, CONDITIONAL: 2, ALLOW: 1 };
  let best = "ALLOW";
  for (const v of verdicts) { if (rank[v] > rank[best]) best = v; }
  return best;
}

// ============ Multi-provider consensus runner ============
export async function runMultiProviderConsensus(params: {
  taskKey: string; // key in TASK_ROUTING
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  requireVerdictConsensus?: boolean;
}): Promise<ConsensusResult> {
  const routing = TASK_ROUTING[params.taskKey];
  if (!routing) {
    // Default: use GLM single model
    const result = await callGLM("glm-4-plus", params.systemPrompt, params.userPrompt, params);
    return {
      content: result.content,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackUsed: !result.success,
      authority: "A1",
      consensus: {
        providersUsed: [result.provider],
        providersSucceeded: result.success ? 1 : 0,
        providersFailed: result.success ? 0 : 1,
        agreementScore: 1.0,
        dissentingOpinions: [],
        allOutputs: [result],
      },
    };
  }

  // A1: single model
  if (routing.authority === "A1") {
    const result = await callProvider(routing.primaryProvider, routing.primaryModel, params.systemPrompt, params.userPrompt, params);
    // If primary fails, try fallback to GLM
    if (!result.success && routing.primaryProvider !== "glm") {
      const fallback = await callGLM("glm-4-plus", params.systemPrompt, params.userPrompt, params);
      return {
        content: fallback.content || "",
        provider: fallback.success ? "glm" : "static",
        model: fallback.success ? "glm-4-plus" : "static-template",
        latencyMs: result.latencyMs + fallback.latencyMs,
        fallbackUsed: true,
        authority: "A1",
        consensus: {
          providersUsed: [routing.primaryProvider, "glm"],
          providersSucceeded: fallback.success ? 1 : 0,
          providersFailed: fallback.success ? 1 : 2,
          agreementScore: 1.0,
          dissentingOpinions: [],
          allOutputs: [result, fallback],
        },
      };
    }
    return {
      content: result.content,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackUsed: !result.success,
      authority: "A1",
      consensus: {
        providersUsed: [result.provider],
        providersSucceeded: result.success ? 1 : 0,
        providersFailed: result.success ? 0 : 1,
        agreementScore: 1.0,
        dissentingOpinions: [],
        allOutputs: [result],
      },
    };
  }

  // A2/A3: multi-provider consensus
  const providers = routing.consensusProviders || [{ provider: routing.primaryProvider, model: routing.primaryModel }];

  // Run all providers in parallel
  const results = await Promise.all(
    providers.map(p => callProvider(p.provider, p.model, params.systemPrompt, params.userPrompt, params))
  );

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // If all failed, return static fallback
  if (succeeded.length === 0) {
    return {
      content: "AI advisory unavailable. Please contact support.",
      provider: "static",
      model: "static-template",
      latencyMs: Math.max(...results.map(r => r.latencyMs)),
      fallbackUsed: true,
      authority: routing.authority,
      consensus: {
        providersUsed: providers.map(p => p.provider),
        providersSucceeded: 0,
        providersFailed: providers.length,
        agreementScore: 0,
        dissentingOpinions: [],
        allOutputs: results,
      },
    };
  }

  // Compute agreement score
  let totalSim = 0, pairs = 0;
  for (let i = 0; i < succeeded.length; i++) {
    for (let j = i + 1; j < succeeded.length; j++) {
      totalSim += textSimilarity(succeeded[i].content, succeeded[j].content);
      pairs++;
    }
  }
  const agreementScore = pairs > 0 ? totalSim / pairs : 1.0;

  // Verdict consensus (if required)
  let consensusVerdict: string | undefined;
  let dissentingOpinions: string[] = [];
  if (params.requireVerdictConsensus) {
    const verdicts = succeeded.map(r => extractVerdict(r.content)).filter(v => v) as string[];
    if (verdicts.length > 0) {
      consensusVerdict = mostConservativeVerdict(verdicts);
      dissentingOpinions = succeeded
        .filter(r => { const v = extractVerdict(r.content); return v && v !== consensusVerdict; })
        .map(r => `${r.provider}/${r.model}: ${extractVerdict(r.content)} — ${r.content.slice(0, 100)}`);
    }
  }

  // Pick best content: prefer matching verdict, else primary
  let bestResult: ProviderResult;
  if (params.requireVerdictConsensus && consensusVerdict) {
    bestResult = succeeded.find(r => extractVerdict(r.content) === consensusVerdict) || succeeded[0];
  } else {
    bestResult = succeeded[0];
  }

  return {
    content: bestResult.content,
    provider: bestResult.provider,
    model: `${bestResult.model} (consensus of ${succeeded.length}/${providers.length} providers)`,
    latencyMs: Math.max(...results.map(r => r.latencyMs)),
    fallbackUsed: failed.length > 0,
    authority: routing.authority,
    consensus: {
      providersUsed: providers.map(p => `${p.provider}/${p.model}`),
      providersSucceeded: succeeded.length,
      providersFailed: failed.length,
      agreementScore,
      verdict: consensusVerdict,
      dissentingOpinions,
      allOutputs: results,
    },
  };
}

// ============ Provider health check ============
/**
 * Live-probe every configured provider with a tiny "Say OK" prompt in parallel.
 * Returns per-provider availability, latency, and (for failing providers) the
 * error message. Used by `/api/sgtx/ai/providers?health=true`.
 */
export async function checkProviderHealth(): Promise<{
  glm: { available: boolean; latencyMs: number; model: string };
  huggingface: { available: boolean; latencyMs: number; model: string };
  openai: { available: boolean; latencyMs: number; model: string; error?: string };
  openrouter: { available: boolean; latencyMs: number; model: string; error?: string };
  groq: { available: boolean; latencyMs: number; model: string; error?: string };
}> {
  const [glm, hf, openai, openrouter, groq] = await Promise.all([
    callGLM("glm-4-flash", "You are a health check.", "Say OK", { maxTokens: 5 }),
    callHuggingFace("meta-llama/Llama-3.1-8B-Instruct", "You are a health check.", "Say OK", { maxTokens: 5 }),
    callOpenAI("gpt-4o-mini", "You are a health check.", "Say OK", { maxTokens: 5 }),
    callOpenRouter("openai/gpt-4o-mini", "You are a health check.", "Say OK", { maxTokens: 5 }),
    callGroq("llama-3.1-8b-instant", "You are a health check.", "Say OK", { maxTokens: 5 }),
  ]);

  return {
    glm: { available: glm.success, latencyMs: glm.latencyMs, model: "glm-4-flash" },
    huggingface: { available: hf.success, latencyMs: hf.latencyMs, model: "meta-llama/Llama-3.1-8B-Instruct" },
    openai: { available: openai.success, latencyMs: openai.latencyMs, model: "gpt-4o-mini", error: openai.error },
    openrouter: { available: openrouter.success, latencyMs: openrouter.latencyMs, model: "openai/gpt-4o-mini", error: openrouter.error },
    groq: { available: groq.success, latencyMs: groq.latencyMs, model: "llama-3.1-8b-instant", error: groq.error },
  };
}

// ============ Get system status ============
export function getMultiProviderStatus() {
  return {
    strategy: "Multi-provider AI consensus: GLM + HuggingFace + OpenAI + OpenRouter + Groq",
    providers: [
      {
        name: "GLM (ZhipuAI)",
        role: "Primary — general purpose, multilingual, fast",
        models: ["glm-4-plus (primary)", "glm-4-air (fast)", "glm-4-flash (fastest)"],
        available: PROVIDER_CONFIG.glm.available,
        bestFor: "Chat, advisory, inbox summary, price band, tenant messages, multilingual (EN/AR/ZH)",
        avgLatency: "~1.5s",
      },
      {
        name: "HuggingFace Router",
        role: "Secondary — large models for complex reasoning",
        models: ["meta-llama/Llama-3.1-70B-Instruct (reasoning)", "Qwen/Qwen2.5-72B-Instruct (multilingual)", "meta-llama/Llama-3.1-8B-Instruct (fast)"],
        available: PROVIDER_CONFIG.huggingface.available,
        bestFor: "Legal clause drafting, compliance analysis, dispute root cause, credit risk assessment",
        avgLatency: "~2-4s",
      },
      {
        name: "OpenAI",
        role: "Tertiary — premium models for complex reasoning",
        models: ["gpt-4o (primary)", "gpt-4o-mini (fast)", "o3-mini (reasoning)"],
        available: PROVIDER_CONFIG.openai.available,
        bestFor: "Complex reasoning, code generation, safety analysis, legal compliance",
        avgLatency: "~1-3s (when available)",
        note: "Key is valid but OpenAI geo-blocks HK IP (Country not supported). Will auto-activate when called from US/EU.",
      },
      {
        name: "OpenRouter",
        role: "Secondary gateway — OpenAI-compatible router to 100+ models",
        models: [
          "openai/gpt-4o-mini (primary, fast + cheap)",
          "anthropic/claude-3.5-sonnet (premium reasoning)",
          "google/gemini-flash-1.5 (Google Flash)",
          "mistralai/mistral-large (Mistral flagship)",
        ],
        available: PROVIDER_CONFIG.openrouter.available,
        bestFor: "Cross-vendor routing, fallback for OpenAI when geo-blocked, model A/B testing",
        avgLatency: "~1-3s",
        note: "Replaces direct OpenAI in the active multi-provider chain (see multi-provider.ts). Attribution headers HTTP-Referer + X-Title required.",
      },
      {
        name: "Groq",
        role: "Quaternary — ultra-fast inference for real-time chat",
        models: ["llama-3.3-70b-versatile (primary)", "llama-3.1-8b-instant (fast)"],
        available: PROVIDER_CONFIG.groq.available,
        bestFor: "Real-time chat, quick responses, high-throughput tasks",
        avgLatency: "~0.3-0.8s (when available)",
        note: "Key is valid but Groq geo-blocks this server's IP (Cloudflare 403 Forbidden). Will auto-activate when called from an allowed IP (US/EU).",
      },
    ],
    taskRouting: Object.entries(TASK_ROUTING).map(([key, r]) => ({
      task: key,
      authority: r.authority,
      primaryModel: `${r.primaryProvider}/${r.primaryModel}`,
      consensus: r.consensusProviders?.map(p => `${p.provider}/${p.model}`) || "single-model",
    })),
    authorityRouting: {
      A0: "observational (no AI)",
      A1: "single best model for the task (rate-limit efficient)",
      A2: "2-provider consensus (primary + best secondary) — safety-first",
      A3: "3-provider consensus (all available providers) — maximum scrutiny",
      A4: "OPA/WasmEdge rule execution (no AI)",
      A5: "blocked (constitutional prohibition)",
    },
    safetyRule: "When providers disagree on verdict, most conservative wins (DENY > CONDITIONAL > ALLOW)",
  };
}
