// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const { reconcileCustoms, autoReconcilePending } = await import("@/lib/sgtx/customs-gateway/reconciliation");
  if (ustn) {
    const result = await reconcileCustoms(ustn);
    return NextResponse.json({ ok: true, result });
  }
  const result = await autoReconcilePending();
  return NextResponse.json({ ok: true, result });
}
export async function POST(req: NextRequest) {
  return GET(req);
}
