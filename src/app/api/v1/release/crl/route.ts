// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// GET /api/v1/release/crl — Certificate Revocation List (v18 §8.3.1)
// Public endpoint — terminals check this for revoked release certificates
export async function GET(req: NextRequest) {
  try {
    // Return CRL — list of revoked release certificate IDs
    // In production: query from DB; in dev: return empty CRL
    return NextResponse.json({ crl: [], revoked_count: 0, updated_at: new Date().toISOString(), version: "v18.0" }, { headers: { "X-SGTX-Version": "v18.0" } });
  } catch (e: any) {
    logger.error("[v1/release/crl] error:", { error: e?.message });
    return NextResponse.json({ error: "CRL query failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
