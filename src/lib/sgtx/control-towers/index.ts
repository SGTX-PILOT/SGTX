// @ts-nocheck
// =============================================================================
// SGTX v17 §20.121-20.126 — Control Towers
// =============================================================================
// Six read-only observability towers over the global trade estate:
//   1. Global Trade Control Tower   — top-level trade overview
//   2. RoRo Control Tower            — RoRo vessel / rolling-cargo tracking
//   3. Air Control Tower             — air cargo tracking
//   4. Road Control Tower            — international road corridor tracking
//   5. Ocean Control Tower           — ocean container tracking
//   6. Multimodal Control Tower      — multimodal shipment tracking
//
// All queries are READ-ONLY aggregates — no mutations, no DB writes. Each
// metric function takes an already-fetched dataset (so the route handlers
// stay thin and the lib is unit-testable without a DB). Routes are responsible
// for the actual Prisma queries.
//
// Health bands (v17 §20.124): GREEN (healthy) / YELLOW (warning) /
//   ORANGE (degraded) / RED (critical). Pure thresholds on numeric inputs;
//   the route layer is free to override (e.g. RED if any critical incident
//   is open).
// =============================================================================

import type { PrismaClient } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────

export type HealthBand = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface GlobalTradeMetrics {
  activeTrades: number;
  totalValueUsd: number;
  byStatus: Record<string, number>;
  byCorridor: { corridor: string; count: number; valueUsd: number }[];
  byMode: Record<string, number>;
  healthSummary: Record<HealthBand, number>;
}

export interface RoRoMetrics {
  activeVessels: number;
  vehiclesInTransit: number;
  nextDepartures: {
    vessel: string;
    route: string;
    etd: string | null;
    eta: string | null;
    availableSlots: number;
  }[];
  portCongestion: {
    port: string;
    congestionLevel: HealthBand;
    avgDwellHours: number;
  }[];
}

export interface AirMetrics {
  activeFlights: number;
  cargoInTransit: number;
  airportCongestion: {
    airport: string;
    congestionLevel: HealthBand;
    openIrregularities: number;
  }[];
  nextDepartures: {
    flight: string;
    origin: string;
    dest: string;
    etd: string | null;
    eta: string | null;
  }[];
}

export interface RoadMetrics {
  activeTrips: number;
  trucksInTransit: number;
  borderCrossings: {
    crossing: string;
    waitHours: number;
    queueLength: number;
  }[];
  corridorStatus: {
    corridor: string;
    status: HealthBand;
    avgTransitHours: number;
  }[];
}

export interface OceanMetrics {
  activeVessels: number;
  containersInTransit: number;
  portCongestion: {
    port: string;
    congestionLevel: HealthBand;
    berthWaitHours: number;
  }[];
  vesselSchedule: {
    vessel: string;
    voyage: string;
    origin: string;
    dest: string;
    eta: string | null;
  }[];
}

