// @ts-nocheck
// §5 Evidence Packages — by USTN
// GET /api/sgtx/completion/evidence-packages/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getEvidencePackageByUstn } from "@/lib/sgtx/evidence-package";
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
    const pkg = await getEvidencePackageByUstn(ustn);
    if (!pkg) {
      return NextResponse.json(
        { error: "evidence package not found for ustn" },
        { status: 404 },
      );
    }
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages/by-ustn] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
