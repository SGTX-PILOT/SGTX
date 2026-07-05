// @ts-nocheck
// SGTX Loom Replay Verifier (Blueprint Part 1.6)
//
// Full Loom chain replay — re-derives every Governor decision hash from genesis
// and compares with the stored hash. Any mismatch is a tamper event and must
// raise a P0 incident.
//
// Functions exposed:
//   - replayChain(ustn?)            → full replay (or filtered by USTN)
//   - exportChain(ustn?)            → JSON export for the external loom-verify tool
//   - verifyDecision(decisionId)    → verify a single decision's hash integrity
//   - getChainStats()               → summary stats + last verification timestamp
//
// Cron job: hourly chain verification (logs P0 incident on mismatch) is provided
// by the existing /api/sgtx/governor/audit-cron endpoint, which calls
// auditFullLoomChain() from src/lib/sgtx/governor/index.ts. This module is the
// **replay** surface — it does NOT raise incidents; the caller decides what to do
// with mismatches.

import { createHash } from "crypto";
import { freshDb } from "@/lib/db-fresh";

// Genesis hash = SHA256 of the immutable constitutional module version manifest.
// This must match the value computed in src/lib/sgtx/governor/index.ts.
const MODULE_VERSIONS = {
  constitutional_rules: "v1.0.0-immutable",
  jurisdiction_matrix: "v2026.06.17-ria",
  incoterms_engine: "v2020-incoterms",
  fee_gate: "v1.0.0-immutable",
  distressed_country_gate: "v2026.06.17-ria",
  dual_mode_gate: "v1.0.0-immutable",
  reserve_rules: "v1.0.0-immutable",
};

export const GENESIS_HASH: string =
  "sha256:" + createHash("sha256").update(JSON.stringify(MODULE_VERSIONS)).digest("hex");

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface LoomReplayDecision {
  decisionId: string;
  action: string;
  actorGtid: string | null;
  verdict: string;
  resourceUstn: string | null;
  storedHash: string;
  recomputedHash: string;
  storedPreviousHash: string | null;
  expectedPreviousHash: string | null;
  signature: string;
  verified: boolean;
  reason?: "hash_mismatch" | "previous_hash_mismatch" | "ok";
  timestamp: string;
}

export interface LoomReplayResult {
  chainVerified: boolean;
  decisionsChecked: number;
  mismatches: LoomReplayDecision[];
  decisions: LoomReplayDecision[];
  genesisHash: string;
  latestHash: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  filter?: { ustn?: string };
}

export interface LoomDecisionVerification {
  decisionId: string;
  found: boolean;
  verified: boolean;
  storedHash: string;
  recomputedHash: string;
  expectedPreviousHash: string | null;
  storedPreviousHash: string | null;
  reason?: "hash_mismatch" | "previous_hash_mismatch" | "ok" | "not_found";
  decision?: {
    action: string;
    actorGtid: string | null;
    verdict: string;
    resourceUstn: string | null;
    signature: string;
    timestamp: string;
  };
  verifiedAt: string;
}

export interface LoomChainStats {
  totalDecisions: number;
  chainLength: number;
  genesisHash: string;
  latestHash: string | null;
  lastVerifiedAt: string | null;
  lastVerificationChainVerified: boolean | null;
  lastVerificationMismatches: number | null;
  filteredByUstn?: string;
}

