// @ts-nocheck
// SGTX Part 28 — Document Friction Reducer
// GET /api/sgtx/document-friction-reducer?ustn=USTN                  — analyzeDocuments
// GET /api/sgtx/document-friction-reducer?ustn=USTN&action=next      — getNextRequiredDocuments
import { NextResponse } from "next/server";
import { analyzeDocuments, getNextRequiredDocuments } from "@/lib/sgtx/document-friction-reducer";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const action = url.searchParams.get("action") || "analyze";
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (action === "next") {
      const docs = await getNextRequiredDocuments(ustn);
      return NextResponse.json({ ok: true, ustn, requiredDocuments: docs, count: docs.length });
    }
    const analysis = await analyzeDocuments(ustn);
    return NextResponse.json({ ok: true, analysis });
  } catch (err: any) {
    logger.error("[api/sgtx/document-friction-reducer] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