export interface MultimodalMetrics {
  activeShipments: number;
  modeTransitions: {
    shipment: string;
    fromMode: string;
    toMode: string;
    location: string;
    timestamp: string | null;
  }[];
  bottlenecks: {
    location: string;
    type: string;
    severity: HealthBand;
    affectedShipments: number;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ACTIVE_TRADE_STATUSES = new Set([
  "INITIATED",
  "QUOTED",
  "BUYER_AMENDED",
  "COUNTER_OFFERED",
  "NEGOTIATING",
  "CONTRACT_SIGNED",
  "IN_EXECUTION",
]);

const IN_TRANSIT_SHIPMENT_STATUSES = new Set([
  "PLANNED",
  "LOADED",
  "DEPARTED",
  "IN_TRANSIT",
]);

/** Map a numeric congestion index (0..100) to a health band. */
export function congestionBand(idx: number): HealthBand {
  if (idx < 20) return "GREEN";
  if (idx < 50) return "YELLOW";
  if (idx < 75) return "ORANGE";
  return "RED";
}

/** Map a port wait-time (hours) to a health band. */
export function dwellBand(hours: number): HealthBand {
  if (hours < 6) return "GREEN";
  if (hours < 18) return "YELLOW";
  if (hours < 48) return "ORANGE";
  return "RED";
}

/** Map a trade health score (0..100) to a health band. */
export function tradeHealthBand(score: number): HealthBand {
  if (score >= 80) return "GREEN";
  if (score >= 60) return "YELLOW";
  if (score >= 40) return "ORANGE";
  return "RED";
}

function corridorKey(origin: string, dest: string): string {
  if (!origin || !dest) return "Unknown";
  return `${origin} → ${dest}`;
}

// ── 1. Global Trade Control Tower ──────────────────────────────────────────

/**
 * Aggregate the top-level trade overview.
 * `trades` is the array of Trade rows (with at least `status`, `tradeValueUsd`,
 * `originPort`, `destPort`, `originCountry`, `destCountry`, `transportMode`,
 * `healthScore`).
 */
export function getGlobalTradeMetrics(trades: any[]): GlobalTradeMetrics {
  const byStatus: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  const corridorMap: Record<string, { count: number; valueUsd: number }> = {};
  const healthSummary: Record<HealthBand, number> = {
    GREEN: 0, YELLOW: 0, ORANGE: 0, RED: 0,
  };

  let activeTrades = 0;
  let totalValueUsd = 0;

  for (const t of trades) {
    const status = t.status || "UNKNOWN";
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (ACTIVE_TRADE_STATUSES.has(status)) {
      activeTrades++;
    }

    const value = Number(t.tradeValueUsd || 0);
    totalValueUsd += value;

    const mode = t.transportMode || (t.coldChain ? "REEFER" : "UNKNOWN");
    byMode[mode] = (byMode[mode] || 0) + 1;

    const corridor = corridorKey(
      t.originPort || t.originCountry || "?",
      t.destPort || t.destCountry || "?",
    );
    if (!corridorMap[corridor]) corridorMap[corridor] = { count: 0, valueUsd: 0 };
    corridorMap[corridor].count++;
    corridorMap[corridor].valueUsd += value;

    const band = tradeHealthBand(Number(t.healthScore ?? 85));
    healthSummary[band]++;
  }

  const byCorridor = Object.entries(corridorMap)
    .map(([corridor, v]) => ({ corridor, count: v.count, valueUsd: Math.round(v.valueUsd) }))
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 15);

  return {
    activeTrades,
    totalValueUsd: Math.round(totalValueUsd),
    byStatus,
    byCorridor,
    byMode,
    healthSummary,
  };
}

// ── 2. RoRo Control Tower ───────────────────────────────────────────────────

/**
 * `vessels`      — array of RoRoVesselSchedule (with vesselName, departurePort,
 *                  arrivalPort, etd, eta, availableSlots, status).
 * `shipments`    — array of RoRoShipment (with totalUnits, status).
 * `portStatuses` — array of PortRealtimeStatus (for RoRo ramp congestion).
 */
export function getRoRoMetrics(
  vessels: any[],
  shipments: any[],
  portStatuses: any[],
): RoRoMetrics {
  const now = Date.now();
  const upcoming = vessels
    .filter((v) => {
      if (!v.etd) return false;
      const etd = new Date(v.etd).getTime();
      return etd >= now - 24 * 3600 * 1000; // include departures within last 24h
    })
    .sort((a, b) => new Date(a.etd).getTime() - new Date(b.etd).getTime())
    .slice(0, 10);

  const nextDepartures = upcoming.map((v) => ({
    vessel: v.vesselName || "—",
    route: corridorKey(v.departurePort || "?", v.arrivalPort || "?"),
    etd: v.etd ? new Date(v.etd).toISOString() : null,
    eta: v.eta ? new Date(v.eta).toISOString() : null,
    availableSlots: Number(v.availableSlots ?? 0),
  }));

  const activeVessels = vessels.filter((v) =>
    ["SCHEDULED", "DEPARTED", "IN_PORT", "LOADING", "DISCHARGING"].includes(v.status || ""),
  ).length;

  const inTransitShipments = shipments.filter((s) =>
    ["BOOKED", "IN_TRANSIT", "LOADED"].includes(s.status || ""),
  );
  const vehiclesInTransit = inTransitShipments.reduce(
    (sum, s) => sum + Number(s.totalUnits ?? 0),
    0,
  );

  // RoRo port congestion — prefer RoRo ramp availability + congestion index.
  const portCongestion = portStatuses
    .filter((p) => p.roroRampOperational !== false || p.congestionIndex > 0)
    .slice(0, 12)
    .map((p) => {
      const idx = Number(p.congestionIndex ?? 0);
      const dwell = Number(p.avgWaitHours ?? 0);
      const rampDown = p.roroRampOperational === false;
      const band = rampDown
        ? "RED"
        : idx >= 75 || dwell >= 48
          ? "RED"
          : idx >= 50 || dwell >= 18
            ? "ORANGE"
            : idx >= 20 || dwell >= 6
              ? "YELLOW"
              : "GREEN";
      return {
        port: p.portUnlocode,
        congestionLevel: band as HealthBand,
        avgDwellHours: Math.round(dwell * 10) / 10,
      };
    });

  return {
    activeVessels,
    vehiclesInTransit,
    nextDepartures,
    portCongestion,
  };
}

// ── 3. Air Control Tower ────────────────────────────────────────────────────

/**
 * `flightLegs`     — array of AirFlightLeg (with flightNumber, originAirport,
 *                    destinationAirport, scheduledDeparture, scheduledArrival,
 *                    status).
 * `shipments`     — array of AirCargoShipment (with totalPieces, bookingStatus,
 *                    cargoStatus).
 * `irregularities`— array of AirIrregularity (with airport, status, severity).
 */
export function getAirMetrics(
  flightLegs: any[],
  shipments: any[],
  irregularities: any[],
): AirMetrics {
  const now = Date.now();
  const upcoming = flightLegs
    .filter((l) => {
      if (!l.scheduledDeparture && !l.estimatedDeparture) return false;
      const dep = new Date(l.estimatedDeparture || l.scheduledDeparture).getTime();
      return dep >= now - 24 * 3600 * 1000;
    })
    .sort((a, b) =>
      new Date(a.estimatedDeparture || a.scheduledDeparture).getTime() -
      new Date(b.estimatedDeparture || b.scheduledDeparture).getTime(),
    )
    .slice(0, 10);

  const nextDepartures = upcoming.map((l) => ({
    flight: l.flightNumber || "—",
    origin: l.originAirport || "—",
    dest: l.destinationAirport || "—",
    etd: l.estimatedDeparture || l.scheduledDeparture
      ? new Date(l.estimatedDeparture || l.scheduledDeparture).toISOString()
      : null,
    eta: l.estimatedArrival || l.scheduledArrival
      ? new Date(l.estimatedArrival || l.scheduledArrival).toISOString()
      : null,
  }));

  const activeFlights = flightLegs.filter((l) =>
    ["SCHEDULED", "BOARDING", "DEPARTED", "AIRBORNE", "DIVERTED"].includes(l.status || ""),
  ).length;

  const cargoInTransit = shipments
    .filter((s) =>
      ["CONFIRMED", "ACCEPTED", "BOOKED", "DEPARTED", "IN_TRANSIT", "ARRIVED"].includes(
        s.bookingStatus || s.cargoStatus || "",
      ),
    )
    .reduce((sum, s) => sum + Number(s.totalPieces ?? 0), 0);

  // Airport congestion — count OPEN irregularities per airport.
  const byAirport: Record<string, { open: number; critical: number; high: number }> = {};
  for (const i of irregularities) {
    if (i.status === "RESOLVED") continue;
    const ap = i.airport || "UNKNOWN";
    if (!byAirport[ap]) byAirport[ap] = { open: 0, critical: 0, high: 0 };
    byAirport[ap].open++;
    if (i.severity === "CRITICAL") byAirport[ap].critical++;
    else if (i.severity === "HIGH") byAirport[ap].high++;
  }
  const airportCongestion = Object.entries(byAirport)
    .map(([airport, v]) => {
      const band = v.critical > 0 ? "RED"
        : v.high >= 3 || v.open >= 5 ? "ORANGE"
        : v.open >= 1 ? "YELLOW"
        : "GREEN";
      return {
        airport,
        congestionLevel: band as HealthBand,
        openIrregularities: v.open,
      };
    })
    .sort((a, b) => b.openIrregularities - a.openIrregularities)
    .slice(0, 12);

  return {
    activeFlights,
    cargoInTransit,
    airportCongestion,
    nextDepartures,
  };
}

// ── 4. Road Control Tower ───────────────────────────────────────────────────

/**
 * `corridors`    — array of RoadCorridor (with corridorCode, status,
 *                  plannedDeparture, plannedArrival, routeDuration, legs).
 * `customsOps`   — array of CustomsOperation (with country, border, status,
 *                  submissionTime, acceptanceTime, releaseTime).
 * `incidents`   — array of RoadIncident (with severity, status).
 */
export function getRoadMetrics(
  corridors: any[],
  customsOps: any[],
  incidents: any[],
): RoadMetrics {
  const activeTrips = corridors.filter((c) =>
    ["ACTIVE", "DISPATCHED", "IN_TRANSIT", "DEPARTED"].includes(c.status || ""),
  ).length;

  // Trucks in transit — count distinct vehicles across active corridor legs.
  const trucksInTransit = corridors
    .filter((c) => Array.isArray(c.legs))
    .flatMap((c) => c.legs)
    .filter((l) =>
      ["DISPATCHED", "IN_TRANSIT", "AT_BORDER", "DEPARTED", "ARRIVED"].includes(l.status || ""),
    )
    .filter((l, idx, arr) => {
      // distinct by vehicleId
      const vid = l.vehicleId || `leg-${l.id}`;
      return arr.findIndex((x) => (x.vehicleId || `leg-${x.id}`) === vid) === idx;
    })
    .length;

  // Border crossings — aggregate OPEN customs operations by border, infer
  // wait hours from submission→now (or release→submission if already released).
  const byBorder: Record<string, { waitHours: number; queue: number }> = {};
  for (const op of customsOps) {
    if (!op.border && !op.customsOffice) continue;
    const key = op.border || op.customsOffice;
    if (!byBorder[key]) byBorder[key] = { waitHours: 0, queue: 0 };
    if (["HOLD", "INSPECTION", "SUBMITTED", "DRAFT"].includes(op.status || "")) {
      byBorder[key].queue++;
      if (op.submissionTime) {
        const end = op.releaseTime ? new Date(op.releaseTime).getTime() : Date.now();
        const wait = Math.max(0, (end - new Date(op.submissionTime).getTime()) / 3600000);
        byBorder[key].waitHours += wait;
      }
    }
  }
  const borderCrossings = Object.entries(byBorder)
    .map(([crossing, v]) => ({
      crossing,
      waitHours: v.queue > 0 ? Math.round((v.waitHours / v.queue) * 10) / 10 : Math.round(v.waitHours * 10) / 10,
      queueLength: v.queue,
    }))
    .filter((b) => b.queueLength > 0)
    .sort((a, b) => b.waitHours - a.waitHours)
    .slice(0, 12);

  // Corridor status — health per corridor based on route duration vs incidents.
  const openIncidentsByCorridor: Record<string, { critical: number; high: number; open: number }> = {};
  for (const inc of incidents) {
    if (inc.status === "RESOLVED") continue;
    const cid = inc.corridorId || "—";
    if (!openIncidentsByCorridor[cid]) openIncidentsByCorridor[cid] = { critical: 0, high: 0, open: 0 };
    openIncidentsByCorridor[cid].open++;
    if (inc.severity === "CRITICAL") openIncidentsByCorridor[cid].critical++;
    else if (inc.severity === "HIGH") openIncidentsByCorridor[cid].high++;
  }
  const corridorStatus = corridors.slice(0, 15).map((c) => {
    const incidents = openIncidentsByCorridor[c.id] || { critical: 0, high: 0, open: 0 };
    const band = incidents.critical > 0 ? "RED"
      : incidents.high >= 2 || incidents.open >= 5 ? "ORANGE"
      : incidents.open >= 1 ? "YELLOW"
      : c.status === "BLOCKED" || c.status === "CANCELLED" ? "RED"
      : c.status === "DELAYED" ? "YELLOW"
      : "GREEN";
    return {
      corridor: c.corridorCode || "—",
      status: band as HealthBand,
      avgTransitHours: Number(c.routeDuration ?? 0),
    };
  });

  return {
    activeTrips,
    trucksInTransit,
    borderCrossings,
    corridorStatus,
  };
}

// ── 5. Ocean Control Tower ──────────────────────────────────────────────────

/**
 * `schedules`    — array of ShippingSchedule (with vesselName, voyageNumber,
 *                  originPort, destinationPort, etd, eta, status, available).
 * `shipments`    — array of Shipment (with transportMode='SEA', status,
 *                  containerCount).
 * `portStatuses` — array of PortRealtimeStatus (for berth congestion).
 */
export function getOceanMetrics(
  schedules: any[],
  shipments: any[],
  portStatuses: any[],
): OceanMetrics {
  const now = Date.now();

  // Active vessels — schedules not yet arrived at destination.
  const activeVessels = schedules.filter((s) => {
    if (!["SCHEDULED", "DEPARTED", "IN_TRANSIT"].includes(s.status || "")) return false;
    return true;
  }).length;

  // Containers in transit — sea-mode shipments that haven't arrived.
  const seaShipments = shipments.filter((s) =>
    (s.transportMode || "SEA") === "SEA" &&
    IN_TRANSIT_SHIPMENT_STATUSES.has(s.status || ""),
  );
  const containersInTransit = seaShipments.reduce(
    (sum, s) => sum + Number(s.containerCount ?? 1),
    0,
  );

  // Vessel schedule — upcoming arrivals (next 14d), sorted by ETA.
  const vesselSchedule = schedules
    .filter((s) => {
      if (!s.eta) return false;
      const eta = new Date(s.eta).getTime();
      return eta >= now - 24 * 3600 * 1000 && eta <= now + 14 * 24 * 3600 * 1000;
    })
    .sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime())
    .slice(0, 12)
    .map((s) => ({
      vessel: s.vesselName || "—",
      voyage: s.voyageNumber || "—",
      origin: s.originPort || s.originPortCode || "—",
      dest: s.destinationPort || s.destinationPortCode || "—",
      eta: s.eta ? new Date(s.eta).toISOString() : null,
    }));

