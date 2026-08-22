// @ts-nocheck
// §6 Trade Closure — the 7-condition checklist
// GET /api/sgtx/completion/closure/checklist?ustn=X
import { NextResponse } from "next/server";
import { getClosureChecklist } from "@/lib/sgtx/trade-closure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const checklist = await getClosureChecklist(ustn);
    return NextResponse.json({ checklist });
  } catch (err: any) {
    logger.error("[api/completion/closure/checklist] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
