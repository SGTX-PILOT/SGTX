// SGTX AI Orchestrator (Blueprint Part 1.4 — AI Authority Ladder)
// NO ZAI — uses multi-provider system: Gemini → OpenRouter → Groq → HuggingFace → static fallback
// Re-exports from multi-provider.ts for backward compatibility + agent stubs

export type { AuthorityLevel, AIProvider, AIResult } from "./multi-provider";
export {
  runAI,
  callAI,
  runMultiProviderAI,
  callProviderByName,
  callOpenRouter,
  getInferenceLog,
  getAIProviderStatus,
  getProviderHealth,
} from "./multi-provider";
import { runAI } from "./multi-provider";
import type { AIResult, AuthorityLevel } from "./multi-provider";

/**
 * Extended AIResult that also carries camelCase aliases (`fallbackUsed`,
 * `latencyMs`) and an `authority` field, for backward compatibility with
 * route handlers that consumed the old agent-wrapper return shape.
 */
export type StubAIResult = AIResult & {
  fallbackUsed: boolean;
  latencyMs: number;
  authority: AuthorityLevel;
};

/** Wraps runAI and post-processes the result into a StubAIResult. */
async function runStub(
  opts: {
    agent_name: string;
    authority_level: AuthorityLevel;
    system_prompt: string;
    user_prompt: string;
    max_tokens?: number;
    temperature?: number;
  }
): Promise<StubAIResult> {
  const r = await runAI(opts);
  return {
    ...r,
    fallbackUsed: r.fallback_used,
    latencyMs: r.latency_ms,
    authority: opts.authority_level,
  };
}

// ============ Agent stub wrappers ============
// Each wrapper preserves the original public signature consumed by API route
// handlers and delegates to the multi-provider runAI() chain with an
// appropriate system prompt + authority level. Replacing the previous
// bespoke agent implementations, which were collapsed into multi-provider.

// ── A1 advisory: alternative port suggester ────────────────────────────────
export async function alternativePortSuggester(
  destCountry: string,
  commodity: string,
  currentPort: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "alt-port-suggester",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX alternative-port suggester. Given a destination country, commodity, and the currently selected port, recommend 2-3 alternative ports with rationale (congestion, cold-chain facilities, draft depth, connectivity). Return a concise JSON array.",
    user_prompt: JSON.stringify({ destCountry, commodity, currentPort }),
    max_tokens: 400,
    temperature: 0.4,
  });
}

// ── A1 advisory: customer-care chat assistant ──────────────────────────────
export async function chatWithAssistant(
  message: string,
  ctx?: { tenant?: any; trades?: any[]; inbox?: any[] }
): Promise<StubAIResult> {
  return runStub({
    agent_name: "chat-assistant",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX customer-care assistant. Help users with trade questions, platform navigation, and support. Be concise and helpful. You may reference the tenant's recent trades and inbox items when relevant.",
    user_prompt:
      `User message: ${message}\n\nContext (JSON): ` +
      JSON.stringify({
        tenant: ctx?.tenant ? { gtid: ctx.tenant.gtid, legalName: ctx.tenant.legalName } : null,
        recentTrades: (ctx?.trades || []).slice(0, 5).map((t: any) => ({ ustn: t.ustn, commodity: t.commodity, status: t.status })),
        inbox: (ctx?.inbox || []).slice(0, 6).map((i: any) => ({ title: i.title, category: i.category, priority: i.priority })),
      }),
    max_tokens: 500,
    temperature: 0.4,
  });
}

// ── A2 advisory: clause forge (single shot) ────────────────────────────────
export async function clauseForge(article: string, trade: any): Promise<StubAIResult> {
  return runStub({
    agent_name: "clause-forge",
    authority_level: "A2",
    system_prompt:
      "You are SGTX Clause Forge. Draft a single contract clause for the requested article using the trade context (parties, commodity, incoterm, value). Return only the clause text, formal legal tone, max 200 words.",
    user_prompt: `Article: ${article}\nTrade context: ${JSON.stringify(trade || {})}`,
    max_tokens: 400,
    temperature: 0.5,
  });
}