  // Port congestion — berth availability + wait hours.
  const portCongestion = portStatuses
    .slice(0, 12)
    .map((p) => {
      const dwell = Number(p.avgWaitHours ?? 0);
      const idx = Number(p.congestionIndex ?? 0);
      const berthDown = p.berthAvailability === "NONE" || p.berthAvailability === "CRITICAL";
      const band = berthDown
        ? "RED"
        : idx >= 75 || dwell >= 48
          ? "RED"
          : idx >= 50 || dwell >= 18
            ? "ORANGE"
            : idx >= 20 || dwell >= 6
              ? "YELLOW"
              : "GREEN";
      return {
        port: p.portUnlocode,
        congestionLevel: band as HealthBand,
        berthWaitHours: Math.round(dwell * 10) / 10,
      };
    });

  return {
    activeVessels,
    containersInTransit,
    portCongestion,
    vesselSchedule,
  };
}

// ── 6. Multimodal Control Tower ─────────────────────────────────────────────

/**
 * `shipments` — array of Shipment (with transportMode='MULTIMODAL' or
 *               parentShipmentId set), plus legSequence / parentShipmentId /
 *               status / originPort / destPort / etd / eta.
 */
export function getMultimodalMetrics(shipments: any[]): MultimodalMetrics {
  // Active multimodal shipments = those with MULTIMODAL mode OR a parent link
  // AND not yet delivered.
  const multimodal = shipments.filter((s) =>
    s.transportMode === "MULTIMODAL" || !!s.parentShipmentId,
  );
  const active = multimodal.filter((s) =>
    IN_TRANSIT_SHIPMENT_STATUSES.has(s.status || "") ||
    s.status === "ARRIVED" || s.status === "DEPARTED",
  );

  // Mode transitions — derive from legSequence chains: a leg whose
  // parentShipmentId is set + whose transportMode differs from the parent's
  // transportMode counts as a transition.
  const byParent: Record<string, any[]> = {};
  for (const s of shipments) {
    if (!s.parentShipmentId) continue;
    if (!byParent[s.parentShipmentId]) byParent[s.parentShipmentId] = [];
    byParent[s.parentShipmentId].push(s);
  }
  const parentById: Record<string, any> = {};
  for (const s of shipments) {
    if (s.id) parentById[s.id] = s;
  }

  const modeTransitions: MultimodalMetrics["modeTransitions"] = [];
  for (const [parentId, legs] of Object.entries(byParent)) {
    const parent = parentById[parentId];
    if (!parent) continue;
    const sortedLegs = legs.sort((a, b) => (a.legSequence ?? 1) - (b.legSequence ?? 1));
    let prevMode = parent.transportMode || "MULTIMODAL";
    let prevLoc = parent.originPort || parent.destPort || "?";
    for (const leg of sortedLegs) {
      const mode = leg.transportMode || "MULTIMODAL";
      if (mode !== prevMode) {
        modeTransitions.push({
          shipment: parent.ustn || parentId,
          fromMode: prevMode,
          toMode: mode,
          location: leg.originPort || prevLoc || "?",
          timestamp: leg.etd ? new Date(leg.etd).toISOString() : null,
        });
      }
      prevMode = mode;
      prevLoc = leg.destPort || prevLoc;
    }
  }

  // Bottlenecks — aggregate active shipments at congested ports (any leg in
  // ARRIVED state but not yet RELEASED/DELIVERED, grouped by port).
  const byPort: Record<string, number> = {};
  for (const s of active) {
    if (s.status === "ARRIVED" && !s.releasedAt) {
      const port = s.destPort || "?";
      byPort[port] = (byPort[port] || 0) + 1;
    }
  }
  const bottlenecks: MultimodalMetrics["bottlenecks"] = Object.entries(byPort)
    .map(([location, count]) => ({
      location,
      type: "PORT_DWELL",
      severity: (count >= 5 ? "RED" : count >= 3 ? "ORANGE" : "YELLOW") as HealthBand,
      affectedShipments: count,
    }))
    .sort((a, b) => b.affectedShipments - a.affectedShipments)
    .slice(0, 10);

  return {
    activeShipments: active.length,
    modeTransitions: modeTransitions.slice(0, 25),
    bottlenecks,
  };
}

