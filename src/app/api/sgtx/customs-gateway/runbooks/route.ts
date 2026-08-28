// @ts-nocheck
/**
 * SGTX Customs Gateway — Production Runbooks API (§172)
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/runbooks
 *   Query: ?runbookId=<ID>            → single runbook
 *          ?severity=<LOW|MEDIUM|HIGH|CRITICAL>  → filter by severity
 *   Returns: { ok, count, runbooks }
 *
 * L0: §172 — runbooks are STRUCTURED HUMAN PROCEDURES. The customs
 * gateway may auto-detect a trigger and auto-RECOMMEND a runbook, but
 * it NEVER auto-executes consequential steps without human + Governor
 * approval. The "auto-invoke runbooks" feature flag (§169) is OFF by
 * default.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRunbook,
  listRunbooks,
  getRunbooksBySeverity,
} from "@/lib/sgtx/customs-gateway/production-runbooks";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runbookId = searchParams.get("runbookId");
    const severity = searchParams.get("severity");

    if (runbookId) {
      const runbook = getRunbook(runbookId);
      if (!runbook) {
        return NextResponse.json(
          { ok: false, error: `runbook ${runbookId} not found` },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, runbook });
    }

    let runbooks;
    if (severity) {
      const upper = severity.toUpperCase();
      if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(upper)) {
        return NextResponse.json(
          { ok: false, error: `Invalid severity: ${severity}` },
          { status: 400 },
        );
      }
      runbooks = getRunbooksBySeverity(upper);
    } else {
      runbooks = listRunbooks();
    }

    return NextResponse.json({
      ok: true,
      count: runbooks.length,
      runbooks,
      // §172 reminder — human procedure, not auto-execution
      _notice:
        "Runbooks are structured human procedures (§172). The customs gateway may auto-RECOMMEND a runbook but never auto-executes consequential steps without human + Governor approval.",
    });
  } catch (err: any) {
    logger.error("[api/runbooks] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
