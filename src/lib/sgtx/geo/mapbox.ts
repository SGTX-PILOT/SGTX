// SGTX Mapbox Integration — Geolocation, Address Verification, Trade Route Mapping
// Uses Mapbox GL JS API (free tier: 50k requests/month)
// Token: pk.eyJ1IjoiZm9ydGxlZW0iLCJhIjoiY21obnNhaGh3MDNqaTJrc2FveTIyYWw3MiJ9...

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";

export interface GeoCoordinates {
  lat: number;
  lon: number;
}

export interface MapboxAddressComponent {
  id: string;
  type: string;
  text: string;
  place_name: string;
  center: [number, number]; // [lon, lat]
  context?: { id: string; text: string }[];
  relevance: number;
}

export interface VerifiedAddress {
  verified: boolean;
  confidence: number;
  formatted: string;
  coordinates: GeoCoordinates | null;
  components: {
    address?: string;
    locality?: string;     // city
    region?: string;       // state/province
    postcode?: string;
    country?: string;
    countryCode?: string;
  };
  source: "mapbox" | "nominatim" | "none";
  raw?: any;
}

/**
 * Verify an address using Mapbox Geocoding API (forward geocoding).
 * Returns verified address with coordinates and component-level confidence.
 */
export async function verifyAddressMapbox(input: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): Promise<VerifiedAddress> {
  const { street, city, state, postalCode, country } = input;

  // Build query string
  const queryParts: string[] = [];
  if (street) queryParts.push(street);
  if (city) queryParts.push(city);
  if (state) queryParts.push(state);
  if (postalCode) queryParts.push(postalCode);
  if (country) queryParts.push(country);

  if (queryParts.length === 0) {
    return { verified: false, confidence: 0, formatted: "", coordinates: null, components: {}, source: "none" };
  }

  const query = encodeURIComponent(queryParts.join(", "));

  // Build country filter (ISO 3166-1 alpha-2, comma-separated)
  const countryCode = country?.length === 2 ? country.toLowerCase() : undefined;
  const countryParam = countryCode ? `&country=${countryCode}` : "";

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=address,place,locality,postcode${countryParam}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      // Fallback to Nominatim
      return verifyAddressNominatim(input);
    }

    const data = await response.json();
    if (!data.features || data.features.length === 0) {
      return verifyAddressNominatim(input);
    }

    const feature = data.features[0];
    const components: any = {};
    for (const ctx of feature.context || []) {
      if (ctx.id.startsWith("locality")) components.locality = ctx.text;
      else if (ctx.id.startsWith("region")) components.region = ctx.text;
      else if (ctx.id.startsWith("postcode")) components.postcode = ctx.text;
      else if (ctx.id.startsWith("country")) {
        components.country = ctx.text;
        components.countryCode = ctx.short_code?.toUpperCase();
      }
    }

    // Parse address line
    if (feature.address) components.address = `${feature.address} ${feature.text}`.trim();
    else if (feature.place_type?.includes("address")) components.address = feature.text;

    return {
      verified: feature.relevance >= 0.7,
      confidence: feature.relevance,
      formatted: feature.place_name,
      coordinates: { lat: feature.center[1], lon: feature.center[0] },
      components,
      source: "mapbox",
      raw: feature,
    };
  } catch {
    return verifyAddressNominatim(input);
  }
}

/**
 * Reverse geocode: get address from coordinates using Mapbox.
 */
