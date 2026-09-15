// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Constitutional Policies Editor (Admin Portal)
// -----------------------------------------------------------------------------
// Browse, simulate impact, propose changes, and approve (multisig) changes
// to constitutional OPA Rego + WasmEdge modules.
//
// Policy tiers:
//   • L0 — Sovereign-grade (constitutional amendments). 3-of-5 multisig.
//   • L1 — Operational-grade (governor gates).        1-of-3 multisig.
//   • L2 — Tenant-config-grade (per-tenant settings).  1-of-3 multisig.
//
// Storage:
//   • OpaPolicy — canonical source of truth for OPA policies (with
//                 version + multisigApproved fields).
//   • MultisigRequest (requestType = "POLICY_UPDATE")
//     payload: { policyId, tier, proposedChange, reason, proposerGtid,
//                requiredApprovals, authorisedApproverGtids }
//   • ConfigurationHistory (configKey = `policy_version:{policyId}`)
//     — version history (created / proposed / approved / rejected / rolled back)
// =============================================================================
import { db } from "@/lib/db";
import { OPA_POLICIES } from "@/lib/sgtx/governor/policies";
import { logger } from "@/lib/sgtx/logger";

export type PolicyTier = "L0" | "L1" | "L2";

export interface ConstitutionalPolicy {
  id: string;
  name: string;
  type: "OPA_REGO" | "WASM_EDGE" | "REGO";
  tier: PolicyTier;
  version: string;
  active: boolean;
  multisigApproved: boolean;
  content: string;
  category: string;
  description?: string;
  lastModified: string;
  source: "db" | "default";
}

export interface ProposedChange {
  field: "content" | "version" | "active" | "name" | "category" | "description";
  newValue: any;
  oldValue?: any;
  reason: string;
}

export interface PolicyImpactResult {
  affectedTrades: any[];
  affectedTenants: any[];
  estimatedCostUsd: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskReasons: string[];
  simulationId: string;
  simulatedAt: string;
}

const DEFAULT_AUTHORIZED_APPROVERS_L0 = [
  "SGTX-EG-GOV-000001-9A0B",
  "SGTX-ADM-000001-C1D2",
  "SGTX-GOV-LEGAL-0001-E3F4",
  "SGTX-GOV-COMPL-0001-A5B6",
  "SGTX-GOV-AUDIT-0001-C7D8",
];
const DEFAULT_AUTHORIZED_APPROVERS_L1L2 = [
  "SGTX-ADM-000001-C1D2",
  "SGTX-GOV-COMPL-0001-A5B6",
  "SGTX-GOV-AUDIT-0001-C7D8",
];

// =============================================================================
// getConstitutionalPolicies — list all OPA Rego + WasmEdge modules
// =============================================================================
export async function getConstitutionalPolicies(): Promise<{
  policies: ConstitutionalPolicy[];
  count: number;
}> {
  const dbPolicies = await db.opaPolicy.findMany().catch(() => []);

  // Combine the static OPA_POLICIES registry with the DB rows (DB overrides
  // where present — supports hot-reload via the editor).
  const out: ConstitutionalPolicy[] = [];
  for (const p of OPA_POLICIES) {
    const dbRow = dbPolicies.find((r: any) => r.name === p.name);
    const tier = inferTierFromName(p.name);
    out.push({
      id: dbRow?.id || p.name,
      name: p.name,
      type: "OPA_REGO",
      tier,
      version: dbRow?.version || "v1.0.0",
      active: dbRow?.active ?? true,
      multisigApproved: dbRow?.multisigApproved ?? false,
      content: dbRow?.content ?? p.content,
      category: p.category,
      description: p.description,
      lastModified: dbRow?.lastReloaded?.toISOString() ?? new Date().toISOString(),
      source: dbRow ? "db" : "default",
    });
  }

  // Include DB-only rows (user-created policies not in the static registry).
  for (const r of dbPolicies) {
    if (OPA_POLICIES.some((p) => p.name === r.name)) continue;
    out.push({
      id: r.id,
      name: r.name,
      type: "OPA_REGO",
      tier: "L1",
      version: r.version,
      active: r.active,
      multisigApproved: r.multisigApproved,
      content: r.content,
      category: r.category,
      lastModified: r.lastReloaded.toISOString(),
      source: "db",
    });
  }

  // WasmEdge modules (in-memory list — no DB table for these).
  // The Governor's WasmEdge modules are declared in
  // src/lib/sgtx/governor/wasm-modules.ts. We expose them as type WASM_EDGE.
  try {
    const wasmModules = await loadWasmModules();
    for (const w of wasmModules) {
      out.push({
        id: w.id,
        name: w.name,
        type: "WASM_EDGE",
        tier: w.tier,
        version: w.version,
        active: true,
        multisigApproved: false,
        content: w.content,
        category: w.category,
        description: w.description,
        lastModified: new Date().toISOString(),
        source: "default",
      });
    }
  } catch (e: any) {
    logger.warn("[constitutional-policies] wasm modules load failed:", e?.message);
  }

  return { policies: out, count: out.length };
}

