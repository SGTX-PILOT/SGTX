// @ts-nocheck
// SGTX Phase 3 §6 — Controlled Goods Engine API
//   GET  /api/sgtx/compliance/controlled-goods   — list ControlledGoodsControl rows
//        Query: ?controlCategory=&hs6=&jurisdictionId=&severity=&legalStatus=
//   POST /api/sgtx/compliance/controlled-goods   — upsert a ControlledGoodsControl
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listControlledGoodsControls,
  upsertControlledGoodsControl,
} from "@/lib/sgtx/controlled-goods";

export const dynamic = "force-dynamic";

// GET — list ControlledGoodsControl rows filtered by category / hs6 /
// jurisdiction / severity / legalStatus.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const controlCategory = url.searchParams.get("controlCategory") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const severity = url.searchParams.get("severity") || undefined;
    const legalStatus = url.searchParams.get("legalStatus") || undefined;

    const controls = await listControlledGoodsControls({
      controlCategory,
      hs6,
      jurisdictionId,
      severity,
      legalStatus,
    });
    return NextResponse.json({ controls, count: controls.length });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/controlled-goods] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a ControlledGoodsControl row. Body = UpsertControlledGoodsInput.
// Calls upsertControlledGoodsControl (find-then-upsert keyed on the natural key).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.controlCategory) {
      return NextResponse.json(
        { error: "controlCategory required" },
        { status: 400 },
      );
    }
    const control = await upsertControlledGoodsControl(body);
    return NextResponse.json({ control });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/controlled-goods] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
