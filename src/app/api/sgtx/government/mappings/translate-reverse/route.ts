// @ts-nocheck
// SGTX Phase 4 §3 — Single Window API
//   POST /api/sgtx/government/mappings/translate-reverse — translate national → canonical
//   Body: { nationalData, jurisdictionCode, authority?, systemName?, mappingType? }
//   Calls translateNationalToCanonical(input).
//   Returns { translated, mappings, unmapped, warnings }.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { translateNationalToCanonical } from "@/lib/sgtx/single-window";

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
    if (body.nationalData === undefined || body.nationalData === null) {
      return NextResponse.json(
        { error: "nationalData required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const result = await translateNationalToCanonical({
      nationalData: body.nationalData,
      jurisdictionCode: body.jurisdictionCode,
      authority: typeof body.authority === "string" ? body.authority : undefined,
      systemName: typeof body.systemName === "string" ? body.systemName : undefined,
      mappingType: typeof body.mappingType === "string" ? body.mappingType : undefined,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/mappings/translate-reverse] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
