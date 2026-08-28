// @ts-nocheck
/**
 * G-11 — ISO 20022 message generation API route
 * POST /api/sgtx/financial/iso20022
 * Body: { messageType: "pain001" | "pacs008" | "pacs002", data: <message-specific payload> }
 * Returns: { ok: true, xml, messageType, generatedAt }
 */

import { NextResponse } from "next/server";
import { generateIso20022Message, type Iso20022MessageType } from "@/lib/sgtx/financial/iso20022";
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
    const messageType = body.messageType as Iso20022MessageType;
    if (!messageType || !["pain001", "pacs008", "pacs002"].includes(messageType)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "messageType is required and must be one of: pain001, pacs008, pacs002",
        },
        { status: 400 },
      );
    }
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { ok: false, error: "data is required (message-specific payload)" },
        { status: 400 },
      );
    }
    const result = await generateIso20022Message(messageType, body.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    logger.error("[api/financial/iso20022] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** GET — list supported message types with their input shape (self-describing). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    supportedMessageTypes: [
      {
        type: "pain001",
        name: "Customer Credit Transfer Initiation (pain.001.001.09)",
        namespace: "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09",
        requiredFields: [
          "messageId",
          "initiatingPartyName",
          "paymentInfoId",
          "debtor",
          "requestedExecutionDate",
          "batchBookingCurrency",
          "transactions",
        ],
      },
      {
        type: "pacs008",
        name: "FI-to-FI Customer Credit Transfer (pacs.008.001.10)",
        namespace: "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10",
        requiredFields: [
          "messageId",
          "settlementAmount",
          "settlementCurrency",
          "settlementDate",
          "instructingBic",
          "instructedBic",
          "debtor",
          "creditor",
          "endToEndId",
          "txId",
        ],
      },
      {
        type: "pacs002",
        name: "FI-to-FI Payment Status Report (pacs.002.001.12)",
        namespace: "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12",
        requiredFields: [
          "messageId",
          "originalMessageId",
          "instructingBic",
          "instructedBic",
          "creationDate",
          "statuses",
        ],
      },
    ],
  });
}
