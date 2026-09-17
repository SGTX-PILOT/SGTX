// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Classification Rules API
//   GET  /api/sgtx/regulatory/classification/rules — list rules
//       Query: ?type=&hsCode=&jurisdictionId=
//   POST /api/sgtx/regulatory/classification/rules — upsert a rule
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listClassificationRules,
  upsertClassificationRule,
} from "@/lib/sgtx/classification";

export const dynamic = "force-dynamic";

// GET — list ClassificationRule rows (only IN_FORCE within effective date window).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || undefined;
    const hsCode = url.searchParams.get("hsCode") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;

    const rules = await listClassificationRules({
      type,
      hsCode,
      jurisdictionId,
    });
    return NextResponse.json({ rules, count: rules.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/classification/rules] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a ClassificationRule (find-then-upsert keyed on
// (classificationType, hsCode, jurisdictionId)).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.classificationType || !body.hsCode) {
      return NextResponse.json(
        { error: "classificationType and hsCode required" },
        { status: 400 },
      );
    }
    const rule = await upsertClassificationRule(body);
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/classification/rules] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
