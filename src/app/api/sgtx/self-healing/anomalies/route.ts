import { NextRequest, NextResponse } from "next/server";
import { detectAnomaly } from "@/lib/sgtx/addons";
import { db } from "@/lib/db";

// GET /api/sgtx/self-healing/anomalies
// Returns the list of detected infrastructure anomalies (Part 11.4.2 — AIOps).
// Optional query params: severity, status, component, limit (default 100).
export async function GET(req: NextRequest) {
  const severity = req.nextUrl.searchParams.get("severity");
  const status = req.nextUrl.searchParams.get("status");
  const component = req.nextUrl.searchParams.get("component");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 500) : 100;

  const where: Record<string, unknown> = {};
  if (severity) where.severity = severity;
  if (status) where.status = status;
  if (component) where.component = component;

  const anomalies = await db.infraAnomaly.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    ok: true,
    anomalies: anomalies.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      remediatedAt: a.remediatedAt?.toISOString() ?? null,
    })),
  });
}

// POST /api/sgtx/self-healing/anomalies
// Body: { component, metric, observedValue, baselineValue }
// Detects a metric anomaly (Part 11.4.2 — AIOps anomaly detection), classifies
// severity by deviation %, persists to InfraAnomaly, and returns the
// recommended remediation action.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.component !== "string" ||
    typeof body.metric !== "string" ||
    typeof body.observedValue !== "number" ||
    typeof body.baselineValue !== "number"
  ) {
    return NextResponse.json(
      {
        error:
          "component (string), metric (string), observedValue (number), baselineValue (number) are required",
      },
      { status: 400 },
    );
  }
  const result = await detectAnomaly({
    component: body.component,
    metric: body.metric,
    observedValue: body.observedValue,
    baselineValue: body.baselineValue,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
