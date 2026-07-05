// GET /api/sgtx/payment/psp/health — health-check all 4 PSP adapters
//
// Returns per-PSP { ok, latencyMs, mode } + an aggregate `allOk` flag.
// Used by the platform admin Integrations dashboard + PSP Router health gate.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getPSPAdapter, PSP_ADAPTER_NAMES } from "@/lib/sgtx/payment/psp-adapters";

export async function GET() {
  try {
    const results = await Promise.all(
      PSP_ADAPTER_NAMES.map(async name => {
        const adapter = getPSPAdapter(name);
        try {
          const health = await adapter.healthCheck();
          return { name, ...health };
        } catch (e: any) {
          return {
            name,
            ok: false,
            latencyMs: 0,
            mode: "SIMULATION",
            error: e?.message ?? "unknown",
          };
        }
      }),
    );

    const allOk = results.every(r => r.ok);

    return NextResponse.json({
      ok: allOk,
      mode: "SIMULATION",
      checkedAt: new Date().toISOString(),
      psps: results,
      summary: {
        total: results.length,
        healthy: results.filter(r => r.ok).length,
        unhealthy: results.filter(r => !r.ok).length,
        avgLatencyMs: Math.round(
          results.reduce((s, r) => s + r.latencyMs, 0) / results.length,
        ),
      },
    });
  } catch (e: any) {
    logger.error("[psp/health]", e);
    return NextResponse.json({ error: e?.message ?? "health check failed" }, { status: 500 });
  }
}
