// SGTX AI Customs Pricing Calculator
// Estimates average customs costs at port of discharge (destination) for buyer reference.
// Includes: import duty (ad valorem), VAT/GST, customs processing fee, customs broker fee,
// port handling, inspection fee, and other applicable charges.

export interface CustomsPricing {
  destinationPort: string;
  destinationCountry: string;
  commodity: string;
  hsCode: string;
  cargoValueUsd: number;
  // Duty calculation
  dutyRatePct: number;            // ad valorem duty %
  dutyAmountUsd: number;          // calculated duty
  // VAT/GST
  vatRatePct: number;             // VAT/GST %
  vatAmountUsd: number;           // calculated VAT (on cargo value + duty)
  // Fees
  customsProcessingFeeUsd: number;
  customsBrokerFeeUsd: number;
  portHandlingFeeUsd: number;
  inspectionFeeUsd: number;
  quarantineFeeUsd: number;
  // Totals
  totalCustomsCostUsd: number;    // duty + VAT + all fees
  totalLandedCostUsd: number;     // cargo value + total customs cost
  effectiveDutyRatePct: number;   // total customs cost as % of cargo value
  // Meta
  currency: string;
  notes: string[];
  aiGenerated: boolean;
  confidence: number;
  aiReasoning?: string;
}

// ─── Country-specific VAT/GST rates ───
export const VAT_RATES: Record<string, { rate: number; name: string }> = {
  DE: { rate: 19, name: "MwSt (VAT)" },
  FR: { rate: 20, name: "TVA (VAT)" },
  NL: { rate: 21, name: "BTW (VAT)" },
  BE: { rate: 21, name: "BTW (VAT)" },
  IT: { rate: 22, name: "IVA (VAT)" },
  ES: { rate: 21, name: "IVA (VAT)" },
  GB: { rate: 20, name: "VAT" },
  EG: { rate: 14, name: "VAT" },
  SA: { rate: 15, name: "VAT" },
  AE: { rate: 5, name: "VAT" },
  US: { rate: 0, name: "No federal VAT (state sales tax may apply)" },
  CN: { rate: 13, name: "VAT" },
  JP: { rate: 10, name: "Consumption Tax" },
  KR: { rate: 10, name: "VAT" },
  SG: { rate: 9, name: "GST" },
  MY: { rate: 10, name: "SST" },
  TH: { rate: 7, name: "VAT" },
  VN: { rate: 10, name: "VAT" },
  IN: { rate: 18, name: "GST" },
  AU: { rate: 10, name: "GST" },
  NZ: { rate: 15, name: "GST" },
  BR: { rate: 17, name: "ICMS" },
  AR: { rate: 21, name: "IVA" },
  MX: { rate: 16, name: "IVA" },
  CA: { rate: 5, name: "GST (federal)" },
  CH: { rate: 7.7, name: "VAT" },
  TR: { rate: 20, name: "KDV (VAT)" },
  ZA: { rate: 15, name: "VAT" },
};

