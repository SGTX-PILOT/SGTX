import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getHealth } from "@/lib/sgtx/brain-os";
import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";

// GET /api/sgtx/brain-os/health
// Aggregate Brain OS health: module health snapshot + event bus + AI providers.
// Optionally return just readiness (`?mode=readiness`) or liveness (`?mode=liveness`).
export async function GET(req: Request): Promise<Response> {
  try {
    await bootstrapBrainOS();

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "health";

    const health = await getHealth();

    if (mode === "readiness") {
      const readiness = await health.getReadiness();
      return NextResponse.json(readiness, { status: readiness.ready ? 200 : 503 });
    }
    if (mode === "liveness") {
      const liveness = await health.getLiveness();
      return NextResponse.json(liveness);
    }

    const fullHealth = await health.getHealth();
    const httpStatus = fullHealth.status === "healthy" ? 200 : fullHealth.status === "degraded" ? 200 : 503;
    return NextResponse.json(fullHealth, { status: httpStatus });
  } catch (e: any) {
    logger.error("[brain-os/health GET] error:", e);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: e?.message || "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
