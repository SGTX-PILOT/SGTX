// 8.3.2 + 8.9 — Release Webhook (push to terminal) + Revocation
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { pushReleaseReadyWebhook, revokeReleaseAuthorisation } from "@/lib/sgtx/release";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "revoke") {
      const result = await revokeReleaseAuthorisation({ ustn: body.ustn, containerNo: body.containerNo, reason: body.reason });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json({ ok: true, revokedCount: result.revokedCount, message: "Release authorisations revoked. Next query will return HOLD." });
    }
    // Default: push webhook
    const result = await pushReleaseReadyWebhook({ ustn: body.ustn, containerNo: body.containerNo, authorisationId: body.authorisationId, validUntil: new Date(body.validUntil), terminalGtid: body.terminalGtid });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[release/webhook]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
