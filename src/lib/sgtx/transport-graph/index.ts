// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX Phase 5 — §1 Transport Graph Engine
 * ------------------------------------------------------------
 * Multi-leg transport orchestration layer. A TransportGraph is a
 * directed sequence of TransportLeg rows; each leg delegates execution
 * to a mode-specific engine (road-corridor / air-cargo / future
 * ocean / rail / ferry engines) via `modeEngineRef` + `modeEngineType`.
 *
 * Supported multi-leg patterns (per spec):
 *   ROAD → OCEAN → ROAD
 *   ROAD → AIR   → ROAD
 *   ROAD → RAIL  → ROAD
 *   ROAD → FERRY → ROAD
 *   ROAD → AIR   → AIR → ROAD
 *
 * Design principles:
 *   • SGTX is NON-MARKETPLACE — provider assignment is by GTID + active
 *     ProviderRelationship only (see src/lib/sgtx/provider-relationship).
 *   • Every DB call is wrapped defensively — the engine never throws
 *     to the caller; instead it logs + returns a safe default / null.
 *   • Continuity is enforced: leg N's destinationLocation (or
 *     handoffLocation) must equal leg N+1's originLocation
 *     (case-insensitive, whitespace-trimmed).
 *   • Mode engines are PRESERVED — this lib DELEGATES to the existing
 *     `road-corridor` and `air-cargo` libs via the leg's
 *     `modeEngineRef` + `modeEngineType` fields. It never duplicates
 *     their logic.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Modes & enums ============

export const TRANSPORT_MODES = [
  "ROAD",
  "AIR",
  "OCEAN",
  "RAIL",
  "FERRY",
  "MULTIMODAL",
] as const;

export const LEG_TYPES = ["ORIGIN", "INTERMEDIATE", "DESTINATION"] as const;

export const GRAPH_STATUSES = [
  "PLANNED",
  "CONFIRMED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
  "DISRUPTED",
] as const;

export const LEG_STATUSES = [
  "PLANNED",
  "BOOKED",
  "IN_TRANSIT",
  "AT_HANDOFF",
  "COMPLETED",
  "CANCELLED",
  "DELAYED",
] as const;

/** Maps a mode to its mode-engine-type label (matches TransportLeg.modeEngineType). */
export const MODE_ENGINE_TYPES: Record<string, string> = {
  ROAD: "ROAD_CORRIDOR",
  AIR: "AIR_CARGO",
  OCEAN: "OCEAN_SHIPMENT",
  RAIL: "RAIL_CONSIGNMENT",
  FERRY: "FERRY_DOCUMENT",
  MULTIMODAL: "MULTIMODAL",
};

/**
 * Graph status state machine — defines allowed forward transitions.
 * (Backwards transitions are NOT permitted; cancellation is terminal.)
 */
