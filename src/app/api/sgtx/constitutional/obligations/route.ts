// @ts-nocheck
// §66 Obligation Graph — create obligation (POST) + list by USTN (GET)
// POST /api/sgtx/constitutional/obligations  body: full CreateObligationInput
// GET  /api/sgtx/constitutional/obligations?ustn=X
import { NextResponse } from "next/server";
import { createObligation, getObligations } from "@/lib/sgtx/obligation-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || !body.ustn || !body.obligationType) {
      return NextResponse.json(
        { error: "ustn and obligationType required" },
        { status: 400 },
      );
    }
    const obligation = await createObligation(body);
    if (!obligation) {
      return NextResponse.json(
        { error: "createObligation failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ obligation });
  } catch (err: any) {
    logger.error("[api/constitutional/obligations] POST failed", {
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
    const obligations = await getObligations(ustn);
    return NextResponse.json({
      obligations,
      count: obligations.length,
    });
  } catch (err: any) {
    logger.error("[api/constitutional/obligations] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
