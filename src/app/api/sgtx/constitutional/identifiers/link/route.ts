// @ts-nocheck
// §57 External Identifier Registry — link an identifier to a USTN
// POST /api/sgtx/constitutional/identifiers/link  body: { type, value, ustn }
import { NextResponse } from "next/server";
import { linkToUstn } from "@/lib/sgtx/external-identifier";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { type, value, ustn } = body || {};
    if (!type || !value || !ustn) {
      return NextResponse.json(
        { error: "type, value, ustn required" },
        { status: 400 },
      );
    }
    const identifier = await linkToUstn(type, String(value), ustn);
    if (!identifier) {
      return NextResponse.json(
        { error: "linkToUstn failed — see logs (link conflict or unknown type)" },
        { status: 500 },
      );
    }
    return NextResponse.json({ identifier });
  } catch (err: any) {
    logger.error("[api/constitutional/identifiers/link] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
