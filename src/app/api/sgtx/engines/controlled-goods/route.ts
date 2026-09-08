// @ts-nocheck
/**
 * SGTX v17 §20 — Controlled Goods Engine API
 * GET /api/sgtx/engines/controlled-goods
 *   No params → list all control rules
 *   ?action=check&hsCode=X&origin=Y&dest=Z&product=P → controlled-goods check
 *   ?action=validateLicense&licenseNumber=X&hsCode=Y → validate controlled-goods license
 */

import { NextRequest, NextResponse } from "next/server";
import {
  checkControlledGoods, validateControlledGoodsLicense, listAllControlRules,
} from "@/lib/sgtx/engines/controlled-goods-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, rules: listAllControlRules(), note: "Use ?action=check|validateLicense" });
    }
    if (action === "check") {
      return NextResponse.json({
        ok: true,
        result: checkControlledGoods(
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
          searchParams.get("product") || "",
        ),
      });
    }
    if (action === "validateLicense") {
      return NextResponse.json({
        ok: true,
        result: validateControlledGoodsLicense(
          searchParams.get("licenseNumber") || "",
          searchParams.get("hsCode") || "",
        ),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllControlRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/controlled-goods] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "check") {
      return NextResponse.json({
        ok: true,
        result: checkControlledGoods(body.hsCode || "", body.origin || "", body.dest || "", body.product || ""),
      });
    }
    if (action === "validateLicense") {
      return NextResponse.json({
        ok: true,
        result: validateControlledGoodsLicense(body.licenseNumber || "", body.hsCode || ""),
      });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/controlled-goods] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
