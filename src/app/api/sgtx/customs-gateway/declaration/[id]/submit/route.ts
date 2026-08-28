// @ts-nocheck
/**
 * SGTX Customs Gateway — Submit declaration API
 * ===========================================================================
 * POST /api/sgtx/customs-gateway/declaration/[id]/submit
 *   Body: {} (optional: { idempotencyKey })
 *   Returns: { ok, result }
 *
 * L0: This route is the G1-gated, broker-authorized, idempotent submission
 * endpoint. The submitDeclaration() lib function:
 *   1. Checks Governor G1 ALLOW verdict (mandatory before submission).
 *   2. Verifies broker authorization (GTID + relationship + credential).
 *   3. Looks up the country adapter via the Adapter Registry.
 *   4. NEVER submits before broker certification (canSubmit gate).
 *   5. Persists an idempotency_key in IntegrationConnectorLog so retries
 *      replay the same result.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitDeclaration, getDeclaration } from "@/lib/sgtx/customs-gateway";
import { canSubmit, preconditionsForSubmit } from "@/lib/sgtx/customs-gateway/declaration-lifecycle";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    // Pre-flight: show the broker why submission would be blocked (if it is).
    const declaration = await getDeclaration(id);
    if (!declaration) {
      return NextResponse.json({ ok: false, error: "Declaration not found" }, { status: 404 });
    }
    if (!canSubmit(declaration.state)) {
      return NextResponse.json({
        ok: false,
        error: `Cannot submit from state ${declaration.state}`,
        preconditions: preconditionsForSubmit(declaration.state),
      }, { status: 409 });
    }

    const result = await submitDeclaration(id);
    const status = result.ok ? 200 : (result.status === "MANUAL_FALLBACK" ? 502 : 409);
    return NextResponse.json({ ok: result.ok, result }, { status });
  } catch (err: any) {
    logger.error("[api/customs-gateway/declaration/[id]/submit] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
