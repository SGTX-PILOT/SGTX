// @ts-nocheck
// §3 Returns — by returnId
// GET /api/sgtx/completion/returns/by-return-id/[returnId]
import { NextResponse } from "next/server";
import { getReturnByReturnId } from "@/lib/sgtx/returns";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ returnId: string }> },
) {
  try {
    const { returnId } = await params;
    if (!returnId) {
      return NextResponse.json({ error: "returnId required" }, { status: 400 });
    }
    const record = await getReturnByReturnId(returnId);
    if (!record) {
      return NextResponse.json({ error: "return not found" }, { status: 404 });
    }
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/by-return-id] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
