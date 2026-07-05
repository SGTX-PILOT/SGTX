// @ts-nocheck
// SGTX Part 11.3 — Self-Healing Infrastructure & Chaos Engineering
//
// Production stack (per blueprint Part 11.3):
//   - K3s cluster (3 master + 5 worker nodes) on Egyptian sovereign cloud.
//   - Chaos Mesh for weekly chaos experiments (pod-kill, network-delay,
//     disk-failure, io-stress, dns-hijack).
//   - LSTM failure-prediction model trained on Backblaze disk-failure data
//     + in-house Prometheus metrics (model accuracy 0.89, F1 0.84).
//   - KEDA autoscaler + Velero backups + Longhorn replicated storage.
//
// This stub simulates the documented API contract so the platform UI /
// operator dashboards can call a stable shape. The "LSTM" predictions are
// simulated deterministically from the in-memory cluster snapshot — no
// real model is loaded.
//
// Functions:
//   - getClusterHealth()           → snapshot of pods + nodes + overall status
//   - predictFailures()            → LSTM-simulated disk + pod failure predictions
//   - triggerHealingAction(pod)    → RESTART | RESCHEDULE | EXPAND
//   - getChaosTestResults()        → last weekly chaos run summary
//   - runChaosTest(testType)       → trigger a single experiment + record result
//   - getSelfHealingStats()        → cumulative counters + model metadata

import { createHash, randomUUID } from "crypto";
import { freshDb as db } from "@/lib/db-fresh";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PodStatus = "RUNNING" | "PENDING" | "FAILED" | "CRASHLOOP" | "HEALING";
export type NodeType = "MASTER" | "WORKER";
export type NodeStatus = "READY" | "NOT_READY" | "CORDONED";
export type OverallStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface PodHealth {
  name: string;             // sgtx-governor-7d9f6c8b-xk2m
  namespace: string;        // sgtx-prod
  workload: string;         // Deployment/StatefulSet name
  status: PodStatus;
  cpuPct: number;           // 0..100
  memoryPct: number;        // 0..100
  restartCount: number;
  ready: boolean;
  node: string;             // node name
  ageHours: number;
  lastHealingAction?: string;   // ISO 8601
  lastHealingType?: "RESTART" | "RESCHEDULE" | "EXPAND";
}

export interface NodeHealth {
  name: string;
  type: NodeType;
  status: NodeStatus;
  cpuPct: number;
  memoryPct: number;
  diskPct: number;
  podCount: number;
  kubeletVersion: string;
  os: string;
}

export interface Prediction {
  resourceType: "DISK" | "POD";
  resourceName: string;
  nodeName?: string;
  failureProbability: number;    // 0..1
  predictedFailureAt?: string;   // ISO 8601 (nullable = no imminent failure)
  recommendation: string;
  confidence: number;            // 0..1 (LSTM confidence)
}

export interface ClusterHealthSnapshot {
  overallStatus: OverallStatus;
  pods: PodHealth[];
  nodes: NodeHealth[];
  snapshotAt: string;
  mode: "SIMULATION";
  degradedPods: number;
  criticalPods: number;
  totalPods: number;
  totalNodes: number;
}

export interface FailurePredictions {
  diskFailures: Prediction[];
  podFailures: Prediction[];
  modelAccuracy: number;        // 0.89 (LSTM Backblaze-trained)
  modelF1: number;              // 0.84
  modelVersion: string;
  predictedAt: string;
  mode: "SIMULATION";
}

export interface HealingActionResult {
  podName: string;
  action: "RESTART" | "RESCHEDULE" | "EXPAND";
  status: "COMPLETED" | "IN_PROGRESS" | "FAILED";
  triggeredAt: string;
  completedAt?: string;
  reason: string;
  replicasBefore?: number;
  replicasAfter?: number;
  newNode?: string;
  healedBy: string;
  mode: "SIMULATION";
}

export type ChaosTestType = "POD_KILL" | "NETWORK_DELAY" | "DISK_FAILURE" | "IO_STRESS" | "DNS_HIJACK";
export type ChaosTestResult = "PASSED" | "FAILED" | "DEGRADED";

export interface ChaosTestRecord {
  testId: string;
  testType: ChaosTestType;
  result: ChaosTestResult;
  recoveryTimeMs: number;
  blastRadius: string;        // "namespace:sgtx-prod"
  startedAt: string;
  finishedAt: string;
  findings: string[];
  triggeredBy: string;
  mode: "SIMULATION";
}

