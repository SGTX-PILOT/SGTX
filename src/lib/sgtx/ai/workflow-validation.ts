// @ts-nocheck
// SGTX AI Workflow Validation — confirm or fail at critical decision points
// Uses z-ai-web-dev-sdk (GLM-4-Plus) for intelligent validation
// Authority level A2 — advisory only, human always in control

import { runAI } from "@/lib/sgtx/ai/orchestrator";

export interface ValidationResult {
  passed: boolean;
  confidence: number; // 0-1
  reason: string;
  warnings: string[];
  recommendations: string[];
}

/**
 * Validate a trade request before submission.
 * Checks for: sanctions risk, HS code accuracy, incoterm consistency, value reasonableness.
 */
export async function validateTradeRequest(params: {
  buyerGtid: string;
  sellerGtid: string;
  commodity: string;
  hsCode: string;
  incoterm: string;
  tradeValueUsd: number;
  originPort: string;
  destPort: string;
}): Promise<ValidationResult> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Rule-based checks
  if (params.tradeValueUsd > 1000000) warnings.push("High-value trade — enhanced due diligence recommended");
  if (params.tradeValueUsd < 100) warnings.push("Unusually low trade value — verify accuracy");
  if (params.originPort === params.destPort) warnings.push("Origin and destination ports are the same");

  // HS code format check
  if (!params.hsCode.match(/^\d{4,6}(\.\d{0,4})?$/)) warnings.push("HS code format may be incorrect");

  // Incoterm consistency
  const SEA_INCOTERMS = ["FOB", "CFR", "CIF"];
  const AIR_INCOTERMS = ["FCA", "CPT", "CIP", "DAP", "DDP"];
  if (!SEA_INCOTERMS.includes(params.incoterm) && !AIR_INCOTERMS.includes(params.incoterm)) {
    warnings.push(`Incoterm ${params.incoterm} — verify applicability for this trade`);
  }

  // AI validation
  try {
    const result = await runAI({
      agentName: "trade_request_validator",
      authority: "A2",
      systemPrompt: "You are an SGTX trade validation assistant. Validate the trade request for consistency, risk, and compliance. Return a JSON object with: passed (boolean), confidence (0-1), reason (string), warnings (array), recommendations (array). Be conservative — flag any unusual patterns.",
      userPrompt: JSON.stringify(params),
      fallbackKey: "trade_validation",
      maxTokens: 300,
      temperature: 0.2,
    });

    const aiText = result.content || result.text || "";
    // Try to parse JSON from AI response
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        return {
          passed: aiResult.passed !== false,
          confidence: aiResult.confidence || 0.8,
          reason: aiResult.reason || "AI validation completed",
          warnings: [...warnings, ...(aiResult.warnings || [])],
          recommendations: [...recommendations, ...(aiResult.recommendations || [])],
        };
      }
    } catch { /* JSON parse failed — use rule-based result */ }

    return {
      passed: warnings.length === 0,
      confidence: 0.75,
      reason: "Rule-based validation completed (AI parsing failed)",
      warnings,
      recommendations,
    };
  } catch {
    return {
      passed: warnings.length === 0,
      confidence: 0.6,
      reason: "Rule-based validation (AI unavailable)",
      warnings,
      recommendations,
    };
  }
}

/**
 * Validate a payment before processing.
 * Checks for: amount consistency, fee calculation correctness, PSP routing.
 */
export async function validatePayment(params: {
  ustn: string;
  amountUsd: number;
  feeAmountUsd: number;
  pspProvider: string;
  payerGtid: string;
  payeeGtid: string;
}): Promise<ValidationResult> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Rule-based checks
  const expectedFeeRate = 0.015; // 1.5%
  const expectedFee = params.amountUsd * expectedFeeRate;
  if (Math.abs(params.feeAmountUsd - expectedFee) > expectedFee * 0.1) {
    warnings.push(`Fee amount ($${params.feeAmountUsd}) deviates from expected 1.5% ($${expectedFee.toFixed(2)})`);
  }

  if (params.amountUsd > 500000) {
    recommendations.push("High-value payment — consider split settlement across multiple PSPs");
  }

  if (!["FAWRY", "PAYMOB", "STRIPE", "CBE_IPN"].includes(params.pspProvider)) {
    warnings.push(`Unknown PSP provider: ${params.pspProvider}`);
  }

  try {
    const result = await runAI({
      agentName: "payment_validator",
      authority: "A2",
      systemPrompt: "You are an SGTX payment validation assistant. Validate the payment for correctness, fraud risk, and AML compliance. Return JSON with: passed, confidence, reason, warnings, recommendations.",
      userPrompt: JSON.stringify(params),
      fallbackKey: "payment_validation",
      maxTokens: 200,
      temperature: 0.2,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        return {
          passed: aiResult.passed !== false,
          confidence: aiResult.confidence || 0.85,
          reason: aiResult.reason || "AI validation passed",
          warnings: [...warnings, ...(aiResult.warnings || [])],
          recommendations: [...recommendations, ...(aiResult.recommendations || [])],
        };
      }
    } catch { /* fall through */ }

    return { passed: warnings.length === 0, confidence: 0.8, reason: "Rule-based validation", warnings, recommendations };
  } catch {
    return { passed: warnings.length === 0, confidence: 0.7, reason: "Rule-based (AI unavailable)", warnings, recommendations };
  }
}