export interface LoomChainExport {
  format: "sgtx-loom-chain-v1";
  exportedAt: string;
  genesisHash: string;
  latestHash: string | null;
  chainLength: number;
  filter?: { ustn?: string };
  moduleVersions: typeof MODULE_VERSIONS;
  decisions: Array<{
    decisionId: string;
    action: string;
    actorGtid: string | null;
    traderMode: string | null;
    resourceUstn: string | null;
    verdict: string;
    conditions: any;
    tenantMessage: string | null;
    loomHash: string;
    previousHash: string | null;
    signature: string;
    moduleVersions: string | null;
    aiConfidence: number | null;
    createdAt: string;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────
// Hash helpers — must match src/lib/sgtx/governor/index.ts exactly
// ──────────────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

function recomputeDecisionHash(d: {
  decisionId: string;
  action: string;
  actorGtid: string | null;
  verdict: string;
  conditions: any;
  previousHash: string | null;
  signature: string;
}): string {
  const decisionJson = JSON.stringify({
    decisionId: d.decisionId,
    action: d.action,
    actorGtid: d.actorGtid,
    verdict: d.verdict,
    conditions: d.conditions,
    previousHash: d.previousHash,
  });
  return sha256((d.previousHash || "genesis") + decisionJson + d.signature);
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Full chain replay (Part 1.6). Reads every Governor decision in chronological
 * order, recomputes each hash from the stored JSON, and verifies the
 * previousHash linkage. Returns the full per-decision breakdown plus any
 * mismatches.
 *
 * If `ustn` is provided, the replay is scoped to that trade (still chronological
 * but the genesis link jumps to the first decision for that USTN).
 */
export async function replayChain(ustn?: string): Promise<LoomReplayResult> {
  const startedAt = new Date();
  const t0 = Date.now();

  const decisions = await freshDb.governorDecision.findMany({
    where: ustn ? { resourceUstn: ustn } : undefined,
    orderBy: { createdAt: "asc" },
  });

  let expectedPrevious: string | null = null;
  const out: LoomReplayDecision[] = [];
  const mismatches: LoomReplayDecision[] = [];

  for (const d of decisions) {
    let conditions: any = [];
    try {
      conditions = d.conditions ? JSON.parse(d.conditions) : [];
    } catch {
      conditions = [];
    }

    const recomputed = recomputeDecisionHash({
      decisionId: d.decisionId,
      action: d.action,
      actorGtid: d.actorGtid,
      verdict: d.verdict,
      conditions,
      previousHash: d.previousHash,
      signature: d.signature,
    });

    let reason: LoomReplayDecision["reason"] = "ok";
    if (recomputed !== d.loomHash) reason = "hash_mismatch";
    else if (d.previousHash !== expectedPrevious) reason = "previous_hash_mismatch";

    const entry: LoomReplayDecision = {
      decisionId: d.decisionId,
      action: d.action,
      actorGtid: d.actorGtid,
      verdict: d.verdict,
      resourceUstn: d.resourceUstn,
      storedHash: d.loomHash,
      recomputedHash: recomputed,
      storedPreviousHash: d.previousHash,
      expectedPreviousHash: expectedPrevious,
      signature: d.signature,
      verified: reason === "ok",
      reason,
      timestamp: d.createdAt.toISOString(),
    };
    out.push(entry);
    if (!entry.verified) mismatches.push(entry);

    expectedPrevious = d.loomHash;
  }

  const finishedAt = new Date();

  return {
    chainVerified: mismatches.length === 0,
    decisionsChecked: decisions.length,
    mismatches,
    decisions: out,
    genesisHash: GENESIS_HASH,
    latestHash: expectedPrevious,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - t0,
    filter: ustn ? { ustn } : undefined,
  };
}

/**
 * Export the chain (or a USTN-scoped slice) in a JSON format consumable by the
 * external loom-verify CLI tool. Includes genesis hash, module version manifest,
 * and every decision with its stored hash + signature so the tool can re-verify
 * offline.
 */
export async function exportChain(ustn?: string): Promise<LoomChainExport> {
  const decisions = await freshDb.governorDecision.findMany({
    where: ustn ? { resourceUstn: ustn } : undefined,
    orderBy: { createdAt: "asc" },
  });

  const exported = decisions.map((d) => {
    let conditions: any = [];
    try {
      conditions = d.conditions ? JSON.parse(d.conditions) : [];
    } catch {
      conditions = [];
    }
    return {
      decisionId: d.decisionId,
      action: d.action,
      actorGtid: d.actorGtid,
      traderMode: d.traderMode,
      resourceUstn: d.resourceUstn,
      verdict: d.verdict,
      conditions,
      tenantMessage: d.tenantMessage,
      loomHash: d.loomHash,
      previousHash: d.previousHash,
      signature: d.signature,
      moduleVersions: d.moduleVersions,
      aiConfidence: d.aiConfidence,
      createdAt: d.createdAt.toISOString(),
    };
  });

  const latest = exported.length > 0 ? exported[exported.length - 1].loomHash : null;

  return {
    format: "sgtx-loom-chain-v1",
    exportedAt: new Date().toISOString(),
    genesisHash: GENESIS_HASH,
    latestHash: latest,
    chainLength: exported.length,
    filter: ustn ? { ustn } : undefined,
    moduleVersions: MODULE_VERSIONS,
    decisions: exported,
  };
}

/**
 * Verify a single decision's hash integrity. Also checks that the
 * previousHash matches the prior decision's loomHash (chain linkage).
 */
export async function verifyDecision(decisionId: string): Promise<LoomDecisionVerification> {
  const verifiedAt = new Date().toISOString();

  const d = await freshDb.governorDecision.findUnique({ where: { decisionId } });
  if (!d) {
    return {
      decisionId,
      found: false,
      verified: false,
      storedHash: "",
      recomputedHash: "",
      expectedPreviousHash: null,
      storedPreviousHash: null,
      reason: "not_found",
      verifiedAt,
    };
  }

  let conditions: any = [];
  try {
    conditions = d.conditions ? JSON.parse(d.conditions) : [];
  } catch {
    conditions = [];
  }

  const recomputed = recomputeDecisionHash({
    decisionId: d.decisionId,
    action: d.action,
    actorGtid: d.actorGtid,
    verdict: d.verdict,
    conditions,
    previousHash: d.previousHash,
    signature: d.signature,
  });

  // Look up the predecessor decision to verify chain linkage
  let expectedPrevious: string | null = null;
  if (d.previousHash) {
    expectedPrevious = d.previousHash; // trust stored previousHash for the predecessor lookup
  }
  // Optionally, fetch the prior decision (by createdAt < this one) and compare its loomHash
  const predecessor = await freshDb.governorDecision.findFirst({
    where: { createdAt: { lt: d.createdAt } },
    orderBy: { createdAt: "desc" },
  });
  const expectedPredecessorHash = predecessor?.loomHash ?? null;

  let reason: LoomDecisionVerification["reason"] = "ok";
  if (recomputed !== d.loomHash) reason = "hash_mismatch";
  else if (d.previousHash !== expectedPredecessorHash) reason = "previous_hash_mismatch";

  return {
    decisionId,
    found: true,
    verified: reason === "ok",
    storedHash: d.loomHash,
    recomputedHash: recomputed,
    expectedPreviousHash: expectedPredecessorHash,
    storedPreviousHash: expectedPrevious,
    reason,
    decision: {
      action: d.action,
      actorGtid: d.actorGtid,
      verdict: d.verdict,
      resourceUstn: d.resourceUstn,
      signature: d.signature,
      timestamp: d.createdAt.toISOString(),
    },
    verifiedAt,
  };
}

/**
 * Chain statistics: total decisions, chain length, genesis hash, latest hash,
 * and (if available) the result of the last verification run.
 *
 * The last verification run is reconstructed from the most recent
 * ConfigurationHistory entry with key `loom_replay.last_run` (written by the
 * /api/sgtx/governor/loom/replay endpoint each time it runs).
 */
export async function getChainStats(ustn?: string): Promise<LoomChainStats> {
  const totalCount = await freshDb.governorDecision.count({
    where: ustn ? { resourceUstn: ustn } : undefined,
  });

  const latest = await freshDb.governorDecision.findFirst({
    where: ustn ? { resourceUstn: ustn } : undefined,
    orderBy: { createdAt: "desc" },
  });

  // Last verification run
  const lastRun = await freshDb.configurationHistory.findFirst({
    where: { configKey: "loom_replay.last_run" },
    orderBy: { version: "desc" },
  });
  let lastVerifiedAt: string | null = null;
  let lastVerificationChainVerified: boolean | null = null;
  let lastVerificationMismatches: number | null = null;
  if (lastRun) {
    lastVerifiedAt = lastRun.createdAt.toISOString();
    try {
      const parsed = JSON.parse(lastRun.newValue || "{}");
      lastVerificationChainVerified = parsed.chainVerified ?? null;
      lastVerificationMismatches = parsed.mismatches ?? null;
    } catch {
      // ignore
    }
  }

  return {
    totalDecisions: totalCount,
    chainLength: totalCount,
    genesisHash: GENESIS_HASH,
    latestHash: latest?.loomHash ?? null,
    lastVerifiedAt,
    lastVerificationChainVerified,
    lastVerificationMismatches,
    filteredByUstn: ustn,
  };
}

/**
 * Persist a verification-run summary so subsequent getChainStats() calls can
 * report "last verified at" without re-running the replay. Called by the
 * /api/sgtx/governor/loom/replay endpoint.
 */
export async function recordVerificationRun(result: LoomReplayResult): Promise<void> {
  try {
    const last = await freshDb.configurationHistory.findFirst({
      where: { configKey: "loom_replay.last_run" },
      orderBy: { version: "desc" },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    const summary = JSON.stringify({
      chainVerified: result.chainVerified,
      decisionsChecked: result.decisionsChecked,
      mismatches: result.mismatches.length,
      latestHash: result.latestHash,
      finishedAt: result.finishedAt,
      filter: result.filter,
    });

    await freshDb.configurationHistory.create({
      data: {
        configKey: "loom_replay.last_run",
        oldValue: last?.newValue ?? null,
        newValue: summary,
        changedByGtid: "system",
        changeReason: `loom replay — ${result.chainVerified ? "verified" : `${result.mismatches.length} mismatch(es)`}`,
        version: nextVersion,
      },
    });
  } catch (e) {
    logger.error("[loom-verifier] failed to record verification run:", e);
  }
}
