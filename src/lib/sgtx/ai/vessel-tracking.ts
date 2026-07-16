// SGTX Vessel Tracking Service with AI ETA Prediction
// Tracks vessel name → current position → predicted ETA at port of loading and port of discharge.
// Uses AI to predict delays, early arrivals, and on-time status with reasoning.
//
// Tier 3 fix: `trackVesselWithAIS()` integrates the real AISStream.io client
// (`ais-vessel-tracking.ts`) and falls back to the existing simulation +
// AI-prediction path when AIS is unavailable (no API key, network error,
// vessel not found). This unblocks the three routes that imported the
// symbol before it existed.

import { getVesselPosition as getAISPosition, type VesselPosition as AISPosition } from "@/lib/sgtx/ai/ais-vessel-tracking";
import { runAI } from "@/lib/sgtx/ai/multi-provider";

export interface VesselPosition {
  vesselName: string;
  vesselImo?: string;            // IMO number (7 digits)
  carrier: string;               // MAERSK, MSC, etc.
  serviceName?: string;          // e.g., "AE7" (Maersk Asia-Europe loop)
  // Current position
  latitude: number;
  longitude: number;
  currentPort?: string;          // if at port
  currentStatus: "AT_PORT" | "IN_TRANSIT" | "ANCHORED" | "DRY_DOCK";
  speedKnots: number;
  headingDeg: number;
  lastUpdated: string;           // ISO timestamp
  // Voyage
  voyageNumber: string;
  originPort: string;
  destinationPort: string;
  departureTime: string;         // actual departure from origin
  scheduledArrivalTime: string;  // carrier-published ETA
  predictedArrivalTime: string;  // AI-predicted arrival
  // Status
  arrivalStatus: "ON_TIME" | "EARLY" | "DELAYED" | "AT_RISK";
  delayMinutes: number;          // positive = late, negative = early
  confidence: number;
  aiReasoning?: string;
}

export interface VesselScheduleEvent {
  port: string;
  portName: string;
  eventType: "ARRIVAL" | "DEPARTURE" | "BERTHED" | "UNBERTHED";
  scheduledTime: string;
  actualTime?: string;
  status: "SCHEDULED" | "COMPLETED" | "DELAYED" | "ESTIMATED";
  delayMinutes?: number;
}

export interface VesselTrackingResult {
  vessel: VesselPosition;
  schedule: VesselScheduleEvent[];
  notifications: VesselNotification[];
  aiAnalysis: {
    overallStatus: string;
    riskFactors: string[];
    recommendation: string;
    confidence: number;
  };
}

export interface VesselNotification {
  type: "DELAY_WARNING" | "EARLY_ARRIVAL" | "ON_TIME" | "AT_PORT" | "DEPARTED" | "SCHEDULE_CHANGE";
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  port: string;
  affectedTime?: string;
  actionRequired?: string;
}

