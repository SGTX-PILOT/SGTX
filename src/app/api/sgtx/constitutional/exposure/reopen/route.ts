// @ts-nocheck
// §65 Financial Exposure — reopen exposure after a reversal
// POST /api/sgtx/constitutional/exposure/reopen  body: { ustn, amount, reason }
import { NextResponse } from "next/server";
import { reopenExposure } from "@/lib/sgtx/financial-exposure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, amount, reason } = body || {};
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount (positive number) required" },
        { status: 400 },
      );
    }
    if (!reason) {
      return NextResponse.json(
        { error: "reason required" },
        { status: 400 },
      );
    }
    const updated = await reopenExposure(ustn, amount, String(reason));
    if (!updated) {
      return NextResponse.json(
        { error: "reopenExposure failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ exposure: updated });
  } catch (err: any) {
    logger.error("[api/constitutional/exposure/reopen] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
