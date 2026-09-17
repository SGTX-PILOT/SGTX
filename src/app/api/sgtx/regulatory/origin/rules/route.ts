// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Origin Rules API
//   GET  /api/sgtx/regulatory/origin/rules — list rules
//       Query: ?ruleType=&hs6=&jurisdictionId=&agreementId=
//   POST /api/sgtx/regulatory/origin/rules — upsert a rule
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listOriginRules, upsertOriginRule } from "@/lib/sgtx/origin";

export const dynamic = "force-dynamic";

// GET — list OriginRule rows (only IN_FORCE within effective date window).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ruleType = url.searchParams.get("ruleType") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const agreementId = url.searchParams.get("agreementId") || undefined;

    const rules = await listOriginRules({
      ruleType,
      hs6,
      jurisdictionId,
      agreementId,
    });
    return NextResponse.json({ rules, count: rules.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/origin/rules] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert an OriginRule (find-then-upsert keyed on
// (ruleType, hs6, jurisdictionId, agreementId)).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.ruleType) {
      return NextResponse.json(
        { error: "ruleType required" },
        { status: 400 },
      );
    }
    const rule = await upsertOriginRule(body);
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/origin/rules] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
