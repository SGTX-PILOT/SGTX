// @ts-nocheck
// SGTX Part 69 — Truth Triangulation Engine
// GET /api/sgtx/truth-triangulation?ustn=USTN
import { NextResponse } from "next/server";
import { triangulate } from "@/lib/sgtx/truth-triangulation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await triangulate(ustn);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/sgtx/truth-triangulation] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
