// SGTX Vessel Tracking Service with AI ETA Prediction
// Tracks vessel name → current position → predicted ETA at port of loading and port of discharge.
// Uses AI to predict delays, early arrivals, and on-time status with reasoning.

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
    // ZAI removed
    const zai = null;
    const completion = await /* ZAI removed */ (async () => ({ choices: [{ message: { content: "" } }] }))()({
      messages: [
        {
          role: "assistant",
          content: "You are a maritime logistics expert with access to vessel tracking, port congestion, and weather data. Predict vessel arrival times with reasoning. Respond with VALID JSON ONLY.",
        },
        {
          role: "user",
          content: `Vessel: ${vesselInfo.name} (IMO ${vesselInfo.imo}, ${vesselInfo.carrier}, ${vesselInfo.teu} TEU${vesselInfo.serviceName ? `, service ${vesselInfo.serviceName}` : ""})
Route: ${origin} → ${dest}
Days since departure: ${daysSinceDeparture}
Scheduled transit: ${scheduledTransitDays} days
Scheduled arrival: ${scheduledArrivalTime.toISOString().slice(0, 10)}
Current status: ${pos.currentStatus}${pos.currentPort ? ` at ${pos.currentPort}` : " in transit"}
Current position: ${pos.latitude}°, ${pos.longitude}°
Speed: ${pos.speedKnots} knots

Predict the vessel's actual arrival time at ${dest}. Consider: current speed, remaining distance, port congestion at destination, weather forecast (seasonal storms, monsoons), canal transit (Suez/Panama) if applicable, and carrier schedule reliability (Maersk ~75%, MSC ~70%, Hapag-Lloyd ~80%, CMA CGM ~72%).

Respond with VALID JSON only:
{
  "predicted_delay_minutes": 360,
  "arrival_status": "DELAYED",
  "confidence": 0.8,
  "reasoning": "Brief explanation of factors",
  "risk_factors": ["Risk 1", "Risk 2"],
  "notifications": [
    {"type": "DELAY_WARNING", "severity": "WARNING", "message": "Description", "port": "DEHAM", "action_required": "Recommended action"}
  ]
}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      delayMinutes = Math.round(parsed.predicted_delay_minutes || 0);
      arrivalStatus = parsed.arrival_status || "ON_TIME";
      confidence = Math.min(0.95, parsed.confidence || 0.7);
      aiReasoning = parsed.reasoning || "";
      if (Array.isArray(parsed.risk_factors)) riskFactors.push(...parsed.risk_factors);
      if (Array.isArray(parsed.notifications)) {
        for (const n of parsed.notifications) {
          notifications.push({
            type: n.type,
            severity: n.severity,
            message: n.message,
            port: n.port || dest,
            actionRequired: n.action_required,
          });
        }
      }
      predictedArrivalTime = new Date(scheduledArrivalTime.getTime() + delayMinutes * 60000);
    }
  } catch (err) {
    // Heuristic fallback
    const congestionFactor = dest.startsWith("US") ? 0.15 : dest.startsWith("DE") ? 0.08 : 0.05;
    const weatherFactor = Math.random() > 0.7 ? 0.1 : 0;
    const totalDelay = Math.round(scheduledTransitDays * 86400 * (congestionFactor + weatherFactor) / 60);
    delayMinutes = totalDelay;
    arrivalStatus = delayMinutes > 1440 ? "DELAYED" : delayMinutes < -1440 ? "EARLY" : "ON_TIME";
    aiReasoning = "Heuristic estimate (AI unavailable) — based on port congestion + weather factors";
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
