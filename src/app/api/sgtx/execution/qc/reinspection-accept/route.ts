// 3B.6.4.3 — Accept Reinspection Request
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { acceptReinspection } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, qcProviderGtid } = body;
    if (!requestId || !qcProviderGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await acceptReinspection({ requestId, qcProviderGtid });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("[execution/qc/reinspection-accept]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
