// @ts-nocheck
/**
 * G-12 — SWIFT MT700-series documentary credit message API route
 * POST /api/sgtx/financial/swift-mt700
 * Body: { messageType: "MT700" | "MT707" | "MT752", data: <message-specific payload> }
 * Returns: { ok: true, text, messageType, generatedAt }
 */

import { NextResponse } from "next/server";
import { generateSwiftMessage, type SwiftMessageType } from "@/lib/sgtx/financial/swift-mt700";
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
    const messageType = body.messageType as SwiftMessageType;
    if (!messageType || !["MT700", "MT707", "MT752"].includes(messageType)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "messageType is required and must be one of: MT700, MT707, MT752",
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
    const result = await generateSwiftMessage(messageType, body.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    logger.error("[api/financial/swift-mt700] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** GET — supported SWIFT message types. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    supportedMessageTypes: [
      {
        type: "MT700",
        name: "Issue of a Documentary Credit",
        fieldTags: [
          ":27:", ":40A:", ":20:", ":31C:", ":31D:", ":50:", ":59:",
          ":32B:", ":39A:", ":41A:", ":42C:", ":43P:", ":43T:", ":44A:",
          ":44B:", ":44C:", ":45A:", ":46A:", ":47A:", ":49:", ":78:",
          ":72:",
        ],
      },
      {
        type: "MT707",
        name: "Amendment to a Documentary Credit",
        fieldTags: [
          ":27:", ":20:", ":21:", ":23E:", ":30:", ":52D:", ":31D:",
          ":32B:", ":34B:", ":50:", ":59:", ":79:", ":72:",
        ],
      },
      {
        type: "MT752",
        name: "Authorisation to Reimburse",
        fieldTags: [
          ":27:", ":20:", ":21:", ":25:", ":30:", ":32B:", ":34B:",
          ":71B:", ":72:",
        ],
      },
    ],
  });
}
