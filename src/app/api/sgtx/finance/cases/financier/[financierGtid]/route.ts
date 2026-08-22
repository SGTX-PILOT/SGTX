// @ts-nocheck
// §2 Trade Finance — all cases for a financier
// GET /api/sgtx/finance/cases/financier/[financierGtid]
import { NextResponse } from "next/server";
import { getFinancingCasesForFinancier } from "@/lib/sgtx/trade-finance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ financierGtid: string }> },
) {
  try {
    const { financierGtid } = await params;
    if (!financierGtid) {
      return NextResponse.json(
        { error: "financierGtid required" },
        { status: 400 },
      );
    }
    const cases = await getFinancingCasesForFinancier(financierGtid);
    return NextResponse.json({ cases });
  } catch (err: any) {
    logger.error("[api/finance/cases/financier] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
