// @ts-nocheck
// §2 Trade Finance — accept offer
// POST /api/sgtx/finance/cases/[id]/accept
import { NextResponse } from "next/server";
import { acceptOffer } from "@/lib/sgtx/trade-finance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const financingCase = await acceptOffer(id);
    return NextResponse.json({ case: financingCase });
  } catch (err: any) {
    logger.error("[api/finance/cases/[id]/accept] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
