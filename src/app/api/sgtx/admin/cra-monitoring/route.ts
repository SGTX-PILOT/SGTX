import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET() {
  try {
    const auths = await db.containerReleaseAuthorisation.findMany({ orderBy: { issuedAt: "desc" }, take: 100, select: { id: true, ustn: true, containerNo: true, releaseStatus: true, holdReason: true, terminalId: true, issuedAt: true, validUntil: true, revokedAt: true, gateOutAt: true } });
    const summary = {
      total: auths.length,
      authorised: auths.filter(a => a.releaseStatus === "AUTHORISED").length,
      used: auths.filter(a => a.releaseStatus === "USED").length,
      expired: auths.filter(a => a.releaseStatus === "EXPIRED").length,
      revoked: auths.filter(a => a.releaseStatus === "REVOKED").length,
    };
    const holdReasons = auths.filter(a => a.holdReason).reduce((acc, a) => { acc[a.holdReason!] = (acc[a.holdReason!] || 0) + 1; return acc; }, {} as Record<string, number>);
    return NextResponse.json({ ok: true, summary, holdReasons: Object.entries(holdReasons).map(([reason, count]) => ({ reason, count })), recent: auths.slice(0, 10) });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
