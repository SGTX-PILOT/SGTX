// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Product Regulatory Profile API
//   GET  /api/sgtx/regulatory/products           — list profiles (optional ?hs6=&status=)
//   POST /api/sgtx/regulatory/products           — upsert a profile
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { upsertProductProfile } from "@/lib/sgtx/classification";

export const dynamic = "force-dynamic";

// GET — list all ProductRegulatoryProfile rows. Optional filters: hs6, status.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hs6 = url.searchParams.get("hs6") || undefined;
    const status = url.searchParams.get("status") || undefined;

    const where: any = {};
    if (hs6) where.hs6 = hs6;
    if (status) where.status = status;

    const profiles = await db.productRegulatoryProfile.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });
    return NextResponse.json({ profiles, count: profiles.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/products] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a ProductRegulatoryProfile. Body = profile fields.
// Calls upsertProductProfile (find-then-upsert keyed on hs6).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.hs6 || !body.productName) {
      return NextResponse.json(
        { error: "hs6 and productName required" },
        { status: 400 },
      );
    }
    const profile = await upsertProductProfile(body);
    return NextResponse.json({ profile });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/products] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
