// @ts-nocheck
// §3 Logistics Quote V2 — list quotes
// GET /api/sgtx/transport/quotes?ustn=X&graphId=Y&legId=Z&providerGtid=W&serviceType=V&status=U
import { NextResponse } from "next/server";
import { listQuotes } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const graphId = url.searchParams.get("graphId") || undefined;
    const legId = url.searchParams.get("legId") || undefined;
    const providerGtid = url.searchParams.get("providerGtid") || undefined;
    const serviceType = url.searchParams.get("serviceType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (graphId) filters.graphId = graphId;
    if (legId) filters.legId = legId;
    if (providerGtid) filters.providerGtid = providerGtid;
    if (serviceType) filters.serviceType = serviceType;
    if (status) filters.status = status;
    const quotes = await listQuotes(filters);
    return NextResponse.json({ quotes });
  } catch (err: any) {
    logger.error("[api/transport/quotes] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
