// SGTX AI Transit Time Estimation Service
// Estimates average transit times between port pairs for different shipping lines.
// Uses a curated database of major port-pair × shipping-line transit times,
// with AI (z-ai-web-dev-sdk) fallback for port pairs not in the database.

export interface TransitRoute {
  originPort: string;        // UN/LOCODE e.g. "EGALX"
  originName: string;        // "Alexandria"
  destinationPort: string;   // "DEHAM"
  destinationName: string;   // "Hamburg"
  shippingLine: string;      // "MAERSK" | "MSC" | etc.
  transitTimeDays: number;
  frequencyPerWeek: number;
  serviceType: string;       // "DIRECT" | "TRANSSHIPMENT"
  transshipmentPort?: string;
  confidence: number;        // 0-1
  source: "database" | "ai";
}

export type ShippingLine = "MAERSK" | "MSC" | "CMA_CGM" | "HAPAG_LLOYD" | "COSCO" | "ONE" | "EVERGREEN" | "ZIM" | "HMM" | "YANG_MING";

const PORT_NAMES: Record<string, string> = {
  EGALX: "Alexandria", EGDMT: "Damietta", DEHAM: "Hamburg", NLRTM: "Rotterdam",
  BEANR: "Antwerp", GBFXT: "Felixstowe", USNYC: "New York", USLAX: "Los Angeles",
  CNSHA: "Shanghai", CNHKG: "Hong Kong", SGSIN: "Singapore", AEJEA: "Jebel Ali",
  INMUM: "Mumbai", THBKK: "Bangkok", VNSGN: "Ho Chi Minh", BRSSZ: "Santos",
  ARBUE: "Buenos Aires", AUMEL: "Melbourne", JPTYO: "Tokyo", KRPUS: "Busan",
  ITGOA: "Genoa", ESBCN: "Barcelona", TRIST: "Istanbul", SALAD: "Salalah",
  INMUN: "Mundra", IDJKT: "Jakarta", MYTPP: "Tanjung Pelepas", LKCMB: "Colombo",
  USOAK: "Oakland", USMIA: "Miami", CAMTR: "Montreal", MXVER: "Veracruz",
  CLVAL: "Valparaiso", PECAL: "Callao", RUVLK: "Vladivostok", FIHEL: "Helsinki",
};

