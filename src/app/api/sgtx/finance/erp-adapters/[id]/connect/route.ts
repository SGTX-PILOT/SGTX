// @ts-nocheck
// §8 ERP Adapters — connect (NOT_CONFIGURED/CONFIGURED → CONNECTED)
// POST /api/sgtx/finance/erp-adapters/[id]/connect
import { NextResponse } from "next/server";
import { connectErp } from "@/lib/sgtx/erp-adapter";
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
    const adapter = await connectErp(id);
    return NextResponse.json({ adapter });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters/[id]/connect] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
