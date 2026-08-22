// @ts-nocheck
// §5 Guarantees — activate (ISSUED → ACTIVE)
// POST /api/sgtx/finance/guarantees/[id]/activate
import { NextResponse } from "next/server";
import { activateGuarantee } from "@/lib/sgtx/guarantee-engine";
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
    const guarantee = await activateGuarantee(id);
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees/[id]/activate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
