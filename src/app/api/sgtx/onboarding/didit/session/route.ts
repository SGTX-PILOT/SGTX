// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createKybSession } from "@/lib/sgtx/onboarding/didit";

// POST /api/sgtx/onboarding/didit/session
// Body: { tenantGtid, legalName }
// Returns: { url, session_id } — open this URL in the browser to start KYB verification
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantGtid, legalName } = body;

    if (!tenantGtid) {
      return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    }

    // Get legal name from DB if not provided
    let name = legalName;
    if (!name) {
      const { db } = await import("@/lib/db");
      const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
      name = tenant?.legalName || tenantGtid;
    }

    const session = await createKybSession({ tenantGtid, legalName: name });

    return NextResponse.json({
      ok: true,
      url: session.url,
      session_id: session.session_id,
      message: "Open the URL to start business verification. You'll be notified when complete.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
