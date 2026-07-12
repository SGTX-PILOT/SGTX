import { NextResponse } from "next/server";
import { brainOrchestrator } from "@/lib/sgtx/brain-os";
import { logger } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/**
 * GET /api/sgtx/port-pair-reference?origin=EGALX&dest=DEHAM
 *
 * Returns an aggregated **indicative reference** for the requested port pair,
 * averaged across all shipping lines that service the lane. Designed as a
 * planning reference for buyers and sellers — NOT a binding quote.
 *
 * Query params:
 *   - origin  (required) — origin UN/LOCODE, e.g. "EGALX"
 *   - dest    (required) — destination UN/LOCODE, e.g. "DEHAM"
 *
 * Response shape:
 *   { ok: true, reference: PortPairReference | null }
 *
 * Returns `reference: null` (with ok:true) when no routes exist for the
 * requested port pair — the client should surface a friendly empty state.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const origin = (searchParams.get("origin") || "").trim().toUpperCase();
    const dest = (searchParams.get("dest") || "").trim().toUpperCase();

    if (!origin || !dest) {
      return NextResponse.json(
        {
          ok: false,
          error: "Both 'origin' and 'dest' query params are required (UN/LOCODE, e.g. origin=EGALX&dest=DEHAM).",
        },
        { status: 400 },
      );
    }

    // Fast path: invoke the Brain capability directly. The orchestrator
    // applies learning corrections per route before aggregating.
    const reference = await brainOrchestrator.invoke("logistics.port-pair-reference", {
      origin,
      dest,
    });

    if (!reference) {
      return NextResponse.json({
        ok: true,
        reference: null,
        message: `No routes found for lane ${origin} → ${dest}. Try a different port pair.`,
      });
    }

    return NextResponse.json({ ok: true, reference });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("port-pair-reference: lookup failed", { error: msg });
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
