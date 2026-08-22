// @ts-nocheck
// §5 Discovery — GET compute transit countries (pure)
// GET /api/sgtx/integrations/discover/transit-countries?origin=X&destination=Y&mode=Z
import { NextResponse } from "next/server";
import { computeTransitCountries } from "@/lib/sgtx/discovery";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.searchParams.get("origin") || "";
    const destination = url.searchParams.get("destination") || "";
    const mode = url.searchParams.get("mode") || "";
    if (!origin) {
      return NextResponse.json(
        { error: "origin required" },
        { status: 400 },
      );
    }
    if (!destination) {
      return NextResponse.json(
        { error: "destination required" },
        { status: 400 },
      );
    }
    if (!mode) {
      return NextResponse.json({ error: "mode required" }, { status: 400 });
    }
    const transitCountries = computeTransitCountries(origin, destination, mode);
    return NextResponse.json({ origin, destination, mode, transitCountries });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/discover/transit-countries] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
