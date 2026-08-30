// @ts-nocheck
// DCSA eBL API — create, submit SI, issue TD, surrender
import { NextRequest, NextResponse } from "next/server";
import { createDcsaEBL, submitSI, issueTD, surrenderEBL, getEBLsByUSTN } from "@/lib/sgtx/dcsa";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const ebls = await getEBLsByUSTN(ustn);
    return NextResponse.json({ ok: true, ebls });
  } catch (err: any) {
    logger.error("[api/dcsa/eBL] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const ebl = await createDcsaEBL(body);
      return NextResponse.json({ ok: true, ebl });
    }
    if (action === "submit_si") {
      const ebl = await submitSI(body.eblId);
      return NextResponse.json({ ok: true, ebl });
    }
    if (action === "issue_td") {
      const ebl = await issueTD(body.eblId, body.blNumber, body.carrierSignature || {});
      return NextResponse.json({ ok: true, ebl });
    }
    if (action === "surrender") {
      const ebl = await surrenderEBL(body.eblId, body.consigneeEndorsement || {});
      return NextResponse.json({ ok: true, ebl });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/dcsa/eBL] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
