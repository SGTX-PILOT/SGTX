// @ts-nocheck
/**
 * SGTX Master Amendment — §66-68 Obligation Graph Engine
 * ===========================================================================
 *
 * Implements the §66 Obligation Graph — the directed graph of obligations
 * that must be satisfied for a trade to reach closure. Each obligation
 * is a node; edges represent dependencies (prerequisite + downstream
 * relationships).
 *
 * §66 — Obligation types:
 *   COMMERCIAL   — buyer/seller commercial obligations (deliver, pay)
 *   DOCUMENT     — document obligations (LC, BL, CoO, inspection cert)
 *   LOGISTICS    — logistics obligations (pickup, transit, delivery)
 *   CUSTOMS      — customs obligations (declare, pay duties, clear)
 *   COMPLIANCE   — compliance obligations (SPS, TBT, sanctions)
 *   FINANCIAL    — financial obligations (fee, financing, settlement)
 *
 * §67 — Dependency Impact: when an obligation's state changes, this
 * engine computes which downstream obligations are affected.
 *
 * §68 — Failure Cascade: when an obligation FAILS, downstream obligations
 * may be marked BLOCKED or FAILED depending on the dependency type.
 *
 * Obligation states:
 *   PENDING → IN_PROGRESS → COMPLETED
 *                       ↘ FAILED
 *                       ↘ REVERSED
 *                       ↘ DISPUTED
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §66 Constants — obligation types + states ============

/**
 * §66 — the canonical obligation types.
 */
export const OBLIGATION_TYPES = [
  "COMMERCIAL",
  "DOCUMENT",
  "LOGISTICS",
  "CUSTOMS",
  "COMPLIANCE",
  "FINANCIAL",
] as const;

export type ObligationType = (typeof OBLIGATION_TYPES)[number];

/**
 * Obligation state machine.
 */
export const OBLIGATION_STATES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "REVERSED",
  "DISPUTED",
  "BLOCKED",
] as const;

export type ObligationState = (typeof OBLIGATION_STATES)[number];

/**
 * Dependency edge types.
 */
export const DEPENDENCY_TYPES = [
  "PREREQUISITE",  // hard dependency: downstream cannot start until upstream completes
  "SOFT",          // soft dependency: downstream can start but cannot complete
  "CONDITIONAL",  // conditional dependency: downstream blocked unless condition met
] as const;

// ============ Types ============

