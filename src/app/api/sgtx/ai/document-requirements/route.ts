import { NextRequest, NextResponse } from "next/server";
import { resolveDocumentsByPortPair } from "@/lib/sgtx/trade-request/doc-rules-v2";

// POST /api/sgtx/ai/document-requirements — AI document requirement resolver by commodity + ports
// Body: { commodity, hs_code?, origin_port, destination_port, incoterm?, transport_mode?, cold_chain?, lc_selected?, financing_requested?, preference_agreement? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commodity = (body?.commodity || "").toString().trim();
    const hsCode = body?.hs_code || body?.hsCode;
    const originPort = (body?.origin_port || body?.originPort || "").toString().toUpperCase();
    const destinationPort = (body?.destination_port || body?.destinationPort || "").toString().toUpperCase();
    const incoterm = body?.incoterm;
    const transportMode = body?.transport_mode || body?.transportMode;
    const coldChain = Boolean(body?.cold_chain ?? body?.coldChain);
    const lcSelected = Boolean(body?.lc_selected ?? body?.lcSelected);
    const financingRequested = Boolean(body?.financing_requested ?? body?.financingRequested);
    const preferenceAgreement = Boolean(body?.preference_agreement ?? body?.preferenceAgreement);

    if (!originPort || !destinationPort) {
      return NextResponse.json(
        { error: "origin_port and destination_port required (UN/LOCODE)" },
        { status: 400 }
      );
    }

    const result = await resolveDocumentsByPortPair({
      commodity: commodity || "general goods",
      hsCode,
      originPort,
      destinationPort,
      incoterm,
      transportMode,
      coldChain,
      lcSelected,
      financingRequested,
      preferenceAgreement,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      document_count: result.documents.length,
      mandatory_count: result.documents.filter((d) => d.mandatory).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
