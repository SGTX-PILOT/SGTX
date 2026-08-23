// @ts-nocheck
// §11 Closure Policy — can the trade be closed (boolean)?
// POST /api/sgtx/constitutional/closure/can-close?ustn=X
import { NextResponse } from "next/server";
import { canClose } from "@/lib/sgtx/closure-policy";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const can = await canClose(ustn);
    return NextResponse.json({ ustn, canClose: can });
  } catch (err: any) {
    logger.error("[api/constitutional/closure/can-close] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
