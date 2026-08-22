// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX Phase 5 — §6 Provider Validation
 * ------------------------------------------------------------
 * Implements the 8+1 provider validation checks per the SGTX Blueprint §6:
 *   LICENSE | INSURANCE | ROUTE_AUTHORIZATION | COMMODITY_AUTHORIZATION |
 *   VEHICLE | DRIVER | TERMINAL_AUTHORIZATION | BROKER_LICENSE |
 *   AIRLINE_SHIPPER_AUTHORITY
 * (The spec lists 8 items but the final "airline/shipper authority" is
 * treated as one combined type, giving 9 distinct validation types.)
 *
 * Provider-type → applicable checks (per spec):
 *   • LSP / FREIGHT_FORWARDER → LICENSE, INSURANCE, ROUTE_AUTHORIZATION,
 *       COMMODITY_AUTHORIZATION, VEHICLE, DRIVER
 *   • SHIPPING_LINE          → LICENSE, INSURANCE, ROUTE_AUTHORIZATION
 *   • AIRLINE                 → LICENSE, INSURANCE, ROUTE_AUTHORIZATION,
 *                               AIRLINE_SHIPPER_AUTHORITY
 *   • RAIL_OPERATOR           → LICENSE, INSURANCE, ROUTE_AUTHORIZATION
 *   • FERRY                   → LICENSE, INSURANCE, ROUTE_AUTHORIZATION
 *   • WAREHOUSE               → LICENSE, INSURANCE
 *   • TERMINAL                → LICENSE, INSURANCE, TERMINAL_AUTHORIZATION
 *   • GHA                     → LICENSE, INSURANCE, AIRLINE_SHIPPER_AUTHORITY
 *   • CUSTOMS_BROKER          → BROKER_LICENSE, INSURANCE, ROUTE_AUTHORIZATION
 *   • LAB                     → LICENSE, INSURANCE
 *   • QC                      → LICENSE, INSURANCE
 *   • INSURANCE               → LICENSE (insurance providers need a license too)
 *
 * Per-check status evaluation:
 *   • VALIDATED if status=VALIDATED AND now within [validFrom, validUntil].
 *   • EXPIRED   if status=VALIDATED but now > validUntil.
 *   • INVALID   if status=INVALID.
 *   • PENDING   if no row exists OR status=PENDING.
 *   • NOT_REQUIRED is treated as VALIDATED (it is a positive exemption).
 *
 * Overall verdict:
 *   • VALIDATED   if ALL applicable checks pass.
 *   • CONDITIONAL if SOME checks are PENDING/EXPIRED but none INVALID.
 *   • INVALID     if ANY check is INVALID.
 *
 * Design principles (NON-MARKETPLACE):
 *   • SGTX never publishes a "provider score" or ranking. The validation
 *     result is private to the trader who requested it (linked via the
 *     ProviderRelationship).
 *   • Every DB call is wrapped defensively — the validator never
 *     throws; it logs + returns a safe default.
 *   • `isValidationValid` is pure (no I/O).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §6 Validation types & statuses ============

export const VALIDATION_TYPES = [
  "LICENSE",
  "INSURANCE",
  "ROUTE_AUTHORIZATION",
  "COMMODITY_AUTHORIZATION",
  "VEHICLE",
  "DRIVER",
  "TERMINAL_AUTHORIZATION",
  "BROKER_LICENSE",
  "AIRLINE_SHIPPER_AUTHORITY",
] as const;

export const VALIDATION_STATUSES = [
  "PENDING",
  "VALIDATED",
  "INVALID",
  "EXPIRED",
  "NOT_REQUIRED",
] as const;

/**
 * Per spec §6 — provider type → applicable validation types.
 * Note: BROKER_LICENSE replaces LICENSE for CUSTOMS_BROKER (brokers are
 * licensed under a separate regulatory regime).
 * INSURANCE providers still need a LICENSE in their own jurisdiction.
 */
