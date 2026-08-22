// @ts-nocheck
// §2 Claims — all claims for a trade (USTN). ORs against both ustn and parentUstn.
// GET /api/sgtx/completion/claims/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getClaimsByUstn } from "@/lib/sgtx/claim";
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
    const claims = await getClaimsByUstn(ustn);
    return NextResponse.json({ claims });
  } catch (err: any) {
    logger.error("[api/completion/claims/by-ustn] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
