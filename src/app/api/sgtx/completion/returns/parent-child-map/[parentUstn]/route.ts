// @ts-nocheck
// §3 Returns — full USTN parent/child tree
// GET /api/sgtx/completion/returns/parent-child-map/[parentUstn]
import { NextResponse } from "next/server";
import { getParentChildUstnMap } from "@/lib/sgtx/returns";
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
    const tree = await getParentChildUstnMap(parentUstn);
    return NextResponse.json({ tree });
  } catch (err: any) {
    logger.error("[api/completion/returns/parent-child-map] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
