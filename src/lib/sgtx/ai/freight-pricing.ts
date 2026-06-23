// SGTX AI Freight Pricing Service
// Estimates sea freight rates, Terminal Handling Charges (THC), and daily reefer
// power (electricity) costs for each transit time × shipping line combination.
// Uses curated market data + AI (z-ai-web-dev-sdk) for current pricing.

export interface FreightPricing {
  originPort: string;
  destinationPort: string;
  shippingLine: string;
  containerType: string;        // STANDARD | HC | REEFER | OPEN_TOP | FLAT_RACK | TANK
  seaFreightUsd: number;        // ocean freight rate per container (USD)
  thcOriginUsd: number;         // Terminal Handling Charge at origin (USD)
  thcDestinationUsd: number;    // Terminal Handling Charge at destination (USD)
  documentationUsd: number;     // B/L fee, manifest fee, etc.
  ispsUsd: number;              // International Ship & Port Security fee
  dailyReeferPowerUsd: number;  // reefer plug daily rate (USD/day) — 0 for non-reefer
  reeferDaysIncluded: number;   // free reefer days included in sea freight
  currency: string;
  rateValidityDays: number;     // how long the rate is valid
  confidence: number;
  source: "database" | "ai";
  aiReasoning?: string;
  totalEstimatedUsd: number;    // sea freight + THC both ends + docs + ISPS + reefer power (if reefer)
}

// ─── Container type definitions ───
export const CONTAINER_TYPES = [
  { code: "STANDARD", label: "20ft Standard Dry (20'DV)", reefer: false, teuFactor: 1 },
  { code: "STANDARD_40", label: "40ft Standard Dry (40'DV)", reefer: false, teuFactor: 2 },
  { code: "HC", label: "40ft High Cube (40'HC)", reefer: false, teuFactor: 2 },
  { code: "REEFER_20", label: "20ft Reefer (20'RF)", reefer: true, teeFactor: 1 },
  { code: "REEFER_40", label: "40ft Reefer (40'RF)", reefer: true, teuFactor: 2 },
  { code: "OPEN_TOP", label: "40ft Open Top", reefer: false, teuFactor: 2 },
  { code: "FLAT_RACK", label: "40ft Flat Rack", reefer: false, teuFactor: 2 },
  { code: "TANK", label: "20ft Tank Container", reefer: false, teuFactor: 1 },
] as const;

// ─── Curated THC database by port (USD per container) ───
// Source: major shipping line tariff sheets, 2024-2025 averages
const THC_BY_PORT: Record<string, { standard20: number; standard40: number; reefer20: number; reefer40: number }> = {
  EGALX: { standard20: 175, standard40: 265, reefer20: 220, reefer40: 330 },
  EGDMT: { standard20: 165, standard40: 250, reefer20: 210, reefer40: 315 },
  DEHAM: { standard20: 240, standard40: 360, reefer20: 285, reefer40: 425 },
  NLRTM: { standard20: 225, standard40: 340, reefer20: 270, reefer40: 405 },
  BEANR: { standard20: 230, standard40: 345, reefer20: 275, reefer40: 410 },
  GBFXT: { standard20: 215, standard40: 325, reefer20: 255, reefer40: 385 },
  USNYC: { standard20: 285, standard40: 425, reefer20: 340, reefer40: 510 },
  USLAX: { standard20: 275, standard40: 410, reefer20: 325, reefer40: 490 },
  CNSHA: { standard20: 155, standard40: 235, reefer20: 195, reefer40: 290 },
  CNHKG: { standard20: 165, standard40: 250, reefer20: 205, reefer40: 310 },
  SGSIN: { standard20: 170, standard40: 255, reefer20: 210, reefer40: 315 },
  AEJEA: { standard20: 195, standard40: 295, reefer20: 235, reefer40: 350 },
  INMUM: { standard20: 145, standard40: 220, reefer20: 185, reefer40: 275 },
  THBKK: { standard20: 160, standard40: 240, reefer20: 200, reefer40: 300 },
  VNSGN: { standard20: 155, standard40: 235, reefer20: 195, reefer40: 295 },
  BRSSZ: { standard20: 245, standard40: 365, reefer20: 295, reefer40: 435 },
  ARBUE: { standard20: 255, standard40: 380, reefer20: 305, reefer40: 455 },
  AUMEL: { standard20: 265, standard40: 395, reefer20: 315, reefer40: 470 },
  JPTYO: { standard20: 235, standard40: 350, reefer20: 280, reefer40: 420 },
  KRPUS: { standard20: 215, standard40: 325, reefer20: 255, reefer40: 385 },
};

