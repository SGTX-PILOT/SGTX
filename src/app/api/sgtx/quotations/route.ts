// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  createQuotation,
  getQuotationsForUstn,
} from "@/lib/sgtx/provider-quotations";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/quotations — create a provider quotation (v18 §8.7).
// Body: { ustn, providerGtid, serviceType, serviceDetails?, fee{amount,
//        currency, terms, condition}, validUntil?, providerName?,
//        providerType?, submitterGtid?, notes? }
// → { ok, quotationId, loomHash, governorDecisionId }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.ustn || !body.providerGtid || !body.serviceType) {
    return NextResponse.json(
      { error: "ustn, providerGtid, serviceType required" },
      { status: 400 },
    );
  }
  if (!body.fee || typeof body.fee.amount !== "number" || !body.fee.currency) {
    return NextResponse.json(
      { error: "fee { amount:number, currency:EGP|USD, terms, condition } required" },
      { status: 400 },
    );
  }
  try {
    const result = await createQuotation({
      ustn: body.ustn,
      providerGtid: body.providerGtid,
      serviceType: body.serviceType,
      serviceDetails: body.serviceDetails,
      fee: body.fee,
      validUntil: body.validUntil,
      quotedAt: body.quotedAt,
      providerName: body.providerName,
      providerType: body.providerType,
      submitterGtid: body.submitterGtid,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message && /not found|denied|not permitted|must be/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logger.error("[api/quotations] POST create failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 500 });
  }
}

// GET /api/sgtx/quotations?ustn=X&service_type=Y — list quotations for a USTN.
// → { quotations: [...], count }
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ustn = url.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn query param required" }, { status: 400 });
  const serviceType = url.searchParams.get("service_type") || undefined;
  try {
    const quotations = await getQuotationsForUstn(ustn, serviceType || undefined);
    return NextResponse.json({ quotations, count: quotations.length });
  } catch (e: any) {
    logger.error("[api/quotations] GET list failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "list failed" }, { status: 500 });
  }
}
