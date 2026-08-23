// @ts-nocheck
// §63 Financial Exposure — get exposure for a USTN
// GET /api/sgtx/constitutional/exposure?ustn=X
import { NextResponse } from "next/server";
import { getExposure } from "@/lib/sgtx/financial-exposure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const exposure = await getExposure(ustn);
    if (!exposure) {
      return NextResponse.json(
        { error: "exposure not found", exposure: null },
        { status: 404 },
      );
    }
    return NextResponse.json({ exposure });
  } catch (err: any) {
    logger.error("[api/constitutional/exposure] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
