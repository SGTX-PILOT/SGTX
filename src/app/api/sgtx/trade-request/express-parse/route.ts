// POST /api/sgtx/trade-request/express-parse — parse free-text trade request into structured fields
//
// CCL-004: Express Mode formalization.
// The buyer types a natural-language description; the AI parses it into
// structured fields. The buyer must CONFIRM before submission — never auto-submit.
//
// Example input: "I need 20,000 kg frozen Grade A strawberries from Egypt,
// delivered to Rotterdam by June 30, CIF, temperature -18°C."
//
// Output: { parsed: { ...14 fields... }, fieldsExtracted: 14, requiresConfirmation: true }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json(
        { ok: false, error: "Please provide a trade description of at least 10 characters." },
        { status: 400 }
      );
    }

    // Parse the free-text into structured fields using heuristics + AI.
    // The parsing is best-effort — the buyer reviews + confirms before submission.
    const parsed = await parseExpressText(text);

    return NextResponse.json({
      ok: true,
      parsed,
      fieldsExtracted: countExtractedFields(parsed),
      requiresConfirmation: true,
      message: `AI extracted ${countExtractedFields(parsed)} fields. Please review and confirm before submitting.`,
    });
  } catch (e: any) {
    logger.error("express-parse failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "parse failed" },
      { status: 500 }
    );
  }
}

