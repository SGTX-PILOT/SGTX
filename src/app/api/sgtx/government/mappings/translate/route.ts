// @ts-nocheck
// SGTX Phase 4 §3 — Single Window API
//   POST /api/sgtx/government/mappings/translate — translate canonical → national
//   Body: { canonicalData, jurisdictionCode, authority?, systemName?, mappingType? }
//   Calls translateCanonicalToNational(input).
//   Returns { translated, mappings, unmapped, warnings }.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { translateCanonicalToNational } from "@/lib/sgtx/single-window";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (body.canonicalData === undefined || body.canonicalData === null) {
      return NextResponse.json(
        { error: "canonicalData required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const result = await translateCanonicalToNational({
      canonicalData: body.canonicalData,
      jurisdictionCode: body.jurisdictionCode,
      authority: typeof body.authority === "string" ? body.authority : undefined,
      systemName: typeof body.systemName === "string" ? body.systemName : undefined,
      mappingType: typeof body.mappingType === "string" ? body.mappingType : undefined,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/mappings/translate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