// ─── Country-specific fixed fees (USD) ───
export const COUNTRY_FEES: Record<string, { processing: number; broker: number; portHandling: number; inspection: number; quarantine: number }> = {
  DE: { processing: 35, broker: 85, portHandling: 65, inspection: 45, quarantine: 30 },
  FR: { processing: 32, broker: 80, portHandling: 60, inspection: 45, quarantine: 30 },
  NL: { processing: 30, broker: 75, portHandling: 55, inspection: 40, quarantine: 28 },
  BE: { processing: 32, broker: 78, portHandling: 58, inspection: 42, quarantine: 28 },
  IT: { processing: 35, broker: 85, portHandling: 62, inspection: 45, quarantine: 32 },
  ES: { processing: 33, broker: 80, portHandling: 60, inspection: 42, quarantine: 30 },
  GB: { processing: 30, broker: 75, portHandling: 55, inspection: 40, quarantine: 28 },
  EG: { processing: 25, broker: 65, portHandling: 50, inspection: 55, quarantine: 45 },
  SA: { processing: 28, broker: 70, portHandling: 55, inspection: 50, quarantine: 40 },
  AE: { processing: 30, broker: 75, portHandling: 60, inspection: 45, quarantine: 35 },
  US: { processing: 28, broker: 95, portHandling: 70, inspection: 50, quarantine: 65 },
  CN: { processing: 22, broker: 60, portHandling: 45, inspection: 40, quarantine: 35 },
  JP: { processing: 30, broker: 80, portHandling: 65, inspection: 55, quarantine: 50 },
  KR: { processing: 25, broker: 70, portHandling: 55, inspection: 45, quarantine: 40 },
  SG: { processing: 22, broker: 65, portHandling: 50, inspection: 38, quarantine: 30 },
  MY: { processing: 23, broker: 68, portHandling: 52, inspection: 40, quarantine: 32 },
  TH: { processing: 23, broker: 68, portHandling: 52, inspection: 42, quarantine: 35 },
  VN: { processing: 22, broker: 65, portHandling: 50, inspection: 40, quarantine: 32 },
  IN: { processing: 25, broker: 72, portHandling: 55, inspection: 45, quarantine: 38 },
  AU: { processing: 35, broker: 90, portHandling: 70, inspection: 60, quarantine: 85 },
  NZ: { processing: 32, broker: 85, portHandling: 65, inspection: 55, quarantine: 75 },
  BR: { processing: 30, broker: 78, portHandling: 62, inspection: 48, quarantine: 38 },
  AR: { processing: 30, broker: 78, portHandling: 62, inspection: 48, quarantine: 38 },
  MX: { processing: 27, broker: 72, portHandling: 58, inspection: 45, quarantine: 35 },
  CA: { processing: 28, broker: 75, portHandling: 60, inspection: 48, quarantine: 55 },
  CH: { processing: 32, broker: 82, portHandling: 65, inspection: 45, quarantine: 35 },
  TR: { processing: 27, broker: 70, portHandling: 55, inspection: 42, quarantine: 33 },
  ZA: { processing: 28, broker: 72, portHandling: 58, inspection: 45, quarantine: 38 },
};

// ─── HS chapter → typical MFN duty rate (WTO averages, indicative) ───
const DUTY_BY_CHAPTER: Record<number, number> = {
  1: 5, 2: 5, 3: 5, 4: 8, 5: 4,                   // Live animals, meat, dairy, eggs, honey
  6: 4, 7: 7, 8: 6, 9: 5, 10: 5, 11: 5, 12: 5,    // Plants, vegetables, fruits, coffee, cereals
  13: 4, 14: 4, 15: 6,                             // Lac, vegetable plaiting, oils
  16: 8, 17: 10, 18: 8, 19: 8, 20: 10, 21: 8,     // Meat prep, sugar, cocoa, cereal prep, veg prep, misc food
  22: 8, 23: 5, 24: 15,                            // Beverages, animal feed, tobacco
  25: 3, 26: 2, 27: 3,                             // Salt, ores, petroleum
  28: 4, 29: 4, 30: 0, 31: 4, 32: 5, 33: 5,       // Chemicals, pharmaceuticals (0!), fertilizers, dyes, cosmetics
  34: 5, 35: 4, 36: 5, 37: 5, 38: 4,               // Soaps, enzymes, explosives, photo, industrial chemicals
  39: 6, 40: 5,                                    // Plastics, rubber
  41: 5, 42: 5, 43: 5,                             // Hides, leather goods, fur
  44: 4, 45: 4, 46: 4,                             // Wood, cork, plaits
  47: 0, 48: 4, 49: 0,                             // Pulp (0!), paper, printed matter (0!)
  50: 5, 51: 5, 52: 5, 53: 4, 54: 5, 55: 5,        // Silk, wool, cotton, flax, synthetic filament, synthetic staple
  56: 5, 57: 6, 58: 5, 59: 5, 60: 5,                // Wadding, carpets, special fabrics, coated, knitted
  61: 12, 62: 12, 63: 5,                           // Apparel knit (12!), apparel woven (12!), home textiles
  64: 12, 65: 5, 66: 5, 67: 5,                     // Footwear (12!), headgear, umbrellas, feathers
  68: 5, 69: 5, 70: 5,                             // Stone, ceramics, glass
  71: 5,                                           // Precious stones/metals
  72: 5, 73: 5, 74: 5, 75: 5, 76: 5,               // Iron/steel, steel products, copper, nickel, aluminum
  78: 5, 79: 5, 80: 5, 81: 5, 82: 5, 83: 5,        // Lead, zinc, tin, other metals, tools, hardware
  84: 5, 85: 5,                                    // Machinery, electrical
  86: 3, 87: 10, 88: 0, 89: 0,                     // Railway, vehicles (10!), aircraft (0!), ships (0!)
  90: 5, 91: 5, 92: 5,                             // Instruments, clocks, musical
  93: 5,                                           // Arms
  94: 5, 95: 5, 96: 5, 97: 0,                      // Furniture, toys, misc, art (0!)
};