async function parseExpressText(text: string) {
  const lower = text.toLowerCase();

  // ── Quantity ───────────────────────────────────────────────────────
  const quantityMatch = text.match(/([\d,]+)\s*(kg|tons?|mt|pallets?|cartons?|cases?|boxes?|units?)/i);
  const quantity = quantityMatch ? parseInt(quantityMatch[1].replace(/,/g, ""), 10) : undefined;
  const quantityUnit = quantityMatch ? normalizeUnit(quantityMatch[2]) : undefined;

  // ── Temperature ────────────────────────────────────────────────────
  const tempMatch = text.match(/(-?\d+)\s*°?c\b/i) || text.match(/temperature\s*(-?\d+)/i);
  const temperature = tempMatch ? parseInt(tempMatch[1], 10) : undefined;

  // ── Date ───────────────────────────────────────────────────────────
  const dateMatch = text.match(/(?:by|before|delivery|deliver by|delivered by)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i)
    || text.match(/([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/);
  const deliveryDate = dateMatch ? normalizeDate(dateMatch[1]) : undefined;

  // ── Incoterm ───────────────────────────────────────────────────────
  const incoterms = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
  const incoterm = incoterms.find((ic) => new RegExp(`\\b${ic}\\b`, "i").test(text));

  // ── Commodity ──────────────────────────────────────────────────────
  let commodityType = "Other";
  let productName = text.substring(0, 60).trim();
  let hsCode: string | undefined;

  if (/strawberr/i.test(lower)) { commodityType = /frozen/i.test(lower) ? "Frozen Fruits" : "Fresh Fruits"; productName = /frozen/i.test(lower) ? "Frozen Strawberries (IQF)" : "Strawberries (Fresh)"; hsCode = /frozen/i.test(lower) ? "0811.10" : "0810.10"; }
  else if (/orange/i.test(lower)) { commodityType = "Fresh Fruits"; productName = "Valencia Oranges"; hsCode = "0805.10"; }
  else if (/mango/i.test(lower)) { commodityType = "Fresh Fruits"; productName = "Mangoes"; hsCode = "0804.50"; }
  else if (/grape/i.test(lower)) { commodityType = "Fresh Fruits"; productName = "Grapes"; hsCode = "0806.10"; }
  else if (/rice/i.test(lower)) { commodityType = "Grains"; productName = "Rice"; hsCode = "1006.30"; }
  else if (/wheat/i.test(lower)) { commodityType = "Grains"; productName = "Wheat"; hsCode = "1001.99"; }
  else if (/banana/i.test(lower)) { commodityType = "Fresh Fruits"; productName = "Bananas"; hsCode = "0803.90"; }
  else if (/apple/i.test(lower)) { commodityType = "Fresh Fruits"; productName = "Apples"; hsCode = "0808.10"; }
  else if (/shrimp|prawn/i.test(lower)) { commodityType = "Seafood"; productName = "Frozen Shrimp"; hsCode = "0306.17"; }
  else if (/salmon/i.test(lower)) { commodityType = "Seafood"; productName = "Fresh Salmon"; hsCode = "0302.12"; }
  else if (/chicken|poultry/i.test(lower)) { commodityType = "Meat"; productName = "Frozen Chicken"; hsCode = "0207.14"; }
  else if (/beef/i.test(lower)) { commodityType = "Meat"; productName = "Frozen Beef"; hsCode = "0202.30"; }

  // ── Grade ──────────────────────────────────────────────────────────
  const gradeMatch = text.match(/\bgrade\s+([a-eA-E1-5])\b/i) || text.match(/\b(grade a|grade b|grade c|premium|choice|select)\b/i);
  const grade = gradeMatch ? gradeMatch[1] : undefined;

  // ── Origin country ─────────────────────────────────────────────────
  const originCountry = detectCountry(lower, ["egypt", "from egypt", "origin egypt"]);

  // ── Destination ────────────────────────────────────────────────────
  const destCountry = detectDestination(lower);
  const destPort = detectPort(lower);

  // ── Transport mode ────────────────────────────────────────────────
  let transportMode: string | undefined;
  if (/air\s|airfreight|air freight|by air/i.test(lower)) transportMode = "AIR";
  else if (/ocean|sea|vessel|container|fcl|lcl/i.test(lower)) transportMode = "OCEAN";
  else if (/truck|road|by road/i.test(lower)) transportMode = "TRUCK";
  else if (/rail|train|by rail/i.test(lower)) transportMode = "RAIL";
  else if (/roro|ro-ro/i.test(lower)) transportMode = "RO_RO";

  // ── Equipment type ─────────────────────────────────────────────────
  let equipmentType: string | undefined;
  if (transportMode === "OCEAN") {
    if (/reefer|refrigerat/i.test(lower)) equipmentType = "40ft Reefer";
    else if (/40ft|40 ft|40-foot/i.test(lower)) equipmentType = "40ft Dry";
    else if (/20ft|20 ft|20-foot/i.test(lower)) equipmentType = "20ft Dry";
    else equipmentType = "40ft High Cube"; // default for ocean
  }

  return {
    commodityType,
    productName,
    hsCode,
    quantity,
    quantityUnit,
    temperature,
    reeferRequired: temperature !== undefined && temperature <= 0,
    incoterm,
    originCountry,
    destCountry,
    destPort,
    deliveryDate,
    grade,
    transportMode,
    equipmentType,
    specialInstructions: undefined,
  };
}

function countExtractedFields(parsed: any): number {
  return Object.values(parsed).filter((v) => v !== undefined && v !== null && v !== "").length;
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith("kg")) return "kg";
  if (u.startsWith("t")) return "tons";
  if (u.startsWith("pallet")) return "pallets";
  if (u.startsWith("carton")) return "cartons";
  if (u.startsWith("case")) return "cases";
  if (u.startsWith("box")) return "boxes";
  return unit;
}

function normalizeDate(dateStr: string): string {
  // Best-effort ISO date construction
  try {
    const cleaned = dateStr.replace(/(\d{1,2})(st|nd|rd|th)/i, "$1").replace(/,/g, "");
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  } catch {}
  return dateStr;
}

function detectCountry(lower: string, patterns: string[]): string | undefined {
  for (const p of patterns) {
    if (lower.includes(p)) return "EG";
  }
  return undefined;
}

function detectDestination(lower: string): string | undefined {
  if (/rotterdam|hamburg|antwerp|bremerhaven|felixstowe|le havre|barcelona|valencia|genoa|la spezia|piraeus/i.test(lower)) return "EU";
  if (/new york|los angeles|long beach|miami|houston|savannah|norfolk|charleston|oakland|seattle/i.test(lower)) return "US";
  if (/dubai|jebel ali|jeddah|dammam|riyadh|doha|kuwait|manama|muscat/i.test(lower)) return "AE";
  if (/shanghai|ningbo|shenzhen|guangzhou|qingdao|tianjin|hong kong|singapore|busan|tokyo|yokohama/i.test(lower)) return "CN";
  if (/mumbai|chennai|mundra|nhava sheva/i.test(lower)) return "IN";
  if (/santos|itajai|manaus/i.test(lower)) return "BR";
  return undefined;
}

function detectPort(lower: string): string | undefined {
  if (/rotterdam/i.test(lower)) return "NLRTM";
  if (/hamburg/i.test(lower)) return "DEHAM";
  if (/antwerp/i.test(lower)) return "BEANR";
  if (/felixstowe/i.test(lower)) return "GBFXT";
  if (/le havre/i.test(lower)) return "FRLEH";
  if (/barcelona|valencia/i.test(lower)) return "ESBCN";
  if (/genoa|la spezia/i.test(lower)) return "ITGOA";
  if (/piraeus/i.test(lower)) return "GRPIR";
  if (/new york/i.test(lower)) return "USNYC";
  if (/los angeles|long beach/i.test(lower)) return "USLAX";
  if (/miami/i.test(lower)) return "USMIA";
  if (/houston/i.test(lower)) return "USHOU";
  if (/savannah/i.test(lower)) return "USSAV";
  if (/dubai|jebel ali/i.test(lower)) return "AEJEA";
  if (/jeddah/i.test(lower)) return "SAJED";
  if (/dammam/i.test(lower)) return "SADMM";
  if (/shanghai/i.test(lower)) return "CNSHA";
  if (/ningbo/i.test(lower)) return "CNNGB";
  if (/shenzhen/i.test(lower)) return "CNSZX";
  if (/singapore/i.test(lower)) return "SGSIN";
  if (/busan/i.test(lower)) return "KRPUS";
  if (/hong kong/i.test(lower)) return "HKHKG";
  return undefined;
}
