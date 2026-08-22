// @ts-nocheck
// §4 Post-Clearance — actions for a trade (USTN)
// GET /api/sgtx/completion/post-clearance/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getActionsByUstn } from "@/lib/sgtx/post-clearance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const actions = await getActionsByUstn(ustn);
    return NextResponse.json({ actions });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance/by-ustn] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
