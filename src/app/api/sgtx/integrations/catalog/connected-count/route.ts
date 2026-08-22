// @ts-nocheck
// §1-3 Integration Catalog — GET connected-count summary for a jurisdiction
// GET /api/sgtx/integrations/catalog/connected-count?jurisdictionCode=X
import { NextResponse } from "next/server";
import { getConnectedCount } from "@/lib/sgtx/integration-catalog";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || "";
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const summary = await getConnectedCount(jurisdictionCode);
    return NextResponse.json({ summary });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/catalog/connected-count] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
