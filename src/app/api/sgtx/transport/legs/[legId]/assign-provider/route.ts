// @ts-nocheck
// §1 Transport Leg — assign provider to leg
// POST /api/sgtx/transport/legs/[legId]/assign-provider  body: { providerGtid, providerType }
import { NextResponse } from "next/server";
import { assignProviderToLeg } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ legId: string }> },
) {
  try {
    const { legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.providerGtid || !body?.providerType) {
      return NextResponse.json(
        { error: "providerGtid and providerType required" },
        { status: 400 },
      );
    }
    const result = await assignProviderToLeg(
      legId,
      body.providerGtid,
      body.providerType,
    );
    if (result && result.ok === false) {
      const status = result.error === "LEG_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: result.error, detail: result }, { status });
    }
    return NextResponse.json({ leg: result });
  } catch (err: any) {
    logger.error("[api/transport/legs/[legId]/assign-provider] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
