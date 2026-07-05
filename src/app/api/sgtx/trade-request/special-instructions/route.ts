import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/trade-request/special-instructions
// Body: { tradeRequestId, instructions }
//   - instructions: free-text string (max 5000 chars)
// Returns: { ok, saved: true }
// Part 4.6 — Special Trade Instructions (free-text + AI-extracted structured categories stored as JSON)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tradeRequestId, instructions } = body || {};
    if (!tradeRequestId) return NextResponse.json({ error: "tradeRequestId required" }, { status: 400 });
    if (typeof instructions !== "string") return NextResponse.json({ error: "instructions must be a string" }, { status: 400 });

    const trimmed = instructions.slice(0, 5000);

    const trade = await db.trade.findUnique({ where: { id: tradeRequestId } });
    if (!trade) return NextResponse.json({ error: `Trade ${tradeRequestId} not found` }, { status: 404 });

    await db.trade.update({
      where: { id: tradeRequestId },
      data: { specialInstructions: trimmed || null },
    });

    // Optionally: AI-extract structured categories (advisory, A2)
    // For now we return the structured categorization hint (non-AI heuristic) — A2 integration can be added later.
    const categories = extractCategoriesHeuristic(trimmed);

    return NextResponse.json({ ok: true, saved: true, instructions: trimmed, categories });
  } catch (e: any) {
    logger.error("[special-instructions] error:", e);
    return NextResponse.json({ error: e.message || "Failed to save special instructions" }, { status: 500 });
  }
}

// GET /api/sgtx/trade-request/special-instructions?tradeRequestId=...
export async function GET(req: NextRequest) {
  const tradeRequestId = req.nextUrl.searchParams.get("tradeRequestId");
  if (!tradeRequestId) return NextResponse.json({ error: "tradeRequestId required" }, { status: 400 });
  const trade = await db.trade.findUnique({
    where: { id: tradeRequestId },
    select: { specialInstructions: true },
  });
  if (!trade) return NextResponse.json({ error: `Trade ${tradeRequestId} not found` }, { status: 404 });
  return NextResponse.json({ ok: true, instructions: trade.specialInstructions || "", categories: extractCategoriesHeuristic(trade.specialInstructions || "") });
}

// Heuristic instruction categorization (A1/A2 should replace this with AI extraction in production).
// Returns array of { category, snippets[] }
function extractCategoriesHeuristic(text: string): { category: string; snippets: string[] }[] {
  if (!text.trim()) return [];
  const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
  const categories: Record<string, string[]> = {
    "Labeling & Marking": [],
    "Certifications": [],
    "Packaging & Handling": [],
    "Shipping & Logistics": [],
    "Documentation": [],
    "Quality & Inspection": [],
    "Dispute & Compliance": [],
    "Other": [],
  };
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/label|barcode|mark|stick|arabic|english|chinese|french|german/.test(lower)) categories["Labeling & Marking"].push(line);
    else if (/halal|kosher|organic|gots|iso|certif/.test(lower)) categories["Certifications"].push(line);
    else if (/pallet|wooden|ispm|temperature|humidity|logger|packaging|carton/.test(lower)) categories["Packaging & Handling"].push(line);
    else if (/vessel|transship|direct call|p&i|dhl|fedex|freight/.test(lower)) categories["Shipping & Logistics"].push(line);
    else if (/bill of lading|b\/l|invoice|packing list|legalis|chamber|translation/.test(lower)) categories["Documentation"].push(line);
    else if (/inspect|sgs|bureau|witness|photo/.test(lower)) categories["Quality & Inspection"].push(line);
    else if (/arbitration|difc|lcia|governing law|penalty|uae law|egypt/.test(lower)) categories["Dispute & Compliance"].push(line);
    else categories["Other"].push(line);
  }
  return Object.entries(categories).filter(([, arr]) => arr.length > 0).map(([category, snippets]) => ({ category, snippets }));
}

// Common templates buyer can apply (Part 4.6.5 — Saved Templates)
export const _INSTRUCTION_TEMPLATES = [
  { id: "phyto_required", name: "Phytosanitary certificate required", category: "Certifications" },
  { id: "reefer_precool", name: "Reefer pre-cooling required before loading", category: "Packaging & Handling" },
  { id: "arabic_labels", name: "Arabic labels mandatory on all cartons", category: "Labeling & Marking" },
  { id: "ispm15", name: "No wooden pallets (ISPM-15 compliant only)", category: "Packaging & Handling" },
  { id: "temp_logger", name: "Temperature logger required in each container", category: "Packaging & Handling" },
  { id: "original_bl_dhl", name: "Original Bill of Lading to be sent by DHL", category: "Documentation" },
  { id: "buyer_witness", name: "Inspection must be witnessed by buyer's representative", category: "Quality & Inspection" },
  { id: "difc_arbitration", name: "Arbitration: DIFC-LCIA, Dubai", category: "Dispute & Compliance" },
  { id: "sgs_inspection", name: "SGS inspection required at origin", category: "Quality & Inspection" },
  { id: "direct_call", name: "Direct call required (no transshipment)", category: "Shipping & Logistics" },
];
