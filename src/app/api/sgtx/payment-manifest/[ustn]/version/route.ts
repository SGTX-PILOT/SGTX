// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPaymentManifestVersion } from "@/lib/sgtx/payment-manifest";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment-manifest/[ustn]/version — quick version info.
// → { ustn, version, hash, createdAt, reason? }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  const { ustn } = await params;
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  try {
    const info = await getPaymentManifestVersion(ustn);
    if (!info) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(info);
  } catch (e: any) {
    logger.error("[api/payment-manifest/[ustn]/version] GET failed", {
      error: e?.message,
    });
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
