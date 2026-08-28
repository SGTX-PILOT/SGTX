// @ts-nocheck
/**
 * G-14 — IATA ONE Record / Cargo-XML API route
 * POST /api/sgtx/air-cargo/one-record
 * Body: { output: "one-record" | "cargo-xml", ...payload }
 *
 * For output=one-record: body.shipments[] → JSON-LD object graph.
 * For output=cargo-xml:  body.type ("XAWB"|"XFFR"|"XRCT") + body.data.
 */

import { NextResponse } from "next/server";
import {
  generateOneRecordObject,
  generateCargoXML,
} from "@/lib/sgtx/air-cargo/one-record";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    const output = (body.output || "one-record").toLowerCase();

    if (output === "one-record") {
      // Body shape: { shipments?: OneRecordShipment[], shipment?: OneRecordShipment }
      // Either is acceptable.
      if (!body.shipments && !body.shipment) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "either 'shipments' (array) or 'shipment' (single) is required for output=one-record",
          },
          { status: 400 },
        );
      }
      const result = await generateOneRecordObject(body);
      return NextResponse.json({ ok: true, output: "one-record", result });
    }

    if (output === "cargo-xml") {
      const type = body.type;
      if (!type) {
        return NextResponse.json(
          {
            ok: false,
            error: "type is required for output=cargo-xml (one of: XAWB, XFFR, XRCT)",
          },
          { status: 400 },
        );
      }
      const xml = await generateCargoXML(type, body.data || {});
      return NextResponse.json({
        ok: true,
        output: "cargo-xml",
        type,
        xml,
        generatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: `unknown output: ${output}. Valid: one-record | cargo-xml`,
      },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/air-cargo/one-record] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** GET — self-describing endpoint listing supported output modes. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    supportedOutputs: [
      {
        output: "one-record",
        description:
          "Generate IATA ONE Record JSON-LD object graph (v2.0 ontology). " +
          "Body shape: { shipments: OneRecordShipment[] } or { shipment: OneRecordShipment }.",
        types: [
          "Shipment",
          "Piece",
          "ULD",
          "Location",
          "Actor",
          "Event",
          "Document",
          "Dimensions",
          "Weight",
        ],
      },
      {
        output: "cargo-xml",
        description:
          "Generate IATA Cargo-XML message. Body shape: { type: 'XAWB'|'XFFR'|'XRCT', data: {...} }.",
        types: [
          {
            type: "XAWB",
            name: "Air Waybill (Cargo-XML 4.0)",
            requiredFields: ["awbNumber", "shipper", "consignee", "issuingCarrier", "origin", "destination"],
          },
          {
            type: "XFFR",
            name: "Flight Manifest (Cargo-XML 3.0)",
            requiredFields: ["flightNumber", "flightDate", "airportOfLoading", "airportOfUnloading", "consignments"],
          },
          {
            type: "XRCT",
            name: "Consignment Status Report (Cargo-XML 3.0)",
            requiredFields: ["awbNumber", "status", "movements"],
          },
        ],
      },
    ],
  });
}