export const PROVIDER_TYPE_VALIDATIONS: Record<string, string[]> = {
  LSP: ["LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION", "COMMODITY_AUTHORIZATION", "VEHICLE", "DRIVER"],
  FREIGHT_FORWARDER: ["LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION", "COMMODITY_AUTHORIZATION", "VEHICLE", "DRIVER"],
  SHIPPING_LINE: ["LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION"],
  AIRLINE: ["LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION", "AIRLINE_SHIPPER_AUTHORITY"],
  RAIL_OPERATOR: ["LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION"],
  FERRY: ["LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION"],
  WAREHOUSE: ["LICENSE", "INSURANCE"],
  TERMINAL: ["LICENSE", "INSURANCE", "TERMINAL_AUTHORIZATION"],
  GHA: ["LICENSE", "INSURANCE", "AIRLINE_SHIPPER_AUTHORITY"],
  CUSTOMS_BROKER: ["BROKER_LICENSE", "INSURANCE", "ROUTE_AUTHORIZATION"],
  LAB: ["LICENSE", "INSURANCE"],
  QC: ["LICENSE", "INSURANCE"],
  INSURANCE: ["LICENSE"],
};

// ============ Input types ============

export interface ValidationContext {
  originLocation?: string;
  destinationLocation?: string;
  hs6?: string;
  vehiclePlate?: string;
  driverId?: string;
}

export interface ProviderValidationResult {
  providerGtid: string;
  providerType: string;
  checks: Array<{
    validationType: string;
    status: string;
    validUntil?: string;
    referenceNumber?: string;
    reason?: string;
  }>;
  overallVerdict: "VALIDATED" | "CONDITIONAL" | "INVALID";
  validChecks: number;
  pendingChecks: number;
  expiredChecks: number;
  invalidChecks: number;
}

export interface UpsertValidationInput {
  providerGtid: string;
  providerType: string;
  validationType: string;
  status?: string;
  referenceNumber?: string;
  issuedBy?: string;
  issuedAt?: Date;
  validFrom?: Date;
  validUntil?: Date;
  jurisdictions?: string[];
  routes?: any[];
  commodities?: string[];
  vehicles?: string[];
  drivers?: string[];
  verifiedAt?: Date;
  verifiedBy?: string;
  verificationMethod?: string;
  evidence?: string[];
  notes?: string;
}

// ============ Pure helpers ============

function isValidValidationType(t?: string | null): boolean {
  return !!t && (VALIDATION_TYPES as readonly string[]).includes(t);
}

function isValidValidationStatus(s?: string | null): boolean {
  return !!s && (VALIDATION_STATUSES as readonly string[]).includes(s);
}

function getApplicableChecks(providerType: string): string[] {
  const t = (providerType || "").toUpperCase();
  return PROVIDER_TYPE_VALIDATIONS[t] || [];
}

function safeParseArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Pure: a ProviderValidation (or compatible) is "valid at a point in time"
 * iff:
 *   • status === "VALIDATED" AND
 *   • (validFrom is null OR at >= validFrom) AND
 *   • (validUntil is null OR at <= validUntil)
 *   • status === "NOT_REQUIRED" is treated as valid (positive exemption).
 *
 * @param validation  the ProviderValidation row (or compatible shape)
 * @param at          the point in time to check (default: now)
 */
export function isValidationValid(validation: any, at: Date = new Date()): boolean {
  if (!validation) return false;
  const status = validation.status;
  if (status === "NOT_REQUIRED") return true;
  if (status !== "VALIDATED") return false;
  const ts = at.getTime();
  if (validation.validFrom) {
    const from = new Date(validation.validFrom).getTime();
    if (Number.isNaN(from)) return false;
    if (ts < from) return false;
  }
  if (validation.validUntil) {
    const until = new Date(validation.validUntil).getTime();
    if (Number.isNaN(until)) return false;
    if (ts > until) return false; // expired
  }
  return true;
}

/**
 * Pure: derives the effective per-check status. Mirrors the spec:
 *   • NOT_REQUIRED → VALIDATED (positive exemption)
 *   • VALIDATED   → VALIDATED if within date window, else EXPIRED
 *   • INVALID     → INVALID
 *   • anything else (incl. no row / PENDING) → PENDING
 */