// ─── FTA preference indicators (countries with EU/Japan/etc.) ───
const FTA_PREFERENCE: { countries: string[]; reductionPct: number; name: string }[] = [
  { countries: ["EG", "MA", "TN", "IL", "JO", "LB", "SY"], reductionPct: 100, name: "EU-Mediterranean FTA (duty-free for most products)" },
  { countries: ["KR", "SG", "VN", "MY", "JP", "CA", "MX"], reductionPct: 90, name: "EU FTA (90% duty reduction)" },
  { countries: ["GB"], reductionPct: 100, name: "EU-UK TCA (duty-free for originating goods)" },
  { countries: ["US", "AU", "NZ", "CH", "NO"], reductionPct: 100, name: "WTO MFN (no FTA, but low tariffs)" },
];

export function getDutyRate(hsCode: string, destinationCountry: string, originCountry: string): { rate: number; notes: string[] } {
  const chapter = parseInt(hsCode.replace(/\D/g, "").slice(0, 2), 10);
  let rate = DUTY_BY_CHAPTER[chapter] ?? 5;
  const notes: string[] = [];

  // Check FTA preference
  const fta = FTA_PREFERENCE.find((f) => f.countries.includes(originCountry));
  if (fta && (destinationCountry === "DE" || destinationCountry === "FR" || destinationCountry === "NL" || destinationCountry === "BE" || destinationCountry === "IT" || destinationCountry === "ES" || destinationCountry === "GB")) {
    const reducedRate = rate * (1 - fta.reductionPct / 100);
    notes.push(`${fta.name}: duty reduced from ${rate}% to ${reducedRate.toFixed(1)}% for originating goods with EUR.1 certificate`);
    rate = reducedRate;
  }

  // Egypt-specific: higher duties on luxury goods
  if (destinationCountry === "EG") {
    if (chapter >= 50 && chapter <= 63) { rate = Math.max(rate, 30); notes.push("Egypt: textile/apparel duty 30% (protective tariff)"); }
    if (chapter === 87) { rate = Math.max(rate, 40); notes.push("Egypt: vehicle duty 40%+ (protective tariff)"); }
    if (chapter >= 84 && chapter <= 85) { rate = Math.max(rate, 20); notes.push("Egypt: machinery/electronics duty 20% (protective tariff)"); }
  }

  // Saudi/UAE: duty-free for most food
  if ((destinationCountry === "SA" || destinationCountry === "AE") && chapter >= 1 && chapter <= 24) {
    rate = 0;
    notes.push(`${destinationCountry}: food products duty-free (GCC common external tariff)`);
  }

  // US: very low duties on many items
  if (destinationCountry === "US" && (chapter === 49 || chapter === 84 || chapter === 85 || chapter === 88 || chapter === 89 || chapter === 97)) {
    rate = 0;
    notes.push("US: duty-free for this category");
  }

  return { rate: Math.round(rate * 10) / 10, notes };
}

