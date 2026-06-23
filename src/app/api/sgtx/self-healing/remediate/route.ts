import { NextRequest, NextResponse } from "next/server";
import { selfHeal } from "@/lib/sgtx/addons";

// POST /api/sgtx/self-healing/remediate
// Body: {
//   anomalyId?: string,    // optional — if provided, marks the InfraAnomaly RESOLVED
//   component: string,     // governor | trade | inbox | shipment | ai | payment | release | disk | cpu | memory
//   action?: "RESTART_POD" | "CORDON_NODE" | "DRAIN_WORKLOADS" | "SCALE_REPLICAS" | "CLEAR_CACHE"
// }
// Triggers the self-healing agent (Part 11.4.2) to remediate the anomaly.
// For disk components, also writes an InfrastructurePrediction row.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.component !== "string") {
    return NextResponse.json(
      { error: "component (string) is required; anomalyId (string) and action (string) are optional" },
      { status: 400 },
    );
  }
  const result = await selfHeal({
    anomalyId: typeof body.anomalyId === "string" ? body.anomalyId : undefined,
    component: body.component,
    action: typeof body.action === "string" ? (body.action as any) : undefined,
  });
  return NextResponse.json(result);
}
