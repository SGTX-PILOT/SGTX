// @ts-nocheck
// §1 E2E Trade Graph Validation — GET all validations for a USTN.
// GET /api/sgtx/readiness/e2e/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getE2EValidationByUstn } from "@/lib/sgtx/production-readiness";
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
    const validations = await getE2EValidationByUstn(ustn);
    return NextResponse.json({ validations });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/e2e/by-ustn/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
