// @ts-nocheck
/**
 * SGTX Customs Gateway — Declaration list + create API
 * ===========================================================================
 * GET  /api/sgtx/customs-gateway/declaration
 *   Query: ?ustn=<USTN>&jurisdiction=<CC>&brokerGtid=<GTID>&state=<STATE>&adapterId=<ID>&limit=<N>
 *   Returns: { ok, declarations[] }
 *
 * POST /api/sgtx/customs-gateway/declaration
 *   Body:  { ustn, jurisdiction, brokerGtid }
 *   Returns: { ok, declaration }
 *
 * L0: jurisdiction-neutral — does NOT auto-select an adapter. The adapterId
 * is recorded from the registry lookup but the broker + Governor choose.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createDeclaration,
  listDeclarations,
} from "@/lib/sgtx/customs-gateway";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = {
      ustn: searchParams.get("ustn") || undefined,
      jurisdiction: searchParams.get("jurisdiction") || undefined,
      brokerGtid: searchParams.get("brokerGtid") || undefined,
      state: searchParams.get("state") || undefined,
      adapterId: searchParams.get("adapterId") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 100,
    };
    const declarations = await listDeclarations(filter);
    return NextResponse.json({ ok: true, count: declarations.length, declarations });
  } catch (err: any) {
    logger.error("[api/customs-gateway/declaration] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn || !body?.jurisdiction) {
      return NextResponse.json(
        { ok: false, error: "ustn and jurisdiction are required" },
        { status: 400 },
      );
    }
    const declaration = await createDeclaration(
      body.ustn,
      body.jurisdiction,
      body.brokerGtid || "",
    );
    return NextResponse.json({ ok: true, declaration }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/customs-gateway/declaration] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