// ─── Curated vessel database (major container ships) ───
const VESSEL_DB: { name: string; imo: string; carrier: string; teu: number; serviceName?: string }[] = [
  // Maersk
  { name: "MAERSK ESSEX", imo: "9699301", carrier: "MAERSK", teu: 18270, serviceName: "AE7" },
  { name: "MAERSK EDINBURGH", imo: "9778751", carrier: "MAERSK", teu: 15050, serviceName: "AE7" },
  { name: "MADRID MAERSK", imo: "9778790", carrier: "MAERSK", teu: 20568, serviceName: "AE10" },
  { name: "MUMBAI MAERSK", imo: "9778806", carrier: "MAERSK", teu: 20568, serviceName: "AE10" },
  { name: "MUNICH MAERSK", imo: "9778818", carrier: "MAERSK", teu: 20568, serviceName: "AE10" },
  { name: "MAERSK HONAM", imo: "9778791", carrier: "MAERSK", teu: 20568, serviceName: "AE11" },
  { name: "EUGEN MAERSK", imo: "9321554", carrier: "MAERSK", teu: 11038, serviceName: "AE2" },
  { name: "MAERSK MC-KINNEY MOLLER", imo: "9619907", carrier: "MAERSK", teu: 18340 },

  // MSC
  { name: "MSC OSCAR", imo: "9703291", carrier: "MSC", teu: 19224, serviceName: "AE9" },
  { name: "MSC OLIVER", imo: "9703280", carrier: "MSC", teu: 19224, serviceName: "AE9" },
  { name: "MSC GÜLSÜN", imo: "9839430", carrier: "MSC", teu: 23756, serviceName: "AE12" },
  { name: "MSC SAMAR", imo: "9839442", carrier: "MSC", teu: 23756 },
  { name: "MSC DIANA", imo: "9284499", carrier: "MSC", teu: 14000, serviceName: "DRAGON" },
  { name: "MSC ISABELLA", imo: "9757357", carrier: "MSC", teu: 23656 },

  // CMA CGM
  { name: "CMA CGM MARCO POLO", imo: "9454436", carrier: "CMA_CGM", teu: 16022, serviceName: "FAL5" },
  { name: "CMA CGM JULES VERNE", imo: "9454448", carrier: "CMA_CGM", teu: 16022, serviceName: "FAL5" },
  { name: "CMA CGM ANTOINE DE SAINT EXUPERY", imo: "9775940", carrier: "CMA_CGM", teu: 20900, serviceName: "FAL1" },
  { name: "CMA CGM BOUGAINVILLE", imo: "9702140", carrier: "CMA_CGM", teu: 18900 },

  // Hapag-Lloyd
  { name: "HAMBURG EXPRESS", imo: "9467444", carrier: "HAPAG_LLOYD", teu: 13900, serviceName: "EUROPE_SERVICE" },
  { name: "BERLIN EXPRESS", imo: "9795546", carrier: "HAPAG_LLOYD", teu: 23660 },
  { name: "FRANKFURT EXPRESS", imo: "9505500", carrier: "HAPAG_LLOYD", teu: 13200 },

  // COSCO
  { name: "COSCO SHIPPING UNIVERSE", imo: "9795610", carrier: "COSCO", teu: 21237, serviceName: "AEU7" },
  { name: "COSCO SHIPPING GALAXY", imo: "9776040", carrier: "COSCO", teu: 21237 },
  { name: "COSCO SHIPPING VIRGO", imo: "9795530", carrier: "COSCO", teu: 21237 },

  // ONE (Ocean Network Express)
  { name: "ONE INNOVATION", imo: "9805150", carrier: "ONE", teu: 14000, serviceName: "FE5" },
  { name: "ONE INSPIRATION", imo: "9800480", carrier: "ONE", teu: 14000 },

  // Evergreen
  { name: "EVER ACE", imo: "9868660", carrier: "EVERGREEN", teu: 23992 },
  { name: "EVER ALOT", imo: "9868672", carrier: "EVERGREEN", teu: 23992 },

  // ZIM
  { name: "ZIM SHANGHAI", imo: "9322998", carrier: "ZIM", teu: 10000, serviceName: "ZCA" },

  // HMM
  { name: "HMM ALGECIRAS", imo: "9863297", carrier: "HMM", teu: 23964 },
  { name: "HMM COPENHAGEN", imo: "9863304", carrier: "HMM", teu: 23964 },
];

