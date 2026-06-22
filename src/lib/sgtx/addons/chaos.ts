// SGTX Part 11.4 — Self-Healing Infrastructure & Chaos Engineering
// Blueprint Part 11.4 requires three integrated capabilities:
//   1. runChaosExperiment()  — fault injection via Chaos Mesh (weekly, staging
//                              only by default; production requires multisig)
//   2. detectAnomaly()       — AIOps metric anomaly detection (LSTM-trained on
//                              Backblaze drive-failure data + platform metrics)
//   3. selfHeal()            — automated remediation (cordons node, drains
//                              workloads, restarts failed pods, scales replicas)
//
// Production: K3s + Cilium + node-health-agent (Rust) + chaos-orchestrator (Rust).
// This module simulates the documented API contract with deterministic outcomes
// and persists every experiment / anomaly / remediation to its corresponding
// table (Part 11.4.3): ChaosExperiment, InfraAnomaly, InfrastructurePrediction.

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

export type ChaosExperimentType =
  | "pod_kill"
  | "network_latency"
  | "dns_failure"
  | "disk_io_throttle";

export interface ChaosExperimentInput {
  experimentName: ChaosExperimentType;
  namespace?: string; // default "staging"
  createdByGtid?: string;
  productionApproved?: boolean; // multisig required for production chaos
}

export interface ChaosExperimentResult {
  ok: boolean;
  experimentId: string;
  status: "SUCCEEDED" | "FAILED" | "ABORTED";
  startedAt: string;
  finishedAt: string;
  groqSummary?: string;
  logsUrl?: string;
  error?: string;
}

export interface AnomalyDetectionInput {
  component: string; // governor | trade | inbox | shipment | ai | payment | release | disk | cpu | memory
  metric: string;    // p95_latency_ms | error_rate_pct | free_space_pct | ...
  observedValue: number;
  baselineValue: number;
}

export interface AnomalyResult {
  ok: boolean;
  anomalyId?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  deviationPct: number;
  remediationAction?: string;
  status: "OPEN" | "IGNORED";
  error?: string;
}

export interface SelfHealInput {
  anomalyId?: string;
  component: string;
  action?: "RESTART_POD" | "CORDON_NODE" | "DRAIN_WORKLOADS" | "SCALE_REPLICAS" | "CLEAR_CACHE";
}

export interface SelfHealResult {
  ok: boolean;
  anomalyId?: string;
  action: string;
  status: "REMEDIATING" | "RESOLVED" | "FAILED";
  message: string;
  error?: string;
}

/**
 * Run a chaos experiment (Part 11.4.2). The production chaos-orchestrator calls
 * Chaos Mesh on K3s. This stub simulates the experiment outcome deterministically
 * based on the experiment type, persists the result to ChaosExperiment, and
 * generates a Groq (A1) postmortem summary stored on the row.
 *
 * Production chaos requires multisig (Part 11.4.4). If the caller passes
 * `productionApproved: true` AND `namespace: "production"`, the experiment
 * proceeds; otherwise production experiments are ABORTED with status=ABORTED.
 */
export async function runChaosExperiment(
  input: ChaosExperimentInput,
): Promise<ChaosExperimentResult> {
  const namespace = input.namespace || "staging";
  const isProduction = namespace === "production";
  if (isProduction && !input.productionApproved) {
    // Persist an ABORTED row for the audit trail.
    const aborted = await db.chaosExperiment.create({
      data: {
        experimentName: input.experimentName,
        namespace,
        status: "ABORTED",
        createdByGtid: input.createdByGtid ?? null,
        productionApproved: false,
      },
    });
    return {
      ok: false,
      experimentId: aborted.id,
      status: "ABORTED",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: "Production chaos experiment requires multisig approval (Part 11.4.4)",
    };
  }

  const startedAt = new Date();
  // Simulate experiment duration (50-500ms in stub; real chaos = minutes).
  const durationMs = 50 + Math.floor(Math.random() * 450);

  // Deterministic outcome: all experiments succeed in the stub.
  const status: ChaosExperimentResult["status"] = "SUCCEEDED";
  const finishedAt = new Date(startedAt.getTime() + durationMs);

  // Generate a Groq postmortem summary (Part 11.4.2 — A1 postmortem generation).
  let groqSummary: string | undefined;
  try {
    const ai = await callAI({
      agent: "general",
      prompt:
        `SGTX Chaos Engineering postmortem (Part 11.4). Experiment: ${input.experimentName} ` +
        `in namespace "${namespace}". Duration: ${durationMs}ms. Outcome: ${status}.\n` +
        `Write a 2-sentence plain-language postmortem summarising what was tested, the result, ` +
        `and the resilience takeaway. Be specific. SGTX is non-marketplace — do not recommend vendors.`,
      maxTokens: 120,
      temperature: 0.3,
    });
    groqSummary = ai.content.trim();
  } catch (e) {
    groqSummary = `Chaos experiment ${input.experimentName} in ${namespace} completed with status ${status}.`;
  }

  const logsUrl = `https://status.sgtx.example/chaos/${input.experimentName}/${Date.now()}`;

  const row = await db.chaosExperiment.create({
    data: {
      experimentName: input.experimentName,
      namespace,
      status,
      startedAt,
      finishedAt,
      groqSummary,
      logsUrl,
      createdByGtid: input.createdByGtid ?? null,
      productionApproved: input.productionApproved ?? false,
    },
  });

  return {
    ok: true,
    experimentId: row.id,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    groqSummary,
    logsUrl,
  };
}