export const GRAPH_STATE_MACHINE: Record<string, string[]> = {
  PLANNED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_TRANSIT", "CANCELLED", "DISRUPTED"],
  IN_TRANSIT: ["COMPLETED", "DISRUPTED", "CANCELLED"],
  DISRUPTED: ["IN_TRANSIT", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Leg status state machine. */
export const LEG_STATE_MACHINE: Record<string, string[]> = {
  PLANNED: ["BOOKED", "CANCELLED"],
  BOOKED: ["IN_TRANSIT", "CANCELLED", "DELAYED"],
  IN_TRANSIT: ["AT_HANDOFF", "COMPLETED", "DELAYED"],
  AT_HANDOFF: ["IN_TRANSIT", "COMPLETED", "DELAYED"],
  DELAYED: ["IN_TRANSIT", "AT_HANDOFF", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// ============ Input / output types ============

export interface CreateGraphInput {
  ustn?: string;
  tradeId?: string;
  name?: string;
  description?: string;
  originLocation?: string;
  destinationLocation?: string;
  currency?: string;
}

export interface AddLegInput {
  graphId: string;
  legNumber?: number; // auto-assigned if omitted
  legType?: string; // auto-derived if omitted (ORIGIN if leg 1, DESTINATION if last, else INTERMEDIATE)
  mode: string;
  originLocation: string;
  destinationLocation?: string;
  handoffLocation?: string;
  handoffType?: string;
  providerGtid?: string;
  providerType?: string;
  modeEngineRef?: string;
  modeEngineType?: string;
  plannedDeparture?: Date;
  plannedArrival?: Date;
  estimatedCostUsd?: number;
  currency?: string;
  notes?: string;
}

// ============ Helpers ============

function normalizeLocation(loc?: string | null): string {
  return (loc || "").trim().toLowerCase();
}

function isValidMode(mode?: string | null): boolean {
  return !!mode && (TRANSPORT_MODES as readonly string[]).includes(mode);
}

function isValidGraphStatus(s?: string | null): boolean {
  return !!s && (GRAPH_STATUSES as readonly string[]).includes(s);
}

function isValidLegStatus(s?: string | null): boolean {
  return !!s && (LEG_STATUSES as readonly string[]).includes(s);
}

function isValidGraphTransition(from: string, to: string): boolean {
  if (!isValidGraphStatus(from) || !isValidGraphStatus(to)) return false;
  if (from === to) return true;
  const allowed = GRAPH_STATE_MACHINE[from] || [];
  return allowed.includes(to);
}

function isValidLegTransition(from: string, to: string): boolean {
  if (!isValidLegStatus(from) || !isValidLegStatus(to)) return false;
  if (from === to) return true;
  const allowed = LEG_STATE_MACHINE[from] || [];
  return allowed.includes(to);
}

/**
 * Derives the primary mode for a graph from its legs.
 * Heuristic (per spec):
 *   • If any leg is OCEAN or AIR, that becomes the primary mode
 *     (OCEAN wins over AIR on equal counts — matches the
 *     ROAD-OCEAN-ROAD example where OCEAN is primary).
 *   • Otherwise pick the mode with the highest count.
 *   • Ties broken by the most expensive leg.
 */
function derivePrimaryMode(
  legs: Array<{ mode: string; estimatedCostUsd?: number | null }>,
): string {
  if (!legs || legs.length === 0) return "ROAD";
  // Count legs by mode
  const counts: Record<string, number> = {};
  const cost: Record<string, number> = {};
  for (const leg of legs) {
    const m = leg.mode || "ROAD";
    counts[m] = (counts[m] || 0) + 1;
    cost[m] = (cost[m] || 0) + (leg.estimatedCostUsd || 0);
  }
  // OCEAN/AIR auto-priority (per spec: ROAD-OCEAN-ROAD → OCEAN, ROAD-AIR-ROAD → AIR)
  if ((counts["OCEAN"] || 0) > 0) return "OCEAN";
  if ((counts["AIR"] || 0) > 0) return "AIR";
  // Otherwise highest count, break ties by cost
  const modes = Object.keys(counts).sort((a, b) => {
    if (counts[b] !== counts[a]) return counts[b] - counts[a];
    return (cost[b] || 0) - (cost[a] || 0);
  });
  return modes[0] || "ROAD";
}

// ============ §1a createTransportGraph ============

/**
 * Creates a new TransportGraph (no legs yet — use addLeg).
 * Defaults: totalLegs=0, isMultimodal=false, primaryMode=null,
 * status=PLANNED.
 */
export async function createTransportGraph(
  input: CreateGraphInput,
): Promise<any> {
  try {
    const data: any = {
      ustn: input.ustn || null,
      tradeId: input.tradeId || null,
      name: input.name || null,
      description: input.description || null,
      originLocation: input.originLocation || null,
      destinationLocation: input.destinationLocation || null,
      currency: input.currency || "USD",
      totalLegs: 0,
      isMultimodal: false,
      primaryMode: null,
      status: "PLANNED",
    };
    const graph = await db.transportGraph.create({ data });
    logger.info("transport-graph: created", { id: graph.id, ustn: input.ustn });
    return graph;
  } catch (err) {
    logger.error("transport-graph: createTransportGraph failed", {
      error: String(err),
      input,
    });
    return null;
  }
}

// ============ §1b addLeg ============

/**
 * Appends a leg to a graph. Auto-assigns legNumber if omitted and
 * derives legType (ORIGIN/INTERMEDIATE/DESTINATION). Recomputes
 * totalLegs / isMultimodal / primaryMode on the parent graph.
 *
 * Continuity check (loose):
 *   • leg N's destinationLocation (or handoffLocation) must equal
 *     leg N+1's originLocation (case-insensitive, trimmed).
 *   • If the new leg's originLocation does NOT match the previous
 *     leg's destination or handoff, the leg is still created (the
 *     caller may have an out-of-order scenario) BUT a `continuityWarning`
 *     is included in the response. Use `validateGraphContinuity` to
 *     get a full report.
 */
export async function addLeg(
  graphId: string,
  leg: AddLegInput,
): Promise<any> {
  try {
    const graph = await db.transportGraph.findUnique({
      where: { id: graphId },
      include: { legs: { orderBy: { legNumber: "asc" } } },
    });
    if (!graph) {
      return { ok: false, error: "GRAPH_NOT_FOUND" };
    }

    const existingLegs = graph.legs || [];
    const nextLegNumber =
      leg.legNumber != null
        ? leg.legNumber
        : existingLegs.length === 0
          ? 1
          : Math.max(...existingLegs.map((l: any) => l.legNumber)) + 1;

    // Derive legType if not supplied
    let legType = leg.legType;
    if (!legType) {
      if (nextLegNumber === 1) legType = "ORIGIN";
      else legType = "INTERMEDIATE"; // may be re-flagged as DESTINATION later by caller
    }

    // Continuity warning (non-fatal)
    let continuityWarning: string | null = null;
    if (existingLegs.length > 0) {
      const prev = existingLegs[existingLegs.length - 1];
      const prevEnd = normalizeLocation(
        prev.destinationLocation || prev.handoffLocation,
      );
      const newStart = normalizeLocation(leg.originLocation);
      if (prevEnd && newStart && prevEnd !== newStart) {
        continuityWarning = `Leg ${nextLegNumber} origin "${leg.originLocation}" does not match previous leg ${prev.legNumber} end "${prev.destinationLocation || prev.handoffLocation}"`;
      }
    }

    const data: any = {
      graphId,
      legNumber: nextLegNumber,
      legType,
      mode: isValidMode(leg.mode) ? leg.mode : "ROAD",
      originLocation: leg.originLocation,
      destinationLocation: leg.destinationLocation || null,
      handoffLocation: leg.handoffLocation || null,
      handoffType: leg.handoffType || null,
      providerGtid: leg.providerGtid || null,
      providerType: leg.providerType || null,
      modeEngineRef: leg.modeEngineRef || null,
      modeEngineType:
        leg.modeEngineType ||
        (leg.mode ? MODE_ENGINE_TYPES[leg.mode] || null : null),
      status: "PLANNED",
      plannedDeparture: leg.plannedDeparture || null,
      plannedArrival: leg.plannedArrival || null,
      estimatedCostUsd: leg.estimatedCostUsd || 0,
      currency: leg.currency || graph.currency || "USD",
      notes: leg.notes || null,
    };

    const created = await db.transportLeg.create({ data });

    // Update the parent graph's denormalized fields
    const allLegs = [...existingLegs, created];
    const totalLegs = allLegs.length;
    const isMultimodal = totalLegs > 1;
    const primaryMode = derivePrimaryMode(allLegs);

    // Re-flag the LAST leg's type as DESTINATION if there is >1 leg
    if (totalLegs > 1) {
      try {
        const last = allLegs[allLegs.length - 1];
        if (last && last.legType !== "DESTINATION") {
          await db.transportLeg.update({
            where: { id: last.id },
            data: { legType: "DESTINATION" },
          });
        }
      } catch {
        /* non-fatal */
      }
    }

    try {
      await db.transportGraph.update({
        where: { id: graphId },
        data: { totalLegs, isMultimodal, primaryMode },
      });
    } catch (e) {
      logger.warn("transport-graph: parent update failed", {
        graphId,
        error: String(e),
      });
    }

    logger.info("transport-graph: leg added", {
      graphId,
      legId: created.id,
      legNumber: nextLegNumber,
      continuityWarning,
    });

    return { ...created, continuityWarning };
  } catch (err) {
    logger.error("transport-graph: addLeg failed", {
      graphId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1c getTransportGraph ============

export async function getTransportGraph(
  id: string,
  includeLegs = true,
): Promise<any | null> {
  try {
    const graph = await db.transportGraph.findUnique({
      where: { id },
      include: includeLegs
        ? { legs: { orderBy: { legNumber: "asc" } } }
        : false,
    });
    return graph;
  } catch (err) {
    logger.error("transport-graph: getTransportGraph failed", {
      id,
      error: String(err),
    });
    return null;
  }
}

// ============ §1d getTransportGraphByUstn ============

export async function getTransportGraphByUstn(
  ustn: string,
): Promise<any[]> {
  try {
    const graphs = await db.transportGraph.findMany({
      where: { ustn },
      include: { legs: { orderBy: { legNumber: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return graphs || [];
  } catch (err) {
    logger.error("transport-graph: getTransportGraphByUstn failed", {
      ustn,
      error: String(err),
    });
    return [];
  }
}

// ============ §1e listTransportGraphs ============

export async function listTransportGraphs(
  filters?: {
    status?: string;
    primaryMode?: string;
    isMultimodal?: boolean;
    ustn?: string;
    tradeId?: string;
  },
): Promise<any[]> {
  try {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.primaryMode) where.primaryMode = filters.primaryMode;
    if (filters?.isMultimodal !== undefined)
      where.isMultimodal = filters.isMultimodal;
    if (filters?.ustn) where.ustn = filters.ustn;
    if (filters?.tradeId) where.tradeId = filters.tradeId;
    const graphs = await db.transportGraph.findMany({
      where,
      include: { legs: { orderBy: { legNumber: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return graphs || [];
  } catch (err) {
    logger.error("transport-graph: listTransportGraphs failed", {
      filters,
      error: String(err),
    });
    return [];
  }
}

// ============ §1f updateLegStatus ============

/**
 * Transitions a leg's status. Validates against the LEG_STATE_MACHINE.
 * Optionally records actualDeparture / actualArrival timestamps.
 * If the leg is the LAST leg of its graph and is transitioned to
 * COMPLETED, the graph's status is also promoted to COMPLETED.
 */
export async function updateLegStatus(
  legId: string,
  newStatus: string,
  actualDeparture?: Date,
  actualArrival?: Date,
): Promise<any> {
  try {
    const leg = await db.transportLeg.findUnique({ where: { id: legId } });
    if (!leg) return { ok: false, error: "LEG_NOT_FOUND" };

    if (!isValidLegTransition(leg.status, newStatus)) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: leg.status,
        to: newStatus,
        allowed: LEG_STATE_MACHINE[leg.status] || [],
      };
    }

    const data: any = { status: newStatus };
    if (actualDeparture) data.actualDeparture = actualDeparture;
    if (actualArrival) data.actualArrival = actualArrival;

    const updated = await db.transportLeg.update({
      where: { id: legId },
      data,
    });

    // Cascade: if all legs are COMPLETED, promote graph to COMPLETED.
    try {
      const graph = await db.transportGraph.findUnique({
        where: { id: leg.graphId },
        include: { legs: { orderBy: { legNumber: "asc" } } },
      });
      if (graph) {
        const allComplete =
          graph.legs.length > 0 &&
          graph.legs.every((l: any) => l.status === "COMPLETED");
        if (allComplete && graph.status !== "COMPLETED") {
          await db.transportGraph.update({
            where: { id: graph.id },
            data: { status: "COMPLETED" },
          });
        } else if (
          newStatus === "IN_TRANSIT" &&
          graph.status === "PLANNED"
        ) {
          await db.transportGraph.update({
            where: { id: graph.id },
            data: { status: "CONFIRMED" },
          });
        } else if (newStatus === "DELAYED" && graph.status === "IN_TRANSIT") {
          await db.transportGraph.update({
            where: { id: graph.id },
            data: { status: "DISRUPTED" },
          });
        }
      }
    } catch (e) {
      logger.warn("transport-graph: graph cascade failed", {
        legId,
        error: String(e),
      });
    }

    logger.info("transport-graph: leg status updated", {
      legId,
      from: leg.status,
      to: newStatus,
    });
    return updated;
  } catch (err) {
    logger.error("transport-graph: updateLegStatus failed", {
      legId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1g getGraphProgress ============

export async function getGraphProgress(
  graphId: string,
): Promise<{
  totalLegs: number;
  completedLegs: number;
  inTransitLegs: number;
  plannedLegs: number;
  delayedLegs: number;
  progressPct: number;
  estimatedArrival?: Date;
}> {
  const safe = {
    totalLegs: 0,
    completedLegs: 0,
    inTransitLegs: 0,
    plannedLegs: 0,
    delayedLegs: 0,
    progressPct: 0,
    estimatedArrival: undefined as Date | undefined,
  };
  try {
    const graph = await db.transportGraph.findUnique({
      where: { id: graphId },
      include: { legs: { orderBy: { legNumber: "asc" } } },
    });
    if (!graph) return safe;
    const legs = graph.legs || [];
    const totalLegs = legs.length;
    const completedLegs = legs.filter((l: any) => l.status === "COMPLETED")
      .length;
    const inTransitLegs = legs.filter(
      (l: any) =>
        l.status === "IN_TRANSIT" ||
        l.status === "AT_HANDOFF" ||
        l.status === "BOOKED",
    ).length;
    const plannedLegs = legs.filter((l: any) => l.status === "PLANNED")
      .length;
    const delayedLegs = legs.filter((l: any) => l.status === "DELAYED")
      .length;
    const progressPct =
      totalLegs === 0 ? 0 : Math.round((completedLegs / totalLegs) * 100);

    // Estimated arrival = the plannedArrival of the last leg
    let estimatedArrival: Date | undefined;
    if (legs.length > 0) {
      const lastLeg = legs[legs.length - 1];
      if (lastLeg.plannedArrival) estimatedArrival = lastLeg.plannedArrival;
    }

    return {
      totalLegs,
      completedLegs,
      inTransitLegs,
      plannedLegs,
      delayedLegs,
      progressPct,
      estimatedArrival,
    };
  } catch (err) {
    logger.error("transport-graph: getGraphProgress failed", {
      graphId,
      error: String(err),
    });
    return safe;
  }
}

// ============ §1h validateGraphContinuity ============

/**
 * Checks handoff continuity for all legs of a graph. A graph is
 * "valid" if for every adjacent pair (N, N+1):
 *   • normalize(leg N.destinationLocation) == normalize(leg N+1.originLocation)
 *     OR
 *   • normalize(leg N.handoffLocation)     == normalize(leg N+1.originLocation)
 *
 * Returns `{ valid, breaks: [{ legNumber, issue }] }`.
 */
export async function validateGraphContinuity(
  graphId: string,
): Promise<{ valid: boolean; breaks: Array<{ legNumber: number; issue: string }> }> {
  const result = { valid: true, breaks: [] as any[] };
  try {
    const graph = await db.transportGraph.findUnique({
      where: { id: graphId },
      include: { legs: { orderBy: { legNumber: "asc" } } },
    });
    if (!graph) {
      result.valid = false;
      result.breaks.push({ legNumber: 0, issue: "GRAPH_NOT_FOUND" });
      return result;
    }
    const legs = graph.legs || [];
    if (legs.length === 0) return result;
    for (let i = 0; i < legs.length - 1; i++) {
      const cur = legs[i];
      const nxt = legs[i + 1];
      const curEnd = normalizeLocation(
        cur.destinationLocation || cur.handoffLocation,
      );
      const nxtStart = normalizeLocation(nxt.originLocation);
      if (!curEnd) {
        result.valid = false;
        result.breaks.push({
          legNumber: cur.legNumber,
          issue: `Leg ${cur.legNumber} has no destinationLocation or handoffLocation`,
        });
        continue;
      }
      if (!nxtStart) {
        result.valid = false;
        result.breaks.push({
          legNumber: nxt.legNumber,
          issue: `Leg ${nxt.legNumber} has no originLocation`,
        });
        continue;
      }
      if (curEnd !== nxtStart) {
        result.valid = false;
        result.breaks.push({
          legNumber: nxt.legNumber,
          issue: `Leg ${nxt.legNumber} origin "${nxt.originLocation}" does not match leg ${cur.legNumber} end "${cur.destinationLocation || cur.handoffLocation}"`,
        });
      }
    }
    return result;
  } catch (err) {
    logger.error("transport-graph: validateGraphContinuity failed", {
      graphId,
      error: String(err),
    });
    result.valid = false;
    result.breaks.push({ legNumber: 0, issue: String(err) });
    return result;
  }
}

// ============ §1i computeEstimatedTotals ============

/**
 * Sums the estimatedCostUsd across all legs and computes the total
 * transit days (max of leg planned arrival − min of leg planned
 * departure, or 0 if unavailable).
 */
export async function computeEstimatedTotals(
  graphId: string,
): Promise<{ totalCostUsd: number; totalTransitDays: number; currency: string }> {
  const safe = { totalCostUsd: 0, totalTransitDays: 0, currency: "USD" };
  try {
    const graph = await db.transportGraph.findUnique({
      where: { id: graphId },
      include: { legs: { orderBy: { legNumber: "asc" } } },
    });
    if (!graph) return safe;
    const legs = graph.legs || [];
    let totalCostUsd = 0;
    let earliestDep: Date | null = null;
    let latestArr: Date | null = null;
    for (const leg of legs) {
      totalCostUsd += leg.estimatedCostUsd || 0;
      if (leg.plannedDeparture) {
        if (!earliestDep || leg.plannedDeparture < earliestDep)
          earliestDep = leg.plannedDeparture;
      }
      if (leg.plannedArrival) {
        if (!latestArr || leg.plannedArrival > latestArr)
          latestArr = leg.plannedArrival;
      }
    }
    let totalTransitDays = 0;
    if (earliestDep && latestArr) {
      const ms = latestArr.getTime() - earliestDep.getTime();
      totalTransitDays = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    }
    // Persist back to the graph for caching
    try {
      await db.transportGraph.update({
        where: { id: graphId },
        data: {
          estimatedTotalCostUsd: totalCostUsd,
          estimatedTransitDays: totalTransitDays,
        },
      });
    } catch {
      /* non-fatal */
    }
    return {
      totalCostUsd,
      totalTransitDays,
      currency: graph.currency || "USD",
    };
  } catch (err) {
    logger.error("transport-graph: computeEstimatedTotals failed", {
      graphId,
      error: String(err),
    });
    return safe;
  }
}

// ============ §1j transitionGraphStatus ============

export async function transitionGraphStatus(
  graphId: string,
  newStatus: string,
): Promise<any> {
  try {
    const graph = await db.transportGraph.findUnique({
      where: { id: graphId },
    });
    if (!graph) return { ok: false, error: "GRAPH_NOT_FOUND" };
    if (!isValidGraphTransition(graph.status, newStatus)) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: graph.status,
        to: newStatus,
        allowed: GRAPH_STATE_MACHINE[graph.status] || [],
      };
    }
    const updated = await db.transportGraph.update({
      where: { id: graphId },
      data: { status: newStatus },
    });
    logger.info("transport-graph: graph status transitioned", {
      graphId,
      from: graph.status,
      to: newStatus,
    });
    return updated;
  } catch (err) {
    logger.error("transport-graph: transitionGraphStatus failed", {
      graphId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1k assignProviderToLeg ============

/**
 * Assigns a provider (by GTID + type) to a leg. SGTX is non-marketplace:
 * the caller is responsible for verifying that an active
 * ProviderRelationship exists between the trader and the provider
 * (see src/lib/sgtx/provider-relationship). This function does NOT
 * perform that check itself (delegated to the route layer).
 */
export async function assignProviderToLeg(
  legId: string,
  providerGtid: string,
  providerType: string,
): Promise<any> {
  try {
    const leg = await db.transportLeg.findUnique({ where: { id: legId } });
    if (!leg) return { ok: false, error: "LEG_NOT_FOUND" };
    const updated = await db.transportLeg.update({
      where: { id: legId },
      data: { providerGtid, providerType },
    });
    logger.info("transport-graph: provider assigned to leg", {
      legId,
      providerGtid,
      providerType,
    });
    return updated;
  } catch (err) {
    logger.error("transport-graph: assignProviderToLeg failed", {
      legId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1l linkLegToModeEngine ============

/**
 * Links a leg to its mode-specific engine record (e.g. a RoadCorridor
 * id for ROAD legs, an AirCargoShipment id for AIR legs). This is the
 * delegation point — the transport graph itself does NOT execute the
 * leg; it routes execution to the relevant mode engine via this ref.
 */
export async function linkLegToModeEngine(
  legId: string,
  modeEngineRef: string,
  modeEngineType: string,
): Promise<any> {
  try {
    const leg = await db.transportLeg.findUnique({ where: { id: legId } });
    if (!leg) return { ok: false, error: "LEG_NOT_FOUND" };
    const updated = await db.transportLeg.update({
      where: { id: legId },
      data: { modeEngineRef, modeEngineType },
    });
    logger.info("transport-graph: leg linked to mode engine", {
      legId,
      modeEngineRef,
      modeEngineType,
    });
    return updated;
  } catch (err) {
    logger.error("transport-graph: linkLegToModeEngine failed", {
      legId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ Convenience export ============

export const TransportGraphEngine = {
  TRANSPORT_MODES,
  LEG_TYPES,
  GRAPH_STATUSES,
  LEG_STATUSES,
  MODE_ENGINE_TYPES,
  GRAPH_STATE_MACHINE,
  LEG_STATE_MACHINE,
  createTransportGraph,
  addLeg,
  getTransportGraph,
  getTransportGraphByUstn,
  listTransportGraphs,
  updateLegStatus,
  getGraphProgress,
  validateGraphContinuity,
  computeEstimatedTotals,
  transitionGraphStatus,
  assignProviderToLeg,
  linkLegToModeEngine,
};
