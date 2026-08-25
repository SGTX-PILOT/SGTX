// @ts-nocheck
// GET  /api/sgtx/roro/egypt-adapter?ustn=USTN       — fetch the Egypt RoRo adapter config
// POST /api/sgtx/roro/egypt-adapter                  — apply (or refresh) the adapter
//
// Body (POST):
//   { ustn, originCountry?, destinationCountry?, transitCountries?: string[],
//     isExport?, isImport?, isTransit? }
//
// Per Art 77: the adapter determines Nafeza applicability per trade, NOT a
// one-size-fits-all maritime workflow. The "Empty Containers" Enhanced Export
// message (Nafeza July 18 2026 notice) is intentionally omitted for RoRo.
//
// Returns:
//   GET  → { adapter: {...} } | { adapter: null }
//   POST → { adapter: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { applyEgyptRoRoAdapter, getEgyptRoRoAdapter } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { error: "ustn query parameter is required" },
        { status: 400 },
      );
    }
    const adapter = await getEgyptRoRoAdapter(ustn);
    return NextResponse.json({ adapter });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/egypt-adapter GET] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json(
        { error: "ustn is required" },
        { status: 400 },
      );
    }
    const adapter = await applyEgyptRoRoAdapter(body.ustn, {
      originCountry: body.originCountry,
      destinationCountry: body.destinationCountry,
      transitCountries: Array.isArray(body.transitCountries)
        ? body.transitCountries
        : [],
      isExport: body.isExport,
      isImport: body.isImport,
      isTransit: body.isTransit,
    });
    if (!adapter) {
      return NextResponse.json(
        { error: "Failed to apply Egypt RoRo adapter — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ adapter }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/egypt-adapter POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
