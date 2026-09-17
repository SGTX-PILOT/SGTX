import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getModelRegistry } from "@/lib/sgtx/brain-os";
import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";

// GET /api/sgtx/brain-os/models
// Returns the Brain OS model registry: all versions, grouped by status
// (candidate / shadow / canary / production / deprecated), plus the current
// production model. Pass `?status=production` to filter.
export async function GET(req: Request): Promise<Response> {
  try {
    await bootstrapBrainOS();

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || undefined;

    const modelRegistry = await getModelRegistry();
    const models = modelRegistry.getModels(statusFilter as any);
    const production = modelRegistry.getProductionModel();

    // Group counts for quick dashboard consumption.
    const counts: Record<string, number> = {
      candidate: 0,
      shadow: 0,
      canary: 0,
      production: 0,
      deprecated: 0,
    };
    for (const m of modelRegistry.getModels()) {
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }

    return NextResponse.json({
      total: models.length,
      counts,
      production: production ?? null,
      models,
      filter: statusFilter ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[brain-os/models GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list model registry" },
      { status: 500 },
    );
  }
}
