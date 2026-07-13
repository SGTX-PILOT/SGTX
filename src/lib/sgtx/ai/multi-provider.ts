// SGTX Multi-Provider AI Orchestrator — NO ZAI, uses Gemini/OpenAI/GroQ/HuggingFace
// Provider chain: Gemini (primary) → OpenAI (secondary) → GroQ (fast) → HuggingFace (A2) → static fallback
// Includes 5-minute TTL cache + per-provider rate limiting (100 req/min)

import { createHash } from "crypto";

export type AuthorityLevel = "A0" | "A1" | "2" | "A3" | "A4" | "A5";
export type AIProvider = "gemini" | "openai" | "groq" | "huggingface" | "static" | "opa_wasm" | "blocked";

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
export interface AIResult {
  content: string;
  provider: string;
  model: string;
  latency_ms: number;
  fallback_used: boolean;
}

// ============ Provider Implementations ============

async function callGemini(systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number }): Promise<AIResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  if (!checkProviderRate("gemini")) throw new Error("Gemini rate limit exceeded");
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
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
  return { content, provider: "gemini", model: "gemini-1.5-flash", latency_ms: Date.now() - start, fallback_used: false };
}

async function callOpenAI(systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number }): Promise<AIResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  if (!checkProviderRate("openai")) throw new Error("OpenAI rate limit exceeded");
  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("OpenAI returned empty content");
  return { content, provider: "openai", model: "gpt-4o-mini", latency_ms: Date.now() - start, fallback_used: false };
}

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

function staticFallback(systemPrompt: string, userPrompt: string): AIResult {
  return {
    content: `Static fallback: unable to reach AI providers. Query: ${userPrompt.substring(0, 200)}`,
    provider: "static", model: "rule-based-v1", latency_ms: 0, fallback_used: true,
  };
}

// ============ Main runAI Function ============

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
    { name: "openai", fn: () => callOpenAI(system_prompt, user_prompt, aiOpts) },
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
      logInference({ agent_name, authority_level, provider: providers[i].name as AIProvider, model: "", latency_ms: 0, fallback_used: true, output_length_tokens: 0, input_context: user_prompt.substring(0, 100), success: false, error: lastError });
      continue;
    }
  }

  // All providers failed — static fallback
  const fallback = staticFallback(system_prompt, user_prompt);
  logInference({ agent_name, authority_level, provider: "static", model: fallback.model, latency_ms: 0, fallback_used: true, output_length_tokens: fallback.content.length, input_context: user_prompt.substring(0, 100), success: true, error: lastError || undefined });
  return fallback;
}

// ============ callAI Wrapper (backward compat) ============

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

// ============ AI Provider Status ============

export function getAIProviderStatus(): { provider: string; available: boolean; rateLimitRemaining: number }[] {
  const now = Date.now();
  return [
    { provider: "gemini", available: !!process.env.GEMINI_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("gemini")?.count || 0) },
    { provider: "openai", available: !!process.env.OPENAI_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("openai")?.count || 0) },
    { provider: "groq", available: !!process.env.GROQ_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("groq")?.count || 0) },
    { provider: "huggingface", available: !!process.env.HUGGINGFACE_API_KEY, rateLimitRemaining: RATE_MAX - (rateMap.get("huggingface")?.count || 0) },
    { provider: "static", available: true, rateLimitRemaining: Infinity },
  ];
}
