// SGTX Part 5.9 — Carbon Footprint (ISO 14067)
export interface CarbonResult { ustn: string; scope1: number; scope2: number; scope3: number; total: number; embeddedEmissionsKg: number; confidenceInterval: [number, number]; dataSources: string[]; modelVersion: string; cbamApplicable: boolean; }

const EMISSION_FACTORS: Record<string, { scope1: number; scope2: number; scope3: number }> = { OCEAN: { scope1: 0.016, scope2: 0.002, scope3: 0.008 }, AIR: { scope1: 0.602, scope2: 0.05, scope3: 0.1 }, RAIL: { scope1: 0.022, scope2: 0.003, scope3: 0.005 }, TRUCK: { scope1: 0.062, scope2: 0.004, scope3: 0.012 } };
const ROUTE_DISTANCES: Record<string, number> = { "EG-DE": 3200, "EG-IT": 2500, "EG-SA": 1800, "EG-AE": 2800, "VN-DE": 9500, "VN-US": 11500, "US-CN": 10500, "DE-US": 7500, "EG-JP": 9500, "EG-US": 8500 };

export function calculateCarbonFootprint(input: { ustn: string; transportMode: string; originCountry: string; destCountry: string; grossWeightKg: number; distanceKm?: number; coldChain?: boolean }): CarbonResult {
  const factors = EMISSION_FACTORS[input.transportMode] || EMISSION_FACTORS.OCEAN;
  const distance = input.distanceKm || ROUTE_DISTANCES[`${input.originCountry}-${input.destCountry}`] || 5000;
  const weightTonnes = input.grossWeightKg / 1000;
  let scope1 = Math.round(factors.scope1 * distance * weightTonnes * 100) / 100;
  let scope2 = Math.round(factors.scope2 * distance * weightTonnes * (input.coldChain ? 1.15 : 1) * 100) / 100;
  let scope3 = Math.round(factors.scope3 * distance * weightTonnes * 100) / 100;
  const total = Math.round((scope1 + scope2 + scope3) * 100) / 100;
  return { ustn: input.ustn, scope1, scope2, scope3, total, embeddedEmissionsKg: Math.round(total * 0.1 * 100) / 100, confidenceInterval: [Math.round(total * 0.85 * 100) / 100, Math.round(total * 1.15 * 100) / 100], dataSources: ["IMO EEXI", "IEA grid factors", "Sea/Road distance calculator"], modelVersion: "SGTX-CARBON-1.0", cbamApplicable: false };
}

export function generateCbamXml(result: CarbonResult): string {
  if (!result.cbamApplicable) return "";
  return `<?xml version="1.0"?><CbamReport><Ustn>${result.ustn}</Ustn><TotalEmissions>${result.total}</TotalEmissions><Scope1>${result.scope1}</Scope1><Scope2>${result.scope2}</Scope2><Scope3>${result.scope3}</Scope3></CbamReport>`;
}
