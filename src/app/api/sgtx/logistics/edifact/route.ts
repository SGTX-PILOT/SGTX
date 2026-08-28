// @ts-nocheck
/**
 * G-15 — UN/EDIFACT message generation API route
 * POST /api/sgtx/logistics/edifact
 * Body: { messageType: "IFTMIN"|"IFTMBC"|"COPARN"|"CODECO"|"COARRI", data: {...} }
 * Returns: { ok: true, text, messageType, generatedAt }
 */

import { NextResponse } from "next/server";
import {
  generateEdifactMessage,
  type EdifactMessageType,
} from "@/lib/sgtx/logistics/edifact";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_TYPES: EdifactMessageType[] = [
  "IFTMIN",
  "IFTMBC",
  "COPARN",
  "CODECO",
  "COARRI",
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    const messageType = body.messageType as EdifactMessageType;
    if (!messageType || !VALID_TYPES.includes(messageType)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "messageType is required and must be one of: " +
            VALID_TYPES.join(", "),
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
    const result = await generateEdifactMessage(messageType, body.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    logger.error("[api/logistics/edifact] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** GET — supported EDIFACT message types. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    standard: "UN/EDIFACT D.96A",
    supportedMessageTypes: [
      {
        type: "IFTMIN",
        name: "Instruction for Multimodal/Transport (booking request)",
        bgmCode: "740",
      },
      {
        type: "IFTMBC",
        name: "Booking Confirmation",
        bgmCode: "640",
      },
      {
        type: "COPARN",
        name: "Container Announcement",
        bgmCode: "85",
      },
      {
        type: "CODECO",
        name: "Container Gate-in/Gate-out Report",
        bgmCode: "34",
      },
      {
        type: "COARRI",
        name: "Container Discharge/Loading Report",
        bgmCode: "73",
      },
    ],
  });
}
