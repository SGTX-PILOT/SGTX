// @ts-nocheck
// §89 Transaction Twin — GET (getTransactionTwin) + POST (getOrCreateTransactionTwin)
// GET  /api/sgtx/constitutional/twin?ustn=X
// POST /api/sgtx/constitutional/twin  body: { ustn }
import { NextResponse } from "next/server";
import {
  getTransactionTwin,
  getOrCreateTransactionTwin,
} from "@/lib/sgtx/transaction-twin";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const twin = await getTransactionTwin(ustn);
    if (!twin) {
      return NextResponse.json(
        { error: "twin not found", twin: null },
        { status: 404 },
      );
    }
    return NextResponse.json({ twin });
  } catch (err: any) {
    logger.error("[api/constitutional/twin] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn = body?.ustn;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const twin = await getOrCreateTransactionTwin(ustn);
    return NextResponse.json({ twin });
  } catch (err: any) {
    logger.error("[api/constitutional/twin] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