// ── A2 advisory: clause forge consensus (multi-model) ──────────────────────
export async function clauseForgeConsensus(opts: {
  article: string;
  trade: any;
}): Promise<StubAIResult> {
  // Consensus path is simulated here — real multi-model fan-out happens inside
  // the provider chain. Delegate to single-shot clauseForge and return the same
  // shape so the route handler works.
  return clauseForge(opts.article, opts.trade);
}

// ── Consensus status (config snapshot) ─────────────────────────────────────
export function getConsensusStatus(_arg?: any): {
  status: string;
  models: string[];
  consensusStrategy: string;
  minModels: number;
} {
  return {
    status: "ACTIVE",
    models: ["gemini", "openrouter", "groq", "huggingface"],
    consensusStrategy: "FIRST_SUCCESS",
    minModels: 1,
  };
}

// ── A1 advisory: container advisor ─────────────────────────────────────────
export async function containerAdvisor(
  palletCount: number,
  palletType: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "container-advisor",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX container advisor. Recommend the optimal container type and stuffing plan given a pallet count and pallet type (EUR/US/ISO). Consider weight distribution, ventilation, and cold-chain needs. Return JSON: { containerType, stuffingPlan, notes }.",
    user_prompt: JSON.stringify({ palletCount, palletType }),
    max_tokens: 350,
    temperature: 0.3,
  });
}

// ── A2 advisory: credit-intelligence risk summary ──────────────────────────
export async function creditIntelligenceRiskSummary(
  borrowerName: string,
  creditScore: number,
  defaultProbability: number,
  recommendedLtv: number,
  signals: any
): Promise<StubAIResult> {
  return runStub({
    agent_name: "credit-intelligence-risk-summary",
    authority_level: "A2",
    system_prompt:
      "You are the SGTX Credit Intelligence risk narrator. Produce a plain-language risk summary (3-5 sentences) for a financier, explaining the borrower's credit score, default probability, recommended LTV, and the driving signals. Be balanced and conservative.",
    user_prompt: JSON.stringify({ borrowerName, creditScore, defaultProbability, recommendedLtv, signals }),
    max_tokens: 400,
    temperature: 0.3,
  });
}

// ── A1 advisory: DeFi risk summary (5 mandatory bullets) ───────────────────
export async function defiRiskSummary(
  stablecoin: string,
  protocol: string,
  healthFactor: number,
  collateralType: string,
  language: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "defi-risk-summary",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX DeFi risk narrator. Produce EXACTLY 5 bullet points covering: (1) stablecoin depeg risk, (2) health-factor liquidation risk, (3) collateral volatility, (4) no guarantee / smart-contract risk, (5) past performance is not indicative. Each bullet one sentence. Plain language.",
    user_prompt: JSON.stringify({ stablecoin, protocol, healthFactor, collateralType, language }),
    max_tokens: 350,
    temperature: 0.4,
  });
}

// ── A1 advisory: dispute root-cause analysis ───────────────────────────────
export async function disputeRootCause(opts: {
  type: string;
  description: string;
  trade: any;
}): Promise<StubAIResult> {
  return runStub({
    agent_name: "dispute-root-cause",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX dispute root-cause analyst. Identify the most likely root cause and 1-2 contributing factors. Be specific and concise (3-5 sentences). Do not assign blame; focus on causal chain.",
    user_prompt: JSON.stringify(opts),
    max_tokens: 400,
    temperature: 0.3,
  });
}

// ── A1 advisory: ecological packaging advisor ──────────────────────────────
export async function ecologicalPackagingAdvisor(
  commodity: string,
  currentPackaging: string,
  containerCount: number
): Promise<StubAIResult> {
  return runStub({
    agent_name: "eco-packaging-advisor",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX ecological packaging advisor. Suggest lower-impact packaging alternatives for the commodity, comparing cost / carbon / recyclability vs. the current packaging. Return JSON: { recommendations: [{ material, rationale, co2ReductionPct, costDeltaPct }] }.",
    user_prompt: JSON.stringify({ commodity, currentPackaging, containerCount }),
    max_tokens: 400,
    temperature: 0.4,
  });
}