/**
 * Detect a metric anomaly (Part 11.4.2 — AIOps anomaly detection).
 * Compares observedValue vs baselineValue; classifies severity by deviation %:
 *   - <25%   → LOW
 *   - 25-50% → MEDIUM
 *   - 50-100%→ HIGH
 *   - >100%  → CRITICAL
 * Persists the anomaly to InfraAnomaly with a recommended remediation action.
 */
export async function detectAnomaly(
  input: AnomalyDetectionInput,
): Promise<AnomalyResult> {
  if (input.baselineValue === 0) {
    return { ok: false, severity: "LOW", deviationPct: 0, status: "IGNORED", error: "baselineValue is 0 — cannot compute deviation" };
  }
  const deviationPct = Math.abs(
    ((input.observedValue - input.baselineValue) / input.baselineValue) * 100,
  );
  let severity: AnomalyResult["severity"] = "LOW";
  if (deviationPct > 100) severity = "CRITICAL";
  else if (deviationPct > 50) severity = "HIGH";
  else if (deviationPct > 25) severity = "MEDIUM";

  // Determine remediation action based on the metric.
  let remediationAction: string | undefined;
  if (input.metric.includes("latency") || input.metric.includes("p95")) {
    remediationAction = "SCALE_REPLICAS";
  } else if (input.metric.includes("error_rate") || input.metric.includes("5xx")) {
    remediationAction = "RESTART_POD";
  } else if (input.metric.includes("free_space") || input.component === "disk") {
    remediationAction = "CORDON_NODE";
  } else if (input.metric.includes("memory") || input.metric.includes("cpu")) {
    remediationAction = "DRAIN_WORKLOADS";
  } else {
    remediationAction = "CLEAR_CACHE";
  }

  // Persist to InfraAnomaly (Part 11.4.3).
  let anomalyId: string | undefined;
  try {
    const row = await db.infraAnomaly.create({
      data: {
        component: input.component,
        metric: input.metric,
        observedValue: input.observedValue,
        baselineValue: input.baselineValue,
        severity,
        status: "OPEN",
        remediationAction,
      },
    });
    anomalyId = row.id;
  } catch (e) {
    console.error("[chaos] persist InfraAnomaly failed:", e);
  }

  return {
    ok: true,
    anomalyId,
    severity,
    deviationPct: Number(deviationPct.toFixed(2)),
    remediationAction,
    status: "OPEN",
  };
}

/**
 * Self-heal an anomaly or component (Part 11.4.2 — automated remediation).
 *
 * The production node-health-agent performs the action via K3s/Cilium. This stub
 * marks the InfraAnomaly as REMEDIATING → RESOLVED, records the action taken,
 * and (for disk-failure predictions) writes an InfrastructurePrediction row.
 *
 * Per blueprint 11.4.2: if failure probability >70%, agent cordons the node and
 * drains workloads BEFORE the failure occurs.
 */
export async function selfHeal(input: SelfHealInput): Promise<SelfHealResult> {
  const action = input.action || "RESTART_POD";
  const now = new Date();

  if (input.anomalyId) {
    try {
      await db.infraAnomaly.update({
        where: { id: input.anomalyId },
        data: {
          status: "RESOLVED",
          remediationAction: action,
          remediatedAt: now,
        },
      });
    } catch (e) {
      console.error("[chaos] update InfraAnomaly failed:", e);
    }
  }

  // For disk components, persist an InfrastructurePrediction (Part 11.4.3).
  if (input.component === "disk") {
    try {
      await db.infrastructurePrediction.create({
        data: {
          nodeGtid: "self-heal-agent",
          component: input.component,
          predictedFailureProbability: 0.72, // >0.70 threshold per 11.4.2
          estimatedFailureDate: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
          actionTaken: action,
        },
      });
    } catch (e) {
      console.error("[chaos] persist InfrastructurePrediction failed:", e);
    }
  }

  const actionHash = createHash("sha256")
    .update(`${input.component}|${action}|${now.toISOString()}`, "utf8")
    .digest("hex")
    .slice(0, 12);

  return {
    ok: true,
    anomalyId: input.anomalyId,
    action,
    status: "RESOLVED",
    message: `Self-heal action "${action}" executed on component "${input.component}" at ${now.toISOString()}. Remediation hash: ${actionHash}.`,
  };
}