export interface ChaosTestSummary {
  lastRunAt: string | null;
  testsRun: number;
  passed: number;
  failed: number;
  degraded: number;
  findings: string[];
  scheduledNextAt: string;    // next weekly run
}

export interface SelfHealingStats {
  totalHealingActions: number;
  totalChaosTests: number;
  modelAccuracy: number;
  modelF1: number;
  modelVersion: string;
  clusterOverall: OverallStatus;
  lastHealingAt: string | null;
  lastChaosRunAt: string | null;
  mode: "SIMULATION";
}

// ---------------------------------------------------------------------------
// Constants — simulated SGTX K3s cluster topology
// ---------------------------------------------------------------------------

const CONFIG_KEY_PREFIX = "self_healing";

const MODEL_VERSION = "lstm-disk-pod-v2.3.1";
const MODEL_ACCURACY = 0.89;
const MODEL_F1 = 0.84;

// Static simulated cluster topology (deterministic). Per-pod CPU/memory is
// jittered at read time so the snapshot evolves naturally for the dashboard.
const NODES: NodeHealth[] = [
  { name: "k3s-master-1", type: "MASTER", status: "READY", cpuPct: 22, memoryPct: 41, diskPct: 33, podCount: 14, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-master-2", type: "MASTER", status: "READY", cpuPct: 18, memoryPct: 38, diskPct: 31, podCount: 12, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-master-3", type: "MASTER", status: "READY", cpuPct: 20, memoryPct: 39, diskPct: 30, podCount: 13, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-worker-1", type: "WORKER", status: "READY", cpuPct: 47, memoryPct: 62, diskPct: 71, podCount: 28, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-worker-2", type: "WORKER", status: "READY", cpuPct: 53, memoryPct: 68, diskPct: 78, podCount: 31, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-worker-3", type: "WORKER", status: "READY", cpuPct: 41, memoryPct: 55, diskPct: 64, podCount: 24, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-worker-4", type: "WORKER", status: "READY", cpuPct: 38, memoryPct: 51, diskPct: 58, podCount: 22, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
  { name: "k3s-worker-5", type: "WORKER", status: "READY", cpuPct: 35, memoryPct: 48, diskPct: 61, podCount: 19, kubeletVersion: "v1.29.4+k3s1", os: "Talos Linux 1.7" },
];

const POD_DEFS: Array<Omit<PodHealth, "cpuPct" | "memoryPct" | "restartCount" | "ageHours" | "ready" | "status">> = [
  { name: "sgtx-governor-7d9f6c8b-xk2m", namespace: "sgtx-prod", workload: "sgtx-governor", node: "k3s-worker-1" },
  { name: "sgtx-governor-7d9f6c8b-q8wn", namespace: "sgtx-prod", workload: "sgtx-governor", node: "k3s-worker-2" },
  { name: "sgtx-release-api-5c8f7b2a-hj3p", namespace: "sgtx-prod", workload: "sgtx-release-api", node: "k3s-worker-1" },
  { name: "sgtx-release-api-5c8f7b2a-k4rq", namespace: "sgtx-prod", workload: "sgtx-release-api", node: "k3s-worker-3" },
  { name: "sgtx-payment-psp-9e2a1d4c-vf7l", namespace: "sgtx-prod", workload: "sgtx-payment-psp", node: "k3s-worker-2" },
  { name: "sgtx-payment-psp-9e2a1d4c-zb8t", namespace: "sgtx-prod", workload: "sgtx-payment-psp", node: "k3s-worker-4" },
  { name: "sgtx-gov-adapter-3f6e8b1c-n2kp", namespace: "sgtx-prod", workload: "sgtx-gov-adapter", node: "k3s-worker-3" },
  { name: "sgtx-gov-adapter-3f6e8b1c-p9m4", namespace: "sgtx-prod", workload: "sgtx-gov-adapter", node: "k3s-worker-5" },
  { name: "sgtx-ai-orchestrator-2a4c7e1b-r5qv", namespace: "sgtx-prod", workload: "sgtx-ai-orchestrator", node: "k3s-worker-2" },
  { name: "sgtx-ai-orchestrator-2a4c7e1b-w8hx", namespace: "sgtx-prod", workload: "sgtx-ai-orchestrator", node: "k3s-worker-4" },
  { name: "sgtx-dispute-service-6b1d9f3a-k3lm", namespace: "sgtx-prod", workload: "sgtx-dispute-service", node: "k3s-worker-3" },
  { name: "sgtx-loom-anchor-4f8a2c5e-j7nq", namespace: "sgtx-prod", workload: "sgtx-loom-anchor", node: "k3s-worker-5" },
  { name: "sgtx-postgres-primary-0", namespace: "sgtx-data", workload: "sgtx-postgres", node: "k3s-worker-2" },
  { name: "sgtx-postgres-replica-0", namespace: "sgtx-data", workload: "sgtx-postgres", node: "k3s-worker-4" },
  { name: "sgtx-redis-master-0", namespace: "sgtx-data", workload: "sgtx-redis", node: "k3s-worker-1" },
  { name: "sgtx-nats-jetstream-0", namespace: "sgtx-data", workload: "sgtx-nats", node: "k3s-worker-3" },
  { name: "sgtx-prometheus-0", namespace: "sgtx-observ", workload: "sgtx-prometheus", node: "k3s-worker-5" },
  { name: "sgtx-loki-0", namespace: "sgtx-observ", workload: "sgtx-loki", node: "k3s-worker-5" },
  { name: "sgtx-grafana-7d8b2c1f-xk4p", namespace: "sgtx-observ", workload: "sgtx-grafana", node: "k3s-worker-1" },
  { name: "sgtx-chaos-mesh-cp-b8e3a1f6-q2rn", namespace: "chaos-mesh", workload: "chaos-controller-manager", node: "k3s-worker-4" },
];

// ---------------------------------------------------------------------------
// In-memory stats (per-process). The persistent record (chaos tests,
// healing actions) is mirrored to ConfigurationHistory for survival across
// dev-server reloads.
// ---------------------------------------------------------------------------

interface SelfHealingStatsInternal {
  totalHealingActions: number;
  totalChaosTests: number;
  lastHealingAt: Date | null;
  lastChaosRunAt: Date | null;
}

const _stats: SelfHealingStatsInternal = {
  totalHealingActions: 0,
  totalChaosTests: 0,
  lastHealingAt: null,
  lastChaosRunAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function jitter(base: number, range: number): number {
  const delta = (Math.random() - 0.5) * 2 * range;
  return Math.max(0, Math.min(100, Math.round(base + delta)));
}

function pickNode(): string {
  return NODES[Math.floor(Math.random() * NODES.length)].name;
}

/**
 * Build a snapshot of all pods with current CPU/memory/restart metrics.
 * The CPU/memory values are jittered around deterministic bases so the
 * dashboard shows natural-looking variation without external metrics.
 *
 * A small fraction of pods will randomly surface CRASHLOOP or FAILED
 * status to exercise the healing-action path. Deterministic per call —
 * the caller may invoke repeatedly to see the cluster "live".
 */
function buildPodsSnapshot(forceCritical = false): PodHealth[] {
  return POD_DEFS.map((def, i) => {
    const hash = createHash("md5").update(`${def.name}|${Date.now()}`, "utf8").digest();
    const dice = (hash[0] % 100) / 100;
    let status: PodStatus = "RUNNING";
    let restartCount = hash[1] % 4;
    let ready = true;
    if (forceCritical && i === 0) {
      status = "CRASHLOOP";
      restartCount = 7;
      ready = false;
    } else if (dice < 0.04) {
      status = "CRASHLOOP";
      restartCount = 5 + (hash[2] % 5);
      ready = false;
    } else if (dice < 0.08) {
      status = "FAILED";
      restartCount = 3 + (hash[2] % 3);
      ready = false;
    } else if (dice < 0.12) {
      status = "PENDING";
      ready = false;
    } else if (dice < 0.15) {
      // Healing in-progress (recently restarted)
      status = "HEALING";
      restartCount = 1 + (hash[2] % 2);
    }

    const cpuBase = 25 + (hash[3] % 50);
    const memBase = 35 + (hash[4] % 45);

    return {
      ...def,
      status,
      cpuPct: jitter(cpuBase, 8),
      memoryPct: jitter(memBase, 6),
      restartCount,
      ready,
      ageHours: 6 + (hash[5] % 240),
    };
  });
}

function deriveOverallStatus(pods: PodHealth[]): OverallStatus {
  const critical = pods.filter((p) => p.status === "CRASHLOOP" || p.status === "FAILED").length;
  const degraded = pods.filter((p) => p.status === "PENDING" || p.status === "HEALING" || p.restartCount >= 5).length;
  if (critical >= 2) return "CRITICAL";
  if (critical >= 1 || degraded >= 3) return "DEGRADED";
  return "HEALTHY";
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function persistHealingAction(action: HealingActionResult): Promise<void> {
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${CONFIG_KEY_PREFIX}.heal.${action.podName}.${Date.now()}`,
        oldValue: null,
        newValue: JSON.stringify(action),
        changedByGtid: action.healedBy,
        changeReason: `heal:${action.action} pod=${action.podName} status=${action.status}`,
        version: 1,
      },
    });
  } catch (e) {
    logger.error("[self-healing] persistHealingAction failed:", e);
  }
}

async function persistChaosTest(rec: ChaosTestRecord): Promise<void> {
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${CONFIG_KEY_PREFIX}.chaos.${rec.testId}`,
        oldValue: null,
        newValue: JSON.stringify(rec),
        changedByGtid: rec.triggeredBy,
        changeReason: `chaos:${rec.testType} result=${rec.result}`,
        version: 1,
      },
    });
  } catch (e) {
    logger.error("[self-healing] persistChaosTest failed:", e);
  }
}

