// @ts-nocheck
// §5 Evidence Packages — by packageId
// GET /api/sgtx/completion/evidence-packages/by-package-id/[packageId]
import { NextResponse } from "next/server";
import { getEvidencePackageByPackageId } from "@/lib/sgtx/evidence-package";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  try {
    const { packageId } = await params;
    if (!packageId) {
      return NextResponse.json(
        { error: "packageId required" },
        { status: 400 },
      );
    }
    const pkg = await getEvidencePackageByPackageId(packageId);
    if (!pkg) {
      return NextResponse.json(
        { error: "evidence package not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error(
      "[api/completion/evidence-packages/by-package-id] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
