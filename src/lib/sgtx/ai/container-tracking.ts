// SGTX Container Tracking Service — Terminal49 integration
// Queries the Terminal49 API for live container tracking events.
// Falls back to a deterministic simulation when the API key is missing
// or the upstream service is unavailable.
//
// Docs: https://docs.terminal49.com/reference/introduction
// Endpoint: GET https://api.terminal49.com/v1/tracking_requests?filter[container_number]={number}
// Auth:    Authorization: Token token={TERMINAL49_API_KEY}

export interface ContainerTrackingEvent {
  timestamp: string;           // ISO 8601
  description: string;
  location?: string;           // port or facility name
  locode?: string;             // UN/LOCODE if available
  eventCode?: string;          // e.g. "GATE_OUT_FULL", "LOADED_ON_VESSEL"
  carrierCode?: string;
  isEstimated?: boolean;
}

export interface ContainerTrackingResult {
  containerNumber: string;
  status:
    | "PRE_ARRIVAL"
    | "EMPTY_OUT"
    | "FULL_IN"
    | "LOADED"
    | "IN_TRANSIT"
    | "DISCHARGED"
    | "AVAILABLE"
    | "RETURNED"
    | "UNKNOWN";
  currentLocation?: string;
  currentLocode?: string;
  vessel?: string;
  vesselImo?: string;
  voyage?: string;
  carrier?: string;
  eta?: string;                // ISO 8601 — estimated arrival at POD
  ata?: string;                // actual time of arrival
  etd?: string;                // estimated time of departure
  atd?: string;                // actual time of departure
  pol?: string;                // port of loading (locode)
  pod?: string;                // port of discharge (locode)
  events: ContainerTrackingEvent[];
  lastUpdated: string;
  source: "TERMINAL49" | "SIMULATED";
  raw?: any;                   // raw upstream payload (T49 only)
}

// ─── Internal helpers ───────────────────────────────────────────
function t49Key(): string | undefined {
  return process.env.TERMINAL49_API_KEY;
}

function normalizeContainerNumber(input: string): string | null {
  // ISO 6346: 4 letters + 7 digits, last digit is check digit. We accept
  // case-insensitively and strip whitespace/dashes.
  const cleaned = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{4}\d{7}$/.test(cleaned)) return cleaned;
  return null;
}

// Map Terminal49 event codes / state strings → SGTX status bucket.
function mapStatus(rawState?: string, eventCodes: string[] = []): ContainerTrackingResult["status"] {
  const codes = eventCodes.join(" ").toUpperCase();
  const state = (rawState || "").toUpperCase();
  if (state.includes("PRE_ARRIVAL") || codes.includes("PRE_ARRIVAL")) return "PRE_ARRIVAL";
  if (codes.includes("GATE_OUT_EMPTY") || state.includes("EMPTY_OUT")) return "EMPTY_OUT";
  if (codes.includes("GATE_IN_FULL") || state.includes("FULL_IN")) return "FULL_IN";
  if (codes.includes("LOADED") || state.includes("LOADED")) return "LOADED";
  if (state.includes("IN_TRANSIT") || codes.includes("IN_TRANSIT")) return "IN_TRANSIT";
  if (codes.includes("DISCHARGED") || state.includes("DISCHARGED")) return "DISCHARGED";
  if (codes.includes("AVAILABLE") || state.includes("AVAILABLE")) return "AVAILABLE";
  if (codes.includes("RETURNED") || state.includes("RETURNED")) return "RETURNED";
  return "UNKNOWN";
}