async function loadChaosTests(limit = 50): Promise<ChaosTestRecord[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: `${CONFIG_KEY_PREFIX}.chaos.` } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 500),
    });
    const out: ChaosTestRecord[] = [];
    for (const row of rows) {
      if (!row.newValue) continue;
      try {
        out.push(JSON.parse(row.newValue) as ChaosTestRecord);
      } catch {
        // skip
      }
    }
    return out;
  } catch (e) {
    logger.error("[self-healing] loadChaosTests failed:", e);
    return [];
  }
}

async function loadHealingActions(limit = 50): Promise<HealingActionResult[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: `${CONFIG_KEY_PREFIX}.heal.` } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 500),
    });
    const out: HealingActionResult[] = [];
    for (const row of rows) {
      if (!row.newValue) continue;
      try {
        out.push(JSON.parse(row.newValue) as HealingActionResult);
      } catch {
        // skip
      }
    }
    return out;
  } catch (e) {
    logger.error("[self-healing] loadHealingActions failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a snapshot of pod + node health, plus the derived overall status.
 */
export async function getClusterHealth(): Promise<ClusterHealthSnapshot> {
  const pods = buildPodsSnapshot();
  const nodes = NODES.map((n) => ({ ...n }));
  const overall = deriveOverallStatus(pods);
  const criticalPods = pods.filter((p) => p.status === "CRASHLOOP" || p.status === "FAILED").length;
  const degradedPods = pods.filter((p) => p.status === "PENDING" || p.status === "HEALING" || p.restartCount >= 5).length;

  return {
    overallStatus: overall,
    pods,
    nodes,
    snapshotAt: nowIso(),
    mode: "SIMULATION",
    degradedPods,
    criticalPods,
    totalPods: pods.length,
    totalNodes: nodes.length,
  };
}

/**
 * Run the LSTM failure-prediction model over the current cluster snapshot.
 *
 * The simulated model focuses on two signals:
 *   1. Disk failure — derived from node.diskPct (SMART-style proxy).
 *   2. Pod failure — derived from restartCount + status.
 *
 * A resource is flagged "predicted to fail" iff its probability exceeds
 * the configured threshold (0.7 for disk, 0.6 for pod).
 */
export async function predictFailures(): Promise<FailurePredictions> {
  const { pods, nodes } = await getClusterHealth();

  const diskFailures: Prediction[] = nodes
    .map((n): Prediction => {
      // Disk failure probability rises sharply above 75% utilization.
      const utilization = n.diskPct;
      let prob = 0;
      if (utilization >= 90) prob = 0.92;
      else if (utilization >= 80) prob = 0.74;
      else if (utilization >= 75) prob = 0.58;
      else if (utilization >= 65) prob = 0.31;
      else prob = 0.08 + (utilization / 100) * 0.1;

      const willFail = prob >= 0.7;
      const hoursToFail = willFail ? Math.max(2, Math.round((100 - utilization) * 1.5)) : undefined;
      const predictedFailureAt = willFail
        ? new Date(Date.now() + hoursToFail! * 3600 * 1000).toISOString()
        : undefined;

      return {
        resourceType: "DISK",
        resourceName: `longhorn-disk-${n.name}`,
        nodeName: n.name,
        failureProbability: Number(prob.toFixed(2)),
        predictedFailureAt,
        recommendation: willFail
          ? `Drain node ${n.name} and replace disk within ${hoursToFail}h — Longhorn will resync replicas from healthy nodes.`
          : `Disk utilization ${utilization}% within safe range — no action needed.`,
        confidence: Number((0.78 + Math.random() * 0.15).toFixed(2)),
      };
    })
    .filter((p) => p.failureProbability >= 0.5)
    .sort((a, b) => b.failureProbability - a.failureProbability);

  const podFailures: Prediction[] = pods
    .map((p): Prediction => {
      let prob = 0;
      if (p.status === "CRASHLOOP") prob = 0.96;
      else if (p.status === "FAILED") prob = 0.88;
      else if (p.restartCount >= 5) prob = 0.72;
      else if (p.restartCount >= 3) prob = 0.45;
      else if (p.status === "PENDING") prob = 0.35;
      else if (p.cpuPct >= 90 || p.memoryPct >= 95) prob = 0.55;
      else prob = 0.05;

      const willFail = prob >= 0.6;
      const minutesToFail = willFail ? Math.max(5, Math.round((1 - 0.6) * 60 + p.restartCount * 3)) : undefined;
      const predictedFailureAt = willFail
        ? new Date(Date.now() + minutesToFail! * 60 * 1000).toISOString()
        : undefined;

      return {
        resourceType: "POD",
        resourceName: p.name,
        nodeName: p.node,
        failureProbability: Number(prob.toFixed(2)),
        predictedFailureAt,
        recommendation: willFail
          ? `Trigger healing action for ${p.name} (status=${p.status}, restarts=${p.restartCount}) — recommended action: ${p.restartCount >= 5 ? "RESCHEDULE" : "RESTART"}.`
          : `Pod healthy (status=${p.status}, restarts=${p.restartCount}) — no action needed.`,
        confidence: Number((0.81 + Math.random() * 0.12).toFixed(2)),
      };
    })
    .filter((p) => p.failureProbability >= 0.4)
    .sort((a, b) => b.failureProbability - a.failureProbability);

  return {
    diskFailures,
    podFailures,
    modelAccuracy: MODEL_ACCURACY,
    modelF1: MODEL_F1,
    modelVersion: MODEL_VERSION,
    predictedAt: nowIso(),
    mode: "SIMULATION",
  };
}

/**
 * Trigger a healing action for a specific pod.
 *
 * The healing controller picks the action based on the pod's current
 * state:
 *   - CRASHLOOP or restartCount >= 5 → RESCHEDULE (delete pod, scheduler
 *     places it on a healthier node).
 *   - FAILED or PENDING → RESTART (kill pod, kubelet respawns).
 *   - HIGH CPU/MEM (>90%) → EXPAND (HPA scales the workload up by 1).
 *
 * The action is recorded to ConfigurationHistory for audit and counted in
 * the cumulative stats.
 */
export async function triggerHealingAction(
  podName: string,
  healedBy = "sgtx-self-healing-controller",
): Promise<HealingActionResult> {
  if (!podName) {
    return {
      podName: "",
      action: "RESTART",
      status: "FAILED",
      triggeredAt: nowIso(),
      reason: "podName is required",
      healedBy,
      mode: "SIMULATION",
    };
  }

  // Find the pod in the current snapshot.
  const { pods } = await getClusterHealth();
  const pod = pods.find((p) => p.name === podName);
  if (!pod) {
    return {
      podName,
      action: "RESTART",
      status: "FAILED",
      triggeredAt: nowIso(),
      reason: `Pod ${podName} not found in cluster snapshot`,
      healedBy,
      mode: "SIMULATION",
    };
  }

  // Pick action.
  let action: HealingActionResult["action"];
  let reason: string;
  let replicasBefore: number | undefined;
  let replicasAfter: number | undefined;
  let newNode: string | undefined;

  if (pod.status === "CRASHLOOP" || pod.restartCount >= 5) {
    action = "RESCHEDULE";
    reason = `Pod in CRASHLOOP / ${pod.restartCount} restarts — rescheduling to a different node.`;
    newNode = pickNode() === pod.node ? pickNode() : pickNode();
  } else if (pod.status === "FAILED" || pod.status === "PENDING") {
    action = "RESTART";
    reason = `Pod ${pod.status} — killing so kubelet can respawn.`;
  } else if (pod.cpuPct >= 90 || pod.memoryPct >= 95) {
    action = "EXPAND";
    reason = `Pod resource pressure (cpu=${pod.cpuPct}% mem=${pod.memoryPct}%) — HPA scaling up by 1 replica.`;
    replicasBefore = 2; // simulated current replica count
    replicasAfter = replicasBefore + 1;
  } else {
    action = "RESTART";
    reason = `Pod healthy but healing action requested — issuing RESTART as a precaution.`;
  }

  const triggeredAt = nowIso();
  // Simulated healing time: 1.5-6s.
  const healingMs = 1500 + Math.floor(Math.random() * 4500);
  const completedAt = new Date(Date.now() + healingMs).toISOString();

  const result: HealingActionResult = {
    podName,
    action,
    status: "COMPLETED",
    triggeredAt,
    completedAt,
    reason,
    replicasBefore,
    replicasAfter,
    newNode,
    healedBy,
    mode: "SIMULATION",
  };

  _stats.totalHealingActions += 1;
  _stats.lastHealingAt = new Date();

  await persistHealingAction(result);

  try {
    await db.activity.create({
      data: {
        actorGtid: healedBy && healedBy.startsWith("GTID-") ? healedBy : null,
        action: `SELF_HEALING_${action}`,
        description: `Self-healing action ${action} on pod ${podName} — ${reason}`,
        type: "INFO",
        metadata: JSON.stringify({
          podName,
          action,
          status: result.status,
          triggeredAt,
          completedAt,
          newNode,
          replicasBefore,
          replicasAfter,
          healedBy,
        }),
      },
    });
  } catch (e) {
    logger.error("[self-healing] activity log failed:", e);
  }

  return result;
}

/**
 * Get the most recent chaos test results + cumulative summary.
 */
export async function getChaosTestResults(): Promise<ChaosTestSummary> {
  const tests = await loadChaosTests(50);
  const last = tests[0];
  const findings: string[] = [];
  for (const t of tests.slice(0, 5)) {
    for (const f of t.findings) {
      if (!findings.includes(f)) findings.push(f);
    }
  }
  // Schedule next run: 7 days from the most recent run, or 7 days from now if none.
  const base = last ? new Date(last.finishedAt) : new Date();
  const scheduledNextAt = new Date(base.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  return {
    lastRunAt: last ? last.finishedAt : null,
    testsRun: tests.length,
    passed: tests.filter((t) => t.result === "PASSED").length,
    failed: tests.filter((t) => t.result === "FAILED").length,
    degraded: tests.filter((t) => t.result === "DEGRADED").length,
    findings: findings.slice(0, 12),
    scheduledNextAt,
  };
}

/**
 * Trigger a chaos experiment of the given type.
 *
 * Production: Chaos Mesh applies the experiment to the configured blast
 * radius (namespace: sgtx-prod), the SRE controller watches recovery, and
 * the run is recorded with the measured recovery time.
 *
 * Simulation: we deterministically pick a recovery time + outcome based on
 * the test type (POD_KILL recovers fast via Deployment controller; DISK_FAILURE
 * takes longest via Longhorn resync).
 */
export async function runChaosTest(
  testType: ChaosTestType,
  triggeredBy = "sgtx-chaos-cron",
): Promise<ChaosTestRecord> {
  const validTypes: ChaosTestType[] = ["POD_KILL", "NETWORK_DELAY", "DISK_FAILURE", "IO_STRESS", "DNS_HIJACK"];
  if (!validTypes.includes(testType)) {
    throw new Error(`runChaosTest: invalid testType. Allowed: ${validTypes.join(", ")}`);
  }

  // Simulated recovery time per test type (ms).
  const recoveryByType: Record<ChaosTestType, [number, number, ChaosTestResult]> = {
    POD_KILL: [1200, 3800, "PASSED"],
    NETWORK_DELAY: [2400, 6500, "PASSED"],
    DISK_FAILURE: [8500, 24000, "DEGRADED"],
    IO_STRESS: [3200, 8800, "PASSED"],
    DNS_HIJACK: [1800, 4200, "PASSED"],
  };
  const [minMs, maxMs, defaultResult] = recoveryByType[testType];
  const recoveryTimeMs = minMs + Math.floor(Math.random() * (maxMs - minMs));

  // 12% chance of FAILED (chaos test exposed a bug).
  const result: ChaosTestResult = Math.random() < 0.12 ? "FAILED" : defaultResult;

  const findingsByType: Record<ChaosTestType, string[]> = {
    POD_KILL: [
      "Deployment controller respawned the killed pod within SLO.",
      "Service mesh rerouted traffic to healthy replicas — no 5xx observed.",
    ],
    NETWORK_DELAY: [
      "300ms artificial latency injected between sgtx-governor and sgtx-postgres.",
      "P99 latency degraded from 80ms to 380ms but stayed below 500ms SLO threshold.",
    ],
    DISK_FAILURE: [
      "Longhorn detected failed replica on k3s-worker-2 and rebuilt from k3s-worker-4.",
      "Rebuild took 18s — within the 30s SLO. No data loss.",
    ],
    IO_STRESS: [
      "IOPS throttled to 200 on the postgres-primary PVC.",
      "Query throughput degraded by 22% — query timeouts stayed below 5s SLO.",
    ],
    DNS_HIJACK: [
      "CoreDNS poisoned for 30s — sgtx-nats resolution failed.",
      "JetStream clients failed over to backup NATS cluster within 4s.",
    ],
  };

  const findings = [...findingsByType[testType]];
  if (result === "FAILED") {
    findings.push("Chaos test FAILED — recovery exceeded SLO. P1 incident created for SRE review.");
  } else if (result === "DEGRADED") {
    findings.push("Recovery completed but took longer than SLO — tuning KEDA autoscaler recommended.");
  }

  const startedAt = nowIso();
  const finishedAt = new Date(Date.now() + recoveryTimeMs).toISOString();
  const testId = `CHAOS-${testType}-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const record: ChaosTestRecord = {
    testId,
    testType,
    result,
    recoveryTimeMs,
    blastRadius: "namespace:sgtx-prod",
    startedAt,
    finishedAt,
    findings,
    triggeredBy,
    mode: "SIMULATION",
  };

  _stats.totalChaosTests += 1;
  _stats.lastChaosRunAt = new Date();

  await persistChaosTest(record);

  try {
    await db.activity.create({
      data: {
        actorGtid: triggeredBy && triggeredBy.startsWith("GTID-") ? triggeredBy : null,
        action: `CHAOS_TEST_${testType}`,
        description: `Chaos test ${testType} (${testId}) → ${result} (recovery ${recoveryTimeMs}ms)`,
        type: result === "FAILED" ? "WARNING" : "INFO",
        metadata: JSON.stringify({
          testId,
          testType,
          result,
          recoveryTimeMs,
          startedAt,
          finishedAt,
          triggeredBy,
        }),
      },
    });
  } catch (e) {
    logger.error("[self-healing] chaos activity log failed:", e);
  }

  return record;
}

/**
 * Return cumulative self-healing stats for the admin dashboard.
 */
export async function getSelfHealingStats(): Promise<SelfHealingStats> {
  const healActions = await loadHealingActions(500);
  const chaosTests = await loadChaosTests(500);
  const { overallStatus } = await getClusterHealth();

  return {
    totalHealingActions: healActions.length,
    totalChaosTests: chaosTests.length,
    modelAccuracy: MODEL_ACCURACY,
    modelF1: MODEL_F1,
    modelVersion: MODEL_VERSION,
    clusterOverall: overallStatus,
    lastHealingAt: healActions[0]?.triggeredAt || null,
    lastChaosRunAt: chaosTests[0]?.finishedAt || null,
    mode: "SIMULATION",
  };
}

/**
 * Return the recent healing-action history (for audit / dashboard timeline).
 */
export async function getHealingHistory(limit = 50): Promise<HealingActionResult[]> {
  return loadHealingActions(limit);
}

/**
 * Return the recent chaos-test history (for audit / dashboard timeline).
 */
export async function getChaosHistory(limit = 50): Promise<ChaosTestRecord[]> {
  return loadChaosTests(limit);
}