// ─── Schedule patterns: voyage events for major routes ───
// (Simplified — in production, this would come from AIS + carrier APIs)
const SCHEDULE_TEMPLATES: Record<string, { port: string; portName: string; offsetDays: number }[]> = {
  // Asia → Europe (CNSHA → DEHAM, ~32 days)
  "CNSHA-DEHAM": [
    { port: "CNSHA", portName: "Shanghai", offsetDays: 0 },
    { port: "CNHKG", portName: "Hong Kong", offsetDays: 2 },
    { port: "SGSIN", portName: "Singapore", offsetDays: 6 },
    { port: "LKCMB", portName: "Colombo", offsetDays: 10 },
    { port: "SALAD", portName: "Salalah", offsetDays: 14 },
    { port: "BEANR", portName: "Antwerp", offsetDays: 28 },
    { port: "DEHAM", portName: "Hamburg", offsetDays: 32 },
  ],
  // Egypt → Europe (EGALX → DEHAM, ~14 days)
  "EGALX-DEHAM": [
    { port: "EGALX", portName: "Alexandria", offsetDays: 0 },
    { port: "ITGOA", portName: "Genoa", offsetDays: 4 },
    { port: "ESBCN", portName: "Barcelona", offsetDays: 6 },
    { port: "BEANR", portName: "Antwerp", offsetDays: 11 },
    { port: "DEHAM", portName: "Hamburg", offsetDays: 14 },
  ],
  // Asia → US West Coast (CNSHA → USLAX, ~16 days)
  "CNSHA-USLAX": [
    { port: "CNSHA", portName: "Shanghai", offsetDays: 0 },
    { port: "CNHKG", portName: "Hong Kong", offsetDays: 2 },
    { port: "KRPUS", portName: "Busan", offsetDays: 4 },
    { port: "USLAX", portName: "Los Angeles", offsetDays: 16 },
  ],
};

function getSchedule(origin: string, dest: string): { port: string; portName: string; offsetDays: number }[] {
  return SCHEDULE_TEMPLATES[`${origin}-${dest}`] || [
    { port: origin, portName: origin, offsetDays: 0 },
    { port: dest, portName: dest, offsetDays: 14 },
  ];
}

export function searchVessel(name: string): { name: string; imo: string; carrier: string; teu: number; serviceName?: string } | null {
  const q = name.toUpperCase();
  // Exact match
  let v = VESSEL_DB.find((x) => x.name === q);
  if (v) return v;
  // Partial match
  v = VESSEL_DB.find((x) => x.name.includes(q) || q.includes(x.name));
  if (v) return v;
  return null;
}

export function getAllVessels() {
  return VESSEL_DB;
}

// Simulate vessel position (in production, would use AIS data from MarineTraffic/VesselFinder)
function simulatePosition(vessel: { name: string; imo: string; carrier: string; teu: number; serviceName?: string }, origin: string, dest: string, daysSinceDeparture: number, scheduledTransitDays: number) {
  const schedule = getSchedule(origin, dest);
  const progress = Math.min(1, daysSinceDeparture / scheduledTransitDays);

  // Find current position based on schedule
  let currentPort = "";
  let currentStatus: VesselPosition["currentStatus"] = "IN_TRANSIT";
  let nextPortIdx = 0;
  for (let i = 0; i < schedule.length; i++) {
    if (schedule[i].offsetDays > daysSinceDeparture) {
      nextPortIdx = i;
      break;
    }
    if (i === schedule.length - 1 || schedule[i + 1].offsetDays > daysSinceDeparture) {
      currentPort = schedule[i].port;
      // At port if within ±0.5 days of scheduled arrival
      if (Math.abs(daysSinceDeparture - schedule[i].offsetDays) < 0.5) {
        currentStatus = "AT_PORT";
      }
      nextPortIdx = i + 1;
      break;
    }
  }

  // Generate plausible lat/long (simulated)
  const baseLat = origin.startsWith("EG") ? 35 : origin.startsWith("CN") ? 30 : 40;
  const baseLng = origin.startsWith("EG") ? 30 : origin.startsWith("CN") ? 120 : -70;
  const destLat = dest.startsWith("DE") ? 53 : dest.startsWith("US") ? 33 : 1;
  const destLng = dest.startsWith("DE") ? 10 : dest.startsWith("USLAX") ? -118 : 100;
  const lat = baseLat + (destLat - baseLat) * progress + (Math.random() - 0.5) * 2;
  const lng = baseLng + (destLng - baseLng) * progress + (Math.random() - 0.5) * 2;

  return {
    latitude: Math.round(lat * 100) / 100,
    longitude: Math.round(lng * 100) / 100,
    currentPort: currentStatus === "AT_PORT" ? currentPort : undefined,
    currentStatus,
    speedKnots: currentStatus === "IN_TRANSIT" ? 18 + Math.round(Math.random() * 8) : 0,
    headingDeg: Math.round(Math.random() * 360),
    nextPortIdx,
  };
}