// ─── Curated reefer power daily rate by port (USD/day) ───
// Plugged-in reefer containers at terminal
const REEFER_POWER_DAILY: Record<string, number> = {
  EGALX: 18, EGDMT: 17, DEHAM: 22, NLRTM: 21, BEANR: 22, GBFXT: 20,
  USNYC: 25, USLAX: 24, CNSHA: 15, CNHKG: 16, SGSIN: 17, AEJEA: 20,
  INMUM: 14, THBKK: 15, VNSGN: 15, BRSSZ: 23, ARBUE: 24, AUMEL: 26,
  JPTYO: 21, KRPUS: 20,
};

// ─── Curated base sea freight by route (USD per 20ft STD) ───
// Source: Freightos, Drewry WCI, Xeneta, 2024-2025 averages
const SEA_FREIGHT_DB: { origin: string; dest: string; line: string; std20: number; std40: number; hc40: number; rf20: number; rf40: number }[] = [
  // EG → EU
  { origin: "EGALX", dest: "DEHAM", line: "MAERSK", std20: 850, std40: 1450, hc40: 1550, rf20: 1650, rf40: 2450 },
  { origin: "EGALX", dest: "DEHAM", line: "MSC", std20: 820, std40: 1400, hc40: 1500, rf20: 1600, rf40: 2380 },
  { origin: "EGALX", dest: "DEHAM", line: "CMA_CGM", std20: 880, std40: 1490, hc40: 1590, rf20: 1700, rf40: 2520 },
  { origin: "EGALX", dest: "NLRTM", line: "MAERSK", std20: 800, std40: 1380, hc40: 1480, rf20: 1620, rf40: 2420 },
  { origin: "EGALX", dest: "NLRTM", line: "MSC", std20: 780, std40: 1350, hc40: 1450, rf20: 1580, rf40: 2350 },
  { origin: "EGALX", dest: "BEANR", line: "MAERSK", std20: 820, std40: 1410, hc40: 1510, rf20: 1640, rf40: 2440 },
  { origin: "EGALX", dest: "GBFXT", line: "MAERSK", std20: 870, std40: 1480, hc40: 1580, rf20: 1680, rf40: 2500 },
  { origin: "EGDMT", dest: "DEHAM", line: "MAERSK", std20: 830, std40: 1420, hc40: 1520, rf20: 1620, rf40: 2420 },
  { origin: "EGDMT", dest: "NLRTM", line: "MAERSK", std20: 790, std40: 1360, hc40: 1460, rf20: 1600, rf40: 2380 },

  // Asia → EU
  { origin: "CNSHA", dest: "DEHAM", line: "MAERSK", std20: 1450, std40: 2650, hc40: 2850, rf20: 2850, rf40: 4200 },
  { origin: "CNSHA", dest: "DEHAM", line: "MSC", std20: 1400, std40: 2550, hc40: 2750, rf20: 2750, rf40: 4050 },
  { origin: "CNSHA", dest: "DEHAM", line: "CMA_CGM", std20: 1480, std40: 2700, hc40: 2900, rf20: 2900, rf40: 4280 },
  { origin: "CNSHA", dest: "DEHAM", line: "COSCO", std20: 1380, std40: 2520, hc40: 2720, rf20: 2720, rf40: 4020 },
  { origin: "CNSHA", dest: "NLRTM", line: "MAERSK", std20: 1400, std40: 2560, hc40: 2760, rf20: 2760, rf40: 4080 },
  { origin: "CNSHA", dest: "NLRTM", line: "MSC", std20: 1360, std40: 2480, hc40: 2680, rf20: 2680, rf40: 3960 },
  { origin: "CNHKG", dest: "DEHAM", line: "MAERSK", std20: 1500, std40: 2720, hc40: 2920, rf20: 2920, rf40: 4320 },
  { origin: "CNHKG", dest: "DEHAM", line: "COSCO", std20: 1420, std40: 2580, hc40: 2780, rf20: 2780, rf40: 4100 },

  // Asia → US
  { origin: "CNSHA", dest: "USLAX", line: "MAERSK", std20: 1850, std40: 3350, hc40: 3600, rf20: 3500, rf40: 5150 },
  { origin: "CNSHA", dest: "USLAX", line: "MSC", std20: 1790, std40: 3250, hc40: 3500, rf20: 3400, rf40: 5000 },
  { origin: "CNSHA", dest: "USLAX", line: "COSCO", std20: 1750, std40: 3180, hc40: 3420, rf20: 3350, rf40: 4920 },
  { origin: "CNSHA", dest: "USLAX", line: "ONE", std20: 1820, std40: 3300, hc40: 3550, rf20: 3450, rf40: 5080 },
  { origin: "CNSHA", dest: "USNYC", line: "MAERSK", std20: 2950, std40: 5350, hc40: 5750, rf20: 5200, rf40: 7650 },

  // SG hub → EU / US
  { origin: "SGSIN", dest: "DEHAM", line: "MAERSK", std20: 1250, std40: 2280, hc40: 2450, rf20: 2450, rf40: 3620 },
  { origin: "SGSIN", dest: "DEHAM", line: "MSC", std20: 1210, std40: 2200, hc40: 2370, rf20: 2370, rf40: 3500 },
  { origin: "SGSIN", dest: "USLAX", line: "MAERSK", std20: 1650, std40: 3000, hc40: 3220, rf20: 3150, rf40: 4650 },

  // VN → EU / US
  { origin: "VNSGN", dest: "DEHAM", line: "MAERSK", std20: 1380, std40: 2520, hc40: 2710, rf20: 2710, rf40: 4000 },
  { origin: "VNSGN", dest: "DEHAM", line: "MSC", std20: 1340, std40: 2440, hc40: 2630, rf20: 2630, rf40: 3880 },
  { origin: "VNSGN", dest: "USLAX", line: "MAERSK", std20: 1780, std40: 3230, hc40: 3470, rf20: 3400, rf40: 5000 },

  // IN → EU
  { origin: "INMUM", dest: "DEHAM", line: "MAERSK", std20: 1100, std40: 2000, hc40: 2150, rf20: 2150, rf40: 3180 },
  { origin: "INMUM", dest: "DEHAM", line: "CMA_CGM", std20: 1130, std40: 2050, hc40: 2200, rf20: 2200, rf40: 3250 },

  // UAE → EU
  { origin: "AEJEA", dest: "DEHAM", line: "MAERSK", std20: 1050, std40: 1920, hc40: 2060, rf20: 2060, rf40: 3050 },
  { origin: "AEJEA", dest: "DEHAM", line: "MSC", std20: 1020, std40: 1860, hc40: 2000, rf20: 2000, rf40: 2960 },

  // US → EU
  { origin: "USNYC", dest: "DEHAM", line: "MAERSK", std20: 950, std40: 1720, hc40: 1850, rf20: 1850, rf40: 2740 },
  { origin: "USLAX", dest: "DEHAM", line: "MAERSK", std20: 1750, std40: 3180, hc40: 3420, rf20: 3380, rf40: 5000 },

  // TR → EU
  { origin: "TRIST", dest: "DEHAM", line: "MAERSK", std20: 780, std40: 1420, hc40: 1530, rf20: 1530, rf40: 2270 },

  // BR → EU / US
  { origin: "BRSSZ", dest: "DEHAM", line: "MAERSK", std20: 1180, std40: 2150, hc40: 2310, rf20: 2310, rf40: 3420 },
  { origin: "BRSSZ", dest: "USNYC", line: "MAERSK", std20: 1650, std40: 3000, hc40: 3220, rf20: 3150, rf40: 4650 },

  // AU → EU / US
  { origin: "AUMEL", dest: "DEHAM", line: "MAERSK", std20: 1650, std40: 3000, hc40: 3220, rf20: 3150, rf40: 4650 },
  { origin: "AUMEL", dest: "USLAX", line: "MAERSK", std20: 1950, std40: 3540, hc40: 3810, rf20: 3700, rf40: 5460 },

  // KR/JP → US
  { origin: "KRPUS", dest: "USLAX", line: "MAERSK", std20: 1720, std40: 3120, hc40: 3360, rf20: 3290, rf40: 4850 },
  { origin: "JPTYO", dest: "USLAX", line: "MAERSK", std20: 1680, std40: 3050, hc40: 3280, rf20: 3210, rf40: 4730 },
  { origin: "JPTYO", dest: "USLAX", line: "ONE", std20: 1650, std40: 3000, hc40: 3230, rf20: 3170, rf40: 4670 },
];

