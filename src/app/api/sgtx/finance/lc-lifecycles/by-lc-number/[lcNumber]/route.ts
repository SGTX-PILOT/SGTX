// @ts-nocheck
// §3 LC Lifecycle — GET by LC number (business identifier)
// GET /api/sgtx/finance/lc-lifecycles/by-lc-number/[lcNumber]
import { NextResponse } from "next/server";
import { getLcLifecycleByLcNumber } from "@/lib/sgtx/lc-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lcNumber: string }> },
) {
  try {
    const { lcNumber } = await params;
    if (!lcNumber) {
      return NextResponse.json(
        { error: "lcNumber required" },
        { status: 400 },
      );
    }
    const lifecycle = await getLcLifecycleByLcNumber(lcNumber);
    if (!lifecycle) {
      return NextResponse.json(
        { error: "lc lifecycle not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles/by-lc-number] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
