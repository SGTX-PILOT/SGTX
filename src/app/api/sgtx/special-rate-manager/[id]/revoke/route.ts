// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { revokeSpecialRate } from "@/lib/sgtx/special-rate-manager";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/special-rate-manager/[id]/revoke — deactivate a live special rate.
// Body: { reason: string, revokedBy?: string }
//   → { ok, revoked, revokedAt }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "rateId required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  try {
    const result = await revokeSpecialRate(id, body.reason, body.revokedBy || "system");
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/special-rate-manager/revoke] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "revoke failed" }, { status: 400 });
  }
}