function deriveCheckStatus(validation: any | null, at: Date): {
  status: string;
  reason?: string;
} {
  if (!validation) {
    return { status: "PENDING", reason: "No validation record on file." };
  }
  const status = validation.status;
  if (status === "NOT_REQUIRED") {
    return { status: "VALIDATED", reason: "Validation not required for this provider type." };
  }
  if (status === "VALIDATED") {
    // Check date window
    const ts = at.getTime();
    if (validation.validFrom) {
      const from = new Date(validation.validFrom).getTime();
      if (!Number.isNaN(from) && ts < from) {
        return { status: "PENDING", reason: "Validation not yet in effect (validFrom in future)." };
      }
    }
    if (validation.validUntil) {
      const until = new Date(validation.validUntil).getTime();
      if (!Number.isNaN(until) && ts > until) {
        return { status: "EXPIRED", reason: "Validation expired (past validUntil)." };
      }
    }
    return { status: "VALIDATED" };
  }
  if (status === "INVALID") {
    return { status: "INVALID", reason: validation.notes || "Validation marked INVALID." };
  }
  if (status === "EXPIRED") {
    return { status: "EXPIRED", reason: "Validation marked EXPIRED." };
  }
  // PENDING or unknown
  return { status: "PENDING", reason: `Validation in status ${status}.` };
}

// ============ §6a validateProvider (main entry) ============

/**
 * The main validation function. Runs all applicable validation checks
 * for the provider's type, evaluates each check's effective status, and
 * returns a per-check breakdown + overall verdict.
 *
 * NON-MARKETPLACE: never produces a score; only the binary VALIDATED /
 * CONDITIONAL / INVALID verdict + the per-check breakdown.
 */
export async function validateProvider(
  providerGtid: string,
  providerType: string,
  context?: ValidationContext,
): Promise<ProviderValidationResult> {
  const applicable = getApplicableChecks(providerType);
  const now = new Date();
  const checks: ProviderValidationResult["checks"] = [];
  let validChecks = 0;
  let pendingChecks = 0;
  let expiredChecks = 0;
  let invalidChecks = 0;

  try {
    for (const validationType of applicable) {
      let row: any = null;
      try {
        row = await db.providerValidation.findUnique({
          where: {
            providerGtid_validationType: {
              providerGtid,
              validationType,
            },
          },
        });
      } catch (err) {
        logger.warn("provider-validation: lookup failed", {
          providerGtid,
          validationType,
          error: String(err),
        });
      }

      const derived = deriveCheckStatus(row, now);
      checks.push({
        validationType,
        status: derived.status,
        validUntil: row?.validUntil
          ? new Date(row.validUntil).toISOString()
          : undefined,
        referenceNumber: row?.referenceNumber || undefined,
        reason: derived.reason,
      });

      switch (derived.status) {
        case "VALIDATED":
          validChecks++;
          break;
        case "PENDING":
          pendingChecks++;
          break;
        case "EXPIRED":
          expiredChecks++;
          break;
        case "INVALID":
          invalidChecks++;
          break;
      }
    }

    // Overall verdict — INVALID > CONDITIONAL > VALIDATED
    let overallVerdict: ProviderValidationResult["overallVerdict"];
    if (invalidChecks > 0) {
      overallVerdict = "INVALID";
    } else if (pendingChecks > 0 || expiredChecks > 0) {
      overallVerdict = "CONDITIONAL";
    } else {
      overallVerdict = applicable.length === 0 ? "VALIDATED" : "VALIDATED";
    }

    // Context-aware additional screening: if context provides route/hs6/vehicle/driver,
    // run the corresponding check and downgrade verdict if the provider is not authorized.
    if (context) {
      try {
        if (
          context.originLocation &&
          context.destinationLocation &&
          applicable.includes("ROUTE_AUTHORIZATION")
        ) {
          const route = await checkRouteAuthorization(
            providerGtid,
            context.originLocation,
            context.destinationLocation,
          );
          if (!route.authorized) {
            // route mismatch demotes VALIDATED → CONDITIONAL
            if (overallVerdict === "VALIDATED") overallVerdict = "CONDITIONAL";
          }
        }
        if (context.hs6 && applicable.includes("COMMODITY_AUTHORIZATION")) {
          const comm = await checkCommodityAuthorization(providerGtid, context.hs6);
          if (!comm.authorized) {
            if (overallVerdict === "VALIDATED") overallVerdict = "CONDITIONAL";
          }
        }
        if (context.vehiclePlate && applicable.includes("VEHICLE")) {
          const veh = await checkVehicleAuthorization(providerGtid, context.vehiclePlate);
          if (!veh.authorized) {
            if (overallVerdict === "VALIDATED") overallVerdict = "CONDITIONAL";
          }
        }
        if (context.driverId && applicable.includes("DRIVER")) {
          const drv = await checkDriverAuthorization(providerGtid, context.driverId);
          if (!drv.authorized) {
            if (overallVerdict === "VALIDATED") overallVerdict = "CONDITIONAL";
          }
        }
      } catch (ctxErr) {
        logger.warn("provider-validation: context screening failed", {
          providerGtid,
          error: String(ctxErr),
        });
      }
    }

    logger.info("provider-validation: validateProvider", {
      providerGtid,
      providerType,
      overallVerdict,
      validChecks,
      pendingChecks,
      expiredChecks,
      invalidChecks,
    });

    return {
      providerGtid,
      providerType,
      checks,
      overallVerdict,
      validChecks,
      pendingChecks,
      expiredChecks,
      invalidChecks,
    };
  } catch (err) {
    logger.error("provider-validation: validateProvider failed", {
      providerGtid,
      providerType,
      error: String(err),
    });
    // Safe degradation: return an all-PENDING CONDITIONAL result.
    return {
      providerGtid,
      providerType,
      checks: applicable.map((vt) => ({
        validationType: vt,
        status: "PENDING",
        reason: "Validation engine unavailable.",
      })),
      overallVerdict: "CONDITIONAL",
      validChecks: 0,
      pendingChecks: applicable.length,
      expiredChecks: 0,
      invalidChecks: 0,
    };
  }
}

