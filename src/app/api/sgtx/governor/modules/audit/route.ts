import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getModuleAuditTrail, listModules } from "@/lib/sgtx/governor/wasm-modules";

// GET /api/sgtx/governor/modules/audit — module change history (Loom-anchored)
//
// Blueprint Part 1.3.5 + Part 1.6 — every constitutional WASM module reload is
// persisted to the ConfigurationHistory table (configKey = wasm_module.<name>)
// and Loom-anchored. This endpoint returns the full audit trail, most-recent
// first.
//
// Query params:
//   ?limit=100 (max 500)
export async function GET(_req: Request) {
  try {
    const url = new URL(_req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 500);

    const [auditTrail, currentModules] = await Promise.all([
      getModuleAuditTrail(),
      Promise.resolve(listModules()),
    ]);

    // Group audit entries by module for easier consumption
    const byModule: Record<string, number> = {};
    for (const e of auditTrail) {
      byModule[e.module] = (byModule[e.module] ?? 0) + 1;
    }

    return NextResponse.json({
      total: auditTrail.length,
      limited: auditTrail.slice(0, limit),
      changes: auditTrail.slice(0, limit),
      byModule,
      currentVersions: currentModules.map((m) => ({
        name: m.name,
        version: m.version,
        hash: m.hash,
        status: m.status,
        loadedAt: m.loadedAt,
      })),
    });
  } catch (e: any) {
    logger.error("[governor/modules/audit GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch module audit trail" },
      { status: 500 },
    );
  }
}
