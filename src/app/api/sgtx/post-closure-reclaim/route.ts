// @ts-nocheck
// SGTX Part 73 — Post-Closure Reclaim Engine
// GET  /api/sgtx/post-closure-reclaim?ustn=USTN                — detect opportunities
// POST /api/sgtx/post-closure-reclaim  { ustn, type }          — create reclaim case
import { NextResponse } from "next/server";
import {
  detectReclaimOpportunities,
  createReclaimCase,
} from "@/lib/sgtx/post-closure-reclaim";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const opportunities = await detectReclaimOpportunities(ustn);
    return NextResponse.json({ ok: true, ustn, opportunities, count: opportunities.length });
  } catch (err: any) {
    logger.error("[api/sgtx/post-closure-reclaim] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn || typeof body.ustn !== "string") {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body.type || typeof body.type !== "string") {
      return NextResponse.json({ error: "type required (DRAWBACK | VAT_REFUND | FTA_RETRO | DEMURRAGE_DISPUTE)" }, { status: 400 });
    }
    const reclaimCase = await createReclaimCase(body.ustn, body.type);
    return NextResponse.json({ ok: true, reclaimCase });
  } catch (err: any) {
    logger.error("[api/sgtx/post-closure-reclaim] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
