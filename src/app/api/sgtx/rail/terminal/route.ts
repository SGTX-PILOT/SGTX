// @ts-nocheck
// GET  /api/sgtx/rail/terminal — list rail terminals (filter: ?country= | ?operatorGtid= | ?hasCustoms= | ?hasInterchange= | ?hasWarehouse= | ?limit=)
// POST /api/sgtx/rail/terminal — register a new rail terminal

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listTerminals, registerTerminal } from "@/lib/sgtx/rail";

export const dynamic = "force-dynamic";

function parseBool(v: string | null): boolean | undefined {
  if (v === null) return undefined;
  const s = v.toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filter = {
      country: url.searchParams.get("country") || undefined,
      operatorGtid: url.searchParams.get("operatorGtid") || undefined,
      hasCustoms: parseBool(url.searchParams.get("hasCustoms")),
      hasInterchange: parseBool(url.searchParams.get("hasInterchange")),
      hasWarehouse: parseBool(url.searchParams.get("hasWarehouse")),
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined,
    };
    const terminals = await listTerminals(filter);
    return NextResponse.json({ ok: true, terminals, count: terminals.length, filter });
  } catch (e: any) {
    logger.error("[rail/terminal/GET] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error", terminals: [], count: 0 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await registerTerminal(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/terminal/POST] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}
