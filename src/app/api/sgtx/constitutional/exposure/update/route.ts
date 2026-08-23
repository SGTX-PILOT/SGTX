// @ts-nocheck
// §63 Financial Exposure — update exposure fields
// POST /api/sgtx/constitutional/exposure/update  body: { ustn, updates }
import { NextResponse } from "next/server";
import { updateExposure } from "@/lib/sgtx/financial-exposure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, updates } = body || {};
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "updates object required" },
        { status: 400 },
      );
    }
    const updated = await updateExposure(ustn, updates);
    if (!updated) {
      return NextResponse.json(
        { error: "updateExposure failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ exposure: updated });
  } catch (err: any) {
    logger.error("[api/constitutional/exposure/update] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
