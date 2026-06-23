import { NextRequest, NextResponse } from "next/server";
import { generateUSTNv2, validateUSTNv2 } from "@/lib/sgtx/ustn";
import { enforceUstnFormatGate, enforceUstnUniquenessGate } from "@/lib/sgtx/ai/orchestrator";
import { db } from "@/lib/db";

// POST /api/sgtx/ustn/generate — Internal USTN v2 generation endpoint.
// Called by the contract lock flow to mint a new v2 human-readable USTN.
// Per blueprint 3.1.2.4, this endpoint is INTERNAL — only called during
// contract lock (single-shipment) or per-shipment lock (multi-shipment).
//
// Body: { seller_gtid, buyer_gtid, contract_id?, shipment_number? }
// Response: { ustn, country, year, trader_id, sequence, generated_at, loom_hash,
//             governor_decisions: [{gate_id, verdict, decision_id}] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { seller_gtid, buyer_gtid, contract_id, shipment_number } = body;

    if (!seller_gtid || !buyer_gtid) {
      return NextResponse.json(
        { error: "seller_gtid and buyer_gtid required" },
        { status: 400 },
      );
    }

    // Verify seller + buyer exist
    const [seller, buyer] = await Promise.all([
      db.tenant.findUnique({ where: { gtid: seller_gtid } }),
      db.tenant.findUnique({ where: { gtid: buyer_gtid } }),
    ]);
    if (!seller) return NextResponse.json({ error: `Seller ${seller_gtid} not found` }, { status: 404 });
    if (!buyer) return NextResponse.json({ error: `Buyer ${buyer_gtid} not found` }, { status: 404 });

    // Generate the USTN v2 atomically
    const generated = await generateUSTNv2(seller_gtid, { buyerGtid: buyer_gtid });

    // Run governor gates (G1U5 format + G1U6 uniqueness)
    const formatGate = enforceUstnFormatGate({ ustn: generated.ustn });
    let uniquenessGate;
    try {
      const existing = await db.trade.findUnique({ where: { ustn: generated.ustn }, select: { id: true } });
      uniquenessGate = enforceUstnUniquenessGate({ ustn: generated.ustn, alreadyExists: !!existing });
    } catch {
      uniquenessGate = enforceUstnUniquenessGate({ ustn: generated.ustn, alreadyExists: false });
    }

    // Full v2 validation (country exists, year valid, trader ID matches seller GTID)
    const validation = await validateUSTNv2(generated.ustn, { sellerGtid: seller_gtid });

    return NextResponse.json({
      ustn: generated.ustn,
      country: generated.country,
      year: generated.year,
      trader_id: generated.traderId,
      sequence: generated.sequence,
      generated_at: generated.generatedAt,
      loom_hash: generated.loomHash,
      contract_id: contract_id || null,
      shipment_number: shipment_number || null,
      validation,
      governor_decisions: [
        { gate_id: formatGate.gate_id, verdict: formatGate.verdict, decision_id: formatGate.decision_id },
        { gate_id: uniquenessGate.gate_id, verdict: uniquenessGate.verdict, decision_id: uniquenessGate.decision_id },
      ],
    });
  } catch (e: any) {
    console.error("[ustn/generate] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