// Main tracking function with AI prediction
export async function trackVessel(input: {
  vesselName: string;
  originPort?: string;
  destinationPort?: string;
  scheduledArrivalDays?: number;  // days from departure to scheduled arrival
  daysSinceDeparture?: number;    // how many days since vessel departed
  cargoValueUsd?: number;
  ustn?: string;                  // SGTX shipment reference
}): Promise<VesselTrackingResult> {
  const vesselName = input.vesselName.toUpperCase().trim();
  const vesselInfo = searchVessel(vesselName) || { name: vesselName, imo: String(Math.floor(1000000 + Math.random() * 9000000)), carrier: "UNKNOWN", teu: 15000 };
  const origin = (input.originPort || "CNSHA").toUpperCase();
  const dest = (input.destinationPort || "DEHAM").toUpperCase();
  const scheduledTransitDays = input.scheduledArrivalDays || 25;
  const daysSinceDeparture = input.daysSinceDeparture ?? Math.floor(Math.random() * scheduledTransitDays);

  // 1. Build schedule
  const scheduleTemplate = getSchedule(origin, dest);
  const departureTime = new Date(Date.now() - daysSinceDeparture * 86400000);
  const scheduledArrivalTime = new Date(departureTime.getTime() + scheduledTransitDays * 86400000);

  // 2. Simulate position
  const pos = simulatePosition(vesselInfo, origin, dest, daysSinceDeparture, scheduledTransitDays);

  // 3. AI prediction of arrival time
  let predictedArrivalTime = new Date(scheduledArrivalTime);
  let arrivalStatus: VesselPosition["arrivalStatus"] = "ON_TIME";
  let delayMinutes = 0;
  let confidence = 0.7;
  let aiReasoning = "";
  const riskFactors: string[] = [];
  const notifications: VesselNotification[] = [];

  try {
    // Re-wired to use the Brain AI multi-provider chain (Gemini → OpenRouter
    // → Groq → HuggingFace → static fallback) via `runAI()` from
    // `@/lib/sgtx/ai/multi-provider`. The model is prompted to return a
    // strict JSON shape ({eta, confidence, reasoning, riskFactors}) so we
    // can parse it deterministically. Any failure (network, JSON.parse,
    // missing fields) falls through to the heuristic block below.
    const distanceNm = Math.round(scheduledTransitDays * 24 * 18); // ~18 knots avg
    const histAvg = scheduledTransitDays;
    const congestion = dest.startsWith("US") ? "high" : dest.startsWith("DE") ? "medium" : "low";
    const weather = "seasonal";
    const aiResult = await runAI({
      agent_name: "vessel-eta-predictor",
      authority_level: "A1",
      system_prompt:
        "You are a maritime logistics AI. Predict vessel ETA based on current position, destination, speed, and historical patterns. Return JSON: {eta, confidence, reasoning, riskFactors}",
      user_prompt:
        `Vessel: ${vesselInfo.name} (IMO ${vesselInfo.imo}), Current position: ${pos.latitude},${pos.longitude}, ` +
        `Destination: ${dest}, Speed: ${pos.speedKnots} knots, Distance remaining: ${distanceNm} nm, ` +
        `Historical avg: ${histAvg} days, Congestion: ${congestion}, Weather: ${weather}`,
      max_tokens: 500,
      temperature: 0.2,
    });

    // Extract the first {...} JSON block from the AI response (the model
    // sometimes wraps JSON in markdown fences or surrounds it with prose).
    const content = (aiResult?.content || "").trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI ETA response contained no JSON object");
    const parsed = JSON.parse(jsonMatch[0]) as {
      eta?: string;
      confidence?: number;
      reasoning?: string;
      riskFactors?: string[];
    };
    const predictedIso = parsed.eta ? new Date(parsed.eta).toISOString() : null;
    if (!predictedIso || !Number.isFinite(new Date(predictedIso).getTime())) {
      throw new Error("AI ETA response missing valid `eta` field");
    }
    predictedArrivalTime = new Date(predictedIso);
    confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.75;
    aiReasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim()
      ? parsed.reasoning.trim()
      : "AI prediction (multi-provider chain)";
    if (Array.isArray(parsed.riskFactors)) {
      for (const rf of parsed.riskFactors) {
        if (typeof rf === "string" && rf.trim()) riskFactors.push(rf.trim());
      }
    }
    const delayMs = predictedArrivalTime.getTime() - scheduledArrivalTime.getTime();
    delayMinutes = Math.round(delayMs / 60000);
    arrivalStatus = delayMinutes > 1440 ? "DELAYED" : delayMinutes < -1440 ? "EARLY" : "ON_TIME";
  } catch (err) {
    // Heuristic fallback
    const congestionFactor = dest.startsWith("US") ? 0.15 : dest.startsWith("DE") ? 0.08 : 0.05;
    const weatherFactor = Math.random() > 0.7 ? 0.1 : 0;
    const totalDelay = Math.round(scheduledTransitDays * 86400 * (congestionFactor + weatherFactor) / 60);
    delayMinutes = totalDelay;
    arrivalStatus = delayMinutes > 1440 ? "DELAYED" : delayMinutes < -1440 ? "EARLY" : "ON_TIME";
    aiReasoning = `Heuristic estimate (AI unavailable: ${err instanceof Error ? err.message : "unknown error"}) — based on port congestion + weather factors`;
    confidence = 0.5;
    predictedArrivalTime = new Date(scheduledArrivalTime.getTime() + delayMinutes * 60000);
  }

  // 4. Build schedule events
  const schedule: VesselScheduleEvent[] = scheduleTemplate.map((s) => {
    const eventTime = new Date(departureTime.getTime() + s.offsetDays * 86400000);
    const isPast = s.offsetDays <= daysSinceDeparture;
    const isCurrent = Math.abs(s.offsetDays - daysSinceDeparture) < 0.5;
    return {
      port: s.port,
      portName: s.portName,
      eventType: isPast ? (s.port === origin ? "DEPARTURE" : "DEPARTURE") : "ARRIVAL",
      scheduledTime: eventTime.toISOString(),
      actualTime: isPast ? eventTime.toISOString() : undefined,
      status: isPast ? "COMPLETED" : isCurrent ? "ESTIMATED" : "SCHEDULED",
      delayMinutes: isPast ? Math.round((Math.random() - 0.3) * 240) : undefined,
    };
  });

  // 5. Add default notification if none from AI
  if (notifications.length === 0) {
    if (arrivalStatus === "DELAYED") {
      notifications.push({
        type: "DELAY_WARNING",
        severity: delayMinutes > 4320 ? "CRITICAL" : "WARNING",
        message: `Vessel ${vesselInfo.name} is predicted to arrive ${Math.round(delayMinutes / 60)}h late at ${dest}`,
        port: dest,
        affectedTime: predictedArrivalTime.toISOString(),
        actionRequired: delayMinutes > 4320 ? "Notify buyer of significant delay; consider demurrage claims" : "Monitor; update buyer ETA",
      });
    } else if (arrivalStatus === "EARLY") {
      notifications.push({
        type: "EARLY_ARRIVAL",
        severity: "INFO",
        message: `Vessel ${vesselInfo.name} is predicted to arrive ${Math.round(-delayMinutes / 60)}h early at ${dest}`,
        port: dest,
        affectedTime: predictedArrivalTime.toISOString(),
        actionRequired: "Ensure buyer/importer is ready for early cargo pickup",
      });
    } else {
      notifications.push({
        type: "ON_TIME",
        severity: "INFO",
        message: `Vessel ${vesselInfo.name} is on schedule for arrival at ${dest}`,
        port: dest,
        affectedTime: predictedArrivalTime.toISOString(),
      });
    }
  }

  // 6. Port of loading notification (origin)
  if (pos.currentStatus === "AT_PORT" && pos.currentPort) {
    notifications.push({
      type: "AT_PORT",
      severity: "INFO",
      message: `Vessel ${vesselInfo.name} is currently at port ${pos.currentPort}`,
      port: pos.currentPort,
    });
  }

  const overallStatus = arrivalStatus === "DELAYED"
    ? `Vessel is delayed by ${Math.round(delayMinutes / 60)} hours`
    : arrivalStatus === "EARLY"
    ? `Vessel will arrive ${Math.round(-delayMinutes / 60)} hours early`
    : "Vessel is on schedule";

  const recommendation = arrivalStatus === "DELAYED"
    ? delayMinutes > 4320
      ? "Significant delay detected. Notify consignee, check demurrage/detention exposure, and verify insurance coverage for delay claims."
      : "Minor delay. Monitor vessel position and notify consignee of updated ETA."
    : arrivalStatus === "EARLY"
    ? "Early arrival. Ensure consignee and customs broker are ready for early cargo pickup to avoid demurrage."
    : "On schedule. Continue monitoring.";

  return {
    vessel: {
      vesselName: vesselInfo.name,
      vesselImo: vesselInfo.imo,
      carrier: vesselInfo.carrier,
      serviceName: vesselInfo.serviceName,
      latitude: pos.latitude,
      longitude: pos.longitude,
      currentPort: pos.currentPort,
      currentStatus: pos.currentStatus,
      speedKnots: pos.speedKnots,
      headingDeg: pos.headingDeg,
      lastUpdated: new Date().toISOString(),
      voyageNumber: `${vesselInfo.carrier.substring(0, 2)}${String(Math.floor(Math.random() * 900) + 100)}E`,
      originPort: origin,
      destinationPort: dest,
      departureTime: departureTime.toISOString(),
      scheduledArrivalTime: scheduledArrivalTime.toISOString(),
      predictedArrivalTime: predictedArrivalTime.toISOString(),
      arrivalStatus,
      delayMinutes,
      confidence,
      aiReasoning,
    },
    schedule,
    notifications,
    aiAnalysis: {
      overallStatus,
      riskFactors,
      recommendation,
      confidence,
    },
  };
}

