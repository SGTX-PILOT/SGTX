// GET /api/sgtx/cargo-insurance/providers — list insurance providers
//
// Query params:
//   ?active=true   — only active providers (default: false, returns all)
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") === "true";

    const rows = await (db as any).insuranceProvider.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { providerName: "asc" },
    });

    // Strip apiKeyEncrypted — never expose provider credentials.
    const safe = (rows || []).map((r: any) => ({
      id: r.id,
      providerName: r.providerName,
      providerCode: r.providerCode,
      apiEndpoint: r.apiEndpoint,
      coverageTypes: r.coverageTypes,
      acceptedCurrencies: r.acceptedCurrencies,
      isActive: !!r.isActive,
    }));

    return NextResponse.json({ ok: true, providers: safe, count: safe.length });
  } catch (e: any) {
    logger.error("[cargo-insurance/providers] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
