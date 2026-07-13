// SGTX Multi-Provider AI Orchestrator — NO ZAI, uses Gemini/OpenRouter/Groq/HuggingFace
// Provider chain: Gemini (primary) → OpenRouter (secondary) → Groq (fast) → HuggingFace (tertiary) → static fallback
// OpenRouter (https://openrouter.ai) is an OpenAI-compatible gateway routing to 100+ models
// (OpenAI, Anthropic, Google, Mistral, etc.) through a single API. It replaces the direct
// OpenAI integration in the active chain because it is a strict superset.
// Includes 5-minute TTL cache + per-provider rate limiting (100 req/min)

import { createHash } from "crypto";

export type AuthorityLevel = "A0" | "A1" | "2" | "A3" | "A4" | "A5";
export type AIProvider = "gemini" | "openrouter" | "openai" | "groq" | "huggingface" | "static" | "opa_wasm" | "blocked";

interface InferenceRecord {
  agent_name: string;
  authority_level: AuthorityLevel;
  provider: AIProvider;
  model: string;
  latency_ms: number;
  fallback_used: boolean;
  output_length_tokens: number;
  input_context: string;
  success: boolean;
  error?: string;
  created_at: string;
}

const INFERENCE_LOG: InferenceRecord[] = [];
const MAX_LOG = 200;

function logInference(rec: Omit<InferenceRecord, "created_at">) {
  INFERENCE_LOG.push({ ...rec, created_at: new Date().toISOString() });
  if (INFERENCE_LOG.length > MAX_LOG) INFERENCE_LOG.shift();
}

/**
 * Return the most recent inference records (newest first), capped at `limit`
 * (default 50, max 200). Pure in-memory ring buffer — resets on server restart.
 */
export function getInferenceLog(limit = 50): InferenceRecord[] {
  return INFERENCE_LOG.slice(-limit).reverse();
}

// ============ 5-minute TTL Cache ============
interface CacheEntry { result: AIResult; expiresAt: number; }
const AI_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(systemPrompt: string, userPrompt: string): string {
  return createHash("sha256").update(systemPrompt + "|" + userPrompt).digest("hex");
}

function getCached(key: string): AIResult | null {
  const entry = AI_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { AI_CACHE.delete(key); return null; }
  return entry.result;
}

function setCached(key: string, result: AIResult) {
  AI_CACHE.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // Prune expired entries
  if (AI_CACHE.size > 1000) {
    const now = Date.now();
    for (const [k, v] of AI_CACHE) { if (now > v.expiresAt) AI_CACHE.delete(k); }
  }
}

// ============ Per-Provider Rate Limiting ============
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 100;

function checkProviderRate(provider: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(provider);
  if (!entry || entry.resetAt < now) {
    rateMap.set(provider, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

// ============ AI Result Type ============
/**
 * Normalized result returned by every provider implementation and the
 * top-level `runAI`/`callAI`/`runMultiProviderAI` entry points.
 */
export interface AIResult {
  content: string;
  provider: string;
  model: string;
  latency_ms: number;
  fallback_used: boolean;
}

// ============ Provider Implementations ============

/**
 * Call Google Gemini (primary provider).
 * Uses gemini-2.0-flash via the Generative Language API (configurable via GEMINI_MODEL env).
 * Throws on missing key, rate limit, HTTP error, or empty content.
 */
async function callGemini(systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number }): Promise<AIResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  if (!checkProviderRate("gemini")) throw new Error("Gemini rate limit exceeded");
  const start = Date.now();
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
    ],
    generationConfig: { maxOutputTokens: opts.maxTokens || 1024, temperature: opts.temperature ?? 0.3 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!content) throw new Error("Gemini returned empty content");
  return { content, provider: "gemini", model, latency_ms: Date.now() - start, fallback_used: false };
}

/**
 * Call OpenRouter (secondary provider) — OpenAI-compatible gateway to 100+ models.
 * Default model: openai/gpt-4o-mini (fast + cheap). Override via opts.model.
 * Sends HTTP-Referer + X-Title headers as required by OpenRouter's attribution policy.
 * Throws on missing key, rate limit, HTTP error, or empty content.
 */
export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number; model?: string }
): Promise<AIResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  if (!checkProviderRate("openrouter")) throw new Error("OpenRouter rate limit exceeded");
  const model = opts.model || "openai/gpt-4o-mini";
  const start = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
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
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("OpenRouter returned empty content");
  return { content, provider: "openrouter", model, latency_ms: Date.now() - start, fallback_used: false };
}