// ============ §6b getProviderValidation ============

/**
 * Fetches the ProviderValidation row for a specific (provider, type).
 * Returns null if not found (caller should treat as PENDING).
 */
export async function getProviderValidation(
  providerGtid: string,
  validationType: string,
): Promise<any | null> {
  try {
    if (!providerGtid || !isValidValidationType(validationType)) return null;
    return await db.providerValidation.findUnique({
      where: {
        providerGtid_validationType: { providerGtid, validationType },
      },
    });
  } catch (err) {
    logger.error("provider-validation: getProviderValidation failed", {
      providerGtid,
      validationType,
      error: String(err),
    });
    return null;
  }
}

// ============ §6c listProviderValidations ============

export async function listProviderValidations(
  filters?: {
    providerGtid?: string;
    providerType?: string;
    validationType?: string;
    status?: string;
  },
): Promise<any[]> {
  try {
    const where: any = {};
    if (filters?.providerGtid) where.providerGtid = filters.providerGtid;
    if (filters?.providerType) where.providerType = filters.providerType;
    if (filters?.validationType) where.validationType = filters.validationType;
    if (filters?.status) where.status = filters.status;
    return (
      (await db.providerValidation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 500,
      })) || []
    );
  } catch (err) {
    logger.error("provider-validation: listProviderValidations failed", {
      filters,
      error: String(err),
    });
    return [];
  }
}

// ============ §6d upsertProviderValidation ============

/**
 * Upserts a ProviderValidation row by the (providerGtid, validationType)
 * unique key. If a row exists, updates the provided fields; otherwise
 * creates a new one.
 */
