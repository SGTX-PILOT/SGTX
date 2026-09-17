// @ts-nocheck
// SGTX Phase 3 §4 — SPS Engine API
//   GET  /api/sgtx/compliance/sps/rules       — list SpsRequirement rows
//        Query: ?spsCategory=&hs6=&originCountry=&destCountry=&jurisdictionId=&legalStatus=
//   POST /api/sgtx/compliance/sps/rules       — upsert an SpsRequirement rule
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listSpsRequirements, upsertSpsRequirement } from "@/lib/sgtx/sps";

export const dynamic = "force-dynamic";

// GET — list SpsRequirement rows filtered by category / hs6 / origin /
// destination / jurisdiction / legal status.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const spsCategory = url.searchParams.get("spsCategory") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const originCountry = url.searchParams.get("originCountry") || undefined;
    const destCountry = url.searchParams.get("destCountry") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const legalStatus = url.searchParams.get("legalStatus") || undefined;

    const rules = await listSpsRequirements({
      spsCategory,
      hs6,
      originCountry,
      destCountry,
      jurisdictionId,
      legalStatus,
    });
    return NextResponse.json({ rules, count: rules.length });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sps/rules] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert an SpsRequirement row. Body = UpsertSpsInput.
// Calls upsertSpsRequirement (find-then-upsert keyed on the natural key).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.spsCategory) {
      return NextResponse.json(
        { error: "spsCategory required" },
        { status: 400 },
      );
    }
    const rule = await upsertSpsRequirement(body);
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sps/rules] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
