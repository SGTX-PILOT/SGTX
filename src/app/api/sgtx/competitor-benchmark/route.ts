// @ts-nocheck
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    sgtx: {
      tradeExecutionTime: "1-3 days",
      costPerTrade: "$50-200",
      coverage: "195+ countries (via GRiRE)",
      aiCapabilities: "Multi-model consensus (Gemini + Groq + HuggingFace)",
      nonCustodial: true, ustnTracking: true, regulatorySnapshots: true, evidencePackages: true,
    },
    competitors: [
      { name: "TradeLens (Maersk + IBM)", status: "DISCONTINUED (2023)", tradeExecutionTime: "3-7 days", costPerTrade: "$100-500", coverage: "100+ ports", aiCapabilities: "Limited", nonCustodial: false, ustnTracking: false, regulatorySnapshots: false, evidencePackages: false },
      { name: "Maersk Spot", status: "ACTIVE", tradeExecutionTime: "2-5 days", costPerTrade: "$150-600", coverage: "Maersk network only", aiCapabilities: "Basic", nonCustodial: false, ustnTracking: false, regulatorySnapshots: false, evidencePackages: false },
      { name: "Flexport", status: "ACTIVE", tradeExecutionTime: "3-10 days", costPerTrade: "$200-800", coverage: "100+ countries", aiCapabilities: "Single-model", nonCustodial: false, ustnTracking: false, regulatorySnapshots: false, evidencePackages: false },
      { name: "CargoX", status: "ACTIVE", tradeExecutionTime: "1-3 days (Egypt only)", costPerTrade: "$30-100", coverage: "Egypt + select EU", aiCapabilities: "None", nonCustodial: true, ustnTracking: false, regulatorySnapshots: false, evidencePackages: false },
    ],
    sgtxAdvantages: [
      "Only platform with multi-model AI consensus (3 providers)",
      "Only platform with USTN (Universal Shipment Tracking Number)",
      "Only platform with immutable Regulatory Snapshots (SHA-256)",
      "Only platform with 26-category Evidence Packages at closure",
      "Only platform with 4 transport engines (Road + Air + RoRo + Rail)",
      "Only platform with GRiRE (195+ countries auto-discovered)",
      "Only platform with Governor + OPA + WasmEdge constitutional enforcement",
    ],
  });
}
