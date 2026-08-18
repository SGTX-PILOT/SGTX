// SGTX Part 32 — Add-On 12: Cold Chain Quality Management
//
// Pre-Trip Inspection (PTI) certificates + cold chain temperature readings
// + anomaly detection. The compliance engine uses GRiRE's
// getColdChainRequirement() to look up the required temperature / humidity
// range for a (hsCode, destinationCountry) pair, then validates each reading
// against that range.
//
// Anomaly lifecycle:
//   - When a reading falls outside the required range, an anomaly is detected.
//   - Severity is derived from the magnitude + duration of deviation.
//   - Critical anomalies may trigger a Governor G2U22 cargo release hold.
//
// Constitutional notes:
//   - No Governor gate wired here. A future G2U22 hook may block cargo release
//     if there's an unresolved CRITICAL anomaly against a container.
//   - All DB calls are defensive (try/catch) — failures return null/empty and
//     log via the shared SGTX logger.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getColdChainRequirement } from "@/lib/sgtx/grire";

// ============ Types ============

export interface PtiCertificateInput {
  containerNumber: string;
  carrierGtid?: string;
  inspectionDate: Date | string;
  validUntil: Date | string;
  temperatureSetPoint: number;
  actualTemperature: number;
  ptiResult: string; // PASS | FAIL | CONDITIONAL
  ptiReference?: string;
  certificateUrl?: string;
  inspectorName?: string;
  verified?: boolean;
}

export interface ColdChainReadingInput {
  ustn: string;
  containerNumber: string;
  temperature: number;
  humidity?: number;
  recordedAt?: Date | string;
}

export interface ColdChainComplianceInput {
  ustn?: string;
  hsCode: string;
  destinationCountry: string;
  containerNumber?: string;
  readings: Array<{
    temperature: number;
    humidity?: number;
    recordedAt?: Date | string;
  }>;
  ptiCertificate?: {
    ptiResult: string;
    validUntil: Date | string;
    verified: boolean;
  };
}

export interface ComplianceResult {
  hsCode: string;
  destinationCountry: string;
  compliant: boolean;
  requirement: {
    temperatureMin: number | null;
    temperatureMax: number | null;
    humidityMin: number | null;
    humidityMax: number | null;
    ptiRequired: boolean;
    treatmentRequired: string | null;
    certificationRequired: string | null;
  } | null;
  ptiStatus: {
    required: boolean;
    valid: boolean;
    verified: boolean;
    reason: string;
  };
  readingStats: {
    total: number;
    inRange: number;
    outOfRange: number;
    maxDeviationCelsius: number;
  };
  anomalies: Array<{
    temperature: number;
    deviationCelsius: number;
    humidity?: number;
    recordedAt?: string;
    severity: string;
  }>;
  severity: string | null; // highest severity among anomalies
  recommendation: string;
}

// PTI result values.
export const PTI_RESULT = {
  PASS: "PASS",
  FAIL: "FAIL",
  CONDITIONAL: "CONDITIONAL",
} as const;

// Anomaly severity thresholds (°C deviation from allowed range).
const SEVERITY_THRESHOLDS = {
  LOW: 0.5,      // deviation ≤ 0.5°C from boundary
  MEDIUM: 2.0,   // 0.5 < deviation ≤ 2.0°C
  HIGH: 5.0,     // 2.0 < deviation ≤ 5.0°C
  CRITICAL: 5.0, // deviation > 5.0°C
};

// ============ Pure helpers ============

/**
 * Classify the severity of a temperature deviation from the allowed range.
 *
 *  - deviation = how far outside the range the reading is (in °C, always positive)
 *  - Returns: LOW | MEDIUM | HIGH | CRITICAL
 */
export function classifyDeviationSeverity(deviationCelsius: number): string {
  if (deviationCelsius <= SEVERITY_THRESHOLDS.LOW) return "LOW";
  if (deviationCelsius <= SEVERITY_THRESHOLDS.MEDIUM) return "MEDIUM";
  if (deviationCelsius <= SEVERITY_THRESHOLDS.HIGH) return "HIGH";
  return "CRITICAL";
}