export function searchFreightDB(origin: string, dest: string, line?: string) {
  const o = origin.toUpperCase();
  const d = dest.toUpperCase();
  return SEA_FREIGHT_DB.filter((r) =>
    r.origin === o &&
    r.dest === d &&
    (!line || r.line === line.toUpperCase())
  );
}

export function getTHCForPort(port: string, containerType: string): { thc: number; dailyReeferPower: number } {
  const p = THC_BY_PORT[port.toUpperCase()];
  if (!p) return { thc: 250, dailyReeferPower: 20 }; // default
  const ct = containerType.toUpperCase();
  let thc = p.standard20;
  if (ct.includes("40")) thc = p.standard40;
  if (ct.includes("REEFER") || ct === "RF") {
    thc = ct.includes("40") ? p.reefer40 : p.reefer20;
  }
  const dailyReeferPower = (ct.includes("REEFER") || ct === "RF") ? (REEFER_POWER_DAILY[port.toUpperCase()] || 20) : 0;
  return { thc, dailyReeferPower };
}

// AI-powered freight pricing estimation — always calls AI for current market rates
export async function estimateFreightPricing(input: {
  originPort: string;
  destinationPort: string;
  shippingLine?: string;
  containerType?: string;
  transitDays?: number;
  commodity?: string;
}): Promise<FreightPricing & { alternatives?: FreightPricing[] }> {
  const origin = input.originPort.toUpperCase();
  const dest = input.destinationPort.toUpperCase();
  const line = (input.shippingLine || "MAERSK").toUpperCase();
  const containerType = (input.containerType || "STANDARD").toUpperCase();
  const transitDays = input.transitDays || 25;

  // 1. Get THC + reefer power from DB (these are port tariffs, less volatile)
  const originThc = getTHCForPort(origin, containerType);
  const destThc = getTHCForPort(dest, containerType);
  const isReefer = containerType.includes("REEFER") || containerType === "RF";
  const dailyReeferPower = isReefer ? Math.max(originThc.dailyReeferPower, destThc.dailyReeferPower) : 0;
  // Free reefer days typically 3-7 days; charge after that
  const reeferDaysIncluded = isReefer ? 4 : 0;
  const reeferChargeDays = isReefer ? Math.max(0, transitDays - reeferDaysIncluded) : 0;

  // 2. Get DB grounding for sea freight
  const dbMatches = searchFreightDB(origin, dest, line);
  const dbGrounding = dbMatches.length > 0 ? dbMatches[0] : null;

  // 3. ALWAYS call AI for current sea freight rate
  let seaFreightUsd = 0;
  let aiReasoning = "";
  let confidence = 0.8;

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const ctLabel = CONTAINER_TYPES.find((c) => c.code === containerType)?.label || containerType;
    const groundingStr = dbGrounding
      ? `\n\nHistorical reference rate (DB, may be outdated): ${line} ${origin}→${dest} 20'STD $${dbGrounding.std20}, 40'STD $${dbGrounding.std40}, 40'HC $${dbGrounding.hc40}, 20'RF $${dbGrounding.rf20}, 40'RF $${dbGrounding.rf40}`
      : "\n\nNo historical DB rate available for this route.";

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: "You are a container shipping freight rate expert with current market knowledge (Freightos, Drewry, Xeneta indices). Provide current spot rates in USD. Respond with VALID JSON ONLY.",
        },
        {
          role: "user",
          content: `Estimate the CURRENT spot sea freight rate for 1× ${ctLabel} container from ${origin} to ${dest} on ${line}.${groundingStr}

Consider: current market conditions, SCFI/Freightos Baltic Index trends, capacity availability, bunker fuel prices, canal tolls (Suez/Panama), seasonal peak surcharges.

Respond with VALID JSON only:
{"sea_freight_usd": 1450, "documentation_usd": 50, "isps_usd": 15, "confidence": 0.85, "reasoning": "Brief explanation of current market factors"}

Rules:
- "sea_freight_usd": integer USD per container (current spot rate for the requested container type)
- "documentation_usd": B/L + manifest fee (typically $40-80)
- "isps_usd": International Ship & Port Security fee (typically $10-25)
- "confidence": 0.0-1.0
- "reasoning": 1-sentence explanation`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      seaFreightUsd = Math.round(parsed.sea_freight_usd || (dbGrounding ? dbGrounding.std20 : 1200));
      confidence = Math.min(0.9, parsed.confidence || 0.7);
      aiReasoning = parsed.reasoning || "";
    }
  } catch (err) {
    // Fallback to DB
    if (dbGrounding) {
      const ct = containerType;
      seaFreightUsd = ct.includes("REEFER") ? (ct.includes("40") ? dbGrounding.rf40 : dbGrounding.rf20) :
                     ct.includes("HC") ? dbGrounding.hc40 :
                     ct.includes("40") ? dbGrounding.std40 : dbGrounding.std20;
      aiReasoning = "AI unavailable — using DB historical rate";
    } else {
      seaFreightUsd = isReefer ? 2400 : 1200;
      aiReasoning = "AI unavailable — heuristic fallback";
      confidence = 0.3;
    }
  }

  if (!seaFreightUsd) seaFreightUsd = 1200;

  const documentationUsd = 50;
  const ispsUsd = 15;
  const totalEstimatedUsd = seaFreightUsd + originThc.thc + destThc.thc + documentationUsd + ispsUsd + (reeferChargeDays * dailyReeferPower);

  // Alternatives — other lines on the same route
  const alternatives: FreightPricing[] = [];
  if (!input.shippingLine) {
    const otherLines = searchFreightDB(origin, dest).filter((r) => r.line !== line).slice(0, 3);
    for (const r of otherLines) {
      const altSeaFreight = containerType.includes("REEFER") ? (containerType.includes("40") ? r.rf40 : r.rf20) :
                            containerType.includes("HC") ? r.hc40 :
                            containerType.includes("40") ? r.std40 : r.std20;
      const altTotal = altSeaFreight + originThc.thc + destThc.thc + documentationUsd + ispsUsd + (reeferChargeDays * dailyReeferPower);
      alternatives.push({
        originPort: origin,
        destinationPort: dest,
        shippingLine: r.line,
        containerType,
        seaFreightUsd: altSeaFreight,
        thcOriginUsd: originThc.thc,
        thcDestinationUsd: destThc.thc,
        documentationUsd,
        ispsUsd,
        dailyReeferPowerUsd: dailyReeferPower,
        reeferDaysIncluded,
        currency: "USD",
        rateValidityDays: 14,
        confidence: 0.7,
        source: "database",
        aiReasoning: "DB historical rate",
        totalEstimatedUsd: altTotal,
      });
    }
  }

  return {
    originPort: origin,
    destinationPort: dest,
    shippingLine: line,
    containerType,
    seaFreightUsd,
    thcOriginUsd: originThc.thc,
    thcDestinationUsd: destThc.thc,
    documentationUsd,
    ispsUsd,
    dailyReeferPowerUsd: dailyReeferPower,
    reeferDaysIncluded,
    currency: "USD",
    rateValidityDays: 14,
    confidence,
    source: "ai",
    aiReasoning,
    totalEstimatedUsd,
    alternatives,
  };
}
