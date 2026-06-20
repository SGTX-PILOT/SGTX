// SGTX Part 11.3 — Causal Inference Engine stub
// Blueprint Part 11.3 requires a Causal Attribution engine that, given a dispute or
// milestone breach, identifies root-cause factors with contribution percentages and
// confidence intervals, then summarises the analysis in plain language via the A1 AI.
//
// The production implementation uses Double-ML / DoWhy in a Python microservice.
// This stub simulates the documented API contract:
//   - normalises the supplied factor weights to percentages,
//   - derives a ±10% confidence interval around each contribution,
//   - persists the result to the CausalAttribution table,
//   - asks the A1 AI orchestrator for a plain-language summary.

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

export interface CausalFactor {
  name: string;
  weight: number;
}

export interface RootCause {
  factor: string;
  contribution: number; // percentage 0..100
  confidenceInterval: [number, number]; // ±10% around contribution
}

export interface CausalAnalysisResult {
  rootCauses: RootCause[];
  aiSummary: string;
}

/**
 * Run a causal analysis for an entity (dispute or milestone breach).
 *
 * @param entityType  "dispute" | "milestone_breach"
 * @param entityRef   ID/USTN of the entity being analysed
 * @param factors     weighted factors to attribute causality to
 */
export async function runCausalAnalysis(
  entityType: string,
  entityRef: string,
  factors: CausalFactor[],
): Promise<CausalAnalysisResult> {
  // Normalise weights to percentages (sum = 100).
  const totalWeight = factors.reduce((sum, f) => sum + Math.max(0, f.weight), 0) || 1;
  const rootCauses: RootCause[] = factors
    .map((f) => {
      const contribution = Number(((Math.max(0, f.weight) / totalWeight) * 100).toFixed(2));
      const lower = Number(Math.max(0, contribution - 10).toFixed(2));
      const upper = Number(Math.min(100, contribution + 10).toFixed(2));
      return {
        factor: f.name,
        contribution,
        confidenceInterval: [lower, upper] as [number, number],
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  // Deterministic short hash for the analysis (used in the persisted record + AI prompt).
  const analysisHash = createHash("sha256")
    .update(`${entityType}|${entityRef}|${JSON.stringify(factors)}`, "utf8")
    .digest("hex")
    .slice(0, 12);

  // Ask the A1 AI orchestrator for a plain-language summary.
  const factorsBlock = rootCauses
    .map((rc) => `- ${rc.factor}: ${rc.contribution}% (CI ${rc.confidenceInterval[0]}–${rc.confidenceInterval[1]}%)`)
    .join("\n");

  const ai = await callAI({
    agent: "general",
    prompt:
      `SGTX Causal Attribution analysis (ref ${analysisHash}) for ${entityType} "${entityRef}".\n\n` +
      `Root-cause factor contributions (normalised to 100%, ±10% confidence interval):\n${factorsBlock}\n\n` +
      `Write a 2-3 sentence plain-language summary for an operator explaining the dominant root cause and the recommended first remediation step. ` +
      `Be specific and conservative. SGTX is non-marketplace — never recommend counterparties.`,
    maxTokens: 180,
    temperature: 0.3,
  });

  const aiSummary = ai.content.trim();

  // Persist to CausalAttribution table (Part 11.3).
  const persisted = await db.causalAttribution.create({
    data: {
      disputeId: entityType === "dispute" ? entityRef : null,
      entityType,
      entityRef,
      rootCauses: JSON.stringify(rootCauses),
      aiSummary,
    },
  });

  return {
    rootCauses,
    aiSummary,
  };
}