/**
 * Validate a contract before signing.
 * Checks for: mandatory clauses, incoterm alignment, governing law, arbitration seat.
 */
export async function validateContract(params: {
  ustn: string;
  contractType: string;
  governingLaw: string;
  arbitrationSeat: string;
  incoterm: string;
  contractValueUsd: number;
  hasWitnessClause: boolean;
  hasQES: boolean;
}): Promise<ValidationResult> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (!params.hasWitnessClause) warnings.push("Missing SGTX Witness Clause — mandatory per blueprint");
  if (!params.hasQES) warnings.push("QES (Qualified Electronic Signature) not applied — recommended for legal enforceability");
  if (params.contractValueUsd > 100000 && !params.hasQES) recommendations.push("High-value contract — QES strongly recommended");

  const VALID_LAWS = ["EGYPTIAN_LAW", "ENGLISH_LAW", "GERMAN_LAW", "UAE_LAW", "UNIDROIT", "CISG"];
  if (!VALID_LAWS.includes(params.governingLaw)) warnings.push(`Governing law '${params.governingLaw}' not in standard list`);

  const VALID_SEATS = ["Cairo", "London", "Paris", "Dubai", "Singapore"];
  if (!VALID_SEATS.includes(params.arbitrationSeat)) warnings.push(`Arbitration seat '${params.arbitrationSeat}' not in standard list`);

  try {
    const result = await runAI({
      agentName: "contract_validator",
      authority: "A2",
      systemPrompt: "You are an SGTX contract validation assistant. Validate the contract for legal completeness, clause coverage, and risk. Return JSON with: passed, confidence, reason, warnings, recommendations.",
      userPrompt: JSON.stringify(params),
      fallbackKey: "contract_validation",
      maxTokens: 250,
      temperature: 0.2,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        return {
          passed: aiResult.passed !== false,
          confidence: aiResult.confidence || 0.85,
          reason: aiResult.reason || "AI validation passed",
          warnings: [...warnings, ...(aiResult.warnings || [])],
          recommendations: [...recommendations, ...(aiResult.recommendations || [])],
        };
      }
    } catch { /* fall through */ }

    return { passed: warnings.length === 0, confidence: 0.8, reason: "Rule-based validation", warnings, recommendations };
  } catch {
    return { passed: warnings.length === 0, confidence: 0.7, reason: "Rule-based (AI unavailable)", warnings, recommendations };
  }
}

/**
 * Validate a dispute filing.
 * Checks for: evidence availability, claim reasonableness, applicable SLA.
 */
export async function validateDispute(params: {
  ustn: string;
  category: string;
  description: string;
  claimAmountUsd: number;
  tradeValueUsd: number;
  filedByGtid: string;
}): Promise<ValidationResult> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (params.description.length < 20) warnings.push("Dispute description is very short — provide more detail");
  if (params.claimAmountUsd > params.tradeValueUsd) warnings.push("Claim amount exceeds trade value — verify accuracy");
  if (params.claimAmountUsd > params.tradeValueUsd * 0.5) recommendations.push("High claim ratio — consider mediation before arbitration");

  const VALID_CATEGORIES = ["QUALITY", "DELAY", "NON_PAYMENT", "DOC_FRAUD", "COLD_CHAIN", "SERVICE_QUALITY", "FINANCING", "SGTX_FEE"];
  if (!VALID_CATEGORIES.includes(params.category)) warnings.push(`Dispute category '${params.category}' not in standard list`);

  try {
    const result = await runAI({
      agentName: "dispute_validator",
      authority: "A2",
      systemPrompt: "You are an SGTX dispute validation assistant. Validate the dispute filing for completeness, claim reasonableness, and evidence likelihood. Return JSON with: passed, confidence, reason, warnings, recommendations.",
      userPrompt: JSON.stringify(params),
      fallbackKey: "dispute_validation",
      maxTokens: 200,
      temperature: 0.2,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        return {
          passed: aiResult.passed !== false,
          confidence: aiResult.confidence || 0.8,
          reason: aiResult.reason || "AI validation passed",
          warnings: [...warnings, ...(aiResult.warnings || [])],
          recommendations: [...recommendations, ...(aiResult.recommendations || [])],
        };
      }
    } catch { /* fall through */ }

    return { passed: warnings.length === 0, confidence: 0.75, reason: "Rule-based validation", warnings, recommendations };
  } catch {
    return { passed: warnings.length === 0, confidence: 0.65, reason: "Rule-based (AI unavailable)", warnings, recommendations };
  }
}
