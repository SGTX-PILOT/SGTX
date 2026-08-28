// @ts-nocheck
/**
 * SGTX Customs Gateway — Normalized Errors API
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/errors
 *   Query: ?ustn=<USTN>&adapterId=<ID>&category=<CATEGORY>
 *   Returns: { ok, errors[], summary[] }
 *
 * Reads the IntegrationConnectorLog table (status = FAILED or partial) and
 * normalises each error via error-normalization.ts. Also returns a per-
 * category summary used by the Admin Portal customs health dashboard.
 *
 * L0: NON-CUSTODIAL — errors here never include payment instructions or
 * settlement references beyond their opaque externalReference strings.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeError, summarizeErrors, type NormalizedError } from "@/lib/sgtx/customs-gateway/error-normalization";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn") || undefined;
    const adapterId = searchParams.get("adapterId") || undefined;
    const category = searchParams.get("category") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

    // Query IntegrationConnectorLog for failed/partial rows.
    const where: any = { status: { in: ["FAILED", "PENDING", "ERROR"] } };
    if (ustn) where.ustn = ustn;
    if (adapterId) where.apiName = { contains: adapterId.split("-")[0] };

    let logs: any[] = [];
    try {
      logs = await db.integrationConnectorLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch (err: any) {
      logger.warn("[api/customs-gateway/errors] log query failed", { error: err?.message });
    }

    const normalized: NormalizedError[] = [];
    for (const log of logs) {
      const ext = {
        code: log.statusCode?.toString?.() || "",
        message: log.errorMessage || log.status,
        statusCode: log.statusCode,
      };
      const effectiveAdapterId = adapterId || inferAdapterId(log.apiName);
      const n = normalizeError(ext, effectiveAdapterId, log.ustn || "");
      normalized.push(n);
    }

    const filtered = category
      ? normalized.filter((e) => e.category === category)
      : normalized;

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      errors: filtered,
      summary: summarizeErrors(normalized),
      note: "Errors are normalised from IntegrationConnectorLog (status FAILED/PENDING/ERROR).",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/errors] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

function inferAdapterId(apiName: string): string {
  try {
    const upper = (apiName || "").toUpperCase();
    if (upper.includes("NAFEZA")) return "EG-NAFEZA";
    if (upper.includes("CARGOX")) return "EG-CARGOX";
    if (upper.includes("ETA")) return "EG-ETA";
    if (upper.includes("CBE") || upper.includes("BANK")) return "EG-CBE";
    if (upper.includes("ACE") || upper.includes("CBP")) return "US-CBP-ACE";
    if (upper.includes("CUSTOMS_GATEWAY")) return "CUSTOMS-GATEWAY";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
