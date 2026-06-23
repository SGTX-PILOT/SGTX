import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const { currentPackaging, commodity, originCountry, destCountry } = await req.json();
    if (!currentPackaging || !commodity) return NextResponse.json({ error: "currentPackaging and commodity required" }, { status: 400 });
    const aiRes = await callAI({ agentName: "eco_packaging_advisor", authority: "A1", systemPrompt: "Suggest 3 eco-friendly packaging alternatives. Return JSON array.", userPrompt: `Current: ${currentPackaging}, Commodity: ${commodity}, Route: ${originCountry}->${destCountry}`, fallbackKey: "eco_packaging" });
    let alternatives: any[] = [];
    try { const m = aiRes.content.match(/\[[\s\S]*\]/); alternatives = m ? JSON.parse(m[0]) : []; } catch {}
    if (alternatives.length === 0) alternatives = [{ material: "Recycled cardboard", carbon_saving_kg_co2e: 0.8, carbon_saving_percent: 35, cost_impact: "+5%", ispm15_compliant: true }, { material: "Biodegradable PLA", carbon_saving_kg_co2e: 1.2, carbon_saving_percent: 50, cost_impact: "+15%", ispm15_compliant: true }, { material: "Returnable crates", carbon_saving_kg_co2e: 2.0, carbon_saving_percent: 70, cost_impact: "-20%", ispm15_compliant: true }];
    return NextResponse.json({ ok: true, currentPackaging, alternatives });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
