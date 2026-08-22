// @ts-nocheck
// §5 Discovery — GET determine integration families (pure)
// GET /api/sgtx/integrations/discover/integration-families?hs6=X&mode=Y
import { NextResponse } from "next/server";
import { determineIntegrationFamilies } from "@/lib/sgtx/discovery";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hs6 = url.searchParams.get("hs6") || undefined;
    const mode = url.searchParams.get("mode") || undefined;
    if (!hs6) {
      return NextResponse.json({ error: "hs6 required" }, { status: 400 });
    }
    if (!mode) {
      return NextResponse.json({ error: "mode required" }, { status: 400 });
    }
    const families = determineIntegrationFamilies(hs6, mode);
    return NextResponse.json({ hs6, mode, families });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/discover/integration-families] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