// ── Convenience: aggregate everything in one call ────────────────────────────

export interface UnifiedControlTower {
  global: GlobalTradeMetrics;
  roro: RoRoMetrics;
  air: AirMetrics;
  road: RoadMetrics;
  ocean: OceanMetrics;
  multimodal: MultimodalMetrics;
  lastUpdated: string;
}

/**
 * Run all six towers against the database. Convenience wrapper — the route
 * handler may instead call the six individual functions directly if it
 * prefers custom parallelism.
 */
export async function buildUnifiedControlTower(db: PrismaClient): Promise<UnifiedControlTower> {
  const now = new Date().toISOString();
  const sinceMs = Date.now() - 30 * 24 * 3600 * 1000;

  const [
    trades,
    roroVessels,
    roroShipments,
    airFlightLegs,
    airShipments,
    airIrregularities,
    roadCorridors,
    roadCustomsOps,
    roadIncidents,
    oceanSchedules,
    oceanShipments,
    portStatuses,
    multimodalShipments,
  ] = await Promise.all([
    db.trade.findMany({
      where: { createdAt: { gte: new Date(sinceMs) } },
      take: 5000,
    }),
    db.roRoVesselSchedule.findMany({ take: 500, orderBy: { etd: "asc" } }),
    db.roRoShipment.findMany({ take: 2000, orderBy: { createdAt: "desc" } }),
    db.airFlightLeg.findMany({ take: 2000, orderBy: { scheduledDeparture: "asc" } }),
    db.airCargoShipment.findMany({ take: 2000, orderBy: { createdAt: "desc" } }),
    db.airIrregularity.findMany({
      where: { status: { not: "RESOLVED" } },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    db.roadCorridor.findMany({
      include: { legs: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    db.customsOperation.findMany({
      where: { status: { in: ["HOLD", "INSPECTION", "SUBMITTED", "DRAFT"] } },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    db.roadIncident.findMany({
      where: { status: { not: "RESOLVED" } },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    db.shippingSchedule.findMany({ take: 1000, orderBy: { etd: "asc" } }),
    db.shipment.findMany({
      where: { OR: [{ transportMode: "SEA" }, { transportMode: "MULTIMODAL" }] },
      take: 5000,
      orderBy: { createdAt: "desc" },
    }),
    db.portRealtimeStatus.findMany({ take: 200 }),
    db.shipment.findMany({
      where: {
        OR: [
          { transportMode: "MULTIMODAL" },
          { parentShipmentId: { not: null } },
        ],
      },
      take: 2000,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Ocean tower needs sea-only shipments; multimodal tower needs multimodal
  // shipments (which may include sea legs in the chain). We pass both.
  const seaShipments = oceanShipments.filter((s) => (s.transportMode || "SEA") === "SEA");

  return {
    global: getGlobalTradeMetrics(trades),
    roro: getRoRoMetrics(roroVessels, roroShipments, portStatuses),
    air: getAirMetrics(airFlightLegs, airShipments, airIrregularities),
    road: getRoadMetrics(roadCorridors, roadCustomsOps, roadIncidents),
    ocean: getOceanMetrics(oceanSchedules, seaShipments, portStatuses),
    multimodal: getMultimodalMetrics(multimodalShipments),
    lastUpdated: now,
  };
}
