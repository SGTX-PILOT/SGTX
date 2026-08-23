// @ts-nocheck
// §57 External Identifier Registry — register (POST) + list by USTN (GET)
// POST /api/sgtx/constitutional/identifiers  body: full RegisterIdentifierInput
// GET  /api/sgtx/constitutional/identifiers?ustn=X
import { NextResponse } from "next/server";
import { registerIdentifier, getIdentifiersByUstn } from "@/lib/sgtx/external-identifier";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || !body.identifierType || !body.identifierValue) {
      return NextResponse.json(
        { error: "identifierType and identifierValue required" },
        { status: 400 },
      );
    }
    const identifier = await registerIdentifier(body);
    if (!identifier) {
      return NextResponse.json(
        { error: "registerIdentifier failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ identifier });
  } catch (err: any) {
    logger.error("[api/constitutional/identifiers] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const identifiers = await getIdentifiersByUstn(ustn);
    return NextResponse.json({
      identifiers,
      count: identifiers.length,
    });
  } catch (err: any) {
    logger.error("[api/constitutional/identifiers] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
