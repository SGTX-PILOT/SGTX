// @ts-nocheck
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getCustomsGatewayOverview, getAdapterHealth, getBrokerConnections, getFailedTransactions, getSchemaVersions, getCertificationReadiness } = await import("@/lib/sgtx/customs-gateway/admin-customs");
    const [overview, adapters, brokers, failed, schemas, certReadiness] = await Promise.all([getCustomsGatewayOverview(), getAdapterHealth(), getBrokerConnections(), getFailedTransactions(), getSchemaVersions(), getCertificationReadiness()]);
    return NextResponse.json({ ok: true, overview, adapters, brokers, failed, schemas, certReadiness });
  } catch (e: any) { logger.error("[admin-overview] error:", e); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
