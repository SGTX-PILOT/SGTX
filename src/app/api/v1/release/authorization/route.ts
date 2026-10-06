// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// GET /api/v1/release/authorization — Release authorization query (v18 §8.3.1)
// Public endpoint — terminals query this to verify release authorization
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const containerNo = req.nextUrl.searchParams.get("container_no");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    const { queryReleaseAuthorisation } = await import("@/lib/sgtx/release");
    const result = await queryReleaseAuthorisation({ ustn, containerNo });
    return NextResponse.json(result, { headers: { "X-SGTX-Version": "v18.0" } });
  } catch (e: any) {
    logger.error("[v1/release/authorization] error:", { error: e?.message });
    return NextResponse.json({ error: "Authorization query failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
