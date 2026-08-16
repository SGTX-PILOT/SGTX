// SGTX AIS Stream Vessel Tracking — Real-time vessel positions via AISStream API
// Replaces mock vessel-tracking data with real AIS data

const AIS_API_KEY = process.env.AIS_STREAM_API_KEY;
// CCL-003: Fixed AISStream.io endpoint URL.
// AISStream.io REST API is at https://api.aisstream.io/v1/lastposition
// (was incorrectly api.aistreams.com — that domain doesn't exist).
// Streaming positions use wss://stream.aisstream.io/v0/stream
const AIS_API_URL = "https://api.aisstream.io/v1/lastposition";

export interface VesselPosition {
  mmsi: number;
  imo: string;
  shipName: string;
  latitude: number;
  longitude: number;
  course: number;
  speed: number;
  heading: number;
  timestamp: string;
  shipType: string;
  destination: string;
  navStatus: string;
}

export interface VesselInArea {
  mmsi: number;
  imo: string;
  shipName: string;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
}

/** Get real-time vessel position by IMO number. */
export async function getVesselPosition(imo: string): Promise<VesselPosition | null> {
  if (!AIS_API_KEY) return null;
  try {
    const res = await fetch(`${AIS_API_URL}?imo=${imo}`, {
      headers: { "Authorization": `Bearer ${AIS_API_KEY}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.latitude) return null;
    return {
      mmsi: data.mmsi || 0,
      imo: data.imo || imo,
      shipName: data.shipName || data.name || "Unknown",
      latitude: data.latitude,
      longitude: data.longitude,
      course: data.course || 0,
      speed: data.speed || 0,
      heading: data.heading || 0,
      timestamp: data.timestamp || new Date().toISOString(),
      shipType: data.shipType || "Cargo",
      destination: data.destination || "",
      navStatus: data.navStatus || "Under way",
    };
  } catch { return null; }
}

/** Get all vessels in a geographic bounding box. */
export async function getVesselsInArea(latMin: number, latMax: number, lonMin: number, lonMax: number): Promise<VesselInArea[]> {
  if (!AIS_API_KEY) return [];
  try {
    const res = await fetch(`${AIS_API_URL}?latmin=${latMin}&latmax=${latMax}&lonmin=${lonMin}&lonmax=${lonMax}`, {
      headers: { "Authorization": `Bearer ${AIS_API_KEY}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((v: any) => ({
      mmsi: v.mmsi || 0,
      imo: v.imo || "",
      shipName: v.shipName || v.name || "Unknown",
      latitude: v.latitude || 0,
      longitude: v.longitude || 0,
      speed: v.speed || 0,
      course: v.course || 0,
    }));
  } catch { return []; }
}

/** Get vessels near a specific port (approximate coordinates). */
export async function getVesselsNearPort(portName: string, portLat: number, portLon: number, radiusKm: number = 50): Promise<VesselInArea[]> {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos(portLat * Math.PI / 180));
  return getVesselsInArea(portLat - latDelta, portLat + latDelta, portLon - lonDelta, portLon + lonDelta);
}

// Port coordinates cache
const PORT_COORDS: Record<string, { lat: number; lon: number }> = {
  "EGALX": { lat: 31.2, lon: 29.87 },   // Alexandria
  "EGDMT": { lat: 31.42, lon: 31.7 },    // Damietta
  "EGPSD": { lat: 31.27, lon: 32.3 },    // Port Said
  "DEHAM": { lat: 53.55, lon: 9.93 },    // Hamburg
  "NLRTM": { lat: 51.95, lon: 4.13 },    // Rotterdam
  "ITGOA": { lat: 44.4, lon: 8.93 },     // Genoa
  "SAJED": { lat: 21.48, lon: 39.19 },   // Jeddah
  "AEJEA": { lat: 25.0, lon: 55.05 },    // Jebel Ali
  "CNSHA": { lat: 31.22, lon: 121.48 },  // Shanghai
  "USNYC": { lat: 40.7, lon: -74.0 },    // New York
  "JPTYO": { lat: 35.68, lon: 139.77 },  // Tokyo
  "SGSIN": { lat: 1.27, lon: 103.85 },   // Singapore
};

/** Get vessels near a port by UN/LOCODE. */
export async function getVesselsNearPortCode(portCode: string, radiusKm: number = 50): Promise<VesselInArea[]> {
  const coords = PORT_COORDS[portCode.toUpperCase()];
  if (!coords) return [];
  return getVesselsNearPort(portCode, coords.lat, coords.lon, radiusKm);
}