// ─── Tier 3: AIS-augmented tracking with graceful fallback ───────────
// The three routes under `src/app/api/sgtx/{vessel-tracking,ustn}/` import
// `trackVesselWithAIS` and treat it as the canonical entry point. This
// implementation:
//   1. Resolves the IMO number (from input, or DB lookup by vessel name).
//   2. Calls the real AIS client (`ais-vessel-tracking.ts` → `getVesselPosition`).
//   3. If AIS returns a fix, overrides the simulated lat/lng/speed/heading/
//      lastUpdated fields on top of the AI-predicted voyage envelope.
//   4. If AIS is unavailable (no API key, network error, vessel missing),
//      falls back to the original `trackVessel()` simulation path.
//   5. Returns the same `VesselTrackingResult` shape (plus `aisPosition`
//      and `source`) so callers do not need any code changes.

export type VesselTrackingSource = "AIS_LIVE" | "AIS_FALLBACK" | "SIMULATED";

export interface VesselTrackingResultWithAIS extends VesselTrackingResult {
  /** Raw AIS fix (or null when no live data was available). */
  aisPosition: AISPosition | null;
  /** Provenance flag — `AIS_LIVE` (real fix), `AIS_FALLBACK` (AIS attempted but unavailable, simulation used), `SIMULATED` (no IMO, simulation only). */
  source: VesselTrackingSource;
}

