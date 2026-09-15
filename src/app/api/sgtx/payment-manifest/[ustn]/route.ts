// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPaymentManifest } from "@/lib/sgtx/payment-manifest";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment-manifest/[ustn] — retrieve the most recent
// stored manifest for a USTN (path-param variant of the query-param
// version on the parent route).
// → { manifest: {...} | null }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  const { ustn } = await params;
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  try {
    const manifest = await getPaymentManifest(ustn);
    if (!manifest) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ manifest });
  } catch (e: any) {
    logger.error("[api/payment-manifest/[ustn]] GET failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