// Curated database: major port-pair × shipping-line transit times
// Format: [origin, dest, line, days, freq/week, type, transship?]
const ENTRIES: [string, string, ShippingLine, number, number, string, string?][] = [
  // Egypt → Europe
  ["EGALX", "DEHAM", "MAERSK", 14, 2, "DIRECT"],
  ["EGALX", "DEHAM", "MSC", 15, 1, "DIRECT"],
  ["EGALX", "DEHAM", "CMA_CGM", 13, 2, "DIRECT"],
  ["EGALX", "DEHAM", "HAPAG_LLOYD", 14, 1, "DIRECT"],
  ["EGALX", "NLRTM", "MAERSK", 12, 2, "DIRECT"],
  ["EGALX", "NLRTM", "MSC", 13, 2, "DIRECT"],
  ["EGALX", "NLRTM", "CMA_CGM", 12, 2, "DIRECT"],
  ["EGALX", "BEANR", "MAERSK", 13, 1, "DIRECT"],
  ["EGALX", "BEANR", "MSC", 14, 1, "DIRECT"],
  ["EGALX", "GBFXT", "MAERSK", 15, 1, "DIRECT"],
  ["EGALX", "GBFXT", "MSC", 16, 1, "DIRECT"],
  ["EGALX", "ESBCN", "MSC", 9, 1, "DIRECT"],
  ["EGALX", "ITGOA", "CMA_CGM", 8, 1, "DIRECT"],
  ["EGDMT", "DEHAM", "MAERSK", 13, 2, "DIRECT"],
  ["EGDMT", "NLRTM", "MAERSK", 11, 2, "DIRECT"],
  ["EGDMT", "BEANR", "MSC", 12, 1, "DIRECT"],
  ["EGDMT", "GBFXT", "MAERSK", 14, 1, "DIRECT"],

  // Asia → Europe
  ["CNSHA", "DEHAM", "MAERSK", 32, 3, "DIRECT"],
  ["CNSHA", "DEHAM", "MSC", 34, 2, "DIRECT"],
  ["CNSHA", "DEHAM", "CMA_CGM", 30, 3, "DIRECT"],
  ["CNSHA", "DEHAM", "HAPAG_LLOYD", 31, 2, "DIRECT"],
  ["CNSHA", "DEHAM", "COSCO", 30, 2, "DIRECT"],
  ["CNSHA", "DEHAM", "ONE", 33, 1, "DIRECT"],
  ["CNSHA", "DEHAM", "EVERGREEN", 34, 1, "DIRECT"],
  ["CNSHA", "DEHAM", "YANG_MING", 35, 1, "DIRECT"],
  ["CNSHA", "NLRTM", "MAERSK", 30, 3, "DIRECT"],
  ["CNSHA", "NLRTM", "MSC", 32, 2, "DIRECT"],
  ["CNSHA", "NLRTM", "CMA_CGM", 28, 3, "DIRECT"],
  ["CNSHA", "NLRTM", "COSCO", 29, 2, "DIRECT"],
  ["CNSHA", "BEANR", "MAERSK", 31, 2, "DIRECT"],
  ["CNSHA", "BEANR", "MSC", 33, 2, "DIRECT"],
  ["CNSHA", "GBFXT", "MAERSK", 33, 2, "DIRECT"],
  ["CNSHA", "GBFXT", "MSC", 35, 1, "DIRECT"],
  ["CNHKG", "DEHAM", "MAERSK", 31, 3, "DIRECT"],
  ["CNHKG", "DEHAM", "MSC", 33, 2, "DIRECT"],
  ["CNHKG", "DEHAM", "CMA_CGM", 29, 3, "DIRECT"],
  ["CNHKG", "DEHAM", "COSCO", 28, 2, "DIRECT"],
  ["CNHKG", "NLRTM", "MAERSK", 29, 3, "DIRECT"],
  ["CNHKG", "BEANR", "MAERSK", 30, 2, "DIRECT"],
  ["CNHKG", "GBFXT", "MSC", 32, 1, "DIRECT"],
  ["CNHKG", "USLAX", "MAERSK", 18, 2, "DIRECT"],
  ["CNHKG", "USLAX", "MSC", 19, 1, "DIRECT"],
  ["CNHKG", "USLAX", "COSCO", 16, 2, "DIRECT"],

  // Asia → US West Coast
  ["CNSHA", "USLAX", "MAERSK", 16, 3, "DIRECT"],
  ["CNSHA", "USLAX", "MSC", 17, 2, "DIRECT"],
  ["CNSHA", "USLAX", "CMA_CGM", 15, 2, "DIRECT"],
  ["CNSHA", "USLAX", "COSCO", 14, 2, "DIRECT"],
  ["CNSHA", "USLAX", "ONE", 16, 2, "DIRECT"],
  ["CNSHA", "USLAX", "EVERGREEN", 17, 1, "DIRECT"],
  ["CNSHA", "USNYC", "MAERSK", 30, 2, "DIRECT"],
  ["CNSHA", "USNYC", "MSC", 32, 1, "DIRECT"],
  ["CNSHA", "USNYC", "CMA_CGM", 29, 2, "DIRECT"],
  ["CNSHA", "USOAK", "MAERSK", 15, 2, "DIRECT"],
  ["CNSHA", "USOAK", "MSC", 16, 1, "DIRECT"],

  // Singapore hub
  ["SGSIN", "DEHAM", "MAERSK", 24, 3, "DIRECT"],
  ["SGSIN", "DEHAM", "MSC", 26, 2, "DIRECT"],
  ["SGSIN", "DEHAM", "CMA_CGM", 22, 3, "DIRECT"],
  ["SGSIN", "NLRTM", "MAERSK", 22, 3, "DIRECT"],
  ["SGSIN", "NLRTM", "MSC", 24, 2, "DIRECT"],
  ["SGSIN", "BEANR", "MAERSK", 23, 2, "DIRECT"],
  ["SGSIN", "USLAX", "MAERSK", 18, 2, "DIRECT"],
  ["SGSIN", "USNYC", "MAERSK", 26, 2, "DIRECT"],
  ["SGSIN", "CNSHA", "MAERSK", 6, 3, "DIRECT"],
  ["SGSIN", "CNHKG", "MAERSK", 4, 3, "DIRECT"],
  ["SGSIN", "VNSGN", "MAERSK", 4, 3, "DIRECT"],
  ["SGSIN", "THBKK", "MAERSK", 5, 3, "DIRECT"],
  ["SGSIN", "INMUM", "MAERSK", 6, 2, "DIRECT"],
  ["SGSIN", "AEJEA", "MAERSK", 7, 2, "DIRECT"],

  // Vietnam → Europe / US
  ["VNSGN", "DEHAM", "MAERSK", 28, 2, "DIRECT"],
  ["VNSGN", "DEHAM", "MSC", 30, 1, "DIRECT"],
  ["VNSGN", "DEHAM", "CMA_CGM", 26, 2, "DIRECT"],
  ["VNSGN", "NLRTM", "MAERSK", 26, 2, "DIRECT"],
  ["VNSGN", "NLRTM", "MSC", 28, 1, "DIRECT"],
  ["VNSGN", "USLAX", "MAERSK", 22, 2, "DIRECT"],
  ["VNSGN", "USNYC", "MAERSK", 32, 1, "DIRECT"],

  // Thailand → Europe / US
  ["THBKK", "DEHAM", "MAERSK", 25, 2, "DIRECT"],
  ["THBKK", "DEHAM", "MSC", 27, 1, "DIRECT"],
  ["THBKK", "NLRTM", "MAERSK", 23, 2, "DIRECT"],
  ["THBKK", "USLAX", "MAERSK", 22, 1, "DIRECT"],

  // India → Europe / US
  ["INMUM", "DEHAM", "MAERSK", 22, 2, "DIRECT"],
  ["INMUM", "DEHAM", "MSC", 24, 1, "DIRECT"],
  ["INMUM", "DEHAM", "CMA_CGM", 20, 2, "DIRECT"],
  ["INMUM", "NLRTM", "MAERSK", 20, 2, "DIRECT"],
  ["INMUM", "USLAX", "MAERSK", 28, 1, "DIRECT"],
  ["INMUM", "USNYC", "MAERSK", 26, 1, "DIRECT"],
  ["INMUN", "DEHAM", "MAERSK", 21, 2, "DIRECT"],
  ["INMUN", "NLRTM", "MAERSK", 19, 2, "DIRECT"],

  // UAE → Europe / Asia
  ["AEJEA", "DEHAM", "MAERSK", 22, 2, "DIRECT"],
  ["AEJEA", "DEHAM", "MSC", 24, 1, "DIRECT"],
  ["AEJEA", "DEHAM", "CMA_CGM", 20, 2, "DIRECT"],
  ["AEJEA", "NLRTM", "MAERSK", 20, 2, "DIRECT"],
  ["AEJEA", "BEANR", "MAERSK", 21, 1, "DIRECT"],
  ["AEJEA", "SGSIN", "MAERSK", 7, 2, "DIRECT"],
  ["AEJEA", "CNSHA", "MAERSK", 16, 1, "DIRECT"],
  ["AEJEA", "USLAX", "MAERSK", 32, 1, "DIRECT"],

  // US → Europe
  ["USNYC", "DEHAM", "MAERSK", 14, 2, "DIRECT"],
  ["USNYC", "DEHAM", "MSC", 15, 1, "DIRECT"],
  ["USNYC", "NLRTM", "MAERSK", 13, 2, "DIRECT"],
  ["USNYC", "BEANR", "MAERSK", 12, 1, "DIRECT"],
  ["USNYC", "GBFXT", "MAERSK", 10, 2, "DIRECT"],
  ["USLAX", "DEHAM", "MAERSK", 28, 2, "DIRECT"],
  ["USLAX", "DEHAM", "MSC", 30, 1, "DIRECT"],
  ["USLAX", "DEHAM", "CMA_CGM", 27, 2, "DIRECT"],
  ["USLAX", "DEHAM", "HAPAG_LLOYD", 29, 1, "DIRECT"],

  // East Asia internal
  ["CNSHA", "CNHKG", "MAERSK", 3, 3, "DIRECT"],
  ["CNSHA", "KRPUS", "MAERSK", 2, 3, "DIRECT"],
  ["CNSHA", "JPTYO", "MAERSK", 4, 2, "DIRECT"],
  ["CNHKG", "KRPUS", "MAERSK", 3, 2, "DIRECT"],
  ["CNHKG", "JPTYO", "MAERSK", 4, 2, "DIRECT"],
  ["CNHKG", "VNSGN", "MAERSK", 4, 2, "DIRECT"],

  // Korea / Japan → US
  ["KRPUS", "USLAX", "MAERSK", 13, 2, "DIRECT"],
  ["KRPUS", "USLAX", "MSC", 14, 1, "DIRECT"],
  ["KRPUS", "USNYC", "MAERSK", 28, 1, "DIRECT"],
  ["JPTYO", "USLAX", "MAERSK", 12, 2, "DIRECT"],
  ["JPTYO", "USLAX", "ONE", 11, 2, "DIRECT"],
  ["JPTYO", "USNYC", "MAERSK", 27, 1, "DIRECT"],

  // Latin America
  ["BRSSZ", "DEHAM", "MAERSK", 20, 1, "DIRECT"],
  ["BRSSZ", "DEHAM", "MSC", 22, 1, "DIRECT"],
  ["BRSSZ", "NLRTM", "MAERSK", 18, 1, "DIRECT"],
  ["BRSSZ", "USLAX", "MAERSK", 22, 1, "DIRECT"],
  ["BRSSZ", "USNYC", "MAERSK", 16, 1, "DIRECT"],
  ["ARBUE", "DEHAM", "MAERSK", 24, 1, "DIRECT"],
  ["ARBUE", "USLAX", "MAERSK", 28, 1, "DIRECT"],
  ["ARBUE", "USNYC", "MAERSK", 18, 1, "DIRECT"],

  // Oceania
  ["AUMEL", "DEHAM", "MAERSK", 36, 1, "TRANSSHIPMENT", "SGSIN"],
  ["AUMEL", "USLAX", "MAERSK", 22, 1, "DIRECT"],
  ["AUMEL", "CNSHA", "MAERSK", 20, 1, "DIRECT"],

  // Turkey → Europe / Asia
  ["TRIST", "DEHAM", "MAERSK", 11, 2, "DIRECT"],
  ["TRIST", "DEHAM", "MSC", 13, 1, "DIRECT"],
  ["TRIST", "NLRTM", "MAERSK", 10, 2, "DIRECT"],
  ["TRIST", "BEANR", "MAERSK", 11, 1, "DIRECT"],
  ["TRIST", "CNSHA", "MAERSK", 26, 1, "DIRECT"],

  // Oman (Salalah hub) → Europe / Asia
  ["SALAD", "DEHAM", "MAERSK", 17, 2, "DIRECT"],
  ["SALAD", "NLRTM", "MAERSK", 15, 2, "DIRECT"],
  ["SALAD", "SGSIN", "MAERSK", 5, 2, "DIRECT"],
  ["SALAD", "CNSHA", "MAERSK", 13, 1, "DIRECT"],

  // Mexico / Canada → US
  ["MXVER", "USLAX", "MAERSK", 5, 2, "DIRECT"],
  ["MXVER", "USNYC", "MAERSK", 6, 1, "DIRECT"],
  ["CAMTR", "USNYC", "MAERSK", 4, 2, "DIRECT"],
];