// ── A1 advisory: governor pre-screen (trade readiness check) ───────────────
export async function governorPrescreen(opts: any): Promise<StubAIResult> {
  return runStub({
    agent_name: "governor-prescreen",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX Governor pre-screener. Evaluate the proposed trade for completeness, risk flags (sanctions, dual-use, valuation, insurance, settlement), and return a JSON verdict: { verdict: 'PROCEED' | 'CONDITIONAL' | 'BLOCK', conditions: string[], rationale: string }.",
    user_prompt: JSON.stringify(opts),
    max_tokens: 500,
    temperature: 0.2,
  });
}

// ── A1 advisory: trade health summary ──────────────────────────────────────
export async function generateHealthSummary(
  trade: any,
  components: any
): Promise<StubAIResult> {
  return runStub({
    agent_name: "health-summary",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX trade health summariser. Produce a 3-4 sentence narrative explaining the trade's overall health score, calling out the weakest component and the single most impactful next action.",
    user_prompt: `Trade (JSON): ${JSON.stringify(trade || {})}\nHealth components: ${JSON.stringify(components || {})}`,
    max_tokens: 350,
    temperature: 0.3,
  });
}

// ── A1 advisory: inbox summary ─────────────────────────────────────────────
export async function generateInboxSummary(
  inbox: any[],
  tenantName: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "inbox-summary",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX inbox summariser. Produce a 3-5 sentence summary for the tenant, highlighting the top-priority items, any deadlines within 48h, and the recommended next action.",
    user_prompt: `Tenant: ${tenantName}\nInbox items: ${JSON.stringify((inbox || []).slice(0, 8))}`,
    max_tokens: 300,
    temperature: 0.3,
  });
}

// ── A1 advisory: incoterm plain-language summary ───────────────────────────
export async function incotermSummary(
  incoterm: string,
  buyerCountry: string,
  sellerCountry: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "incoterm-summary",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX incoterm explainer. Produce a concise (3-4 sentence) plain-language summary of the named Incoterms 2020 rule, highlighting cost, risk, and insurance transfer points for the given buyer/seller countries.",
    user_prompt: JSON.stringify({ incoterm, buyerCountry, sellerCountry }),
    max_tokens: 300,
    temperature: 0.3,
  });
}

// ── A1 advisory: container loading guide ───────────────────────────────────
export async function generateLoadingGuide(
  commodity: string,
  containerCount: number,
  coldChain: boolean
): Promise<StubAIResult> {
  return runStub({
    agent_name: "loading-guide",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX loading-guide advisor. Produce a step-by-step loading plan for the commodity/container count, including bracing, dunnage, ventilation, and (if cold-chain) pre-cooling & set-point. Return JSON: { steps: string[], setPointC?: number, notes: string }.",
    user_prompt: JSON.stringify({ commodity, containerCount, coldChain }),
    max_tokens: 450,
    temperature: 0.3,
  });
}

// ── A2 advisory: AI price band generation ──────────────────────────────────
export async function generatePriceBand(
  commodity: string,
  hsCode: string,
  originCountry: string,
  destCountry: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "price-band",
    authority_level: "A2",
    system_prompt:
      "You are the SGTX price-band generator. Produce a defensible USD price band for the commodity on the given lane. Return JSON: { lowUsd, midUsd, highUsd, currency, rationale, confidence } — be conservative; cite seasonality / lane risks.",
    user_prompt: JSON.stringify({ commodity, hsCode, originCountry, destCountry }),
    max_tokens: 350,
    temperature: 0.3,
  });
}

// ── A1 advisory: price-deviation check ─────────────────────────────────────
export async function priceDeviationCheck(
  commodity: string,
  enteredPrice: number,
  aiBandLow: number,
  aiBandHigh: number
): Promise<StubAIResult> {
  return runStub({
    agent_name: "price-deviation-check",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX price-deviation analyst. Compare the entered price against the AI band and produce a 2-3 sentence narrative: deviation %, direction (above/below band), possible reasons, and recommended action (proceed / request justification / block).",
    user_prompt: JSON.stringify({ commodity, enteredPrice, aiBandLow, aiBandHigh }),
    max_tokens: 250,
    temperature: 0.3,
  });
}