export async function reverseGeocodeMapbox(lat: number, lon: number): Promise<VerifiedAddress> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=address`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      return { verified: false, confidence: 0, formatted: "", coordinates: { lat, lon }, components: {}, source: "none" };
    }

    const data = await response.json();
    if (!data.features || data.features.length === 0) {
      return { verified: false, confidence: 0, formatted: "", coordinates: { lat, lon }, components: {}, source: "none" };
    }

    const feature = data.features[0];
    const components: any = {};
    for (const ctx of feature.context || []) {
      if (ctx.id.startsWith("locality")) components.locality = ctx.text;
      else if (ctx.id.startsWith("region")) components.region = ctx.text;
      else if (ctx.id.startsWith("postcode")) components.postcode = ctx.text;
      else if (ctx.id.startsWith("country")) {
        components.country = ctx.text;
        components.countryCode = ctx.short_code?.toUpperCase();
      }
    }

    return {
      verified: true,
      confidence: feature.relevance,
      formatted: feature.place_name,
      coordinates: { lat, lon },
      components,
      source: "mapbox",
      raw: feature,
    };
  } catch {
    return { verified: false, confidence: 0, formatted: "", coordinates: { lat, lon }, components: {}, source: "none" };
  }
}

/**
 * Get trade route information between two ports/cities.
 * Returns distance, estimated transit time, and route geometry.
 */
export async function getTradeRoute(origin: string, destination: string): Promise<{
  originCoords: GeoCoordinates | null;
  destCoords: GeoCoordinates | null;
  distanceKm: number | null;
  estimatedTransitDays: number | null;
  routeGeometry: any | null;
}> {
  try {
    // Geocode origin and destination
    const [originResult, destResult] = await Promise.all([
      geocodePlace(origin),
      geocodePlace(destination),
    ]);

    let distanceKm: number | null = null;
    let routeGeometry: any = null;

    if (originResult && destResult) {
      // Calculate great-circle distance
      distanceKm = haversineDistance(originResult, destResult);

      // Try to get route from Mapbox Directions API (for land routes)
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originResult.lon},${originResult.lat};${destResult.lon},${destResult.lat}?access_token=${MAPBOX_TOKEN}&overview=full&geometries=geojson`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            distanceKm = data.routes[0].distance / 1000;
            routeGeometry = data.routes[0].geometry;
          }
        }
      } catch {
        // Directions API failed — use great-circle distance
      }

      // Estimate transit time (ocean freight: ~40km/h average including port time)
      const estimatedTransitDays = distanceKm ? Math.ceil(distanceKm / (40 * 24)) : null;

      return {
        originCoords: originResult,
        destCoords: destResult,
        distanceKm,
        estimatedTransitDays,
        routeGeometry,
      };
    }

    return { originCoords: originResult, destCoords: destResult, distanceKm: null, estimatedTransitDays: null, routeGeometry: null };
  } catch {
    return { originCoords: null, destCoords: null, distanceKm: null, estimatedTransitDays: null, routeGeometry: null };
  }
}

/**
 * Geocode a place name to coordinates using Mapbox.
 */
async function geocodePlace(place: string): Promise<GeoCoordinates | null> {
  try {
    const query = encodeURIComponent(place);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.features || data.features.length === 0) return null;
    return { lat: data.features[0].center[1], lon: data.features[0].center[0] };
  } catch {
    return null;
  }
}

/**
 * Fallback: verify address using OpenStreetMap Nominatim (free, no token needed).
 */
async function verifyAddressNominatim(input: {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}): Promise<VerifiedAddress> {
  const { street, city, postalCode, country } = input;
  const params = new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "1" });
  const queryParts: string[] = [];
  if (street) queryParts.push(street);
  if (city) queryParts.push(city);
  if (postalCode) queryParts.push(postalCode);
  if (country) queryParts.push(country);
  if (queryParts.length === 0) {
    return { verified: false, confidence: 0, formatted: "", coordinates: null, components: {}, source: "none" };
  }
  params.set("q", queryParts.join(", "));
  if (country?.length === 2) params.set("countrycodes", country.toLowerCase());

  try {
    await new Promise(r => setTimeout(r, 1100)); // Rate limit
    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const response = await fetch(url, { headers: { "User-Agent": "SGTX-Platform/1.0" } });
    if (!response.ok) return { verified: false, confidence: 0, formatted: "", coordinates: null, components: {}, source: "none" };
    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      return { verified: false, confidence: 0, formatted: "", coordinates: null, components: {}, source: "none" };
    }
    const r = results[0];
    const addr = r.address || {};
    return {
      verified: true,
      confidence: r.importance || 0.5,
      formatted: r.display_name || "",
      coordinates: { lat: parseFloat(r.lat), lon: parseFloat(r.lon) },
      components: {
        address: [addr.house_number, addr.road].filter(Boolean).join(" ") || undefined,
        locality: addr.city || addr.town || addr.village,
        region: addr.state,
        postcode: addr.postcode,
        country: addr.country,
        countryCode: addr.country_code?.toUpperCase(),
      },
      source: "nominatim",
      raw: r,
    };
  } catch {
    return { verified: false, confidence: 0, formatted: "", coordinates: null, components: {}, source: "none" };
  }
}

/**
 * Haversine distance between two coordinates (in km).
 */
function haversineDistance(a: GeoCoordinates, b: GeoCoordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
