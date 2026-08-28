// @ts-nocheck
// SGTX Part 29 — Document Consistency Engine
// GET /api/sgtx/document-consistency?ustn=USTN
import { NextResponse } from "next/server";
import { checkConsistency } from "@/lib/sgtx/document-consistency";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await checkConsistency(ustn);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/sgtx/document-consistency] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
