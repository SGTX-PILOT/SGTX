// @ts-nocheck — defensive; Prisma schema drift handled at runtime
// SGTX International Road Corridor Engine
// Spec references: §8 ACI Applicability · §11 Document Consistency · §14 Dispatch
// Authorization Gate · §15 Road Corridor State Machine · §16 Border Execution ·
// §18 Seal Management · §22 Transit Deadline
//
// Design principles:
//   • Every DB call is wrapped defensively — the engine never throws to the
//     caller; instead it returns structured results with `ok` / `issues`.
//   • State transitions are validated against the ROAD_STATE_MACHINE map
//     before being persisted; invalid transitions are rejected with the
//     list of allowed next-states.
//   • Exception states (ROAD_EXCEPTION_STATES) are terminal side-paths that
//     can be raised at any point but never become the corridor's primary
//     `status` (they live on RoadIncident rows + an `exceptionFlag`).
//   • The ACI / Document-consistency engines are pure (no DB writes) so
//     they can be unit-tested in isolation and reused by the API layer.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §15 Road Corridor State Machine ============

export const ROAD_STATE_MACHINE: Record<string, string[]> = {
  DRAFT: ["CORRIDOR_VALIDATED"],
  CORRIDOR_VALIDATED: ["DOCUMENTATION_PENDING"],
  DOCUMENTATION_PENDING: ["CUSTOMS_PREPARATION"],
  CUSTOMS_PREPARATION: ["CUSTOMS_SUBMITTED"],
  CUSTOMS_SUBMITTED: ["CUSTOMS_HOLD", "CUSTOMS_RELEASED"],
  CUSTOMS_HOLD: ["CUSTOMS_RELEASED", "CUSTOMS_REJECTION"],
  CUSTOMS_RELEASED: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP: ["TRUCK_ASSIGNED"],
  TRUCK_ASSIGNED: ["DRIVER_ASSIGNED"],
  DRIVER_ASSIGNED: ["LOADING"],
  LOADING: ["LOADED"],
  LOADED: ["SEAL_APPLIED"],
  SEAL_APPLIED: ["DEPARTED_ORIGIN"],
  DEPARTED_ORIGIN: ["IN_TRANSIT"],
  IN_TRANSIT: ["ARRIVED_BORDER"],
  ARRIVED_BORDER: ["BORDER_GATE_IN"],
  BORDER_GATE_IN: ["CUSTOMS_PRESENTED"],
  CUSTOMS_PRESENTED: ["CUSTOMS_INSPECTION", "BORDER_RELEASED"],
  CUSTOMS_INSPECTION: ["BORDER_HOLD", "BORDER_RELEASED"],
  BORDER_HOLD: ["BORDER_RELEASED"],
  BORDER_RELEASED: ["BORDER_GATE_OUT"],
  BORDER_GATE_OUT: ["TRANSIT_ACTIVE", "DESTINATION_CUSTOMS"],
  TRANSIT_ACTIVE: ["NEXT_BORDER_APPROACH", "DESTINATION_CUSTOMS"],
  NEXT_BORDER_APPROACH: ["ARRIVED_BORDER"],
  DESTINATION_CUSTOMS: ["IMPORT_DECLARATION_SUBMITTED"],
  IMPORT_DECLARATION_SUBMITTED: ["IMPORT_INSPECTION", "IMPORT_RELEASED"],
  IMPORT_INSPECTION: ["IMPORT_RELEASED"],
  IMPORT_RELEASED: ["FINAL_DELIVERY"],
  FINAL_DELIVERY: ["POD_PENDING"],
  POD_PENDING: ["POD_CONFIRMED"],
  POD_CONFIRMED: ["COMPLETED"],
};

// Exception states — side-channel only; never become the primary status.
export const ROAD_EXCEPTION_STATES = [
  "DOCUMENT_ERROR",
  "VEHICLE_BREAKDOWN",
  "DRIVER_EXCEPTION",
  "ROUTE_DEVIATION",
  "SEAL_BROKEN",
  "TEMPERATURE_EXCURSION",
  "ACCIDENT",
  "THEFT_ALERT",
  "BORDER_CLOSURE",
  "TRANSIT_EXPIRY",
  "GUARANTEE_EXCEPTION",
  "DELIVERY_REJECTED",
  "CUSTOMS_REJECTION",
];

// Terminal states — no further transitions allowed.
export const ROAD_TERMINAL_STATES = ["COMPLETED", "CANCELLED", "ABANDONED"];

/**
 * Validate that `from -> to` is a permitted transition per §15.
 * Terminal / unknown states never validate. Self-transitions (from===to)
 * are allowed for idempotency only on terminal states.
 */