// ─── Terminal49 API call ────────────────────────────────────────
async function fetchTerminal49(containerNumber: string): Promise<ContainerTrackingResult | null> {
  const key = t49Key();
  if (!key) return null;
  const normalized = normalizeContainerNumber(containerNumber);
  if (!normalized) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `https://api.terminal49.com/v1/tracking_requests?filter[container_number]=${encodeURIComponent(normalized)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Token token=${key}`,
        "Accept": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload: any = await res.json();
    // Terminal49 returns { data: [ { attributes, relationships, id } ], included: [...] }
    const items: any[] = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
    const first = items.find((it) => {
      const cn = it?.attributes?.container_number || it?.attributes?.containerNumber;
      return cn && String(cn).toUpperCase() === normalized;
    }) || items[0];
    if (!first) return null;

    const attrs = first.attributes || {};
    const eventCodes: string[] = [];
    const events: ContainerTrackingEvent[] = [];

    // Events come via included[] linked through relationships.events
    const included: any[] = Array.isArray(payload?.included) ? payload.included : [];
    const eventRelIds: string[] = (first?.relationships?.events?.data || []).map((r: any) => r?.id).filter(Boolean);
    for (const inc of included) {
      if (inc?.type !== "events") continue;
      if (eventRelIds.length > 0 && !eventRelIds.includes(inc.id)) continue;
      const a = inc.attributes || {};
      if (a.event_code) eventCodes.push(a.event_code);
      events.push({
        timestamp: a.event_time || a.timestamp || a.created_at || new Date().toISOString(),
        description: a.description || a.event_type || a.event_code || "Event recorded",
        location: a.location_name || a.facility_name || a.city || undefined,
        locode: a.locode || a.port_code || undefined,
        eventCode: a.event_code || a.event_type || undefined,
        carrierCode: a.carrier_code || undefined,
        isEstimated: a.estimated === true || a.is_estimated === true,
      });
    }
    events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    return {
      containerNumber: normalized,
      status: mapStatus(attrs.state || attrs.status, eventCodes),
      currentLocation: attrs.last_event_location || attrs.current_location || events[0]?.location,
      currentLocode: attrs.last_event_locode || events[0]?.locode,
      vessel: attrs.vessel_name || attrs.vessel || undefined,
      vesselImo: attrs.vessel_imo || undefined,
      voyage: attrs.voyage_number || attrs.voyage || undefined,
      carrier: attrs.carrier || attrs.shipping_line || undefined,
      eta: attrs.eta_pod || attrs.eta || undefined,
      ata: attrs.ata_pod || attrs.ata || undefined,
      etd: attrs.etd_pol || attrs.etd || undefined,
      atd: attrs.atd_pol || attrs.atd || undefined,
      pol: attrs.pol || attrs.port_of_loading || undefined,
      pod: attrs.pod || attrs.port_of_discharge || undefined,
      events,
      lastUpdated: attrs.updated_at || new Date().toISOString(),
      source: "TERMINAL49",
      raw: attrs,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Simulation fallback ────────────────────────────────────────
// Deterministic-ish (seeded by container number hash) so repeated
// calls for the same container return consistent results.
function simulateContainer(containerNumber: string): ContainerTrackingResult {
  let hash = 0;
  for (let i = 0; i < containerNumber.length; i++) {
    hash = (hash * 31 + containerNumber.charCodeAt(i)) & 0xffff;
  }
  const seed = hash;
  const rand = (salt: number) => {
    const x = Math.sin(seed + salt) * 10000;
    return x - Math.floor(x);
  };

  const statuses: ContainerTrackingResult["status"][] = [
    "IN_TRANSIT", "IN_TRANSIT", "IN_TRANSIT", "LOADED", "DISCHARGED", "AVAILABLE",
  ];
  const status = statuses[Math.floor(rand(1) * statuses.length)];

  const polPool = ["EGALY", "CNSHA", "SGSIN", "TRIST", "INNSA"];
  const podPool = ["DEHAM", "USLAX", "NLRTM", "BEANR", "GBFXT"];
  const pol = polPool[Math.floor(rand(2) * polPool.length)];
  const pod = podPool[Math.floor(rand(3) * podPool.length)];
  const vessels = ["MAERSK ESSEX", "MSC OSCAR", "CMA CGM MARCO POLO", "EVER ACE", "HMM ALGECIRAS"];
  const vessel = vessels[Math.floor(rand(4) * vessels.length)];
  const carriers = ["MAERSK", "MSC", "CMA_CGM", "EVERGREEN", "HMM"];
  const carrier = carriers[Math.floor(rand(5) * carriers.length)];

  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86400000).toISOString();
  const future = (n: number) => new Date(now + n * 86400000).toISOString();

  const events: ContainerTrackingEvent[] = [
    { timestamp: days(20), description: "Empty container released from depot", location: pol, locode: pol, eventCode: "GATE_OUT_EMPTY" },
    { timestamp: days(18), description: "Container stuffed and gated-in at POL", location: pol, locode: pol, eventCode: "GATE_IN_FULL" },
    { timestamp: days(16), description: `Loaded on vessel ${vessel}`, location: pol, locode: pol, eventCode: "LOADED_ON_VESSEL" },
    { timestamp: days(8), description: "Vessel departed POL", location: pol, locode: pol, eventCode: "VESSEL_DEPARTED" },
    { timestamp: status === "DISCHARGED" || status === "AVAILABLE" ? days(1) : future(4), description: `Vessel arrived at POD ${pod}`, location: pod, locode: pod, eventCode: "VESSEL_ARRIVED" },
    ...(status === "DISCHARGED" || status === "AVAILABLE"
      ? [{ timestamp: days(0.5), description: "Container discharged from vessel", location: pod, locode: pod, eventCode: "DISCHARGED" }]
      : []),
    ...(status === "AVAILABLE"
      ? [{ timestamp: days(0.1), description: "Container available for pickup", location: pod, locode: pod, eventCode: "AVAILABLE" }]
      : []),
  ];

  return {
    containerNumber,
    status,
    currentLocation: status === "IN_TRANSIT" ? `At sea (en route ${pol} → ${pod})` : pod,
    currentLocode: status === "IN_TRANSIT" ? undefined : pod,
    vessel,
    vesselImo: String(9700000 + Math.floor(rand(6) * 99999)),
    voyage: `${carrier.substring(0, 2)}${100 + Math.floor(rand(7) * 800)}E`,
    carrier,
    eta: status === "DISCHARGED" || status === "AVAILABLE" ? days(0.5) : future(4),
    atd: days(8),
    etd: days(9),
    pol,
    pod,
    events,
    lastUpdated: new Date().toISOString(),
    source: "SIMULATED",
  };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Track a single container by its ISO 6346 number. Prefers the Terminal49
 * API and falls back to a deterministic simulation when the API is
 * unavailable. Always returns a ContainerTrackingResult — the `source`
 * field tells the caller which path produced the data.
 */
export async function trackContainer(containerNumber: string): Promise<ContainerTrackingResult> {
  const normalized = normalizeContainerNumber(containerNumber);
  if (!normalized) {
    // Can't even normalise — return a minimal SIMULATED record so callers
    // can still surface *something*.
    return simulateContainer(String(containerNumber || "XXXX0000000").toUpperCase());
  }
  const live = await fetchTerminal49(normalized);
  if (live) return live;
  return simulateContainer(normalized);
}

/**
 * Batch-track many containers. Runs requests concurrently (cap 5) and
 * returns one result per input container. Failures fall back to simulation
 * transparently.
 */
export async function trackContainers(containerNumbers: string[]): Promise<ContainerTrackingResult[]> {
  const unique = Array.from(new Set((containerNumbers || []).map((c) => String(c || "").toUpperCase()).filter(Boolean)));
  if (unique.length === 0) return [];

  const out: ContainerTrackingResult[] = [];
  const concurrency = 5;
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map((cn) => trackContainer(cn)));
    out.push(...results);
  }
  return out;
}

/**
 * Aggregate summary across many containers — useful for dashboards.
 */
export function summarizeContainerTracking(results: ContainerTrackingResult[]) {
  const byStatus: Record<string, number> = {};
  let t49 = 0, sim = 0;
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.source === "TERMINAL49") t49++; else sim++;
  }
  return {
    total: results.length,
    liveTerminal49: t49,
    simulated: sim,
    byStatus,
    anyDelayed: results.some((r) => r.status === "IN_TRANSIT" && r.eta && new Date(r.eta).getTime() > Date.now() + 7 * 86400000),
    allDischarged: results.length > 0 && results.every((r) => r.status === "DISCHARGED" || r.status === "AVAILABLE" || r.status === "RETURNED"),
  };
}