// ── A2 advisory: product form / dynamic schema agent ───────────────────────
export async function productFormAgent(
  commodityType: string,
  productName: string,
  hsCode: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "product-form-agent",
    authority_level: "A2",
    system_prompt:
      "You are the SGTX product-form agent. Produce a JSON dynamic-fields schema for the commodity/product/HS-code combination, including packing defaults, required documents, special conditions, treatment details, and lab tests. Return JSON ONLY: { dynamic_fields: [], required_documents: [], special_conditions: [], treatment_details: {}, lab_tests_required: [] }.",
    user_prompt: JSON.stringify({ commodityType, productName, hsCode }),
    max_tokens: 800,
    temperature: 0.3,
  });
}

// ── A1 advisory: tenant-facing message generator ───────────────────────────
export async function generateTenantMessage(
  action: string,
  verdict: string,
  conditions: string[]
): Promise<StubAIResult> {
  return runStub({
    agent_name: "tenant-message",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX tenant-message generator. Convert a system action/verdict into a 2-3 sentence tenant-facing message, formal but humane tone, listing any conditions as bullet points.",
    user_prompt: JSON.stringify({ action, verdict, conditions }),
    max_tokens: 250,
    temperature: 0.4,
  });
}

// ── A1 advisory: trade-room assistant ──────────────────────────────────────
export async function tradeRoomAssistant(
  question: string,
  trade: any
): Promise<StubAIResult> {
  return runStub({
    agent_name: "trade-room-assistant",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX Trade Room assistant. Answer operator questions about a specific trade — status, documents, shipments, payments, risks. Be specific to the trade context. 3-5 sentences max.",
    user_prompt: `Question: ${question}\nTrade (JSON): ${JSON.stringify(trade || {})}`,
    max_tokens: 500,
    temperature: 0.3,
  });
}

// ── A1 advisory: "why it matters" explainer ────────────────────────────────
export async function generateWhyItMatters(opts: {
  label: string;
  context?: string;
}): Promise<StubAIResult> {
  return runStub({
    agent_name: "why-matters",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX 'why it matters' explainer. Given a UI label and optional context, produce a 1-2 sentence plain-language explanation of why this field/flag matters to the operator.",
    user_prompt: JSON.stringify(opts),
    max_tokens: 150,
    temperature: 0.4,
  });
}

// ── A2 advisory: defect detection (QC) ────────────────────────────────────
export async function defectDetection(opts: {
  commodity: string;
  inspectionType: string;
  photoCount: number;
  inspectorNotes: string;
}): Promise<StubAIResult> {
  return runStub({
    agent_name: "defect-detection",
    authority_level: "A2",
    system_prompt:
      "You are the SGTX QC defect-detection agent. Given commodity, inspection type, photo count, and inspector notes, return JSON: { defects: [{ type, severity: 'LOW'|'MEDIUM'|'HIGH', evidence, recommendation }], overallSeverity, recommendedAction }.",
    user_prompt: JSON.stringify(opts),
    max_tokens: 500,
    temperature: 0.3,
  });
}

// ── A1 advisory: financing match-score explanation ─────────────────────────
export async function financingMatchScoreExplanation(
  financierName: string,
  borrowerName: string,
  matchScore: number,
  conditions: any[],
  additionalContext: string
): Promise<StubAIResult> {
  return runStub({
    agent_name: "financing-match-explanation",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX financing match-score narrator. Produce a 2-3 sentence plain-language explanation of why this financier-borrower pair has the given match score, citing the strongest contributing factors. Be balanced; avoid guarantees.",
    user_prompt: JSON.stringify({ financierName, borrowerName, matchScore, conditions, additionalContext }),
    max_tokens: 250,
    temperature: 0.4,
  });
}

// ── A1 advisory: PSP recommendation explanation ───────────────────────────
export async function pspRecommendationExplanation(opts: {
  pspName: string;
  feeUsd: number;
  settlementDays: number;
  healthScore: number;
  payerCountry: string;
  payeeCountry: string;
  amountUsd: number;
}): Promise<StubAIResult> {
  return runStub({
    agent_name: "psp-recommendation-explanation",
    authority_level: "A1",
    system_prompt:
      "You are the SGTX PSP recommendation narrator. Explain in 2-3 sentences why this Payment Service Provider is the top-ranked choice for the given corridor and amount, citing fee, settlement speed, and health score.",
    user_prompt: JSON.stringify(opts),
    max_tokens: 250,
    temperature: 0.3,
  });
}
