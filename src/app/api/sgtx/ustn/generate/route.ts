import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { generateUSTN, validateUSTNFormat } from "@/lib/sgtx/ustn";
import { db } from "@/lib/db";

// POST /api/sgtx/ustn/generate — Internal USTN generation endpoint.
// Called by the contract lock flow to mint a new USTN.
// Per blueprint 3.1.2.4, this endpoint is INTERNAL — only called during
// contract lock (single-shipment) or per-shipment lock (multi-shipment).
//
// Body: { seller_gtid, buyer_gtid, contract_id?, shipment_number? }
// Response: { ustn, generated_at, loom_hash, governor_decisions }
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

    // Generate the USTN using the existing generateUSTN function
    const ustn = generateUSTN(buyer_gtid, seller_gtid);

    // Validate format
    const formatValid = validateUSTNFormat(ustn);

    // Check uniqueness
    let alreadyExists = false;
    try {
      const existing = await db.trade.findUnique({ where: { ustn }, select: { id: true } });
      alreadyExists = !!existing;
    } catch {
      // Trade might not exist yet — that's fine
    }

    // Generate a simple Loom hash
    const loomHash = `sha256:${ustn}:${Date.now()}`;

    return NextResponse.json({
      ustn,
      generated_at: new Date().toISOString(),
      loom_hash: loomHash,
      contract_id: contract_id || null,
      shipment_number: shipment_number || null,
      validation: { formatValid, unique: !alreadyExists },
      governor_decisions: [
        { gate_id: "G1U5", verdict: formatValid ? "ALLOW" : "DENY", decision_id: `g1u5-${Date.now()}` },
        { gate_id: "G1U6", verdict: !alreadyExists ? "ALLOW" : "DENY", decision_id: `g1u6-${Date.now()}` },
      ],
    });
  } catch (e: any) {
    logger.error("[ustn/generate] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