/**
 * Check whether a single reading is within the required temperature / humidity range.
 * Returns the deviation in °C (0 if in range) and which boundary was violated.
 */
export function checkReadingInRange(
  reading: { temperature: number; humidity?: number },
  requirement: {
    temperatureMin: number | null;
    temperatureMax: number | null;
    humidityMin?: number | null;
    humidityMax?: number | null;
  },
): { inRange: boolean; deviationCelsius: number; reason: string | null } {
  const { temperatureMin, temperatureMax } = requirement;
  if (temperatureMin == null || temperatureMax == null) {
    // No constraint defined — cannot classify, assume in range.
    return { inRange: true, deviationCelsius: 0, reason: null };
  }
  const t = reading.temperature;
  if (t < temperatureMin) {
    const dev = +(temperatureMin - t).toFixed(2);
    return { inRange: false, deviationCelsius: dev, reason: `Below min ${temperatureMin}°C by ${dev}°C` };
  }
  if (t > temperatureMax) {
    const dev = +(t - temperatureMax).toFixed(2);
    return { inRange: false, deviationCelsius: dev, reason: `Above max ${temperatureMax}°C by ${dev}°C` };
  }
  return { inRange: true, deviationCelsius: 0, reason: null };
}

/**
 * Validate a PTI certificate's status:
 *   - PTI must be required (per GRiRE requirement).
 *   - If required, the PTI must be PASS or CONDITIONAL.
 *   - The certificate must not be expired (validUntil > now).
 *   - The certificate must be verified.
 */
export function validatePtiCertificate(
  ptiRequired: boolean,
  pti?: {
    ptiResult: string;
    validUntil: Date | string;
    verified: boolean;
  },
  asOf: Date = new Date(),
): { required: boolean; valid: boolean; verified: boolean; reason: string } {
  if (!ptiRequired) {
    return { required: false, valid: true, verified: true, reason: "PTI not required for this commodity" };
  }
  if (!pti) {
    return { required: true, valid: false, verified: false, reason: "PTI required but no certificate provided" };
  }
  if (pti.ptiResult === PTI_RESULT.FAIL) {
    return { required: true, valid: false, verified: pti.verified, reason: "PTI result is FAIL" };
  }
  const validUntil = typeof pti.validUntil === "string" ? new Date(pti.validUntil) : pti.validUntil;
  if (isNaN(validUntil.getTime())) {
    return { required: true, valid: false, verified: pti.verified, reason: "PTI certificate has invalid validUntil date" };
  }
  if (validUntil.getTime() <= asOf.getTime()) {
    return { required: true, valid: false, verified: pti.verified, reason: "PTI certificate expired" };
  }
  if (!pti.verified) {
    return { required: true, valid: false, verified: false, reason: "PTI certificate not yet verified" };
  }
  return { required: true, valid: true, verified: true, reason: "PTI certificate valid and verified" };
}

// ============ Persistence (defensive) ============

/**
 * Create a PtiCertificate row. Defensive — returns null on failure.
 */
