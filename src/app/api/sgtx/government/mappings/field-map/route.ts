// @ts-nocheck
// SGTX Phase 4 §3 — Single Window API
//   GET /api/sgtx/government/mappings/field-map?jurisdictionCode=X&systemName=Y
//   Calls getFieldMappings(jurisdictionCode, systemName) — returns a simple
//   source→target map for a given jurisdiction + system (admin-display use).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getFieldMappings } from "@/lib/sgtx/single-window";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || "";
    const systemName = url.searchParams.get("systemName") || "";
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode query parameter required" },
        { status: 400 },
      );
    }
    if (!systemName) {
      return NextResponse.json(
        { error: "systemName query parameter required" },
        { status: 400 },
      );
    }
    const fieldMap = await getFieldMappings(jurisdictionCode, systemName);
    const count = Object.keys(fieldMap).length;
    return NextResponse.json({
      fieldMap,
      count,
      jurisdictionCode,
      systemName,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/government/mappings/field-map] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