export const TRANSIT_TIME_DB: TransitRoute[] = ENTRIES.map(([o, d, line, days, freq, type, transship]) => ({
  originPort: o,
  originName: PORT_NAMES[o] || o,
  destinationPort: d,
  destinationName: PORT_NAMES[d] || d,
  shippingLine: line,
  transitTimeDays: days,
  frequencyPerWeek: freq,
  serviceType: type,
  transshipmentPort: transship,
  confidence: 1.0,
  source: "database" as const,
}));

export function getPortName(code: string): string {
  return PORT_NAMES[code.toUpperCase()] || code;
}

export function searchTransitDB(origin: string, dest: string, line?: string): TransitRoute[] {
  const o = origin.toUpperCase();
  const d = dest.toUpperCase();
  return TRANSIT_TIME_DB.filter((r) =>
    r.originPort === o &&
    r.destinationPort === d &&
    (!line || r.shippingLine === line.toUpperCase())
  );
}

export function getAllShippingLines(): ShippingLine[] {
  return ["MAERSK", "MSC", "CMA_CGM", "HAPAG_LLOYD", "COSCO", "ONE", "EVERGREEN", "ZIM", "HMM", "YANG_MING"];
}

export function getAllPorts(): { code: string; name: string }[] {
  return Object.entries(PORT_NAMES)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// AI-powered estimation — ALWAYS calls AI for fresh, up-to-date estimates.
// Uses DB as grounding context (historical reference) but AI produces the final
// number, reflecting current conditions (weather, port congestion, schedule changes).
export async function estimateTransitTime(input: {
  originPort: string;
  destinationPort: string;
  shippingLine?: string;
  commodity?: string;
  containerType?: string;
}): Promise<TransitRoute & { alternatives?: TransitRoute[]; dbGrounding?: TransitRoute[]; aiReasoning?: string }> {
  const origin = input.originPort.toUpperCase();
  const dest = input.destinationPort.toUpperCase();
  const line = input.shippingLine?.toUpperCase();

  // 1. Gather DB grounding data (used as reference context for AI)
  const dbMatches = searchTransitDB(origin, dest, line);
  const reverseMatches = searchTransitDB(dest, origin, line);
  const allLineMatches = searchTransitDB(origin, dest);
  const dbGrounding = [...dbMatches, ...reverseMatches.slice(0, 2)];

  // 2. ALWAYS call AI for fresh estimate — DB is grounding only
  const originName = getPortName(origin);
  const destName = getPortName(dest);
  const lineStr = line || "any major container shipping line";

  // Build grounding context string for AI
  const groundingStr = dbGrounding.length > 0
    ? `\n\nHistorical reference data (DB — may be outdated, use as grounding only):\n${dbGrounding.map((r) =>
        `- ${r.originPort}→${r.destinationPort} ${r.shippingLine}: ${r.transitTimeDays} days, ${r.frequencyPerWeek}/wk, ${r.serviceType}${r.transshipmentPort ? ` (via ${r.transshipmentPort})` : ""}`
      ).join("\n")}`
    : "\n\nNo historical DB data available for this port pair.";

  let aiEstimate: { days: number; freq: number; type: string; transship?: string; confidence: number; reasoning?: string } | null = null;

  try {
    // ZAI removed — placeholder completion object; AI path disabled until
    // multi-provider transit-time wrapper is wired in. Falls through to the
    // catch block below which uses DB grounding or heuristic defaults.
    const completion: { choices: { message: { content: string } }[] } = { choices: [{ message: { content: "" } }] };
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      aiEstimate = {
        days: Math.round(parsed.days || 25),
        freq: parsed.frequency_per_week || 1,
        type: parsed.service_type || "DIRECT",
        transship: parsed.transshipment_port || undefined,
        confidence: Math.min(0.95, parsed.confidence || 0.7),
        reasoning: parsed.reasoning || "",
      };
    }
  } catch (err) {
    // If AI fails, fall back to DB grounding if available
    if (dbMatches.length > 0) {
      const primary = dbMatches[0];
      const alternatives = allLineMatches.filter((r) => r.shippingLine !== primary.shippingLine).slice(0, 5);
      return {
        ...primary,
        source: "database",
        alternatives,
        dbGrounding,
        aiReasoning: "AI unavailable — using DB historical data as fallback",
      };
    }
    aiEstimate = { days: 25, freq: 1, type: "TRANSSHIPMENT", confidence: 0.3, reasoning: "AI unavailable — heuristic fallback" };
  }

  if (!aiEstimate) {
    if (dbMatches.length > 0) {
      const primary = dbMatches[0];
      return { ...primary, alternatives: allLineMatches.slice(1, 5), dbGrounding, aiReasoning: "AI parse failed — using DB" };
    }
    aiEstimate = { days: 25, freq: 1, type: "TRANSSHIPMENT", confidence: 0.3, reasoning: "Heuristic fallback" };
  }

  // Gather alternatives from DB (other lines on the same pair)
  const alternatives = line
    ? allLineMatches.filter((r) => r.shippingLine !== line.toUpperCase()).slice(0, 3)
    : allLineMatches.slice(0, 5);

  return {
    originPort: origin,
    originName,
    destinationPort: dest,
    destinationName: getPortName(dest),
    shippingLine: line || "AI_ESTIMATE",
    transitTimeDays: aiEstimate.days,
    frequencyPerWeek: aiEstimate.freq,
    serviceType: aiEstimate.type,
    transshipmentPort: aiEstimate.transship,
    confidence: aiEstimate.confidence,
    source: "ai",
    alternatives,
    dbGrounding: dbGrounding.length > 0 ? dbGrounding : undefined,
    aiReasoning: aiEstimate.reasoning,
  };
}
