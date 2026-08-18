// GET /api/sgtx/terminal/integrations?terminalGtid=X — list terminal integrations
//
// Query params:
//   ?terminalGtid=X    — optional filter by terminal GTID
//   ?active=true       — optional filter to only active integrations
//
// NOTE: `credentialsEncrypted` is NEVER returned by this route.
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const terminalGtid = url.searchParams.get("terminalGtid") || "";
    const activeOnly = url.searchParams.get("active") === "true";

    const where: any = {};
    if (terminalGtid) where.terminalGtid = terminalGtid;
    if (activeOnly) where.isActive = true;

    const rows = await (db as any).terminalIntegration.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Strip credentialsEncrypted — never expose secrets.
    const safe = (rows || []).map((r: any) => ({
      id: r.id,
      terminalGtid: r.terminalGtid,
      integrationType: r.integrationType,
      endpointUrl: r.endpointUrl,
      format: r.format,
      isActive: !!r.isActive,
      lastTest: r.lastTest,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      ok: true,
      terminalGtid: terminalGtid || null,
      integrations: safe,
      count: safe.length,
    });
  } catch (e: any) {
    logger.error("[terminal/integrations] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
