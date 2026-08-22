// @ts-nocheck
// §3 Returns — returns for a parent trade (USTN)
// GET /api/sgtx/completion/returns/parent/[parentUstn]
import { NextResponse } from "next/server";
import { getReturnsByParentUstn } from "@/lib/sgtx/returns";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ parentUstn: string }> },
) {
  try {
    const { parentUstn } = await params;
    if (!parentUstn) {
      return NextResponse.json(
        { error: "parentUstn required" },
        { status: 400 },
      );
    }
    const returns = await getReturnsByParentUstn(parentUstn);
    return NextResponse.json({ returns });
  } catch (err: any) {
    logger.error("[api/completion/returns/parent] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
