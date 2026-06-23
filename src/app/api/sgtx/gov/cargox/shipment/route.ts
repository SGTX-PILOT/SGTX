import { NextRequest, NextResponse } from "next/server";
import { submitShipment } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/cargox/shipment — submit an ACI shipment envelope to CargoX
//
// Per Blueprint 7.3.3 / 7.3.4 — POST /v3/shipments. The shipment envelope is
// the actual ACI (Advance Cargo Information) submission that produces the ACID
// used by the Nafeza SAD declaration. This is the endpoint the OneClick
// Trigger Map calls in step 1 (Part 7.1 — "Seller clicks Pay Stage 1 → CargoX
// POST /v3/shipments → after PSP webhook confirms split").
//
// Body:
//   ustn: string                              — required (used as external_reference when not supplied)
//   envelope: {                               — required, matches CargoXShipmentEnvelope
//     external_reference?: string,            — defaults to ustn
//     shipper: { tax_id, name, country },     — required
//     consignee: { tax_id, name, country },   — required
//     goods_value: { amount, currency },      — required (amount > 0)
//     container_numbers?: string[],
//     documents?: [{ type, content_base64, filename }]
//   }
//
// Returns: { ok, acid, status, blockchain_seal, tx_hash, notarized_at }
//   acid format: ACIYYYYMMDD-NNNN (production-valid per GGOV4 / G1U31)
//   status: ISSUED | PENDING | REJECTED

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, envelope } = body || {};

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        { error: "Missing required field: ustn" },
        { status: 400 }
      );
    }

    if (!envelope || typeof envelope !== "object") {
      return NextResponse.json(
        { error: "Missing required field: envelope (object)" },
        { status: 400 }
      );
    }

    // Validate required nested fields up-front so callers get a 400 (not 500)
    // on malformed envelopes.
    const missing: string[] = [];
    if (!envelope.shipper?.tax_id) missing.push("envelope.shipper.tax_id");
    if (!envelope.shipper?.name) missing.push("envelope.shipper.name");
    if (!envelope.consignee?.tax_id) missing.push("envelope.consignee.tax_id");
    if (!envelope.consignee?.name) missing.push("envelope.consignee.name");
    if (!envelope.goods_value?.amount || envelope.goods_value.amount <= 0) {
      missing.push("envelope.goods_value.amount (>0)");
    }
    if (!envelope.goods_value?.currency) missing.push("envelope.goods_value.currency");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Envelope missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await submitShipment(ustn, envelope);

    return NextResponse.json({
      ok: true,
      acid: result.acid,
      status: result.status,
      blockchain_seal: result.blockchain_seal,
      tx_hash: result.tx_hash,
      notarized_at: result.notarized_at,
    }, { status: 201 });
  } catch (e: any) {
    console.error("[gov/cargox/shipment POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to submit CargoX shipment envelope" },
      { status: 500 }
    );
  }
}
