// @ts-nocheck
// §1-3 Integration Catalog — list (GET) + upsert (POST)
// GET  /api/sgtx/integrations/catalog?jurisdictionCode=X&authority=Y&systemName=Z&status=W&integrationType=V&transportMode=U&procedure=T
// POST /api/sgtx/integrations/catalog  body: CreateCatalogInput  → upsertCatalogEntry
import { NextResponse } from "next/server";
import { listCatalogEntries, upsertCatalogEntry } from "@/lib/sgtx/integration-catalog";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const authority = url.searchParams.get("authority") || undefined;
    const systemName = url.searchParams.get("systemName") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const integrationType = url.searchParams.get("integrationType") || undefined;
    const transportMode = url.searchParams.get("transportMode") || undefined;
    const procedure = url.searchParams.get("procedure") || undefined;
    if (jurisdictionCode) filters.jurisdictionCode = jurisdictionCode;
    if (authority) filters.authority = authority;
    if (systemName) filters.systemName = systemName;
    if (status) filters.status = status;
    if (integrationType) filters.integrationType = integrationType;
    if (transportMode) filters.transportMode = transportMode;
    if (procedure) filters.procedure = procedure;

    const entries = await listCatalogEntries(filters);
    return NextResponse.json({ entries });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/catalog] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    if (!body.authority) {
      return NextResponse.json({ error: "authority required" }, { status: 400 });
    }
    if (!body.systemName) {
      return NextResponse.json({ error: "systemName required" }, { status: 400 });
    }
    if (!body.integrationType) {
      return NextResponse.json(
        { error: "integrationType required" },
        { status: 400 },
      );
    }
    const entry = await upsertCatalogEntry(body);
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/catalog] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