/**
 * Call Groq (fast fallback provider) — ultra-low latency inference.
 * Uses llama-3.3-70b-versatile via the OpenAI-compatible Groq endpoint.
 * Throws on missing key, rate limit, HTTP error, or empty content.
 */
async function callGroq(systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number }): Promise<AIResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  if (!checkProviderRate("groq")) throw new Error("Groq rate limit exceeded");
  const start = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("Groq returned empty content");
  return { content, provider: "groq", model: "llama-3.3-70b-versatile", latency_ms: Date.now() - start, fallback_used: false };
}

/**
 * Call HuggingFace (tertiary provider) — open-source models via the Inference API.
 * Uses mistralai/Mistral-7B-Instruct-v0.3 by default.
 * Throws on missing key, rate limit, HTTP error, or empty content.
 */
async function callHuggingFace(systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number }): Promise<AIResult> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HUGGINGFACE_API_KEY not set");
  if (!checkProviderRate("huggingface")) throw new Error("HuggingFace rate limit exceeded");
  const start = Date.now();
  const model = "mistralai/Mistral-7B-Instruct-v0.3";
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ inputs: systemPrompt + "\n\n" + userPrompt, parameters: { max_new_tokens: opts.maxTokens || 1024, temperature: opts.temperature ?? 0.3, return_full_text: false } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HuggingFace HTTP ${res.status}`);
  const data = await res.json();
  const content = Array.isArray(data) ? data[0]?.generated_text || "" : data?.generated_text || "";
  if (!content) throw new Error("HuggingFace returned empty content");
  return { content, provider: "huggingface", model, latency_ms: Date.now() - start, fallback_used: false };
}

/**
 * Rule-based static fallback used when every live AI provider has failed.
 * Always succeeds — never throws.
 */
function staticFallback(systemPrompt: string, userPrompt: string): AIResult {
  return {
    content: `Static fallback: unable to reach AI providers. Query: ${userPrompt.substring(0, 200)}`,
    provider: "static", model: "rule-based-v1", latency_ms: 0, fallback_used: true,
  };
}

// ============ Main runAI Function ============

/**
 * Run an AI inference request through the multi-provider fallback chain.
 *
 * Provider chain order:
 *   1. Gemini (primary)
 *   2. OpenRouter (secondary) — replaces direct OpenAI access
 *   3. Groq (fast fallback)
 *   4. HuggingFace (tertiary)
 *   5. Static rule-based fallback (always succeeds)
 *
 * Results are cached for 5 minutes (TTL) keyed by system+user prompt hash.
 * Each provider is rate-limited to 100 req/min. All failures are logged to
 * the in-memory inference log (see `getInferenceLog`).
 */
export async function runAI(opts: {
  agent_name: string;
  authority_level: AuthorityLevel;
  system_prompt: string;
  user_prompt: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<AIResult> {
  const { agent_name, authority_level, system_prompt, user_prompt, max_tokens, temperature } = opts;

  // Check cache first
  const cKey = cacheKey(system_prompt, user_prompt);
  const cached = getCached(cKey);
  if (cached) {
    logInference({ agent_name, authority_level, provider: cached.provider as AIProvider, model: cached.model, latency_ms: 0, fallback_used: cached.fallback_used, output_length_tokens: cached.content.length, input_context: user_prompt.substring(0, 100), success: true });
    return { ...cached, latency_ms: 0 };
  }

  const aiOpts = { maxTokens: max_tokens, temperature };
  const providers = [
    { name: "gemini", fn: () => callGemini(system_prompt, user_prompt, aiOpts) },
    { name: "openrouter", fn: () => callOpenRouter(system_prompt, user_prompt, aiOpts) },
    { name: "groq", fn: () => callGroq(system_prompt, user_prompt, aiOpts) },
    { name: "huggingface", fn: () => callHuggingFace(system_prompt, user_prompt, aiOpts) },
  ];

  let lastError: string | null = null;
  for (let i = 0; i < providers.length; i++) {
    try {
      const result = await providers[i].fn();
      result.fallback_used = i > 0;
      setCached(cKey, result);
      logInference({ agent_name, authority_level, provider: result.provider as AIProvider, model: result.model, latency_ms: result.latency_ms, fallback_used: result.fallback_used, output_length_tokens: result.content.length, input_context: user_prompt.substring(0, 100), success: true });
      return result;
    } catch (e: any) {
      lastError = e.message;
      logInference({ agent_name, authority_level, provider: providers[i].name as AIProvider, model: "", latency_ms: 0, fallback_used: true, output_length_tokens: 0, input_context: user_prompt.substring(0, 100), success: false, error: lastError ?? undefined });
      continue;
    }
  }

  // All providers failed — static fallback
  const fallback = staticFallback(system_prompt, user_prompt);
  logInference({ agent_name, authority_level, provider: "static", model: fallback.model, latency_ms: 0, fallback_used: true, output_length_tokens: fallback.content.length, input_context: user_prompt.substring(0, 100), success: true, error: lastError || undefined });
  return fallback;
}

/**
 * Backward-compatible alias for `runAI`. Returns the same `AIResult` shape;
 * kept as a thin wrapper so existing call sites continue to compile after the
 * provider chain switched from OpenAI to OpenRouter.
 */
export async function callAI(opts: {
  agent_name: string;
  authority_level: AuthorityLevel;
  system_prompt: string;
  user_prompt: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<{ content: string; provider: string; model: string; latency_ms: number; fallback_used: boolean }> {
  return runAI(opts);
}

/**
 * Backward-compatible alias for `runAI`, exposing the multi-provider entry
 * point under the name used in higher-level docs.
 */
export async function runMultiProviderAI(opts: {
  agent_name: string;
  authority_level: AuthorityLevel;
  system_prompt: string;
  user_prompt: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<AIResult> {
  return runAI(opts);
}

/**
 * Call a single named provider directly without going through the fallback
 * chain. Used by the `/api/sgtx/ai/providers` POST health-test endpoint to
 * exercise one provider at a time. Throws if the provider name is unknown or
 * the provider call fails.
 */
export async function callProviderByName(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number; model?: string } = {}
): Promise<AIResult> {
  switch (provider) {
    case "gemini":
      return callGemini(systemPrompt, userPrompt, opts);
    case "openrouter":
      return callOpenRouter(systemPrompt, userPrompt, opts);
    case "groq":
      return callGroq(systemPrompt, userPrompt, opts);
    case "huggingface":
      return callHuggingFace(systemPrompt, userPrompt, opts);
    case "static":
      return staticFallback(systemPrompt, userPrompt);
    default:
      throw new Error(`Provider '${provider}' cannot be called directly via callProviderByName`);
  }
}

// ============ AI Provider Status ============

/**
 * Return a snapshot of every provider's availability (key configured) and
 * remaining rate-limit budget for the current 60-second window. Does not
 * perform any network I/O — purely a config + in-memory counter check.
 */
export function getAIProviderStatus(): { provider: string; available: boolean; rateLimitRemaining: number }[] {
  const now = Date.now();
  void now;
  return [
    { provider: "gemini", available: !!process.env.GEMINI_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("gemini")?.count || 0) },
    { provider: "openrouter", available: !!process.env.OPENROUTER_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("openrouter")?.count || 0) },
    { provider: "groq", available: !!process.env.GROQ_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("groq")?.count || 0) },
    { provider: "huggingface", available: !!process.env.HUGGINGFACE_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("huggingface")?.count || 0) },
    { provider: "static", available: true, rateLimitRemaining: Infinity },
  ];
}

/**
 * Lightweight health map for all providers. Reports whether each provider's
 * API key is configured and (for live providers) whether it is currently
 * considered available. Does NOT perform any network I/O — use the
 * `/api/sgtx/ai/providers?health=true` endpoint for a live probe.
 */
export function getProviderHealth(): {
  gemini: { available: boolean; keyConfigured: boolean };
  openrouter: { available: boolean; keyConfigured: boolean; models: string[] };
  groq: { available: boolean; keyConfigured: boolean };
  huggingface: { available: boolean; keyConfigured: boolean };
  static: { available: true };
} {
  const geminiKey = !!process.env.GEMINI_API_KEY;
  const openrouterKey = !!process.env.OPENROUTER_API_KEY;
  const groqKey = !!process.env.GROQ_API_KEY;
  const hfKey = !!process.env.HUGGINGFACE_API_KEY;
  return {
    gemini: { available: geminiKey, keyConfigured: geminiKey },
    openrouter: {
      available: openrouterKey,
      keyConfigured: openrouterKey,
      models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5", "mistralai/mistral-large"],
    },
    groq: { available: groqKey, keyConfigured: groqKey },
    huggingface: { available: hfKey, keyConfigured: hfKey },
    static: { available: true },
  };
}