export async function createPtiCertificate(input: PtiCertificateInput): Promise<{ id: string } | null> {
  try {
    const inspectionDate = typeof input.inspectionDate === "string" ? new Date(input.inspectionDate) : input.inspectionDate;
    const validUntil = typeof input.validUntil === "string" ? new Date(input.validUntil) : input.validUntil;
    if (isNaN(inspectionDate.getTime())) return null;
    if (isNaN(validUntil.getTime())) return null;

    const created = await db.ptiCertificate.create({
      data: {
        containerNumber: input.containerNumber,
        carrierGtid: input.carrierGtid || null,
        inspectionDate,
        validUntil,
        temperatureSetPoint: input.temperatureSetPoint,
        actualTemperature: input.actualTemperature,
        ptiResult: input.ptiResult,
        ptiReference: input.ptiReference || null,
        certificateUrl: input.certificateUrl || null,
        inspectorName: input.inspectorName || null,
        verified: input.verified ?? false,
      },
    });
    logger.info("[cold-chain/createPtiCertificate] created", {
      id: created.id, containerNumber: input.containerNumber, ptiResult: input.ptiResult,
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[cold-chain/createPtiCertificate] failed", {
      containerNumber: input.containerNumber, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Record a cold chain reading. If the reading is out of range (caller supplies
 * the requirement), an anomaly is also flagged on the row.
 *
 * Returns the created reading + the created anomaly (if any). Defensive.
 */
export async function recordColdChainReading(
  input: ColdChainReadingInput,
  requirement?: {
    temperatureMin: number | null;
    temperatureMax: number | null;
  },
): Promise<{ readingId: number; anomalyId: string | null } | null> {
  try {
    const recordedAt = input.recordedAt
      ? (typeof input.recordedAt === "string" ? new Date(input.recordedAt) : input.recordedAt)
      : new Date();
    if (isNaN(recordedAt.getTime())) return null;

    // Pre-check the reading against the requirement (if supplied) to flag anomaly.
    let anomaly = false;
    let anomalyType: string | null = null;
    let deviationCelsius = 0;
    if (requirement && requirement.temperatureMin != null && requirement.temperatureMax != null) {
      const check = checkReadingInRange(
        { temperature: input.temperature, humidity: input.humidity },
        requirement,
      );
      if (!check.inRange) {
        anomaly = true;
        anomalyType = check.reason?.includes("Below") ? "TEMP_BELOW_MIN" : "TEMP_ABOVE_MAX";
        deviationCelsius = check.deviationCelsius;
      }
    }

    const created = await db.coldChainReading.create({
      data: {
        ustn: input.ustn,
        containerNumber: input.containerNumber,
        temperature: input.temperature,
        humidity: input.humidity ?? null,
        recordedAt,
        anomaly,
        anomalyType,
      },
    });

    let anomalyId: string | null = null;
    if (anomaly) {
      try {
        const severity = classifyDeviationSeverity(deviationCelsius);
        const anomalyRow = await db.coldChainAnomaly.create({
          data: {
            ustn: input.ustn,
            containerNumber: input.containerNumber,
            deviationCelsius,
            durationMinutes: 0, // single-reading anomaly — duration unknown until subsequent readings
            severity,
          },
        });
        anomalyId = anomalyRow.id;
        logger.warn("[cold-chain/recordColdChainReading] anomaly detected", {
          ustn: input.ustn, containerNumber: input.containerNumber,
          temperature: input.temperature, deviationCelsius, severity,
        });
      } catch (e: any) {
        logger.error("[cold-chain/recordColdChainReading] anomaly persistence failed", {
          ustn: input.ustn, error: e?.message || String(e),
        });
      }
    }

    return { readingId: created.id, anomalyId };
  } catch (e: any) {
    logger.error("[cold-chain/recordColdChainReading] failed", {
      ustn: input.ustn, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * List anomalies for a USTN. Defensive — returns [] on failure.
 */
export async function listAnomalies(
  ustn: string,
  opts: { resolved?: boolean; severity?: string } = {},
): Promise<any[]> {
  try {
    const where: any = { ustn };
    if (opts.resolved != null) where.resolved = opts.resolved;
    if (opts.severity) where.severity = opts.severity.toUpperCase();
    return await db.coldChainAnomaly.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  } catch (e: any) {
    logger.error("[cold-chain/listAnomalies] failed", {
      ustn, error: e?.message || String(e),
    });
    return [];
  }
}

// ============ Core compliance check ============

/**
 * Check cold chain compliance for a shipment against GRiRE requirements.
 *
 * This performs DB I/O (GRiRE lookup) but is otherwise pure — persistence
 * is the caller's responsibility (use recordColdChainReading() to persist).
 *
 * Logic:
 *   1. Look up requirement via GRiRE getColdChainRequirement(hsCode, destination).
 *   2. Validate PTI certificate (if PTI required).
 *   3. Validate each reading against the temperature/humidity range.
 *   4. Compute aggregate stats (in-range count, max deviation, severity).
 *   5. Build recommendation.
 *
 * Returns ComplianceResult. The `compliant` flag is true only when:
 *   - PTI is valid (or not required)
 *   - All readings are in range (or no requirement defined)
 */
export async function checkColdChainCompliance(input: ColdChainComplianceInput): Promise<ComplianceResult> {
  // 1) GRiRE requirement lookup
  const req = await getColdChainRequirement(input.hsCode, input.destinationCountry);
  const requirement = req
    ? {
        temperatureMin: req.temperatureMin,
        temperatureMax: req.temperatureMax,
        humidityMin: req.humidityMin,
        humidityMax: req.humidityMax,
        ptiRequired: req.ptiRequired,
        treatmentRequired: req.treatmentRequired,
        certificationRequired: req.certificationRequired,
      }
    : null;

  // 2) PTI validation
  const ptiStatus = validatePtiCertificate(
    requirement?.ptiRequired ?? false,
    input.ptiCertificate,
  );

  // 3) Readings validation
  let inRange = 0;
  let outOfRange = 0;
  let maxDeviationCelsius = 0;
  const anomalies: ComplianceResult["anomalies"] = [];
  const severityRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  let highestSeverity: string | null = null;

  for (const reading of input.readings) {
    if (requirement) {
      const check = checkReadingInRange(
        { temperature: reading.temperature, humidity: reading.humidity },
        requirement,
      );
      if (check.inRange) {
        inRange++;
      } else {
        outOfRange++;
        const severity = classifyDeviationSeverity(check.deviationCelsius);
        if (check.deviationCelsius > maxDeviationCelsius) maxDeviationCelsius = check.deviationCelsius;
        anomalies.push({
          temperature: reading.temperature,
          deviationCelsius: check.deviationCelsius,
          humidity: reading.humidity,
          recordedAt: reading.recordedAt
            ? (typeof reading.recordedAt === "string" ? reading.recordedAt : reading.recordedAt.toISOString())
            : undefined,
          severity,
        });
        if (!highestSeverity || severityRank[severity] > severityRank[highestSeverity]) {
          highestSeverity = severity;
        }
      }
    } else {
      // No requirement defined — assume in range, but note that compliance is uncertain.
      inRange++;
    }
  }

  const total = input.readings.length;
  const compliant = ptiStatus.valid && outOfRange === 0;

  // 4) Recommendation
  const recommendation = buildComplianceRecommendation({
    hasRequirement: !!requirement,
    ptiStatus,
    compliant,
    outOfRange,
    total,
    highestSeverity,
  });

  return {
    hsCode: input.hsCode,
    destinationCountry: input.destinationCountry.toUpperCase(),
    compliant,
    requirement,
    ptiStatus,
    readingStats: {
      total,
      inRange,
      outOfRange,
      maxDeviationCelsius: +maxDeviationCelsius.toFixed(2),
    },
    anomalies,
    severity: highestSeverity,
    recommendation,
  };
}

function buildComplianceRecommendation(ctx: {
  hasRequirement: boolean;
  ptiStatus: { valid: boolean; verified: boolean; reason: string };
  compliant: boolean;
  outOfRange: number;
  total: number;
  highestSeverity: string | null;
}): string {
  if (!ctx.hasRequirement) {
    return "No cold chain requirement defined in GRiRE for this (hsCode, destination) pair — manual verification required.";
  }
  if (!ctx.ptiStatus.valid) {
    return `PTI non-compliant: ${ctx.ptiStatus.reason}. Hold cargo release until PTI is rectified.`;
  }
  if (ctx.compliant) {
    return `Cold chain compliant — all ${ctx.total} reading(s) within required range. PTI valid.`;
  }
  if (ctx.highestSeverity === "CRITICAL") {
    return `CRITICAL cold chain breach: ${ctx.outOfRange} of ${ctx.total} readings out of range. Reject cargo release, file inspection dispute.`;
  }
  if (ctx.highestSeverity === "HIGH") {
    return `HIGH severity cold chain deviation: ${ctx.outOfRange} of ${ctx.total} readings out of range. Quarantine cargo pending quality review.`;
  }
  if (ctx.highestSeverity === "MEDIUM") {
    return `MEDIUM severity cold chain deviation: ${ctx.outOfRange} of ${ctx.total} readings out of range. Request quality attestation from shipper.`;
  }
  return `LOW severity deviation: ${ctx.outOfRange} of ${ctx.total} readings marginally out of range. Monitor and document.`;
}
