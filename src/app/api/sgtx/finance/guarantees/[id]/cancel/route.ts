// @ts-nocheck
// §5 Guarantees — cancel. Body: { reason }
// POST /api/sgtx/finance/guarantees/[id]/cancel
import { NextResponse } from "next/server";
import { cancelGuarantee } from "@/lib/sgtx/guarantee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const guarantee = await cancelGuarantee(id, body.reason);
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees/[id]/cancel] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
