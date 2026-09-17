// @ts-nocheck
// SGTX Phase 3 §5 — TBT Engine API
//   GET  /api/sgtx/compliance/tbt/rules        — list TbtRequirement rows
//        Query: ?tbtCategory=&hs6=&jurisdictionId=&legalStatus=
//   POST /api/sgtx/compliance/tbt/rules        — upsert a TbtRequirement rule
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listTbtRequirements, upsertTbtRequirement } from "@/lib/sgtx/tbt";

export const dynamic = "force-dynamic";

// GET — list TbtRequirement rows filtered by category / hs6 / jurisdiction /
// legal status.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tbtCategory = url.searchParams.get("tbtCategory") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const legalStatus = url.searchParams.get("legalStatus") || undefined;

    const rules = await listTbtRequirements({
      tbtCategory,
      hs6,
      jurisdictionId,
      legalStatus,
    });
    return NextResponse.json({ rules, count: rules.length });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/tbt/rules] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a TbtRequirement row. Body = UpsertTbtInput.
// Calls upsertTbtRequirement (find-then-upsert keyed on the natural key).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.tbtCategory) {
      return NextResponse.json(
        { error: "tbtCategory required" },
        { status: 400 },
      );
    }
    const rule = await upsertTbtRequirement(body);
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/tbt/rules] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