export interface ObligationNodeRow {
  id: string;
  ustn: string;
  obligationId: string;
  obligationType: string;
  beneficiary?: string | null;
  amount?: number | null;
  currency?: string | null;
  prerequisites?: string | null;  // JSON array of obligation IDs
  dependencies?: string | null;   // JSON array of obligation IDs
  completionCondition?: string | null;
  reversalCondition?: string | null;
  disputeCondition?: string | null;
  recoveryPath?: string | null;
  financialConsequence?: number | null;
  state: string;
  authority?: string | null;
  evidenceRequirement?: string | null;
  deadline?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateObligationInput {
  ustn: string;
  obligationType: string;
  beneficiary?: string | null;
  amount?: number | null;
  currency?: string | null;
  prerequisites?: string[];
  dependencies?: string[];
  completionCondition?: Record<string, any> | null;
  reversalCondition?: string | null;
  disputeCondition?: string | null;
  recoveryPath?: string | null;
  financialConsequence?: number | null;
  authority?: string | null;
  evidenceRequirement?: Record<string, any> | null;
  deadline?: Date | null;
}

export interface DependencyGraph {
  ustn: string;
  nodes: ObligationNodeRow[];
  edges: Array<{
    from: string; // obligationId
    to: string;   // obligationId
    type: string; // PREREQUISITE | SOFT | CONDITIONAL
  }>;
}

export interface DependencyImpactResult {
  obligationId: string;
  directlyAffected: string[];      // obligation IDs directly downstream
  transitivelyAffected: string[];  // all transitively affected IDs
  blockedBy: string[];             // obligations blocking this one
  blocks: string[];                // obligations this one blocks
  cascadeRequired: boolean;
}

// ============ §66.0 Pure helpers ============

/**
 * Pure: generate an obligationId in the form:
 *   OBS-{ustn8}-{TYPE3}-{RANDOM6}
 */
export function generateObligationId(
  ustn: string,
  obligationType: string,
): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const t = String(obligationType || "OBS").slice(0, 3).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OBS-${u}-${t}-${r}`;
}

/**
 * Pure: parse a JSON-encoded array of obligation IDs from the
 * prerequisites or dependencies column.
 */
export function parseObligationIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: serialize an array of obligation IDs to JSON.
 */
export function serializeObligationIds(ids: string[] | null | undefined): string | null {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return null;
  try {
    return JSON.stringify(ids);
  } catch {
    return null;
  }
}

// ============ §66.1 createObligation ============

/**
 * Create a new obligation node in the graph. Generates an obligationId,
 * serializes prerequisites/dependencies, and persists the row.
 *
 * Returns the new obligation row, or null on error.
 */
export async function createObligation(
  input: CreateObligationInput,
): Promise<ObligationNodeRow | null> {
  if (!input || !input.ustn || !input.obligationType) {
    logger.warn("[obligation-graph] createObligation rejected: missing required fields");
    return null;
  }
  if (!OBLIGATION_TYPES.includes(input.obligationType as ObligationType)) {
    logger.warn("[obligation-graph] unknown obligation type", {
      type: input.obligationType,
    });
    return null;
  }
  const obligationId = generateObligationId(input.ustn, input.obligationType);
  try {
    const row = await db.obligationNode.create({
      data: {
        obligationId,
        ustn: input.ustn,
        obligationType: input.obligationType,
        beneficiary: input.beneficiary || null,
        amount: input.amount ?? null,
        currency: input.currency || null,
        prerequisites: serializeObligationIds(input.prerequisites),
        dependencies: serializeObligationIds(input.dependencies),
        completionCondition: input.completionCondition
          ? JSON.stringify(input.completionCondition)
          : null,
        reversalCondition: input.reversalCondition || null,
        disputeCondition: input.disputeCondition || null,
        recoveryPath: input.recoveryPath || null,
        financialConsequence: input.financialConsequence ?? null,
        state: "PENDING",
        authority: input.authority || null,
        evidenceRequirement: input.evidenceRequirement
          ? JSON.stringify(input.evidenceRequirement)
          : null,
        deadline: input.deadline || null,
      },
    });
    logger.info("[obligation-graph] obligation created", {
      obligationId,
      ustn: input.ustn,
      type: input.obligationType,
      prereqCount: input.prerequisites?.length || 0,
      depCount: input.dependencies?.length || 0,
    });
    return row as ObligationNodeRow;
  } catch (err) {
    logger.error("[obligation-graph] createObligation failed", {
      error: String(err),
      ustn: input.ustn,
      obligationType: input.obligationType,
    });
    return null;
  }
}

// ============ §67 addDependency ============

/**
 * Add a dependency edge from obligationId → dependsOnId. The edge is
 * recorded by adding dependsOnId to the obligation's `dependencies`
 * array, and by adding obligationId to the dependsOnId's `prerequisites`
 * array (so the graph is bi-directional).
 *
 * Returns true on success, false on error.
 */
export async function addDependency(
  obligationId: string,
  dependsOnId: string,
  type: string = "PREREQUISITE",
): Promise<boolean> {
  if (!obligationId || !dependsOnId || obligationId === dependsOnId) {
    logger.warn("[obligation-graph] addDependency rejected: invalid args");
    return false;
  }
  try {
    const obligation = (await db.obligationNode.findUnique({
      where: { obligationId },
    })) as ObligationNodeRow | null;
    const dependsOn = (await db.obligationNode.findUnique({
      where: { obligationId: dependsOnId },
    })) as ObligationNodeRow | null;
    if (!obligation || !dependsOn) {
      logger.warn("[obligation-graph] addDependency: obligation not found", {
        obligationId,
        dependsOnId,
        obligationFound: !!obligation,
        dependsOnFound: !!dependsOn,
      });
      return false;
    }
    if (obligation.ustn !== dependsOn.ustn) {
      logger.warn("[obligation-graph] cross-USTN dependency not allowed", {
        obligationId,
        dependsOnId,
      });
      return false;
    }

    // Update dependencies on the downstream node
    const deps = parseObligationIds(obligation.dependencies);
    if (!deps.includes(dependsOnId)) deps.push(dependsOnId);
    await db.obligationNode.update({
      where: { obligationId },
      data: { dependencies: serializeObligationIds(deps) },
    });

    // Update prerequisites on the upstream node
    const prereqs = parseObligationIds(dependsOn.prerequisites);
    if (!prereqs.includes(obligationId)) prereqs.push(obligationId);
    await db.obligationNode.update({
      where: { obligationId: dependsOnId },
      data: { prerequisites: serializeObligationIds(prereqs) },
    });

    logger.info("[obligation-graph] dependency added", {
      from: obligationId,
      to: dependsOnId,
      type,
      ustn: obligation.ustn,
    });
    return true;
  } catch (err) {
    logger.error("[obligation-graph] addDependency failed", {
      error: String(err),
      obligationId,
      dependsOnId,
    });
    return false;
  }
}

// ============ §66.2 getObligations ============

/**
 * Get all obligations for a USTN. Returns [] on error.
 */
export async function getObligations(
  ustn: string,
): Promise<ObligationNodeRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.obligationNode.findMany({
      where: { ustn },
      orderBy: [{ obligationType: "asc" }, { createdAt: "asc" }],
    });
    return (rows as ObligationNodeRow[]) || [];
  } catch (err) {
    logger.error("[obligation-graph] getObligations failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §67.1 getDependencyGraph ============

/**
 * Get the full dependency graph for a USTN. Returns nodes + edges.
 * Each edge is a tuple of (from, to, type) where `from` is the
 * downstream obligation and `to` is the prerequisite obligation.
 *
 * Returns { nodes: [], edges: [] } on error.
 */
export async function getDependencyGraph(
  ustn: string,
): Promise<DependencyGraph> {
  const empty: DependencyGraph = { ustn, nodes: [], edges: [] };
  if (!ustn) return empty;
  try {
    const nodes = await getObligations(ustn);
    const edges: Array<{ from: string; to: string; type: string }> = [];
    for (const n of nodes) {
      const deps = parseObligationIds(n.dependencies);
      for (const depId of deps) {
        edges.push({ from: n.obligationId, to: depId, type: "PREREQUISITE" });
      }
    }
    return { ustn, nodes, edges };
  } catch (err) {
    logger.error("[obligation-graph] getDependencyGraph failed", {
      error: String(err),
      ustn,
    });
    return empty;
  }
}

// ============ §67.2 evaluateDependencyImpact ============

/**
 * §67 — Evaluate the dependency impact of a single obligation. Computes:
 *
 *   - directlyAffected: obligations that directly depend on this one
 *   - transitivelyAffected: full transitive closure
 *   - blockedBy: obligations that block this one (i.e. its prerequisites)
 *   - blocks: obligations this one blocks (i.e. its dependents)
 *   - cascadeRequired: true if any affected obligation is in a terminal
 *     state (COMPLETED / FAILED) — meaning a cascade is needed
 *
 * Returns the impact result. Returns an empty result on error.
 */
export async function evaluateDependencyImpact(
  obligationId: string,
): Promise<DependencyImpactResult> {
  const empty: DependencyImpactResult = {
    obligationId,
    directlyAffected: [],
    transitivelyAffected: [],
    blockedBy: [],
    blocks: [],
    cascadeRequired: false,
  };
  if (!obligationId) return empty;
  try {
    const target = (await db.obligationNode.findUnique({
      where: { obligationId },
    })) as ObligationNodeRow | null;
    if (!target) return empty;
    const allObligations = await getObligations(target.ustn);

    // Build a lookup map
    const byId = new Map<string, ObligationNodeRow>();
    for (const o of allObligations) byId.set(o.obligationId, o);

    // blockedBy = prerequisites of this obligation
    const blockedBy = parseObligationIds(target.prerequisites);

    // blocks = obligations whose dependencies include this obligation
    const blocks: string[] = [];
    for (const o of allObligations) {
      const deps = parseObligationIds(o.dependencies);
      if (deps.includes(obligationId)) blocks.push(o.obligationId);
    }

    // transitivelyAffected: BFS through `blocks` (downstream cascade)
    const transitive = new Set<string>();
    const queue: string[] = [...blocks];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (transitive.has(current)) continue;
      transitive.add(current);
      const node = byId.get(current);
      if (!node) continue;
      // Find obligations that depend on `current`
      for (const o of allObligations) {
        const deps = parseObligationIds(o.dependencies);
        if (deps.includes(current) && !transitive.has(o.obligationId)) {
          queue.push(o.obligationId);
        }
      }
    }

    // cascadeRequired: any transitive obligation in a terminal state
    let cascadeRequired = false;
    for (const id of transitive) {
      const n = byId.get(id);
      if (n && ["COMPLETED", "FAILED", "REVERSED"].includes(n.state)) {
        cascadeRequired = true;
        break;
      }
    }

    return {
      obligationId,
      directlyAffected: blocks,
      transitivelyAffected: Array.from(transitive),
      blockedBy,
      blocks,
      cascadeRequired,
    };
  } catch (err) {
    logger.error("[obligation-graph] evaluateDependencyImpact failed", {
      error: String(err),
      obligationId,
    });
    return empty;
  }
}

// ============ §66.3 completeObligation ============

/**
 * Mark an obligation as COMPLETED. Validates that all prerequisite
 * obligations are also COMPLETED (else the completion is rejected with
 * the list of incomplete prerequisites).
 *
 * Returns the updated obligation row, or null on error / blocked.
 */
export async function completeObligation(
  obligationId: string,
  metadata?: { completedBy?: string; notes?: string },
): Promise<ObligationNodeRow | null> {
  if (!obligationId) return null;
  try {
    const target = (await db.obligationNode.findUnique({
      where: { obligationId },
    })) as ObligationNodeRow | null;
    if (!target) return null;
    if (target.state === "COMPLETED") return target;

    // Verify prerequisites are completed
    const prereqs = parseObligationIds(target.prerequisites);
    if (prereqs.length > 0) {
      const prereqRows = await db.obligationNode.findMany({
        where: { obligationId: { in: prereqs } },
      });
      const incomplete = prereqRows.filter(
        (r: any) => r.state !== "COMPLETED",
      );
      if (incomplete.length > 0) {
        logger.warn("[obligation-graph] completeObligation blocked by incomplete prerequisites", {
          obligationId,
          incompletePrereqs: incomplete.map((r: any) => r.obligationId),
        });
        return null;
      }
    }

    const updated = await db.obligationNode.update({
      where: { obligationId },
      data: { state: "COMPLETED" },
    });
    logger.info("[obligation-graph] obligation completed", {
      obligationId,
      ustn: target.ustn,
      completedBy: metadata?.completedBy,
    });
    return updated as ObligationNodeRow;
  } catch (err) {
    logger.error("[obligation-graph] completeObligation failed", {
      error: String(err),
      obligationId,
    });
    return null;
  }
}

// ============ §68 failObligation ============

/**
 * §68 — Mark an obligation as FAILED and cascade the failure to
 * downstream obligations. The cascade rules are:
 *
 *   - obligations that depend on the failed one (transitively) are
 *     marked BLOCKED if they are PENDING, or FAILED if they are
 *     IN_PROGRESS.
 *   - already-COMPLETED downstream obligations are NOT rolled back
 *     (this is a separate, governed reversal action — see
 *     `reverseObligation` if needed).
 *
 * Returns the updated obligation row + the list of cascaded obligation IDs.
 */
export async function failObligation(
  obligationId: string,
  reason: string,
  cascade: boolean = true,
): Promise<{
  obligation: ObligationNodeRow | null;
  cascaded: string[];
}> {
  if (!obligationId) return { obligation: null, cascaded: [] };
  try {
    const target = (await db.obligationNode.findUnique({
      where: { obligationId },
    })) as ObligationNodeRow | null;
    if (!target) return { obligation: null, cascaded: [] };

    const updated = await db.obligationNode.update({
      where: { obligationId },
      data: {
        state: "FAILED",
        reversalCondition: reason, // store the failure reason
      },
    });
    logger.warn("[obligation-graph] obligation FAILED", {
      obligationId,
      ustn: target.ustn,
      reason,
    });

    let cascaded: string[] = [];
    if (cascade) {
      // Find all downstream obligations + cascade
      const allObligations = await getObligations(target.ustn);
      const byId = new Map<string, ObligationNodeRow>();
      for (const o of allObligations) byId.set(o.obligationId, o);

      // BFS through dependents
      const toUpdate: Array<{ id: string; newState: string }> = [];
      const visited = new Set<string>([obligationId]);
      const queue: string[] = [];
      // Seed with direct dependents
      for (const o of allObligations) {
        const deps = parseObligationIds(o.dependencies);
        if (deps.includes(obligationId)) queue.push(o.obligationId);
      }
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = byId.get(id);
        if (!node) continue;
        if (node.state === "PENDING") {
          toUpdate.push({ id, newState: "BLOCKED" });
        } else if (node.state === "IN_PROGRESS") {
          toUpdate.push({ id, newState: "FAILED" });
        }
        // Continue cascade
        for (const o of allObligations) {
          const deps = parseObligationIds(o.dependencies);
          if (deps.includes(id) && !visited.has(o.obligationId)) {
            queue.push(o.obligationId);
          }
        }
      }

      // Apply updates
      for (const u of toUpdate) {
        try {
          await db.obligationNode.update({
            where: { obligationId: u.id },
            data: { state: u.newState },
          });
          cascaded.push(u.id);
        } catch (updErr) {
          logger.warn("[obligation-graph] cascade update failed", {
            error: String(updErr),
            obligationId: u.id,
            newState: u.newState,
          });
        }
      }
      logger.warn("[obligation-graph] failure cascade applied", {
        obligationId,
        cascadedCount: cascaded.length,
        cascaded,
      });
    }

    return { obligation: updated as ObligationNodeRow, cascaded };
  } catch (err) {
    logger.error("[obligation-graph] failObligation failed", {
      error: String(err),
      obligationId,
    });
    return { obligation: null, cascaded: [] };
  }
}

/**
 * Mark an obligation as DISPUTED (e.g. a buyer disputes the obligation).
 * Does NOT cascade — disputes are governed separately by the §70 exception
 * engine.
 */
export async function disputeObligation(
  obligationId: string,
  reason: string,
): Promise<ObligationNodeRow | null> {
  if (!obligationId) return null;
  try {
    const updated = await db.obligationNode.update({
      where: { obligationId },
      data: {
        state: "DISPUTED",
        disputeCondition: reason,
      },
    });
    logger.info("[obligation-graph] obligation DISPUTED", {
      obligationId,
      reason,
    });
    return updated as ObligationNodeRow;
  } catch (err) {
    logger.error("[obligation-graph] disputeObligation failed", {
      error: String(err),
      obligationId,
    });
    return null;
  }
}

/**
 * Get a single obligation by its obligationId. Returns null if not found.
 */
export async function getObligation(
  obligationId: string,
): Promise<ObligationNodeRow | null> {
  if (!obligationId) return null;
  try {
    const row = await db.obligationNode.findUnique({
      where: { obligationId },
    });
    return (row as ObligationNodeRow) || null;
  } catch (err) {
    logger.error("[obligation-graph] getObligation failed", {
      error: String(err),
      obligationId,
    });
    return null;
  }
}
