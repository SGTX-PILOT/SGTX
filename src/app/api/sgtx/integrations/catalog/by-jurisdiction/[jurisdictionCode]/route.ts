// @ts-nocheck
// §1-3 Integration Catalog — GET all connectors for a jurisdiction
// GET /api/sgtx/integrations/catalog/by-jurisdiction/[jurisdictionCode]
import { NextResponse } from "next/server";
import { getCatalogByJurisdiction } from "@/lib/sgtx/integration-catalog";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jurisdictionCode: string }> },
) {
  try {
    const { jurisdictionCode } = await params;
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const entries = await getCatalogByJurisdiction(jurisdictionCode);
    return NextResponse.json({ entries });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/catalog/by-jurisdiction/[jurisdictionCode]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
