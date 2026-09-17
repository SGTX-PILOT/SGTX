// SGTX Reefer Telemetry Time-Series Service (Tier 3)
//
// Persists continuous reefer-container telemetry (Carrier Transicold,
// Thermo King, Roambee, Tive, Sensitech, ELPRO, manual readings) into the
// `ReeferTelemetry` Prisma model. Auto-detects:
//   - Temperature excursions (|actual - setpoint| > 2°C sustained across
//     consecutive readings) — sets `tempExcursion = true`.
//   - Power failures (transition from `powerStatus = "ON"` → `"OFF"`) —
//     sets `powerFailure = true`.
//
// Exposes query helpers for dashboards: `getTelemetry` (time-series),
// `getLatestTelemetry`, `detectExcursions` (returns contiguous excursion
// windows), and `getTelemetryStats` (min/max/avg + excursion minutes).

import { db } from "@/lib/db";

/** Allowed reefer power states (loosely typed — providers may send extras). */
export type ReeferPowerStatus = "ON" | "OFF" | "DEFROST" | "STANDBY";

/** Telemetry sources supported by the platform. */
export const REEFER_TELEMETRY_SOURCES = [
  "MANUAL",
  "CARRIER_TRANSICOLD",
  "THERMO_KING",
  "ROAMBEE",
  "TIVE",
  "SENSITECH",
  "ELPRO",
] as const;
export type ReeferTelemetrySource = (typeof REEFER_TELEMETRY_SOURCES)[number];

/** Threshold (°C) above which a reading is treated as an excursion. */
export const TEMP_EXCURSION_THRESHOLD_C = 2;

/** Input payload accepted by `recordTelemetry`. */
export interface RecordTelemetryInput {
  shipmentId: string;
  ustn: string;
  containerId?: string;
  actualTempC: number;
  setpointTempC?: number;
  supplyAirTempC?: number;
  returnAirTempC?: number;
  humidityPct?: number;
  o2Pct?: number;
  co2Pct?: number;
  n2Pct?: number;
  powerStatus?: ReeferPowerStatus | string;
  fuelLevelPct?: number;
  batteryVoltage?: number;
  lat?: number;
  lng?: number;
  source?: ReeferTelemetrySource | string;
  deviceId?: string;
  /** Raw provider payload — stringified JSON, kept for audit. */
  rawPayload?: unknown;
}

/** Row shape returned by query helpers (mirrors Prisma model). */
export interface ReeferTelemetryRecord {
  id: string;
  shipmentId: string;
  containerId: string | null;
  ustn: string;
  timestamp: Date;
  setpointTempC: number | null;
  actualTempC: number;
  supplyAirTempC: number | null;
  returnAirTempC: number | null;
  humidityPct: number | null;
  o2Pct: number | null;
  co2Pct: number | null;
  n2Pct: number | null;
  powerStatus: string | null;
  fuelLevelPct: number | null;
  batteryVoltage: number | null;
  lat: number | null;
  lng: number | null;
  tempExcursion: boolean;
  doorOpen: boolean;
  powerFailure: boolean;
  defrostCycle: boolean;
  source: string;
  deviceId: string | null;
  rawPayload: string | null;
}

/** A contiguous temperature excursion window for a shipment. */
export interface ExcursionEvent {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  peakTempC: number;
  setpointTempC: number | null;
  maxDeviationC: number;
  readingCount: number;
}

/** Aggregate stats over all telemetry for a shipment. */
export interface TelemetryStats {
  minTemp: number | null;
  maxTemp: number | null;
  avgTemp: number | null;
  excursionCount: number;
  totalExcursionMinutes: number;
  lastReadingAt: Date | null;
  readingCount: number;
}

/**
 * Persist a single reefer telemetry reading.
 *
 * Sets `tempExcursion = true` when `|actualTempC - setpointTempC|` exceeds
 * the configured threshold AND the previous reading for the same shipment
 * was also out of range (sustained excursion, suppresses single-sample
 * noise). Sets `powerFailure = true` when the previous reading's
 * `powerStatus` was `"ON"` and the current reading is `"OFF"`.
 *
 * @returns the created `ReeferTelemetry` row (typed as `ReeferTelemetryRecord`).
 */
export async function recordTelemetry(
  input: RecordTelemetryInput,
): Promise<ReeferTelemetryRecord> {
  const setpoint = input.setpointTempC ?? null;
  const deviation =
    setpoint != null ? Math.abs(input.actualTempC - setpoint) : null;
  const isOutOfRange =
    deviation != null && deviation > TEMP_EXCURSION_THRESHOLD_C;

  // Look up the immediately previous reading to detect sustained excursions
  // and power-state transitions.
  const previous = await db.reeferTelemetry.findFirst({
    where: { shipmentId: input.shipmentId },
    orderBy: { timestamp: "desc" },
  });

  let tempExcursion = false;
  if (isOutOfRange) {
    // Sustained: previous reading was also out of range vs the same setpoint.
    if (
      previous?.setpointTempC != null &&
      previous?.actualTempC != null &&
      Math.abs(previous.actualTempC - previous.setpointTempC) >
        TEMP_EXCURSION_THRESHOLD_C
    ) {
      tempExcursion = true;
    } else if (previous == null) {
      // First reading already out of range — flag it.
      tempExcursion = true;
    }
  }

  let powerFailure = false;
  if (
    input.powerStatus &&
    String(input.powerStatus).toUpperCase() === "OFF" &&
    previous?.powerStatus &&
    String(previous.powerStatus).toUpperCase() === "ON"
  ) {
    powerFailure = true;
  }

  const created = await db.reeferTelemetry.create({
    data: {
      shipmentId: input.shipmentId,
      ustn: input.ustn,
      containerId: input.containerId || null,
      actualTempC: input.actualTempC,
      setpointTempC: setpoint,
      supplyAirTempC: input.supplyAirTempC ?? null,
      returnAirTempC: input.returnAirTempC ?? null,
      humidityPct: input.humidityPct ?? null,
      o2Pct: input.o2Pct ?? null,
      co2Pct: input.co2Pct ?? null,
      n2Pct: input.n2Pct ?? null,
      powerStatus: input.powerStatus ?? null,
      fuelLevelPct: input.fuelLevelPct ?? null,
      batteryVoltage: input.batteryVoltage ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      tempExcursion,
      powerFailure,
      source: (input.source as string) || "MANUAL",
      deviceId: input.deviceId ?? null,
      rawPayload: input.rawPayload
        ? safeStringify(input.rawPayload)
        : null,
    },
  });

  return created as unknown as ReeferTelemetryRecord;
}

