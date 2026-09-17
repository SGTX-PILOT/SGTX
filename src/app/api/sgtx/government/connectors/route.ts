// @ts-nocheck
// SGTX Phase 4 §2 + §7 admin — Government Connectors API
//   GET  /api/sgtx/government/connectors          — list GovConnector rows
//        Query: ?jurisdictionCode=&authority=&systemName=&status=&systemType=
//   POST /api/sgtx/government/connectors          — upsert a GovConnector
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listGovConnectors, upsertGovConnector } from "@/lib/sgtx/gov-gateway";

export const dynamic = "force-dynamic";

// GET — list GovConnector rows filtered by jurisdiction / authority / system /
// status / systemType.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const authority = url.searchParams.get("authority") || undefined;
    const systemName = url.searchParams.get("systemName") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const systemType = url.searchParams.get("systemType") || undefined;

    const connectors = await listGovConnectors({
      jurisdictionCode,
      authority,
      systemName,
      status,
      systemType,
    });
    return NextResponse.json({ connectors, count: connectors.length });
  } catch (err: any) {
    logger.error("[api/sgtx/government/connectors] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a GovConnector. Body = UpsertConnectorInput.
// Calls upsertGovConnector (find-then-upsert keyed on jurisdictionCode +
// authority + systemName).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.authority) {
      return NextResponse.json(
        { error: "authority required" },
        { status: 400 },
      );
    }
    if (!body.systemName) {
      return NextResponse.json(
        { error: "systemName required" },
        { status: 400 },
      );
    }
    const connector = await upsertGovConnector(body);
    return NextResponse.json({ connector });
  } catch (err: any) {
    logger.error("[api/sgtx/government/connectors] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
