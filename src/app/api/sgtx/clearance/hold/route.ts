import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { ustn, heldByGtid, reason } = await req.json();
    if (!ustn || !reason) return NextResponse.json({ error: "ustn and reason required" }, { status: 400 });
    await db.customsDeclaration.updateMany({ where: { trade: { ustn } }, data: { status: "HELD" } });
    let revoked = 0;
    try { const { autoRevokeOnEvent } = await import("@/lib/sgtx/release"); const r = await autoRevokeOnEvent(ustn, "CUSTOMS_HOLD"); if (r.ok) revoked = r.revokedAuthorisations; } catch {}
    return NextResponse.json({ ok: true, ustn, status: "HELD", reason, releaseAuthorisationsRevoked: revoked });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
