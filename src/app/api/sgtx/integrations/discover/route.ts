// @ts-nocheck
// §5 Discovery — POST discover required integrations for a trade
// POST /api/sgtx/integrations/discover  body: DiscoverInput  → discoverRequiredIntegrations
import { NextResponse } from "next/server";
import { discoverRequiredIntegrations } from "@/lib/sgtx/discovery";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.originCountry) {
      return NextResponse.json(
        { error: "originCountry required" },
        { status: 400 },
      );
    }
    if (!body.destinationCountry) {
      return NextResponse.json(
        { error: "destinationCountry required" },
        { status: 400 },
      );
    }
    if (!body.mode) {
      return NextResponse.json({ error: "mode required" }, { status: 400 });
    }
    const result = await discoverRequiredIntegrations(body);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/discover] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
