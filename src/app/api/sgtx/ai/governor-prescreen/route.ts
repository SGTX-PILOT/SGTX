import { NextRequest, NextResponse } from "next/server";
import { governorPrescreen } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/governor-prescreen
// Body (Part 4.15 expanded):
//   { commodity, hsCode, buyerCountry, sellerCountry, value,
//     incoterm?, transportMode?, equipmentType?,
//     insuranceRequirement?, insuranceType?,
//     settlementStructure?, paymentTiming?, currency?,
//     tradeCriticality?, earliestDeliveryDate?, preferredDeliveryDate?, latestDeliveryDate?,
//     documentationMandatoryCount?, documentationMandatorySelected?, sellerGtid? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.commodity) return NextResponse.json({ error: "commodity required" }, { status: 400 });
  const result = await governorPrescreen({
    commodity: body.commodity,
    hsCode: body.hsCode || body.hs || "",
    buyerCountry: body.buyerCountry || "",
    sellerCountry: body.sellerCountry || "",
    value: body.value || 0,
    incoterm: body.incoterm,
    transportMode: body.transportMode,
    equipmentType: body.equipmentType,
    insuranceRequirement: body.insuranceRequirement,
    insuranceType: body.insuranceType,
    settlementStructure: body.settlementStructure,
    paymentTiming: body.paymentTiming,
    currency: body.currency,
    tradeCriticality: body.tradeCriticality,
    earliestDeliveryDate: body.earliestDeliveryDate,
    preferredDeliveryDate: body.preferredDeliveryDate,
    latestDeliveryDate: body.latestDeliveryDate,
    documentationMandatoryCount: body.documentationMandatoryCount,
    documentationMandatorySelected: body.documentationMandatorySelected,
    sellerGtid: body.sellerGtid,
  });
  return NextResponse.json(result);
}
