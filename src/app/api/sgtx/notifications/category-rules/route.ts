// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  getCategoryPriorityRules,
  setCategoryPriorityRules,
} from "@/lib/sgtx/notifications/center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/notifications/category-rules?tenantGtid=X
//   → { rules, defaults }
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }
  try {
    const rules = await getCategoryPriorityRules(tenantGtid);
    return NextResponse.json({ rules });
  } catch (e: any) {
    logger.error("[api/notifications/category-rules] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/notifications/category-rules
//   Body: { tenantGtid, rules: [{ category, priority, overrideQuietHours }], changedByGtid? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { tenantGtid, rules, changedByGtid } = body;
  if (!tenantGtid || !Array.isArray(rules)) {
    return NextResponse.json(
      { error: "tenantGtid and rules[] are required" },
      { status: 400 },
    );
  }
  // Basic validation — each rule must have category + priority + overrideQuietHours.
  for (const r of rules) {
    if (!r.category || !r.priority || typeof r.overrideQuietHours !== "boolean") {
      return NextResponse.json(
        { error: `invalid rule: ${JSON.stringify(r)} — must have category, priority, overrideQuietHours` },
        { status: 400 },
      );
    }
    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(r.priority)) {
      return NextResponse.json(
        { error: `invalid priority: ${r.priority}` },
        { status: 400 },
      );
    }
  }
  try {
    const saved = await setCategoryPriorityRules(tenantGtid, rules, changedByGtid || "system");
    return NextResponse.json({ ok: true, rules: saved });
  } catch (e: any) {
    logger.error("[api/notifications/category-rules] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "save failed" }, { status: 500 });
  }
}
