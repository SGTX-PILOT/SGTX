// SGTX AI Orchestrator (Blueprint Part 1.4 — AI Authority Ladder)
// Provider chain: z-ai-web-dev-sdk (glm-4-plus, primary) → HuggingFace (A2 secondary) → static fallback.
// Groq key provided was invalid (403 Forbidden); z-ai SDK replaces it as the A1 advisory provider.

export type AuthorityLevel = "A1" | "A2" | "A3";
export type AIProvider = "zai" | "huggingface" | "static";

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

// ============ z-ai-web-dev-sdk (primary A1/A2/A3) ============
let _zaiInstance: any = null;
async function getZAI() {
  if (!_zaiInstance) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    _zaiInstance = await ZAI.create();
  }
  return _zaiInstance;
}

async function callZAI(systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<{ content: string; latencyMs: number }> {
  const zai = await getZAI();
  const start = Date.now();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
    max_tokens: opts.maxTokens ?? 400,
    temperature: opts.temperature ?? 0.4,
  });
  const latencyMs = Date.now() - start;
  const content = completion.choices?.[0]?.message?.content || "";
  return { content, latencyMs };
}

// ============ HuggingFace (A2/A3 secondary) ============
async function callHuggingFace(modelId: string, systemPrompt: string, userPrompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<{ content: string; latencyMs: number }> {
  const apiKey = process.env.HF_API_TOKEN;
  if (!apiKey) throw new Error("HF_API_TOKEN not configured");

  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  const start = Date.now();
  const payload = {
    inputs: `<s>[INST] ${systemPrompt}\n\n${userPrompt} [/INST]`,
    parameters: {
      max_new_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.4,
      return_full_text: false,
    },
    options: { wait_for_model: true },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`HF ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = Array.isArray(data) ? data[0]?.generated_text || "" : data.generated_text || "";
  return { content: content.trim(), latencyMs };
}

// ============ Static fallback ============
const STATIC_FALLBACKS: Record<string, string> = {
  inbox_summary: "You have pending actions requiring attention. Please review the Smart Inbox for high-priority items. (AI summary unavailable — static fallback.)",
  tenant_message: "This action requires additional verification. Please review the conditions below and retry. (AI message unavailable — static fallback.)",
  health_summary: "Trade health is being calculated. Review the component scores below for details. (AI summary unavailable — static fallback.)",
  why_matters: "This action is required to progress the trade to the next phase. (AI explanation unavailable — static fallback.)",
  chat: "I'm currently operating in fallback mode. Please contact support for detailed assistance with this query.",
  price_band: "Market price band unavailable. Please consult public commodity indices. (AI advisory unavailable — static fallback.)",
  dispute_root_cause: "Root-cause analysis unavailable. Manual review recommended. (AI analysis unavailable — static fallback.)",
  contract_clause: "Standard contract clause generation unavailable. Please use the template provided. (AI generation unavailable — static fallback.)",
  governor_prescreen: "Automated pre-screen unavailable. Manual compliance review required. (AI pre-screen unavailable — static fallback.)",
  loading_guide: "1. Inspect container condition. 2. Load pallets evenly. 3. Secure with straps. 4. Verify seal. 5. Record milestone. (Static fallback guide.)",
};

function staticFallback(key: string): string {
  return STATIC_FALLBACKS[key] || "AI advisory unavailable. Please contact support.";
}

// ============ Public orchestrator ============
export interface AIResult {
  content: string;
  provider: AIProvider;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  authority: AuthorityLevel;
}

export async function runAI(params: {
  agentName: string;
  authority: AuthorityLevel;
  systemPrompt: string;
  userPrompt: string;
  fallbackKey: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AIResult> {
  const { agentName, authority, systemPrompt, userPrompt, fallbackKey, maxTokens, temperature } = params;

  // A1: z-ai primary → static
  if (authority === "A1") {
    try {
      const { content, latencyMs } = await callZAI(systemPrompt, userPrompt, { maxTokens, temperature });
      logInference({ agent_name: agentName, authority_level: authority, provider: "zai", model: "glm-4-plus", latency_ms: latencyMs, fallback_used: false, output_length_tokens: Math.ceil(content.length / 4), input_context: userPrompt.slice(0, 200), success: true });
      return { content, provider: "zai", model: "glm-4-plus", latencyMs, fallbackUsed: false, authority };
    } catch (err: any) {
      logInference({ agent_name: agentName, authority_level: authority, provider: "zai", model: "glm-4-plus", latency_ms: 0, fallback_used: true, output_length_tokens: 0, input_context: userPrompt.slice(0, 200), success: false, error: err.message });
      return { content: staticFallback(fallbackKey), provider: "static", model: "static-template", latencyMs: 0, fallbackUsed: true, authority };
    }
  }

  // A2/A3: z-ai primary → HuggingFace secondary → static
  try {
    const { content, latencyMs } = await callZAI(systemPrompt, userPrompt, { maxTokens, temperature });
    logInference({ agent_name: agentName, authority_level: authority, provider: "zai", model: "glm-4-plus", latency_ms: latencyMs, fallback_used: false, output_length_tokens: Math.ceil(content.length / 4), input_context: userPrompt.slice(0, 200), success: true });
    return { content, provider: "zai", model: "glm-4-plus", latencyMs, fallbackUsed: false, authority };
  } catch (err: any) {
    logInference({ agent_name: agentName, authority_level: authority, provider: "zai", model: "glm-4-plus", latency_ms: 0, fallback_used: true, output_length_tokens: 0, input_context: userPrompt.slice(0, 200), success: false, error: err.message });
    // Fallback: HuggingFace Mixtral
    const hfModel = process.env.HF_MIXTRAL_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
    try {
      const { content, latencyMs } = await callHuggingFace(hfModel, systemPrompt, userPrompt, { maxTokens, temperature });
      logInference({ agent_name: agentName, authority_level: authority, provider: "huggingface", model: hfModel, latency_ms: latencyMs, fallback_used: true, output_length_tokens: Math.ceil(content.length / 4), input_context: userPrompt.slice(0, 200), success: true });
      return { content, provider: "huggingface", model: hfModel, latencyMs, fallbackUsed: true, authority };
    } catch (err2: any) {
      logInference({ agent_name: agentName, authority_level: authority, provider: "huggingface", model: hfModel, latency_ms: 0, fallback_used: true, output_length_tokens: 0, input_context: userPrompt.slice(0, 200), success: false, error: err2.message });
      return { content: staticFallback(fallbackKey), provider: "static", model: "static-template", latencyMs: 0, fallbackUsed: true, authority };
    }
  }
}

// ============ Convenience agents (Blueprint-aligned) ============

/** A1 — Smart Inbox AI Summary Card (Part 12A.1.3) */
export async function generateInboxSummary(inbox: any[], tenantName: string): Promise<AIResult> {
  const items = inbox.slice(0, 8).map((i) => `- [P${i.priority}] ${i.title}: ${i.description}`).join("\n");
  return runAI({
    agentName: "inbox_summary_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Smart Inbox AI. Generate a concise, plain-language summary of the user's pending actions (max 3 sentences). Mention high-priority items first. Never recommend counterparties. SGTX is a non-marketplace system. Be direct and actionable.",
    userPrompt: `Tenant: ${tenantName}\nPending actions (${inbox.length} total):\n${items}\n\nSummarize what needs attention today.`,
    fallbackKey: "inbox_summary",
    maxTokens: 200,
    temperature: 0.3,
  });
}

/** A1 — Trade HealthScore AI Summary (Part 12G.7.6) */
export async function generateHealthSummary(trade: any, components: any): Promise<AIResult> {
  return runAI({
    agentName: "health_summary_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Trade Health AI. Given a trade's health component scores, generate ONE plain-language sentence explaining the overall health and the single most impactful issue to fix. Be specific and actionable. Max 30 words.",
    userPrompt: `Trade USTN: ${trade.ustn}\nCommodity: ${trade.commodity}\nStatus: ${trade.status}\nHealth components: Compliance=${components.compliance}, Documentation=${components.documentation}, Logistics=${components.logistics}, Payment=${components.payment}, Risk=${components.risk}, Timeline=${components.timeline}, Overall=${components.score}\n\nGenerate the health summary.`,
    fallbackKey: "health_summary",
    maxTokens: 80,
    temperature: 0.3,
  });
}

/** A1 — TCC Pending Action "why this matters" (Part 12A.2.3) */
export async function generateWhyItMatters(action: { label: string; context: string }): Promise<AIResult> {
  return runAI({
    agentName: "why_matters_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Trade Command Center AI. Explain in ONE sentence (max 25 words) why the pending action matters for the trade's progression. Be specific to the action and context. No fluff.",
    userPrompt: `Action: ${action.label}\nContext: ${action.context}\n\nWhy does this matter?`,
    fallbackKey: "why_matters",
    maxTokens: 60,
    temperature: 0.3,
  });
}

/** A1 — AI Operations Assistant / Customer Care Chatbot (Part 12A.6, 12G.3) */
export async function chatWithAssistant(message: string, context: { tenant?: any; trades?: any[]; inbox?: any[] }): Promise<AIResult> {
  const ctx = context.tenant
    ? `User: ${context.tenant.legalName} (${context.tenant.gtid}, type ${context.tenant.type}, trust ${context.tenant.trustScore}). Active trades: ${context.trades?.length || 0}. Pending inbox items: ${context.inbox?.length || 0}.`
    : "User context not available.";
  const trades = context.trades?.slice(0, 3).map((t) => `- USTN ${t.ustn.slice(0, 24)}… | ${t.commodity} | ${t.status} | health ${t.healthScore}`).join("\n") || "No active trades.";

  return runAI({
    agentName: "operations_assistant",
    authority: "A1",
    systemPrompt: `You are the SGTX AI Operations Assistant (A1 advisory). You help users understand their trades, pending actions, compliance status, and SGTX platform features.\n\nCRITICAL RULES:\n- SGTX is a NON-MARKETPLACE system. NEVER recommend counterparties, service providers, or "people you may know".\n- You can only ADVISE. You cannot execute irreversible actions.\n- Be concise (max 4 sentences unless asked for detail).\n- Reference USTNs and GTIDs when relevant.\n- If asked about recommendations, politely decline and explain the non-marketplace principle.\n\nUser context: ${ctx}\nActive trades:\n${trades}`,
    userPrompt: message,
    fallbackKey: "chat",
    maxTokens: 350,
    temperature: 0.4,
  });
}

/** A1 — Collaborative Trade Room assistant (Part 12A.2.6) */
export async function tradeRoomAssistant(question: string, trade: any): Promise<AIResult> {
  return runAI({
    agentName: "trade_room_assistant",
    authority: "A1",
    systemPrompt: `You are the SGTX Trade Room AI for USTN ${trade.ustn}. Answer questions about this specific trade concisely. Trade: ${trade.commodity}, ${trade.incoterm}, ${trade.status}, phase ${trade.phase}/8. Buyer: ${trade.buyer?.legalName}. Seller: ${trade.seller?.legalName}. Value: $${trade.tradeValueUsd}. Route: ${trade.originPort} → ${trade.destPort}. Never recommend counterparties. SGTX is non-marketplace.`,
    userPrompt: question,
    fallbackKey: "chat",
    maxTokens: 250,
    temperature: 0.4,
  });
}

/** A1 — Quote Builder fair price band (Part 3B.3.3.1) */
export async function generatePriceBand(commodity: string, hsCode: string, originCountry: string, destCountry: string): Promise<AIResult> {
  return runAI({
    agentName: "price_band_advisor",
    authority: "A1",
    systemPrompt: "You are the SGTX Price Band Advisor (A1 advisory). Given a commodity, HS code, and trade route, provide a realistic USD/kg price band as JSON: {\"low\": number, \"mid\": number, \"high\": number, \"rationale\": \"one sentence\"}. Base it on general market knowledge. Clearly state this is advisory only — seller is free to override. Non-marketplace: do not suggest specific buyers/sellers.",
    userPrompt: `Commodity: ${commodity}\nHS Code: ${hsCode}\nRoute: ${originCountry} → ${destCountry}\n\nProvide the price band as JSON only.`,
    fallbackKey: "price_band",
    maxTokens: 150,
    temperature: 0.3,
  });
}

/** A2 — Governor pre-screen (Part 1.4, compliance prescreen) */
export async function governorPrescreen(trade: { commodity: string; hsCode: string; buyerCountry: string; sellerCountry: string; value: number }): Promise<AIResult & { verdict: string; conditions: string[] }> {
  const result = await runAI({
    agentName: "governor_prescreen",
    authority: "A2",
    systemPrompt: 'You are the SGTX Governor Pre-Screen AI (A2 constraining). Evaluate the trade for compliance risks. Return JSON: {"verdict": "ALLOW"|"CONDITIONAL"|"DENY", "conditions": ["list of required actions if CONDITIONAL"], "rationale": "one sentence"}. Check: sanctions risk, dual-use goods, incompatible commodity mixing, jurisdiction autoblock. Be conservative. Non-marketplace.',
    userPrompt: `Commodity: ${trade.commodity}\nHS: ${trade.hsCode}\nBuyer country: ${trade.buyerCountry}\nSeller country: ${trade.sellerCountry}\nValue: $${trade.value}\n\nEvaluate.`,
    fallbackKey: "governor_prescreen",
    maxTokens: 200,
    temperature: 0.2,
  });
  let verdict = "ALLOW";
  let conditions: string[] = [];
  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      verdict = parsed.verdict || "ALLOW";
      conditions = parsed.conditions || [];
    }
  } catch {}
  return { ...result, verdict, conditions };
}

/** A3 — Dispute root-cause analysis (Part 10, causal inference) */
export async function disputeRootCause(dispute: { type: string; description: string; trade: any }): Promise<AIResult> {
  return runAI({
    agentName: "dispute_causal_analyzer",
    authority: "A3",
    systemPrompt: "You are the SGTX Causal Inference Engine (A3 escalation). Analyze the dispute and provide a root-cause hypothesis with contribution percentages. Format: 'Root cause: <cause>. Contributing factors: <factor1> (XX%), <factor2> (XX%). Recommended resolution: <action>.' Be specific and evidence-based. You advise only — a human mediator decides.",
    userPrompt: `Dispute type: ${dispute.type}\nDescription: ${dispute.description}\nTrade: ${dispute.trade?.commodity} (${dispute.trade?.incoterm}), USTN ${dispute.trade?.ustn?.slice(0, 24)}\n\nAnalyze the root cause.`,
    fallbackKey: "dispute_root_cause",
    maxTokens: 200,
    temperature: 0.3,
  });
}

/** A2 — Governor tenant_message (Part 1.5) */
export async function generateTenantMessage(action: string, verdict: string, conditions: string[]): Promise<AIResult> {
  return runAI({
    agentName: "tenant_message_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Governor Message Generator. Write a 2-3 sentence plain-language message explaining why an action was blocked or made conditional. Never expose OPA rule IDs, WasmEdge codes, or Loom hashes. Be empathetic and actionable. Mention the specific conditions to resolve.",
    userPrompt: `Action attempted: ${action}\nVerdict: ${verdict}\nConditions: ${conditions.join("; ")}\n\nWrite the tenant message.`,
    fallbackKey: "tenant_message",
    maxTokens: 120,
    temperature: 0.4,
  });
}

/** A2 — Contract Clause Forge (Part 3B) */
export async function clauseForge(article: string, trade: any): Promise<AIResult> {
  return runAI({
    agentName: "clause_forge",
    authority: "A2",
    systemPrompt: "You are the SGTX Clause Forge AI. Draft a precise legal contract clause for the given article based on the trade terms. Use formal legal language, reference SGTX fee model (1.5% per side, non-custodial FeeLock), and USTN embedding. Max 120 words. Do not include counterparty recommendations.",
    userPrompt: `Article: ${article}\nTrade: ${trade.commodity}, ${trade.incoterm}, $${trade.tradeValueUsd}, ${trade.originPort}→${trade.destPort}\nBuyer: ${trade.buyer?.legalName}\nSeller: ${trade.seller?.legalName}\n\nDraft the clause.`,
    fallbackKey: "contract_clause",
    maxTokens: 200,
    temperature: 0.3,
  });
}

/** A1 — Loading guide generation (Part 3B) */
export async function generateLoadingGuide(commodity: string, containerCount: number, coldChain: boolean): Promise<AIResult> {
  return runAI({
    agentName: "loading_guide_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Loading Guide AI. Generate a concise step-by-step loading guide for warehouse workers. Use numbered steps, max 6 steps. Mention pallet arrangement, weight distribution, and cold-chain requirements if applicable. Non-marketplace: no provider recommendations.",
    userPrompt: `Commodity: ${commodity}\nContainers: ${containerCount}\nCold chain: ${coldChain ? "Yes (-18°C)" : "No"}\n\nGenerate the loading guide.`,
    fallbackKey: "loading_guide",
    maxTokens: 200,
    temperature: 0.3,
  });
}

/** A2 — Product Form Agent (Part 3B.2.3.3) — generates dynamic JSON schema for product specs */
export async function productFormAgent(commodityType: string, productName: string, hsCode: string): Promise<AIResult> {
  return runAI({
    agentName: "product_form_agent",
    authority: "A2",
    systemPrompt: `You are the SGTX Product Form Agent (A2). Given a commodity type, product name, and HS code, generate a JSON schema that dynamically adds product-specific fields, packing defaults, required documents, special procedures, and lab tests. Return valid JSON only. Format: {"dynamic_fields":[{"name","type","options","mandatory","default"}],"required_documents":[{"type","mandatory"}],"special_conditions":[],"treatment_details":{},"lab_tests_required":[]}. Non-marketplace.`,
    userPrompt: `Commodity Type: ${commodityType}\nProduct: ${productName}\nHS Code: ${hsCode}\n\nGenerate the dynamic product specification schema as JSON.`,
    fallbackKey: "chat",
    maxTokens: 400,
    temperature: 0.2,
  });
}

/** A1 — AI Container Advisor (Part 3B.2.5) — suggests container count/type */
export async function containerAdvisor(palletCount: number, palletType: string): Promise<AIResult> {
  return runAI({
    agentName: "container_advisor",
    authority: "A1",
    systemPrompt: "You are the SGTX Container Advisor (A1 advisory). Based on the number and type of pallets, suggest the optimal container type and count. Return JSON: {\"suggestion\": \"1 × 40ft High-Cube reefer\", \"reason\": \"...\", \"current\": \"\", \"adjust_needed\": true/false}. Non-marketplace: never reference 'other buyers'.",
    userPrompt: `Pallets: ${palletCount}\nPallet type: ${palletType} (${palletType === "EUR" ? "800×1200mm" : "1000×1200mm"})\n\nSuggest container configuration as JSON.`,
    fallbackKey: "chat",
    maxTokens: 120,
    temperature: 0.3,
  });
}

/** A1 — Incoterm plain-language summary (Part 3B.2.2) */
export async function incotermSummary(incoterm: string, buyerCountry: string, sellerCountry: string): Promise<AIResult> {
  return runAI({
    agentName: "incoterm_summary_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Incoterm AI. Generate a ONE-sentence plain-language summary of buyer and seller responsibilities for the given incoterm. Be specific. Non-marketplace.",
    userPrompt: `Incoterm: ${incoterm}\nBuyer country: ${buyerCountry}\nSeller country: ${sellerCountry}\n\nGenerate the responsibility summary.`,
    fallbackKey: "chat",
    maxTokens: 60,
    temperature: 0.3,
  });
}

/** A1 — Ecological Packaging Advisor (Part 3B.3.4.5) */
export async function ecologicalPackagingAdvisor(commodity: string, currentPackaging: string, containerCount: number): Promise<AIResult> {
  return runAI({
    agentName: "ecological_packaging_advisor",
    authority: "A1",
    systemPrompt: "You are the SGTX Ecological Packaging Advisor (A1). Suggest sustainable packaging alternatives with carbon savings and cost impact. Return JSON: {\"alternatives\":[{\"material\",\"carbon_saving_kg\",\"cost_impact\",\"description\"}]}. Non-marketplace.",
    userPrompt: `Commodity: ${commodity}\nCurrent packaging: ${currentPackaging}\nContainers: ${containerCount}\n\nSuggest ecological alternatives as JSON.`,
    fallbackKey: "chat",
    maxTokens: 200,
    temperature: 0.3,
  });
}

/** A2 — Price Deviation Justification (Part 3B.3.3.5) */
export async function priceDeviationCheck(commodity: string, enteredPrice: number, aiBandLow: number, aiBandHigh: number): Promise<AIResult> {
  return runAI({
    agentName: "price_deviation_checker",
    authority: "A2",
    systemPrompt: "You are the SGTX Price Deviation Checker (A2). Evaluate if the entered price deviates significantly from the AI market band. Return JSON: {\"deviation_pct\": number, \"requires_justification\": boolean, \"advisory\": \"string\"}. If deviation >30% above, justification required. If >50% below, amber advisory.",
    userPrompt: `Commodity: ${commodity}\nEntered price: $${enteredPrice}/kg\nAI band: $${aiBandLow}-$${aiBandHigh}/kg\n\nEvaluate deviation as JSON.`,
    fallbackKey: "chat",
    maxTokens: 100,
    temperature: 0.2,
  });
}

/** A1 — Alternative Port Suggester (Part 3B.3.6) */
export async function alternativePortSuggester(destCountry: string, commodity: string, currentPort: string): Promise<AIResult> {
  return runAI({
    agentName: "alternative_port_suggester",
    authority: "A1",
    systemPrompt: "You are the SGTX Alternative Port Advisor (A1). Suggest alternative delivery ports within the destination country based on historical cost savings, transit time, and congestion. Return JSON: {\"suggestions\":[{\"port\",\"un_locode\",\"transit_time_days\",\"cost_delta_usd\",\"congestion_level\"}]}. Non-marketplace.",
    userPrompt: `Destination country: ${destCountry}\nCommodity: ${commodity}\nCurrent port: ${currentPort}\n\nSuggest alternative ports as JSON.`,
    fallbackKey: "chat",
    maxTokens: 200,
    temperature: 0.3,
  });
}