/**
 * Track a vessel with a live AIS overlay when available.
 *
 * Accepts either an IMO number (`imo` / `vesselImo`) or a vessel name; if
 * only a name is supplied, the curated vessel DB is consulted to resolve
 * the IMO. Optional routing context (`originPort`, `destinationPort`,
 * `scheduledArrivalDays`, `daysSinceDeparture`, `cargoValueUsd`, `ustn`)
 * is forwarded to the underlying `trackVessel()` for AI ETA prediction.
 *
 * Returns the same envelope as `trackVessel()` plus `aisPosition` and
 * `source` fields so existing route handlers work unchanged.
 */
export async function trackVesselWithAIS(input: {
  imo?: string;
  vesselImo?: string;
  vesselName?: string;
  ustn?: string;
  originPort?: string;
  destinationPort?: string;
  scheduledArrivalDays?: number;
  daysSinceDeparture?: number;
  cargoValueUsd?: number;
}): Promise<VesselTrackingResultWithAIS> {
  const vesselName = (input.vesselName || "").toUpperCase().trim();
  // Resolve IMO: explicit param > DB lookup by name.
  const explicitImo = (input.imo || input.vesselImo || "").trim();
  const dbMatch = vesselName ? searchVessel(vesselName) : null;
  const imo = explicitImo || dbMatch?.imo || "";

  // 1. Try live AIS first.
  let aisFix: AISPosition | null = null;
  if (imo) {
    try {
      aisFix = await getAISPosition(imo);
    } catch {
      aisFix = null;
    }
  }

  // 2. Always run the full simulation + AI ETA path (gives us schedule,
  //    notifications, risk factors). When a live fix exists, we overlay it.
  const fallback = await trackVessel({
    vesselName: vesselName || imo || "UNKNOWN",
    originPort: input.originPort,
    destinationPort: input.destinationPort,
    scheduledArrivalDays: input.scheduledArrivalDays,
    daysSinceDeparture: input.daysSinceDeparture,
    cargoValueUsd: input.cargoValueUsd,
    ustn: input.ustn,
  });

  let source: VesselTrackingSource;
  if (aisFix) {
    source = "AIS_LIVE";
    // Overlay the real fix on top of the simulated vessel envelope.
    fallback.vessel.latitude = aisFix.latitude;
    fallback.vessel.longitude = aisFix.longitude;
    fallback.vessel.speedKnots = Math.round(aisFix.speed * 10) / 10;
    fallback.vessel.headingDeg = Math.round(aisFix.heading || aisFix.course || 0);
    fallback.vessel.lastUpdated = aisFix.timestamp;
    // Map AIS nav status → our currentStatus enum where possible.
    const nav = (aisFix.navStatus || "").toUpperCase();
    if (nav.includes("ANCHOR") || nav.includes("MOORED")) {
      fallback.vessel.currentStatus = "ANCHORED";
      fallback.vessel.currentPort = aisFix.destination || fallback.vessel.currentPort;
    } else if (nav.includes("UNDER WAY") || aisFix.speed > 1) {
      fallback.vessel.currentStatus = "IN_TRANSIT";
    }
    // Prefer the real ship name if the caller only had an IMO.
    if (!vesselName && aisFix.shipName) {
      fallback.vessel.vesselName = aisFix.shipName.toUpperCase();
    }
  } else if (imo) {
    source = "AIS_FALLBACK";
  } else {
    source = "SIMULATED";
  }

  return {
    ...fallback,
    aisPosition: aisFix,
    source,
  };
}
