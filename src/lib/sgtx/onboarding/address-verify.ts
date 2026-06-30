// SGTX Free Worldwide Address Verification
// Uses OpenStreetMap Nominatim API — 100% free, no API key, no billing ever needed.
// Rate limit: 1 request per second (compliant with Nominatim usage policy).
// For production with high volume, self-host a Nominatim instance (still free).

export interface AddressVerificationResult {
  verified: boolean;
  confidence: number; // 0-1
  formatted: string;
  components: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  coordinates?: { lat: number; lon: number };
  source: "nominatim" | "postal" | "none";
  matches: { field: string; input: string; verified: string; match: boolean }[];
}

// Rate limiter — Nominatim requires max 1 req/sec
let lastNominatimCall = 0;
const NOMINATIM_MIN_INTERVAL = 1100; // 1.1 seconds

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < NOMINATIM_MIN_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, NOMINATIM_MIN_INTERVAL - elapsed));
  }
  lastNominatimCall = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": "SGTX-Platform/1.0 (sovereign-trade-execution)",
      "Accept-Language": "en",
    },
  });
}

/**
 * Verify an address using OpenStreetMap Nominatim (free, no billing).
 * Returns confidence score, formatted address, and component-level matches.
 */
export async function verifyAddress(input: {
  street?: string;
  houseNumber?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string; // ISO 3166-1 alpha-2
}): Promise<AddressVerificationResult> {
  const { street, houseNumber, city, state, postalCode, country } = input;

  // Build Nominatim query
  const params = new URLSearchParams();
  params.set("format", "jsonv2");
  params.set("addressdetails", "1");
  params.set("limit", "1");

  // Build the query string from components
  const queryParts: string[] = [];
  if (houseNumber && street) queryParts.push(`${houseNumber} ${street}`);
  else if (street) queryParts.push(street);
  if (city) queryParts.push(city);
  if (state) queryParts.push(state);
  if (postalCode) queryParts.push(postalCode);
  if (country) queryParts.push(country);

  if (queryParts.length === 0) {
    return {
      verified: false,
      confidence: 0,
      formatted: "",
      components: {},
      source: "none",
      matches: [],
    };
  }

  params.set("q", queryParts.join(", "));

  // Add country code if available (improves accuracy)
  if (country && country.length === 2) {
    params.set("countrycodes", country.toLowerCase());
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      // Fallback to postal-only verification
      return verifyPostalOnly(input);
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      return verifyPostalOnly(input);
    }

    const result = results[0];
    const addr = result.address || {};

    // Build component matches
    const matches: { field: string; input: string; verified: string; match: boolean }[] = [];

    if (street) {
      const verifiedRoad = addr.road || addr.pedestrian || addr.footway || "";
      matches.push({
        field: "street",
        input: street,
        verified: verifiedRoad,
        match: verifiedRoad.toLowerCase().includes(street.toLowerCase()) ||
               street.toLowerCase().includes(verifiedRoad.toLowerCase()),
      });
    }

    if (city) {
      const verifiedCity = addr.city || addr.town || addr.village || addr.hamlet || "";
      matches.push({
        field: "city",
        input: city,
        verified: verifiedCity,
        match: verifiedCity.toLowerCase().includes(city.toLowerCase()) ||
               city.toLowerCase().includes(verifiedCity.toLowerCase()),
      });
    }

    if (postalCode) {
      const verifiedPostcode = addr.postcode || "";
      matches.push({
        field: "postalCode",
        input: postalCode,
        verified: verifiedPostcode,
        match: verifiedPostcode.replace(/\s/g, "") === postalCode.replace(/\s/g, ""),
      });
    }

    if (state) {
      const verifiedState = addr.state || addr.region || "";
      matches.push({
        field: "state",
        input: state,
        verified: verifiedState,
        match: verifiedState.toLowerCase().includes(state.toLowerCase()),
      });
    }

    if (country) {
      const verifiedCountry = addr.country_code?.toUpperCase() || addr.country || "";
      matches.push({
        field: "country",
        input: country,
        verified: verifiedCountry,
        match: verifiedCountry.toUpperCase() === country.toUpperCase(),
      });
    }

    // Calculate confidence
    const matchedFields = matches.filter(m => m.match).length;
    const totalFields = matches.length || 1;
    const confidence = matchedFields / totalFields;

    return {
      verified: confidence >= 0.6, // 60% of fields must match
      confidence: Math.round(confidence * 100) / 100,
      formatted: result.display_name || "",
      components: {
        road: addr.road || addr.pedestrian || undefined,
        house_number: addr.house_number || undefined,
        city: addr.city || undefined,
        town: addr.town || undefined,
        village: addr.village || undefined,
        county: addr.county || undefined,
        state: addr.state || undefined,
        postcode: addr.postcode || undefined,
        country: addr.country || undefined,
        country_code: addr.country_code?.toUpperCase() || undefined,
      },
      coordinates: result.lat && result.lon ? {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
      } : undefined,
      source: "nominatim",
      matches,
    };
  } catch (error) {
    // Network error — fallback to postal-only verification
    return verifyPostalOnly(input);
  }
}

/**
 * Fallback: verify using postal code format validation only (no external API).
 */
async function verifyPostalOnly(input: {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}): Promise<AddressVerificationResult> {
  const { street, city, postalCode, country } = input;
  const matches: any[] = [];

  if (postalCode && country) {
    // Use the postal format validator
    try {
      const { isValidPostalCode } = await import("./postal-bank-data");
      const valid = isValidPostalCode(country, postalCode);
      matches.push({
        field: "postalCode",
        input: postalCode,
        verified: valid ? "Valid format" : "Invalid format",
        match: valid,
      });
    } catch {
      // Module not available
    }
  }

  const confidence = matches.length > 0 ? matches.filter((m: any) => m.match).length / matches.length : 0;

  return {
    verified: confidence >= 0.5,
    confidence: Math.round(confidence * 100) / 100,
    formatted: [street, city, postalCode, country].filter(Boolean).join(", "),
    components: {},
    source: "postal",
    matches,
  };
}

/**
 * Reverse geocode: get address from coordinates (free, no billing).
 */
export async function reverseGeocode(lat: number, lon: number): Promise<AddressVerificationResult> {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      lat: lat.toString(),
      lon: lon.toString(),
    });
    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      return { verified: false, confidence: 0, formatted: "", components: {}, source: "none", matches: [] };
    }

    const result = await response.json();
    const addr = result.address || {};

    return {
      verified: true,
      confidence: 1,
      formatted: result.display_name || "",
      components: {
        road: addr.road || undefined,
        house_number: addr.house_number || undefined,
        city: addr.city || undefined,
        town: addr.town || undefined,
        village: addr.village || undefined,
        county: addr.county || undefined,
        state: addr.state || undefined,
        postcode: addr.postcode || undefined,
        country: addr.country || undefined,
        country_code: addr.country_code?.toUpperCase() || undefined,
      },
      coordinates: { lat, lon },
      source: "nominatim",
      matches: [],
    };
  } catch {
    return { verified: false, confidence: 0, formatted: "", components: {}, source: "none", matches: [] };
  }
}