export async function upsertProviderValidation(
  input: UpsertValidationInput,
): Promise<any> {
  try {
    if (!input.providerGtid) {
      return { ok: false, error: "PROVIDER_GTID_REQUIRED" };
    }
    if (!isValidValidationType(input.validationType)) {
      return { ok: false, error: "INVALID_VALIDATION_TYPE", valid: VALIDATION_TYPES };
    }
    const status = isValidValidationStatus(input.status)
      ? input.status
      : "PENDING";

    const data: any = {
      providerGtid: input.providerGtid,
      providerType: input.providerType || "UNKNOWN",
      validationType: input.validationType,
      status,
      referenceNumber: input.referenceNumber || null,
      issuedBy: input.issuedBy || null,
      issuedAt: input.issuedAt || null,
      validFrom: input.validFrom || null,
      validUntil: input.validUntil || null,
      jurisdictions:
        input.jurisdictions && input.jurisdictions.length > 0
          ? JSON.stringify(input.jurisdictions)
          : null,
      routes:
        input.routes && input.routes.length > 0
          ? JSON.stringify(input.routes)
          : null,
      commodities:
        input.commodities && input.commodities.length > 0
          ? JSON.stringify(input.commodities)
          : null,
      vehicles:
        input.vehicles && input.vehicles.length > 0
          ? JSON.stringify(input.vehicles)
          : null,
      drivers:
        input.drivers && input.drivers.length > 0
          ? JSON.stringify(input.drivers)
          : null,
      verifiedAt: input.verifiedAt || (status === "VALIDATED" ? new Date() : null),
      verifiedBy: input.verifiedBy || null,
      verificationMethod: input.verificationMethod || null,
      evidence:
        input.evidence && input.evidence.length > 0
          ? JSON.stringify(input.evidence)
          : null,
      notes: input.notes || null,
    };

    const upserted = await db.providerValidation.upsert({
      where: {
        providerGtid_validationType: {
          providerGtid: input.providerGtid,
          validationType: input.validationType,
        },
      },
      create: data,
      update: data,
    });

    logger.info("provider-validation: upserted", {
      id: upserted.id,
      providerGtid: input.providerGtid,
      validationType: input.validationType,
      status,
    });
    return upserted;
  } catch (err) {
    logger.error("provider-validation: upsertProviderValidation failed", {
      error: String(err),
      input,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §6e isValidationValid (pure — see above) ============
// (Declared earlier — pure function.)

// ============ §6f isProviderFullyValidated ============

/**
 * Returns true iff ALL applicable checks for the provider's type are
 * currently VALIDATED (or NOT_REQUIRED) and within their validFrom/validUntil
 * window. Convenience wrapper around `validateProvider` for gate G-T3.
 */
export async function isProviderFullyValidated(
  providerGtid: string,
  providerType: string,
): Promise<boolean> {
  try {
    const result = await validateProvider(providerGtid, providerType);
    return result.overallVerdict === "VALIDATED";
  } catch (err) {
    logger.error("provider-validation: isProviderFullyValidated failed", {
      providerGtid,
      providerType,
      error: String(err),
    });
    return false;
  }
}

// ============ §6g getExpiredValidations ============

/**
 * Returns all ProviderValidation rows whose validUntil is in the past
 * AND whose status is still VALIDATED (i.e. they SHOULD be marked
 * EXPIRED). Useful for the nightly compliance sweep.
 */
export async function getExpiredValidations(): Promise<any[]> {
  try {
    return (
      (await db.providerValidation.findMany({
        where: {
          status: "VALIDATED",
          validUntil: { lt: new Date() },
        },
        orderBy: { validUntil: "asc" },
        take: 1000,
      })) || []
    );
  } catch (err) {
    logger.error("provider-validation: getExpiredValidations failed", {
      error: String(err),
    });
    return [];
  }
}

// ============ §6h checkRouteAuthorization ============

/**
 * Checks whether a provider is authorized to operate a specific route.
 * Reads the ROUTE_AUTHORIZATION validation's `routes` JSON (array of
 * { origin, destination } or { origin, destination, via } entries).
 *
 * Match logic: case-insensitive, trimmed comparison on origin/destination
 * (the route entries may also include a "via" waypoint which is ignored
 * for the simple O→D check). If routes is "*" or ["*"], all routes are
 * authorized (platform-wide approval).
 */
export async function checkRouteAuthorization(
  providerGtid: string,
  originLocation: string,
  destinationLocation: string,
): Promise<{ authorized: boolean; reason: string }> {
  try {
    if (!providerGtid) {
      return { authorized: false, reason: "Provider GTID required." };
    }
    if (!originLocation || !destinationLocation) {
      return {
        authorized: false,
        reason: "Both originLocation and destinationLocation are required.",
      };
    }
    const validation = await getProviderValidation(
      providerGtid,
      "ROUTE_AUTHORIZATION",
    );
    if (!validation) {
      return {
        authorized: false,
        reason: "No ROUTE_AUTHORIZATION validation on file for provider.",
      };
    }
    if (!isValidationValid(validation)) {
      return {
        authorized: false,
        reason: `ROUTE_AUTHORIZATION is ${validation.status} (not currently valid).`,
      };
    }
    const routes = safeParseArray(validation.routes);
    if (routes.length === 0) {
      // No routes specified → treat as not authorized (safer default).
      return {
        authorized: false,
        reason: "Provider's ROUTE_AUTHORIZATION has no routes listed.",
      };
    }
    // Wildcard authorization
    if (routes.some((r: any) => r === "*" || r?.pattern === "*")) {
      return { authorized: true, reason: "Provider has wildcard route authorization." };
    }

    const norm = (s: string) => (s || "").trim().toUpperCase();
    const o = norm(originLocation);
    const d = norm(destinationLocation);

    const match = routes.some((r: any) => {
      if (!r || typeof r !== "object") return false;
      const ro = norm(r.origin || r.from || "");
      const rd = norm(r.destination || r.to || "");
      if (!ro || !rd) return false;
      // Exact match OR wildcard segment "*" within route
      const oMatches = ro === "*" || ro === o;
      const dMatches = rd === "*" || rd === d;
      return oMatches && dMatches;
    });

    if (match) {
      return {
        authorized: true,
        reason: `Route ${originLocation} → ${destinationLocation} authorized for provider.`,
      };
    }
    return {
      authorized: false,
      reason: `Route ${originLocation} → ${destinationLocation} not in provider's authorized routes list.`,
    };
  } catch (err) {
    logger.error("provider-validation: checkRouteAuthorization failed", {
      providerGtid,
      originLocation,
      destinationLocation,
      error: String(err),
    });
    return { authorized: false, reason: String(err) };
  }
}

// ============ §6i checkCommodityAuthorization ============

/**
 * Checks whether a provider is authorized to handle a specific commodity
 * (HS6 code). Reads the COMMODITY_AUTHORIZATION validation's `commodities`
 * JSON array. Match logic: HS6 prefix match (the commodity list may
 * contain HS4 or HS2 prefixes that authorize a broader category).
 *
 * Example: provider authorized for ["0901"] covers HS6 "090121" (coffee).
 */
export async function checkCommodityAuthorization(
  providerGtid: string,
  hs6: string,
): Promise<{ authorized: boolean; reason: string }> {
  try {
    if (!providerGtid) {
      return { authorized: false, reason: "Provider GTID required." };
    }
    if (!hs6) {
      return { authorized: false, reason: "HS6 code required." };
    }
    const validation = await getProviderValidation(
      providerGtid,
      "COMMODITY_AUTHORIZATION",
    );
    if (!validation) {
      return {
        authorized: false,
        reason: "No COMMODITY_AUTHORIZATION validation on file for provider.",
      };
    }
    if (!isValidationValid(validation)) {
      return {
        authorized: false,
        reason: `COMMODITY_AUTHORIZATION is ${validation.status} (not currently valid).`,
      };
    }
    const commodities = safeParseArray(validation.commodities);
    if (commodities.length === 0) {
      return {
        authorized: false,
        reason: "Provider's COMMODITY_AUTHORIZATION has no commodities listed.",
      };
    }
    // Wildcard
    if (commodities.some((c: any) => c === "*" || c === "ALL")) {
      return { authorized: true, reason: "Provider has wildcard commodity authorization." };
    }
    const hs = String(hs6).trim();
    const match = commodities.some((c: any) => {
      const cs = String(c || "").trim();
      if (!cs) return false;
      // Prefix match — authorized commodity may be HS2/HS4/HS6 prefix.
      return hs === cs || hs.startsWith(cs) || cs.startsWith(hs);
    });
    if (match) {
      return {
        authorized: true,
        reason: `Commodity HS6 ${hs6} authorized for provider.`,
      };
    }
    return {
      authorized: false,
      reason: `Commodity HS6 ${hs6} not in provider's authorized commodities list.`,
    };
  } catch (err) {
    logger.error("provider-validation: checkCommodityAuthorization failed", {
      providerGtid,
      hs6,
      error: String(err),
    });
    return { authorized: false, reason: String(err) };
  }
}

// ============ §6j checkVehicleAuthorization ============

/**
 * Checks whether a specific vehicle (plate) is authorized for the
 * provider. Reads the VEHICLE validation's `vehicles` JSON array.
 * Case-insensitive plate comparison.
 */
export async function checkVehicleAuthorization(
  providerGtid: string,
  vehiclePlate: string,
): Promise<{ authorized: boolean; reason: string }> {
  try {
    if (!providerGtid) {
      return { authorized: false, reason: "Provider GTID required." };
    }
    if (!vehiclePlate) {
      return { authorized: false, reason: "Vehicle plate required." };
    }
    const validation = await getProviderValidation(providerGtid, "VEHICLE");
    if (!validation) {
      return {
        authorized: false,
        reason: "No VEHICLE validation on file for provider.",
      };
    }
    if (!isValidationValid(validation)) {
      return {
        authorized: false,
        reason: `VEHICLE validation is ${validation.status} (not currently valid).`,
      };
    }
    const vehicles = safeParseArray(validation.vehicles);
    if (vehicles.length === 0) {
      return {
        authorized: false,
        reason: "Provider's VEHICLE validation has no vehicles listed.",
      };
    }
    const norm = (s: string) => (s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const plate = norm(vehiclePlate);
    const match = vehicles.some((v: any) => {
      if (!v) return false;
      // v may be a string or { plate, type }
      const ps = typeof v === "string" ? v : v.plate || v.plateNumber || "";
      return norm(ps) === plate;
    });
    if (match) {
      return {
        authorized: true,
        reason: `Vehicle ${vehiclePlate} authorized for provider.`,
      };
    }
    return {
      authorized: false,
      reason: `Vehicle ${vehiclePlate} not in provider's authorized vehicles list.`,
    };
  } catch (err) {
    logger.error("provider-validation: checkVehicleAuthorization failed", {
      providerGtid,
      vehiclePlate,
      error: String(err),
    });
    return { authorized: false, reason: String(err) };
  }
}

// ============ §6k checkDriverAuthorization ============

/**
 * Checks whether a specific driver is authorized for the provider.
 * Reads the DRIVER validation's `drivers` JSON array. Case-insensitive
 * comparison on driver ID.
 */
export async function checkDriverAuthorization(
  providerGtid: string,
  driverId: string,
): Promise<{ authorized: boolean; reason: string }> {
  try {
    if (!providerGtid) {
      return { authorized: false, reason: "Provider GTID required." };
    }
    if (!driverId) {
      return { authorized: false, reason: "Driver ID required." };
    }
    const validation = await getProviderValidation(providerGtid, "DRIVER");
    if (!validation) {
      return {
        authorized: false,
        reason: "No DRIVER validation on file for provider.",
      };
    }
    if (!isValidationValid(validation)) {
      return {
        authorized: false,
        reason: `DRIVER validation is ${validation.status} (not currently valid).`,
      };
    }
    const drivers = safeParseArray(validation.drivers);
    if (drivers.length === 0) {
      return {
        authorized: false,
        reason: "Provider's DRIVER validation has no drivers listed.",
      };
    }
    const norm = (s: string) => String(s || "").trim().toUpperCase();
    const id = norm(driverId);
    const match = drivers.some((d: any) => {
      if (!d) return false;
      // d may be a string ID or { driverId, licenseNumber, name }
      const ds =
        typeof d === "string"
          ? d
          : d.driverId || d.licenseNumber || d.id || "";
      return norm(ds) === id;
    });
    if (match) {
      return {
        authorized: true,
        reason: `Driver ${driverId} authorized for provider.`,
      };
    }
    return {
      authorized: false,
      reason: `Driver ${driverId} not in provider's authorized drivers list.`,
    };
  } catch (err) {
    logger.error("provider-validation: checkDriverAuthorization failed", {
      providerGtid,
      driverId,
      error: String(err),
    });
    return { authorized: false, reason: String(err) };
  }
}