function inferTierFromName(name: string): PolicyTier {
  if (name.includes("fee") || name.includes("reserve") || name.includes("permissions")) return "L0";
  if (name.includes("financing") || name.includes("broker") || name.includes("logistics")) return "L1";
  return "L2";
}

async function loadWasmModules(): Promise<any[]> {
  // Defensive import — the wasm-modules file may export a different shape.
  try {
    const mod = await import("@/lib/sgtx/governor/wasm-modules");
    const candidates = (mod as any).WASM_MODULES || (mod as any).wasmModules || (mod as any).default || [];
    if (Array.isArray(candidates)) return candidates;
    if (typeof candidates === "object") {
      return Object.entries(candidates).map(([k, v]: any) => ({
        id: k, name: k, category: "wasm", tier: "L1",
        version: v?.version || "v1.0.0",
        description: v?.description || "WasmEdge module",
        content: typeof v === "string" ? v : JSON.stringify(v),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// =============================================================================
// getConstitutionalPolicy (single)
// =============================================================================
export async function getConstitutionalPolicy(policyId: string): Promise<ConstitutionalPolicy | null> {
  const all = await getConstitutionalPolicies();
  return all.policies.find((p) => p.id === policyId || p.name === policyId) || null;
}

// =============================================================================
// getPolicyImpact — simulate the impact of a proposed change BEFORE applying
// =============================================================================
export async function getPolicyImpact(
  policyId: string,
  proposedChange: ProposedChange,
): Promise<PolicyImpactResult> {
  const policy = await getConstitutionalPolicy(policyId);
  if (!policy) throw new Error("policy not found");

  // For impact simulation we estimate:
  //   • Affected trades = all OPEN/IN_PROGRESS trades where the policy
  //     category applies (e.g. fee.rego → all open trades, distressed.rego
  //     → trades with distressed flag, etc.).
  //   • Affected tenants = distinct buyer/seller GTIDs of those trades.
  //   • Estimated cost (USD) = a rough proxy based on trade value + rate.
  //   • Risk level — based on policy tier + number of affected trades +
  //     content delta (changes to L0 → CRITICAL, L1 → HIGH, L2 → MEDIUM
  //     by default; bumped up if many trades affected).

  const where = inferTradeWhereForPolicy(policy);
  const trades = await db.trade.findMany({
    where,
    take: 5000,
    select: { id: true, ustn: true, buyerGtid: true, sellerGtid: true, tradeValueUsd: true },
  }).catch(() => []);

  const affectedTrades = trades.map((t: any) => ({
    id: t.id,
    ustn: t.ustn,
    tradeValueUsd: t.tradeValueUsd,
  }));

  const tenantSet = new Set<string>();
  for (const t of trades) {
    tenantSet.add(t.buyerGtid);
    tenantSet.add(t.sellerGtid);
  }
  const affectedTenants = Array.from(tenantSet).map((gtid) => ({ gtid }));

  // Estimated cost: for content changes, simulate the rate delta × trade volume.
  let estimatedCostUsd = 0;
  if (policy.tier === "L0" && policy.category === "fee") {
    // Try to parse the new fee rate from the proposed content (regex).
    const newRate = extractFeeRate(proposedChange.newValue);
    const oldRate = extractFeeRate(policy.content);
    if (newRate != null && oldRate != null) {
      const delta = Math.abs(newRate - oldRate);
      const totalVolume = trades.reduce((s: number, t: any) => s + (t.tradeValueUsd || 0), 0);
      estimatedCostUsd = totalVolume * delta;
    }
  } else {
    // Heuristic: ~$50 per affected trade (operational cost of policy migration).
    estimatedCostUsd = trades.length * 50;
  }

  // Risk level.
  let riskLevel: PolicyImpactResult["riskLevel"] = "LOW";
  const riskReasons: string[] = [];
  if (policy.tier === "L0") {
    riskLevel = "HIGH";
    riskReasons.push("L0 constitutional amendment — irreversible without 3-of-5 multisig");
  } else if (policy.tier === "L1") {
    riskLevel = "MEDIUM";
    riskReasons.push("L1 operational gate — Governor will enforce immediately");
  } else {
    riskReasons.push("L2 tenant config — bounded impact, low risk");
  }
  if (trades.length > 1000) {
    riskLevel = "CRITICAL";
    riskReasons.push(`Impact is broad: ${trades.length} active trades affected (threshold > 1000)`);
  } else if (trades.length > 200 && riskLevel !== "CRITICAL") {
    riskLevel = "HIGH";
    riskReasons.push(`Moderate impact: ${trades.length} active trades affected`);
  }
  if (proposedChange.field === "content" && proposedChange.oldValue !== undefined) {
    const sizeDelta = Math.abs((proposedChange.newValue || "").length - (proposedChange.oldValue || "").length);
    if (sizeDelta > 500) {
      riskReasons.push(`Large content delta (${sizeDelta} bytes) — review carefully`);
      if (riskLevel === "LOW") riskLevel = "MEDIUM";
    }
  }

  return {
    affectedTrades,
    affectedTenants,
    estimatedCostUsd,
    riskLevel,
    riskReasons,
    simulationId: `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    simulatedAt: new Date().toISOString(),
  };
}

function inferTradeWhereForPolicy(policy: ConstitutionalPolicy): any {
  switch (policy.category) {
    case "fee":
      return { status: { in: ["INITIATED", "NEGOTIATING", "LOCKED"] } };
    case "financing":
      return { financingInterest: { not: null } };
    case "distressed":
      return { status: "DISTRESSED" };
    case "multiship":
      return { multiShipment: true };
    case "logistics":
      return { status: { in: ["IN_TRANSIT", "CUSTOMS_HOLD"] } };
    case "broker":
      return { status: "BROKER_ASSIGNED" };
    case "reserve":
      // Reserve changes affect ALL trades.
      return {};
    case "permissions":
      return {};
    default:
      return { status: { in: ["INITIATED", "NEGOTIATING", "LOCKED", "IN_PROGRESS"] } };
  }
}

function extractFeeRate(content: string): number | null {
  if (typeof content !== "string") return null;
  // Look for `input.fee_rate >= 0.001` or `input.fee_rate <= 0.025` style.
  const match = content.match(/fee_rate\s*[<>=!]+\s*([0-9.]+)/);
  if (match) return Number(match[1]);
  return null;
}

// =============================================================================
// proposePolicyChange — create a MultisigRequest
// =============================================================================
export async function proposePolicyChange(
  policyId: string,
  proposedChange: ProposedChange,
  proposerGtid: string,
  reason: string,
): Promise<{
  proposalId: string;
  requiresMultisig: true;
  requiredApprovals: number;
  authorizedApproverGtids: string[];
}> {
  const policy = await getConstitutionalPolicy(policyId);
  if (!policy) throw new Error("policy not found");

  const isL0 = policy.tier === "L0";
  const requiredApprovals = isL0 ? 3 : 1;
  const approvers = isL0 ? DEFAULT_AUTHORIZED_APPROVERS_L0 : DEFAULT_AUTHORIZED_APPROVERS_L1L2;

  const proposalId = `PROP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const payload = {
    proposalId,
    policyId,
    policyName: policy.name,
    tier: policy.tier,
    proposedChange,
    reason,
    proposerGtid,
    requiredApprovals,
    authorisedApproverGtids: approvers,
  };

  await db.multisigRequest.create({
    data: {
      requestType: "POLICY_UPDATE",
      requesterGtid: proposerGtid,
      payload: JSON.stringify(payload),
      requiredApprovals,
      authorisedApproverGtids: JSON.stringify(approvers),
      status: "PENDING",
    },
  });

  // Version history entry — PROPOSED.
  await db.configurationHistory.create({
    data: {
      configKey: `policy_version:${policyId}`,
      newValue: JSON.stringify({
        policyId, policyName: policy.name, action: "PROPOSED",
        proposedChange, reason, proposerGtid,
        proposedAt: new Date().toISOString(), proposalId,
        requiredApprovals, approvers,
      }),
      changedByGtid: proposerGtid,
      changeReason: `Policy change proposed: ${reason}`,
      version: (await nextPolicyVersion(policyId)),
    },
  });

  // Inbox the approvers.
  for (const approverGtid of approvers) {
    await db.inboxItem.create({
      data: {
        tenantGtid: approverGtid,
        category: "APPROVAL",
        priority: isL0 ? 95 : 80,
        title: `Policy change: ${policy.name} (${policy.tier})`,
        description: `Proposed by ${proposerGtid}. Reason: ${reason}. ${requiredApprovals}-of-${approvers.length} approvals required.`,
        ctaLabel: "Review & Approve",
      },
    }).catch((e: any) => logger.error("[constitutional-policies] inbox failed:", e?.message));
  }

  return {
    proposalId,
    requiresMultisig: true,
    requiredApprovals,
    authorizedApproverGtids: approvers,
  };
}

// =============================================================================
// approvePolicyChange — record one approval against the multisig request
// =============================================================================
export async function approvePolicyChange(
  proposalId: string,
  approverGtid: string,
  decision: "APPROVE" | "REJECT" = "APPROVE",
): Promise<{
  approved: boolean;
  approvalsCount: number;
  applied: boolean;
  request: any;
}> {
  const requests = await db.multisigRequest.findMany({
    where: { requestType: "POLICY_UPDATE", status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const target = requests.find((r: any) => {
    try {
      const p = JSON.parse(r.payload || "{}");
      return p.proposalId === proposalId;
    } catch { return false; }
  });
  if (!target) throw new Error("policy proposal not found (or already resolved)");

  if (target.authorisedApproverGtids) {
    try {
      const authorised = JSON.parse(target.authorisedApproverGtids);
      if (Array.isArray(authorised) && authorised.length > 0 && !authorised.includes(approverGtid)) {
        throw new Error("approver not in the authorised set");
      }
    } catch (e: any) {
      if (e.message.includes("authorised")) throw e;
    }
  }

  const approvals = JSON.parse(target.approvals || "[]");

  if (decision === "REJECT") {
    await db.multisigRequest.update({
      where: { id: target.id },
      data: { status: "REJECTED" },
    });
    return { approved: false, approvalsCount: approvals.length, applied: false, request: target };
  }

  if (approvals.includes(approverGtid)) {
    return { approved: false, approvalsCount: approvals.length, applied: false, request: target };
  }
  approvals.push(approverGtid);
  const isApproved = approvals.length >= target.requiredApprovals;

  await db.multisigRequest.update({
    where: { id: target.id },
    data: {
      approvals: JSON.stringify(approvals),
      status: isApproved ? "APPROVED" : "PENDING",
      executedAt: isApproved ? new Date() : null,
    },
  });

  let applied = false;
  if (isApproved) {
    const payload = JSON.parse(target.payload || "{}");
    applied = await applyPolicyChange(payload, approverGtid, approvals);
  }

  return { approved: isApproved, approvalsCount: approvals.length, applied, request: target };
}

// =============================================================================
// applyPolicyChange — write the new content/version/active to OpaPolicy
// =============================================================================
async function applyPolicyChange(
  payload: any,
  approverGtid: string,
  approverGtids: string[],
): Promise<boolean> {
  const { policyId, policyName, proposedChange } = payload;
  if (!policyName) return false;
  const existing = await db.opaPolicy.findUnique({ where: { name: policyName } }).catch(() => null);

  // Build the new row data.
  const data: any = {
    name: policyName,
    category: proposedChange.category || existing?.category || "general",
    content: proposedChange.field === "content" ? proposedChange.newValue : (existing?.content || ""),
    version: proposedChange.field === "version" ? proposedChange.newValue : bumpVersion(existing?.version || "v1.0.0"),
    active: proposedChange.field === "active" ? proposedChange.newValue : (existing?.active ?? true),
    multisigApproved: true,
    lastReloaded: new Date(),
  };

  if (existing) {
    await db.opaPolicy.update({ where: { name: policyName }, data });
  } else {
    await db.opaPolicy.create({ data });
  }

  // Version history entry — APPLIED.
  await db.configurationHistory.create({
    data: {
      configKey: `policy_version:${policyId}`,
      newValue: JSON.stringify({
        policyId, policyName, action: "APPLIED",
        proposedChange, approvedBy: approverGtids,
        appliedAt: new Date().toISOString(),
        newVersion: data.version,
      }),
      changedByGtid: approverGtid,
      changeReason: `Policy change applied (multisig approved)`,
      version: (await nextPolicyVersion(policyId)),
    },
  });

  return true;
}

function bumpVersion(v: string): string {
  // v1.0.0 → v1.0.1 (patch bump on each applied change).
  const m = v.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return "v1.0.1";
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

// =============================================================================
// getPolicyVersionHistory
// =============================================================================
export async function getPolicyVersionHistory(policyId: string): Promise<{
  versions: any[];
  count: number;
}> {
  const rows = await db.configurationHistory.findMany({
    where: { configKey: `policy_version:${policyId}` },
    orderBy: { version: "desc" },
    take: 100,
  }).catch(() => []);

  const versions = rows.map((r: any) => {
    try {
      const p = JSON.parse(r.newValue || "{}");
      return {
        version: r.version,
        changedAt: r.createdAt.toISOString(),
        changedBy: r.changedByGtid,
        changeSummary: r.changeReason,
        action: p.action || "UNKNOWN",
        proposedChange: p.proposedChange || null,
        approvedBy: p.approvedBy || null,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return { versions, count: versions.length };
}

// =============================================================================
// helpers
// =============================================================================
async function nextPolicyVersion(policyId: string): Promise<number> {
  const last = await db.configurationHistory.findFirst({
    where: { configKey: `policy_version:${policyId}` },
    orderBy: { version: "desc" },
    select: { version: true },
  }).catch(() => null);
  return (last?.version || 0) + 1;
}