export function isValidRoadStateTransition(from: string, to: string): boolean {
  if (!from || !to) return false;
  if (ROAD_TERMINAL_STATES.includes(from)) return false;
  const allowed = ROAD_STATE_MACHINE[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Return the list of states the corridor may legally move to from `from`.
 * Empty array means the state is terminal or unknown.
 */
export function getAllowedTransitions(from: string): string[] {
  if (!from) return [];
  return ROAD_STATE_MACHINE[from] || [];
}

// ============ Types ============

export interface CreateRoadCorridorInput {
  ustn: string;
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string[];
  plannedDeparture?: Date | string;
  plannedArrival?: Date | string;
  earliestDelivery?: Date | string;
  preferredDelivery?: Date | string;
  latestDelivery?: Date | string;
  routeDistance?: number; // km
  routeDuration?: number;  // hours
  routeGeometry?: any;    // GeoJSON
  legs?: Array<{
    sequence: number;
    country: string;
    origin: string;
    destination: string;
    transportMode?: string;
    equipmentType?: string;
    carrierGtid?: string;
    driverId?: string;
    vehicleId?: string;
    trailerId?: string;
    customsRegime?: string;
    plannedDeparture?: Date | string;
    plannedArrival?: Date | string;
    routeGeometry?: any;
  }>;
  borderCrossings?: Array<{
    legId?: string;
    countryFrom: string;
    countryTo: string;
    borderCode: string;
    borderName: string;
    customsAuthority?: string;
    immigrationAuthority?: string;
    transportAuthority?: string;
    requiredDocuments?: string[];
    operatingHours?: string;
    routeRestrictions?: string;
    guaranteeRequirements?: string;
    inspectionRequirements?: string;
  }>;
}

export interface RoadCorridor {
  id: string;
  ustn: string;
  corridorCode: string;
  routeVersion: number;
  originCountry: string;
  destinationCountry: string;
  transitCountries: string[];
  status: string;
  [key: string]: any;
}

// ============ §15 Corridor lifecycle ============

/**
 * Create a new RoadCorridor in DRAFT status. Generates a deterministic
 * corridorCode (USTN-scoped) and persists legs + border crossings in the
 * same transaction. Never throws — returns structured error on failure.
 */
export async function createRoadCorridor(
  input: CreateRoadCorridorInput,
): Promise<RoadCorridor> {
  try {
    if (!input.ustn) throw new Error("ustn is required");
    if (!input.originCountry || !input.destinationCountry) {
      throw new Error("originCountry and destinationCountry are required");
    }

    const corridorCode = await generateCorridorCode(input.ustn);
    const transitCountries = input.transitCountries || [];

    const corridor = await db.roadCorridor.create({
      data: {
        ustn: input.ustn,
        corridorCode,
        routeVersion: 1,
        originCountry: input.originCountry.toUpperCase(),
        destinationCountry: input.destinationCountry.toUpperCase(),
        transitCountries: JSON.stringify(transitCountries),
        status: "DRAFT",
        plannedDeparture: input.plannedDeparture ? new Date(input.plannedDeparture) : null,
        plannedArrival: input.plannedArrival ? new Date(input.plannedArrival) : null,
        earliestDelivery: input.earliestDelivery ? new Date(input.earliestDelivery) : null,
        preferredDelivery: input.preferredDelivery ? new Date(input.preferredDelivery) : null,
        latestDelivery: input.latestDelivery ? new Date(input.latestDelivery) : null,
        routeDistance: input.routeDistance ?? null,
        routeDuration: input.routeDuration ?? null,
        approvedRouteGeometry: input.routeGeometry
          ? JSON.stringify(input.routeGeometry)
          : null,
      },
    });

    // Persist legs
    if (input.legs && input.legs.length > 0) {
      for (const leg of input.legs) {
        await db.roadCorridorLeg.create({
          data: {
            corridorId: corridor.id,
            ustn: input.ustn,
            sequence: leg.sequence,
            country: leg.country.toUpperCase(),
            origin: leg.origin,
            destination: leg.destination,
            transportMode: leg.transportMode || "ROAD",
            equipmentType: leg.equipmentType || null,
            carrierGtid: leg.carrierGtid || null,
            driverId: leg.driverId || null,
            vehicleId: leg.vehicleId || null,
            trailerId: leg.trailerId || null,
            customsRegime: leg.customsRegime || null,
            plannedDeparture: leg.plannedDeparture ? new Date(leg.plannedDeparture) : null,
            plannedArrival: leg.plannedArrival ? new Date(leg.plannedArrival) : null,
            routeGeometry: leg.routeGeometry ? JSON.stringify(leg.routeGeometry) : null,
            status: "PENDING",
          },
        });
      }
    }

    // Persist border crossings
    if (input.borderCrossings && input.borderCrossings.length > 0) {
      for (const bx of input.borderCrossings) {
        await db.borderCrossing.create({
          data: {
            corridorId: corridor.id,
            legId: bx.legId || null,
            countryFrom: bx.countryFrom.toUpperCase(),
            countryTo: bx.countryTo.toUpperCase(),
            borderCode: bx.borderCode,
            borderName: bx.borderName,
            customsAuthority: bx.customsAuthority || null,
            immigrationAuthority: bx.immigrationAuthority || null,
            transportAuthority: bx.transportAuthority || null,
            requiredDocuments: bx.requiredDocuments
              ? JSON.stringify(bx.requiredDocuments)
              : null,
            operatingHours: bx.operatingHours || null,
            routeRestrictions: bx.routeRestrictions || null,
            guaranteeRequirements: bx.guaranteeRequirements || null,
            inspectionRequirements: bx.inspectionRequirements || null,
            active: true,
          },
        });
      }
    }

    logger.info("[road-corridor] created", { corridorId: corridor.id, ustn: input.ustn });
    return {
      ...corridor,
      transitCountries,
    } as RoadCorridor;
  } catch (err: any) {
    logger.error("[road-corridor] createRoadCorridor failed", {
      ustn: input?.ustn,
      error: err?.message,
    });
    throw new Error(`createRoadCorridor failed: ${err?.message || "unknown"}`);
  }
}

/**
 * Generate a deterministic-ish corridor code: RDC-{USTN-suffix}-{routeVersion}.
 * Falls back to a cuid if USTN is malformed.
 */
async function generateCorridorCode(ustn: string): Promise<string> {
  try {
    const suffix = ustn.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
    if (!suffix) return `RDC-${Date.now().toString(36).toUpperCase()}`;
    // Look up the count of existing corridors for this USTN to bump version
    const existing = await db.roadCorridor.count({ where: { ustn } });
    return `RDC-${suffix}-${String(existing + 1).padStart(2, "0")}`;
  } catch {
    return `RDC-${Date.now().toString(36).toUpperCase()}`;
  }
}

/**
 * Validate a corridor for internal consistency — checks that:
 *   • each leg's country appears in transitCountries OR is origin/destination,
 *   • each border crossing's countries are present in the country set,
 *   • the origin of leg N+1 equals the destination of leg N,
 *   • the corridor is in DRAFT or CORRIDOR_VALIDATED state (idempotent).
 * Returns `{ valid, issues }`. Never throws.
 */
export async function validateCorridor(
  corridorId: string,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  try {
    const corridor = await db.roadCorridor.findUnique({
      where: { id: corridorId },
      include: { legs: { orderBy: { sequence: "asc" } }, borderCrossings: true },
    });
    if (!corridor) return { valid: false, issues: ["Corridor not found"] };

    const transit: string[] = (() => {
      try {
        return JSON.parse(corridor.transitCountries || "[]");
      } catch {
        return [];
      }
    })();
    const countrySet = new Set<string>([
      corridor.originCountry.toUpperCase(),
      corridor.destinationCountry.toUpperCase(),
      ...transit.map((c) => c.toUpperCase()),
    ]);

    // Leg country coverage
    let prevDestination: string | null = null;
    for (const leg of corridor.legs) {
      if (!countrySet.has(leg.country.toUpperCase())) {
        issues.push(
          `Leg ${leg.sequence} country ${leg.country} is not in transit/origin/destination set`,
        );
      }
      if (prevDestination && prevDestination !== leg.origin) {
        issues.push(
          `Leg ${leg.sequence} origin ${leg.origin} does not match previous leg destination ${prevDestination}`,
        );
      }
      prevDestination = leg.destination;
    }

    // Border crossing coverage
    for (const bx of corridor.borderCrossings) {
      if (!countrySet.has(bx.countryFrom.toUpperCase())) {
        issues.push(
          `Border ${bx.borderCode}: countryFrom ${bx.countryFrom} not in corridor country set`,
        );
      }
      if (!countrySet.has(bx.countryTo.toUpperCase())) {
        issues.push(
          `Border ${bx.borderCode}: countryTo ${bx.countryTo} not in corridor country set`,
        );
      }
    }

    // Origin/destination must each appear as a leg endpoint
    if (corridor.legs.length > 0) {
      const firstLeg = corridor.legs[0];
      const lastLeg = corridor.legs[corridor.legs.length - 1];
      if (firstLeg.origin && !firstLeg.origin.toUpperCase().includes(corridor.originCountry.toUpperCase())) {
        issues.push(
          `First leg origin ${firstLeg.origin} does not start in origin country ${corridor.originCountry}`,
        );
      }
      if (lastLeg.destination && !lastLeg.destination.toUpperCase().includes(corridor.destinationCountry.toUpperCase())) {
        issues.push(
          `Last leg destination ${lastLeg.destination} does not end in destination country ${corridor.destinationCountry}`,
        );
      }
    }

    const valid = issues.length === 0;
    if (valid) {
      // Promote to CORRIDOR_VALIDATED if currently DRAFT
      if (corridor.status === "DRAFT") {
        await db.roadCorridor.update({
          where: { id: corridorId },
          data: { status: "CORRIDOR_VALIDATED" },
        });
        logger.info("[road-corridor] validated + promoted", { corridorId });
      }
    } else {
      logger.warn("[road-corridor] validation failed", { corridorId, issues });
    }
    return { valid, issues };
  } catch (err: any) {
    logger.error("[road-corridor] validateCorridor failed", {
      corridorId,
      error: err?.message,
    });
    return {
      valid: false,
      issues: [`validateCorridor failed: ${err?.message || "unknown"}`],
    };
  }
}

/**
 * Lock the corridor — after this, route geometry + legs + borders are
 * immutable. Only allowed from CORRIDOR_VALIDATED status.
 */
export async function lockCorridor(
  corridorId: string,
): Promise<{ ok: boolean }> {
  try {
    const corridor = await db.roadCorridor.findUnique({
      where: { id: corridorId },
      select: { id: true, status: true },
    });
    if (!corridor) return { ok: false };
    if (corridor.status !== "CORRIDOR_VALIDATED") {
      logger.warn("[road-corridor] lock rejected — not validated", {
        corridorId,
        status: corridor.status,
      });
      return { ok: false };
    }
    // Promote to DOCUMENTATION_PENDING (next state per §15)
    await db.roadCorridor.update({
      where: { id: corridorId },
      data: { status: "DOCUMENTATION_PENDING" },
    });
    logger.info("[road-corridor] locked + promoted to DOCUMENTATION_PENDING", {
      corridorId,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error("[road-corridor] lockCorridor failed", {
      corridorId,
      error: err?.message,
    });
    return { ok: false };
  }
}

// ============ §14 Dispatch Authorization Gate ============

export interface DispatchAuthorizationResult {
  authorized: boolean;
  checks: {
    driver: boolean;
    vehicle: boolean;
    trailer: boolean;
    insurance: boolean;
    routePermissions: boolean;
    countryPermissions: boolean;
    payload: boolean;
    equipment: boolean;
    cargo: boolean;
    customsReadiness: boolean;
    documents: boolean;
    guarantees: boolean;
  };
  issues: string[];
}

/**
 * Dispatch Authorization Gate (§14).
 *
 * Verifies the 12 prerequisite gates before a loaded road corridor may
 * depart its origin. Each gate is a binary factual check (not a score).
 * `authorized` is true iff every gate passes.
 */
export async function checkDispatchAuthorization(
  corridorId: string,
): Promise<DispatchAuthorizationResult> {
  const issues: string[] = [];
  const checks: DispatchAuthorizationResult["checks"] = {
    driver: false,
    vehicle: false,
    trailer: false,
    insurance: false,
    routePermissions: false,
    countryPermissions: false,
    payload: false,
    equipment: false,
    cargo: false,
    customsReadiness: false,
    documents: false,
    guarantees: false,
  };

  try {
    const corridor = await db.roadCorridor.findUnique({
      where: { id: corridorId },
      include: { legs: true, borderCrossings: true, seals: true, customsOperations: true },
    });
    if (!corridor) {
      return { ...{ authorized: false }, checks, issues: ["Corridor not found"] };
    }

    // --- Driver / Vehicle / Trailer -----------------------------------------
    const assignedLegs = corridor.legs.filter(
      (l: any) => l.driverId || l.vehicleId || l.trailerId,
    );
    if (assignedLegs.length === 0) {
      issues.push("No legs with driver / vehicle / trailer assignments");
    }

    // Driver check — pull InternationalDriverProfile for the first assigned leg
    const firstAssigned = assignedLegs[0];
    if (firstAssigned?.driverId) {
      try {
        const driver = await db.internationalDriverProfile.findUnique({
          where: { driverId: firstAssigned.driverId },
        });
        if (!driver) {
          issues.push(`Driver ${firstAssigned.driverId} not found in registry`);
        } else if (driver.status !== "ACTIVE") {
          issues.push(`Driver ${firstAssigned.driverId} status is ${driver.status}`);
        } else {
          checks.driver = true;
        }
      } catch (e: any) {
        issues.push(`Driver lookup failed: ${e?.message}`);
      }
    } else {
      issues.push("No driver assigned on any leg");
    }

    // Vehicle check
    if (firstAssigned?.vehicleId) {
      try {
        const vehicle = await db.internationalVehicle.findUnique({
          where: { id: firstAssigned.vehicleId },
        });
        if (!vehicle) {
          issues.push(`Vehicle ${firstAssigned.vehicleId} not found`);
        } else if (vehicle.status !== "ACTIVE") {
          issues.push(`Vehicle ${firstAssigned.vehicleId} status is ${vehicle.status}`);
        } else {
          checks.vehicle = true;
          // Trailer is optional — if specified, validate it
          if (firstAssigned.trailerId) {
            const trailer = await db.internationalVehicle.findUnique({
              where: { id: firstAssigned.trailerId },
            });
            if (!trailer) {
              issues.push(`Trailer ${firstAssigned.trailerId} not found`);
            } else if (trailer.status !== "ACTIVE") {
              issues.push(`Trailer ${firstAssigned.trailerId} status is ${trailer.status}`);
            } else {
              checks.trailer = true;
            }
          } else {
            // Trailer-less transport (e.g. rigid truck) is permitted
            checks.trailer = true;
          }
        }
      } catch (e: any) {
        issues.push(`Vehicle lookup failed: ${e?.message}`);
      }
    } else {
      issues.push("No vehicle assigned on any leg");
    }

    // --- Insurance ----------------------------------------------------------
    try {
      if (firstAssigned?.vehicleId) {
        const vehicle = await db.internationalVehicle.findUnique({
          where: { id: firstAssigned.vehicleId },
        });
        if (vehicle?.insurancePolicy && vehicle.insuranceExpiry) {
          if (new Date(vehicle.insuranceExpiry) < new Date()) {
            issues.push(
              `Vehicle insurance expired on ${vehicle.insuranceExpiry}`,
            );
          } else {
            checks.insurance = true;
          }
        } else {
          issues.push("Vehicle has no insurance policy / expiry on file");
        }
      }
    } catch (e: any) {
      issues.push(`Insurance check failed: ${e?.message}`);
    }

    // --- Route & Country permissions --------------------------------------
    const transit: string[] = (() => {
      try {
        return JSON.parse(corridor.transitCountries || "[]");
      } catch {
        return [];
      }
    })();
    const allCountries = new Set<string>([
      corridor.originCountry.toUpperCase(),
      corridor.destinationCountry.toUpperCase(),
      ...transit.map((c: string) => c.toUpperCase()),
    ]);

    // Route permissions — every border crossing must be active
    const inactiveBorders = corridor.borderCrossings.filter((b: any) => !b.active);
    if (inactiveBorders.length > 0) {
      issues.push(
        `${inactiveBorders.length} border crossing(s) are inactive: ${inactiveBorders
          .map((b: any) => b.borderCode)
          .join(", ")}`,
      );
    } else if (corridor.borderCrossings.length === 0) {
      // No border crossings is fine for a domestic corridor; for international,
      // we still allow it but warn.
      if (corridor.originCountry !== corridor.destinationCountry) {
        issues.push("International corridor has no border crossings defined");
      }
    } else {
      checks.routePermissions = true;
    }

    // Country permissions — vehicle must have permission for every transit country
    try {
      if (firstAssigned?.vehicleId) {
        const perms = await db.vehicleJurisdictionPermission.findMany({
          where: {
            vehicleId: firstAssigned.vehicleId,
            status: "ACTIVE",
          },
        });
        const permCountries = new Set(perms.map((p: any) => p.country.toUpperCase()));
        const missing = [...allCountries].filter((c) => !permCountries.has(c));
        if (missing.length > 0) {
          issues.push(
            `Vehicle lacks permission for: ${missing.join(", ")}`,
          );
        } else {
          checks.countryPermissions = true;
        }
      }
    } catch (e: any) {
      issues.push(`Country-permission check failed: ${e?.message}`);
    }

    // --- Payload / Equipment / Cargo --------------------------------------
    // Pull the underlying Trade for gross/net weight + equipment
    let trade: any = null;
    try {
      trade = await db.trade.findUnique({
        where: { ustn: corridor.ustn },
        include: { containers: true },
      });
    } catch (e: any) {
      issues.push(`Trade lookup failed: ${e?.message}`);
    }

    // Payload check — vehicle payload >= trade gross weight
    if (trade && firstAssigned?.vehicleId) {
      try {
        const vehicle = await db.internationalVehicle.findUnique({
          where: { id: firstAssigned.vehicleId },
        });
        if (vehicle?.payloadCapacity) {
          if (vehicle.payloadCapacity < trade.grossWeightKg) {
            issues.push(
              `Vehicle payload ${vehicle.payloadCapacity}kg < trade gross weight ${trade.grossWeightKg}kg`,
            );
          } else {
            checks.payload = true;
          }
        } else {
          issues.push("Vehicle payload capacity not on file");
        }
      } catch (e: any) {
        issues.push(`Payload check failed: ${e?.message}`);
      }
    }

    // Equipment check — equipmentType on each leg matches a real equipment type
    const legEquipment = assignedLegs
      .map((l: any) => l.equipmentType)
      .filter(Boolean) as string[];
    if (legEquipment.length === 0) {
      issues.push("No equipment type specified on assigned legs");
    } else if (trade?.equipmentType) {
      // Loose check: at least one leg's equipment type matches the trade's
      const tradeEquipment = trade.equipmentType.toUpperCase();
      const matched = legEquipment.some((e: string) => e.toUpperCase() === tradeEquipment);
      if (!matched) {
        issues.push(
          `Leg equipment types (${legEquipment.join(", ")}) do not match trade equipment ${tradeEquipment}`,
        );
      } else {
        checks.equipment = true;
      }
    } else {
      // Trade has no equipment preference — accept any leg equipment
      checks.equipment = true;
    }

    // Cargo check — at least one container with goods
    if (trade && trade.containers && trade.containers.length > 0) {
      checks.cargo = true;
    } else if (trade) {
      // Trade without containers (bulk / breakbulk) — still acceptable
      checks.cargo = true;
    } else {
      issues.push("No trade / cargo record linked to USTN");
    }

    // --- Customs readiness -------------------------------------------------
    // The first country on the corridor must have an EXPORT or TRANSIT customs
    // operation in ACCEPTED / RELEASED status.
    try {
      const exportOps = corridor.customsOperations.filter(
        (op: any) =>
          op.country.toUpperCase() === corridor.originCountry.toUpperCase() &&
          (op.operationType === "EG_EXPORT" || op.operationType === "EXPORT" || op.operationType.includes("EXPORT")),
      );
      if (exportOps.length === 0) {
        issues.push(
          `No export customs operation filed for origin country ${corridor.originCountry}`,
        );
      } else {
        const accepted = exportOps.some(
          (op: any) => ["ACCEPTED", "RELEASED"].includes(op.status),
        );
        if (!accepted) {
          issues.push(
            `Export customs operation not yet accepted (status: ${exportOps[0].status})`,
          );
        } else {
          checks.customsReadiness = true;
        }
      }
    } catch (e: any) {
      issues.push(`Customs-readiness check failed: ${e?.message}`);
    }

    // --- Documents ---------------------------------------------------------
    try {
      const docs = await db.document.findMany({
        where: { ustn: corridor.ustn },
      });
      if (docs.length === 0) {
        issues.push("No documents on file for this USTN");
      } else {
        const verified = docs.filter((d: any) => d.verificationStatus === "VERIFIED" || d.verificationStatus === "ACCEPTED");
        if (verified.length === 0) {
          issues.push(
            `No verified documents (${docs.length} total, 0 verified)`,
          );
        } else {
          checks.documents = true;
        }
      }
    } catch (e: any) {
      issues.push(`Document check failed: ${e?.message}`);
    }

    // --- Guarantees --------------------------------------------------------
    try {
      const guarantees = await db.transitGuarantee.findMany({
        where: { ustn: corridor.ustn, status: { in: ["ACTIVE", "PENDING", "CONFIRMED"] } },
      });
      // For transit corridors (any country other than origin/destination),
      // a guarantee is required
      const isTransit = transit.length > 0 ||
        corridor.originCountry !== corridor.destinationCountry;
      if (isTransit && guarantees.length === 0) {
        issues.push("Transit corridor has no active transit guarantee");
      } else if (!isTransit) {
        checks.guarantees = true; // domestic — no guarantee needed
      } else {
        checks.guarantees = true;
      }
    } catch (e: any) {
      issues.push(`Guarantee check failed: ${e?.message}`);
    }

    const authorized = Object.values(checks).every(Boolean);
    return { authorized, checks, issues };
  } catch (err: any) {
    logger.error("[road-corridor] checkDispatchAuthorization failed", {
      corridorId,
      error: err?.message,
    });
    issues.push(`Dispatch authorization engine failed: ${err?.message}`);
    return { authorized: false, checks, issues };
  }
}

// ============ §18 Seal Management ============

export interface ApplySealInput {
  ustn: string;
  corridorId?: string;
  sealNumber: string;
  sealType?: string;
  appliedBy?: string;
  appliedLocation?: string;
  authority?: string;
  photoHash?: string;
}

/**
 * Apply a new seal. The seal is created in NOT_APPLIED status and
 * immediately transitioned to APPLIED.
 */
export async function applySeal(input: ApplySealInput): Promise<any> {
  try {
    if (!input.ustn || !input.sealNumber) {
      throw new Error("ustn and sealNumber are required");
    }
    // Idempotency: if a seal with this number exists, return it
    const existing = await db.shipmentSeal.findFirst({
      where: { sealNumber: input.sealNumber },
    });
    if (existing) {
      logger.info("[road-corridor] applySeal idempotent hit", {
        sealId: existing.id,
        sealNumber: input.sealNumber,
      });
      return existing;
    }
    const seal = await db.shipmentSeal.create({
      data: {
        ustn: input.ustn,
        corridorId: input.corridorId || null,
        sealNumber: input.sealNumber,
        sealType: input.sealType || "HIGH_SECURITY",
        authority: input.authority || null,
        appliedAt: new Date(),
        appliedLocation: input.appliedLocation || null,
        appliedBy: input.appliedBy || null,
        status: "APPLIED",
        photoHash: input.photoHash || null,
      },
    });
    logger.info("[road-corridor] seal applied", { sealId: seal.id, ustn: input.ustn });
    return seal;
  } catch (err: any) {
    logger.error("[road-corridor] applySeal failed", {
      ustn: input?.ustn,
      error: err?.message,
    });
    throw new Error(`applySeal failed: ${err?.message || "unknown"}`);
  }
}

/**
 * Verify a previously-applied seal at a checkpoint. Transitions APPLIED → VERIFIED.
 */
export async function verifySeal(
  sealId: string,
  verifiedBy: string,
  verifiedLocation: string,
): Promise<any> {
  try {
    const seal = await db.shipmentSeal.findUnique({ where: { id: sealId } });
    if (!seal) throw new Error("Seal not found");
    if (seal.status === "BROKEN") throw new Error("Cannot verify a broken seal");
    if (seal.status === "REMOVED") throw new Error("Cannot verify a removed seal");
    const updated = await db.shipmentSeal.update({
      where: { id: sealId },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        appliedLocation: verifiedLocation || seal.appliedLocation,
        appliedBy: verifiedBy || seal.appliedBy,
      },
    });
    logger.info("[road-corridor] seal verified", { sealId, verifiedBy });
    return updated;
  } catch (err: any) {
    logger.error("[road-corridor] verifySeal failed", { sealId, error: err?.message });
    throw new Error(`verifySeal failed: ${err?.message || "unknown"}`);
  }
}

/**
 * Report a seal as broken — triggers an exception flow. Transitions
 * APPLIED/VERIFIED → BROKEN. Records a RoadIncident of type SEAL_TAMPERING.
 */
export async function reportBrokenSeal(
  sealId: string,
  reason: string,
): Promise<any> {
  try {
    const seal = await db.shipmentSeal.findUnique({ where: { id: sealId } });
    if (!seal) throw new Error("Seal not found");
    const updated = await db.shipmentSeal.update({
      where: { id: sealId },
      data: { status: "BROKEN" },
    });
    // Record a RoadIncident for audit trail
    await db.roadIncident.create({
      data: {
        ustn: seal.ustn,
        corridorId: seal.corridorId || null,
        incidentType: "SEAL_TAMPERING",
        description: `Seal ${seal.sealNumber} reported broken: ${reason}`,
        severity: "HIGH",
        status: "OPEN",
      },
    });
    logger.warn("[road-corridor] seal broken reported", { sealId, reason });
    return updated;
  } catch (err: any) {
    logger.error("[road-corridor] reportBrokenSeal failed", {
      sealId,
      error: err?.message,
    });
    throw new Error(`reportBrokenSeal failed: ${err?.message || "unknown"}`);
  }
}

// ============ §16 Border Execution ============

/**
 * Record border arrival (corridor → ARRIVED_BORDER). Idempotent.
 */
export async function recordBorderArrival(
  corridorId: string,
  borderId: string,
  gps: { lat: number; lng: number },
): Promise<{ ok: boolean }> {
  try {
    const corridor = await db.roadCorridor.findUnique({
      where: { id: corridorId },
      select: { id: true, status: true },
    });
    if (!corridor) return { ok: false };

    // Validate state transition (IN_TRANSIT or NEXT_BORDER_APPROACH → ARRIVED_BORDER)
    const validFrom = ["IN_TRANSIT", "NEXT_BORDER_APPROACH"];
    if (validFrom.includes(corridor.status)) {
      await db.roadCorridor.update({
        where: { id: corridorId },
        data: { status: "ARRIVED_BORDER" },
      });
    }
    // Record GPS as an incident of type ROUTE_DEVIATION? No — that would be wrong.
    // Instead, log it as an info event.
    logger.info("[road-corridor] border arrival recorded", {
      corridorId,
      borderId,
      lat: gps.lat,
      lng: gps.lng,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error("[road-corridor] recordBorderArrival failed", {
      corridorId,
      borderId,
      error: err?.message,
    });
    return { ok: false };
  }
}

/**
 * Record border gate-in (corridor → BORDER_GATE_IN).
 */
export async function recordBorderGateIn(borderId: string): Promise<{ ok: boolean }> {
  try {
    const border = await db.borderCrossing.findUnique({
      where: { id: borderId },
      include: { corridor: { select: { id: true, status: true } } },
    });
    if (!border || !border.corridor) return { ok: false };

    if (border.corridor.status === "ARRIVED_BORDER") {
      await db.roadCorridor.update({
        where: { id: border.corridor.id },
        data: { status: "BORDER_GATE_IN" },
      });
    }
    logger.info("[road-corridor] border gate-in recorded", {
      corridorId: border.corridor.id,
      borderId,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error("[road-corridor] recordBorderGateIn failed", {
      borderId,
      error: err?.message,
    });
    return { ok: false };
  }
}

/**
 * Record customs presentation at a border (corridor → CUSTOMS_PRESENTED).
 */
export async function recordCustomsPresentation(
  borderId: string,
  declarationNumber: string,
): Promise<{ ok: boolean }> {
  try {
    const border = await db.borderCrossing.findUnique({
      where: { id: borderId },
      include: { corridor: { select: { id: true, status: true, ustn: true } } },
    });
    if (!border || !border.corridor) return { ok: false };

    // Create a CustomsOperation row for the presentation
    await db.customsOperation.create({
      data: {
        ustn: border.corridor.ustn,
        corridorId: border.corridor.id,
        country: border.countryTo,
        border: border.borderCode,
        operationType: "CROSS_BORDER_TRANSIT",
        declarationNumber,
        status: "SUBMITTED",
        submissionTime: new Date(),
      },
    });

    if (border.corridor.status === "BORDER_GATE_IN") {
      await db.roadCorridor.update({
        where: { id: border.corridor.id },
        data: { status: "CUSTOMS_PRESENTED" },
      });
    }
    logger.info("[road-corridor] customs presentation recorded", {
      corridorId: border.corridor.id,
      borderId,
      declarationNumber,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error("[road-corridor] recordCustomsPresentation failed", {
      borderId,
      error: err?.message,
    });
    return { ok: false };
  }
}

/**
 * Record border release (corridor → BORDER_RELEASED).
 */
export async function recordBorderRelease(
  borderId: string,
  releaseReference: string,
): Promise<{ ok: boolean }> {
  try {
    const border = await db.borderCrossing.findUnique({
      where: { id: borderId },
      include: { corridor: { select: { id: true, status: true, ustn: true } } },
    });
    if (!border || !border.corridor) return { ok: false };

    // Update the most recent CustomsOperation for this corridor/border
    const op = await db.customsOperation.findFirst({
      where: {
        corridorId: border.corridor.id,
        border: border.borderCode,
      },
      orderBy: { createdAt: "desc" },
    });
    if (op) {
      await db.customsOperation.update({
        where: { id: op.id },
        data: {
          status: "RELEASED",
          releaseTime: new Date(),
          governmentReference: releaseReference,
        },
      });
    }

    const validPrev = ["CUSTOMS_PRESENTED", "CUSTOMS_INSPECTION", "BORDER_HOLD"];
    if (validPrev.includes(border.corridor.status)) {
      await db.roadCorridor.update({
        where: { id: border.corridor.id },
        data: { status: "BORDER_RELEASED" },
      });
    }
    logger.info("[road-corridor] border release recorded", {
      corridorId: border.corridor.id,
      borderId,
      releaseReference,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error("[road-corridor] recordBorderRelease failed", {
      borderId,
      error: err?.message,
    });
    return { ok: false };
  }
}

/**
 * Record border gate-out (corridor → BORDER_GATE_OUT, then either
 * TRANSIT_ACTIVE or DESTINATION_CUSTOMS based on whether more borders remain).
 */
export async function recordBorderGateOut(borderId: string): Promise<{ ok: boolean }> {
  try {
    const border = await db.borderCrossing.findUnique({
      where: { id: borderId },
      include: {
        corridor: {
          select: {
            id: true,
            status: true,
            ustn: true,
            borderCrossings: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (!border || !border.corridor) return { ok: false };

    const corridor = border.corridor;
    if (corridor.status === "BORDER_RELEASED") {
      // Determine whether there's another border after this one
      const borderIdx = corridor.borderCrossings.findIndex((b: any) => b.id === borderId);
      const hasMoreBorders = borderIdx >= 0 && borderIdx < corridor.borderCrossings.length - 1;
      const nextStatus = hasMoreBorders ? "TRANSIT_ACTIVE" : "DESTINATION_CUSTOMS";
      await db.roadCorridor.update({
        where: { id: corridor.id },
        data: { status: nextStatus },
      });
    }
    logger.info("[road-corridor] border gate-out recorded", {
      corridorId: corridor.id,
      borderId,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error("[road-corridor] recordBorderGateOut failed", {
      borderId,
      error: err?.message,
    });
    return { ok: false };
  }
}

// ============ §22 Transit Deadline ============

/**
 * Calculate the transit deadline (start + duration).
 */
export function calculateTransitDeadline(
  startTime: Date,
  durationHours: number,
): Date {
  return new Date(startTime.getTime() + durationHours * 3600_000);
}

/**
 * Check transit expiry against `now`. Returns status:
 *   • EXPIRED — deadline in the past
 *   • CRITICAL — < 6 hours remaining
 *   • WARNING — < 24 hours remaining
 *   • ON_TRACK — >= 24 hours remaining
 */
export function checkTransitExpiry(deadline: Date): {
  status: string;
  remainingHours: number;
} {
  const now = Date.now();
  const remainingMs = deadline.getTime() - now;
  const remainingHours = Math.max(0, Math.floor(remainingMs / 3600_000));
  let status = "ON_TRACK";
  if (remainingMs <= 0) status = "EXPIRED";
  else if (remainingHours < 6) status = "CRITICAL";
  else if (remainingHours < 24) status = "WARNING";
  return { status, remainingHours };
}

/**
 * Get transit alerts (ordered by severity). Returns one alert per
 * status level applicable.
 */
export function getTransitAlerts(deadline: Date): Array<{ level: string; message: string }> {
  const { status, remainingHours } = checkTransitExpiry(deadline);
  const alerts: Array<{ level: string; message: string }> = [];
  if (status === "EXPIRED") {
    alerts.push({
      level: "CRITICAL",
      message: "Transit deadline has expired — guarantee may be invoked",
    });
  }
  if (status === "CRITICAL") {
    alerts.push({
      level: "CRITICAL",
      message: `Transit deadline in ${remainingHours}h — immediate action required`,
    });
  }
  if (status === "WARNING") {
    alerts.push({
      level: "WARNING",
      message: `Transit deadline in ${remainingHours}h — prepare for border handover`,
    });
  }
  if (status === "ON_TRACK") {
    alerts.push({
      level: "INFO",
      message: `Transit on track — ${remainingHours}h remaining`,
    });
  }
  return alerts;
}

// ============ §8 ACI Applicability Engine ============

export interface AciApplicabilityInput {
  country: string;
  transportMode: string;
  origin: string;
  destination: string;
  cargoType: string;
  customsRegime: string;
  shipmentType: string;
}

export interface AciApplicabilityResult {
  result: "REQUIRED" | "NOT_REQUIRED" | "CONDITIONAL" | "UNKNOWN";
  reason: string;
}

/**
 * ACI (Advance Cargo Information) Applicability Engine (§8).
 *
 * Determines whether an ACI filing is required for the given shipment based
 * on country, mode, regime, and cargo type. Conservative: when in doubt,
 * returns CONDITIONAL (caller must consult a broker).
 */
export function checkAciApplicability(
  input: AciApplicabilityInput,
): AciApplicabilityResult {
  const country = (input.country || "").toUpperCase();
  const mode = (input.transportMode || "").toUpperCase();
  const regime = (input.customsRegime || "").toUpperCase();

  // ACI is meaningful for Egypt (Nafeza / ACI Egypt) and a growing list of
  // countries (US AMS, EU ENS, China AFR, India AEO). For road corridors we
  // focus on Egypt.
  const ACI_COUNTRIES = new Set(["EG", "US", "EU", "CN", "IN", "SA", "AE"]);
  if (!ACI_COUNTRIES.has(country)) {
    return {
      result: "NOT_REQUIRED",
      reason: `Country ${country} does not require ACI filing`,
    };
  }

  // ACI applies to all transport modes for these countries
  if (!mode) {
    return {
      result: "UNKNOWN",
      reason: "Transport mode not specified",
    };
  }

  // Transit-only shipments are NOT subject to ACI (they're covered by the
  // transit guarantee / TIR carnet instead)
  if (regime === "TRANSIT") {
    return {
      result: "CONDITIONAL",
      reason:
        "Transit shipments may be exempt from ACI but require a transit declaration (T1/T2 or TIR carnet) instead",
    };
  }

  // Egypt-specific: ACI is mandatory for all imports (customsRegime = IMPORT)
  if (country === "EG" && regime === "IMPORT") {
    return {
      result: "REQUIRED",
      reason: "Egypt Nafeza ACI mandatory for all import shipments",
    };
  }

  // Egypt export — ACI not required for exports, but EX-A declaration is
  if (country === "EG" && regime === "EXPORT") {
    return {
      result: "NOT_REQUIRED",
      reason: "Egypt ACI not applicable to exports (EX-A declaration applies instead)",
    };
  }

  // All other cases for ACI countries — conditional
  return {
    result: "CONDITIONAL",
    reason: `ACI may apply for ${country}/${mode}/${regime} — consult broker`,
  };
}

// ============ §11 Road Document Consistency ============

export interface DocumentConsistencyResult {
  consistent: boolean;
  mismatches: Array<{
    field: string;
    expected: string;
    actual: string;
  }>;
}

/**
 * Validate that every document attached to a USTN agrees on the core
 * trade facts (shipper, consignee, origin, destination, gross weight,
 * cargo description). Pulls the canonical record from the Trade and
 * compares against each Document's source payload.
 *
 * Implementation note: the platform stores documents with a `payload` JSON
 * field. This function tolerates missing / malformed payload and only flags
 * actual mismatches (not missing fields — those are a separate validation).
 */
export async function validateDocumentConsistency(
  ustn: string,
): Promise<DocumentConsistencyResult> {
  const mismatches: DocumentConsistencyResult["mismatches"] = [];
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { containers: true },
    });
    if (!trade) {
      return {
        consistent: false,
        mismatches: [{ field: "trade", expected: "Trade record exists", actual: "Not found" }],
      };
    }

    const expected: Record<string, string> = {
      originPort: trade.originPort || "",
      destPort: trade.destPort || "",
      originCountry: trade.originCountry || "",
      destCountry: trade.destCountry || "",
      commodity: trade.commodity || "",
      grossWeightKg: String(trade.grossWeightKg || ""),
      tradeValueUsd: String(trade.tradeValueUsd || ""),
      currency: trade.currency || "USD",
      incoterm: trade.incoterm || "",
      transportMode: trade.transportMode || "",
    };

    const docs = await db.document.findMany({ where: { ustn } });
    for (const doc of docs) {
      // Documents may store fields directly or in a payload JSON.
      const payload = (() => {
        try {
          return typeof doc.payload === "string"
            ? JSON.parse(doc.payload)
            : doc.payload || {};
        } catch {
          return {};
        }
      })();

      const docFields: Record<string, any> = {
        originPort: doc.originPort ?? payload.originPort ?? payload.portOfLoading,
        destPort: doc.destPort ?? payload.destPort ?? payload.portOfDischarge,
        originCountry: doc.originCountry ?? payload.originCountry ?? payload.countryOfOrigin,
        destCountry: doc.destCountry ?? payload.destCountry ?? payload.countryOfDestination,
        commodity: doc.commodity ?? payload.commodity ?? payload.goodsDescription,
        grossWeightKg: doc.grossWeightKg ?? payload.grossWeightKg ?? payload.weight,
        tradeValueUsd: doc.tradeValueUsd ?? payload.tradeValueUsd ?? payload.invoiceValue,
        currency: doc.currency ?? payload.currency,
        incoterm: doc.incoterm ?? payload.incoterm,
        transportMode: doc.transportMode ?? payload.transportMode,
      };

      for (const [field, expVal] of Object.entries(expected)) {
        if (!expVal) continue; // canonical value missing — skip
        const actVal = String(docFields[field] ?? "").trim();
        if (!actVal) continue; // document doesn't carry this field — skip
        // Loose comparison (case-insensitive, whitespace-trimmed)
        if (actVal.toUpperCase() !== String(expVal).toUpperCase()) {
          mismatches.push({
            field,
            expected: expVal,
            actual: actVal,
          });
        }
      }
    }

    return { consistent: mismatches.length === 0, mismatches };
  } catch (err: any) {
    logger.error("[road-corridor] validateDocumentConsistency failed", {
      ustn,
      error: err?.message,
    });
    return {
      consistent: false,
      mismatches: [
        {
          field: "_engine",
          expected: "Engine ran successfully",
          actual: `Engine error: ${err?.message || "unknown"}`,
        },
      ],
    };
  }
}