/**
 * Fetch the time-series of telemetry for a shipment, optionally bounded by
 * `from` / `to` and capped at `limit` (default 500, max 5000).
 */
export async function getTelemetry(
  shipmentId: string,
  opts: { from?: Date; to?: Date; limit?: number } = {},
): Promise<ReeferTelemetryRecord[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 500), 5000);
  const rows = await db.reeferTelemetry.findMany({
    where: {
      shipmentId,
      ...(opts.from || opts.to
        ? {
            timestamp: {
              gte: opts.from,
              lte: opts.to,
            },
          }
        : {}),
    },
    orderBy: { timestamp: "asc" },
    take: limit,
  });
  return rows as unknown as ReeferTelemetryRecord[];
}

/**
 * Return the most recent telemetry reading for a shipment (or `null` if
 * no readings exist).
 */
export async function getLatestTelemetry(
  shipmentId: string,
): Promise<ReeferTelemetryRecord | null> {
  const row = await db.reeferTelemetry.findFirst({
    where: { shipmentId },
    orderBy: { timestamp: "desc" },
  });
  return (row as unknown as ReeferTelemetryRecord) || null;
}

/**
 * Scan all telemetry for a shipment and return an array of contiguous
 * excursion windows. An excursion window is a maximal run of consecutive
 * readings where `|actualTempC - setpointTempC| > 2°C`. Each event reports
 * the start/end timestamps, peak temperature, max deviation, and duration.
 */
export async function detectExcursions(
  shipmentId: string,
): Promise<ExcursionEvent[]> {
  const rows = await db.reeferTelemetry.findMany({
    where: { shipmentId },
    orderBy: { timestamp: "asc" },
  });

  const events: ExcursionEvent[] = [];
  let window: ReeferTelemetryRecord[] = [];

  const flush = () => {
    if (window.length === 0) return;
    const peak = window.reduce((m, r) =>
      Math.abs(r.actualTempC - (r.setpointTempC ?? 0)) >
      Math.abs(m.actualTempC - (m.setpointTempC ?? 0))
        ? r
        : m,
    );
    const setpoint = peak.setpointTempC;
    const start = window[0].timestamp;
    const end = window[window.length - 1].timestamp;
    const durationMinutes = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 60000),
    );
    events.push({
      startTime: start,
      endTime: end,
      durationMinutes,
      peakTempC: peak.actualTempC,
      setpointTempC: setpoint,
      maxDeviationC: Math.abs(peak.actualTempC - (setpoint ?? peak.actualTempC)),
      readingCount: window.length,
    });
    window = [];
  };

  for (const r of rows) {
    if (r.setpointTempC == null) continue;
    const out =
      Math.abs(r.actualTempC - r.setpointTempC) > TEMP_EXCURSION_THRESHOLD_C;
    if (out) {
      window.push(r as unknown as ReeferTelemetryRecord);
    } else {
      flush();
    }
  }
  flush();

  return events;
}

/**
 * Return aggregate stats for a shipment's telemetry: min/max/avg temp,
 * count of excursion events, total excursion minutes, last reading
 * timestamp, and total reading count.
 */
export async function getTelemetryStats(
  shipmentId: string,
): Promise<TelemetryStats> {
  const rows = await db.reeferTelemetry.findMany({
    where: { shipmentId },
    orderBy: { timestamp: "asc" },
    select: {
      actualTempC: true,
      setpointTempC: true,
      timestamp: true,
    },
  });

  if (rows.length === 0) {
    return {
      minTemp: null,
      maxTemp: null,
      avgTemp: null,
      excursionCount: 0,
      totalExcursionMinutes: 0,
      lastReadingAt: null,
      readingCount: 0,
    };
  }

  const temps = rows.map((r) => r.actualTempC);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const avgTemp = Math.round(
    (temps.reduce((s, t) => s + t, 0) / temps.length) * 100,
  ) / 100;

  const excursions = await detectExcursions(shipmentId);
  const totalExcursionMinutes = excursions.reduce(
    (s, e) => s + e.durationMinutes,
    0,
  );

  return {
    minTemp,
    maxTemp,
    avgTemp,
    excursionCount: excursions.length,
    totalExcursionMinutes,
    lastReadingAt: rows[rows.length - 1].timestamp,
    readingCount: rows.length,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string"
      ? value
      : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