export async function calculateCustomsPricing(input: {
  destinationPort: string;
  commodity: string;
  hsCode: string;
  cargoValueUsd: number;
  originCountry?: string;
  incoterm?: string;
  weight?: number;
}): Promise<CustomsPricing> {
  const destinationCountry = input.destinationPort.slice(0, 2).toUpperCase();
  const originCountry = (input.originCountry || "").toUpperCase();
  const notes: string[] = [];

  // 1. Get duty rate from DB
  const { rate: dutyRatePct, notes: dutyNotes } = getDutyRate(input.hsCode, destinationCountry, originCountry);
  notes.push(...dutyNotes);

  // 2. Get VAT/GST rate
  const vatInfo = VAT_RATES[destinationCountry] || { rate: 10, name: "VAT" };
  const vatRatePct = vatInfo.rate;
  notes.push(`${destinationCountry} ${vatInfo.name}: ${vatRatePct}%`);

  // 3. Get fixed fees
  const fees = COUNTRY_FEES[destinationCountry] || { processing: 30, broker: 75, portHandling: 55, inspection: 45, quarantine: 35 };

  // 4. Calculate duty
  const dutyAmountUsd = Math.round((input.cargoValueUsd * dutyRatePct / 100) * 100) / 100;

  // 5. Calculate VAT (on cargo value + duty — "CIF + duty" basis in most countries)
  const vatBase = input.cargoValueUsd + dutyAmountUsd;
  const vatAmountUsd = Math.round((vatBase * vatRatePct / 100) * 100) / 100;

  // 6. AI enrichment — get more accurate duty rate + country-specific notes
  let aiGenerated = false;
  let aiReasoning = "";
  let finalDutyRate = dutyRatePct;
  let finalVatRate = vatRatePct;

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: "You are a customs duty and tax expert. Provide accurate import duty and VAT rates for the destination country. Respond with VALID JSON ONLY.",
        },
        {
          role: "user",
          content: `Cargo: ${input.commodity} (HS ${input.hsCode}), value $${input.cargoValueUsd}, importing to ${destinationCountry} (port ${input.destinationPort}).
Origin: ${originCountry || "unknown"}.
Estimated duty rate from DB: ${dutyRatePct}%. Estimated VAT: ${vatRatePct}%.

Provide the most accurate current duty rate and any additional notes (anti-dumping duties, seasonal tariffs, special permits, etc.):

{"duty_rate_pct": 6.5, "vat_rate_pct": 19, "additional_notes": ["Note 1", "Note 2"], "reasoning": "Brief explanation"}

Rules:
- "duty_rate_pct": MFN or FTA rate for this HS code in this country
- "vat_rate_pct": standard VAT/GST rate
- "additional_notes": any extra charges, anti-dumping, seasonal, permit requirements
- "reasoning": 1-sentence explanation`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      finalDutyRate = Math.round((parsed.duty_rate_pct || dutyRatePct) * 10) / 10;
      finalVatRate = Math.round((parsed.vat_rate_pct || vatRatePct) * 10) / 10;
      if (Array.isArray(parsed.additional_notes)) {
        notes.push(...parsed.additional_notes.map((n: string) => `AI: ${n}`));
      }
      aiReasoning = parsed.reasoning || "";
      aiGenerated = true;
    }
  } catch (err) {
    notes.push("AI enrichment skipped (API unavailable)");
  }

  // Recalculate with AI-adjusted rates if different
  const finalDutyAmount = Math.round((input.cargoValueUsd * finalDutyRate / 100) * 100) / 100;
  const finalVatAmount = Math.round(((input.cargoValueUsd + finalDutyAmount) * finalVatRate / 100) * 100) / 100;

  const totalCustomsCost = finalDutyAmount + finalVatAmount + fees.processing + fees.broker + fees.portHandling + fees.inspection + fees.quarantine;
  const totalLandedCost = input.cargoValueUsd + totalCustomsCost;
  const effectiveDutyRate = Math.round((totalCustomsCost / input.cargoValueUsd) * 1000) / 10;

  return {
    destinationPort: input.destinationPort,
    destinationCountry,
    commodity: input.commodity,
    hsCode: input.hsCode,
    cargoValueUsd: input.cargoValueUsd,
    dutyRatePct: finalDutyRate,
    dutyAmountUsd: finalDutyAmount,
    vatRatePct: finalVatRate,
    vatAmountUsd: finalVatAmount,
    customsProcessingFeeUsd: fees.processing,
    customsBrokerFeeUsd: fees.broker,
    portHandlingFeeUsd: fees.portHandling,
    inspectionFeeUsd: fees.inspection,
    quarantineFeeUsd: fees.quarantine,
    totalCustomsCostUsd: Math.round(totalCustomsCost * 100) / 100,
    totalLandedCostUsd: Math.round(totalLandedCost * 100) / 100,
    effectiveDutyRatePct: effectiveDutyRate,
    currency: "USD",
    notes,
    aiGenerated,
    confidence: aiGenerated ? 0.85 : 0.7,
    aiReasoning,
  };
}
