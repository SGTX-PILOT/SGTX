import { NextRequest, NextResponse } from "next/server";
import { runChaosExperiment } from "@/lib/sgtx/addons";

// POST /api/sgtx/self-healing/chaos
// Body: {
//   experimentName: "pod_kill" | "network_latency" | "dns_failure" | "disk_io_throttle",
//   namespace?: string,           // default "staging"; "production" requires productionApproved=true
//   createdByGtid?: string,
//   productionApproved?: boolean  // multisig required for production chaos (Part 11.4.4)
// }
// Runs a chaos experiment via the simulated chaos-orchestrator, persists the
// result to ChaosExperiment, and returns a Groq (A1) postmortem summary.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.experimentName !== "string") {
    return NextResponse.json(
      {
        error:
          'experimentName (string: "pod_kill" | "network_latency" | "dns_failure" | "disk_io_throttle") is required',
      },
      { status: 400 },
    );
  }
  const result = await runChaosExperiment({
    experimentName: body.experimentName,
    namespace: typeof body.namespace === "string" ? body.namespace : undefined,
    createdByGtid: typeof body.createdByGtid === "string" ? body.createdByGtid : undefined,
    productionApproved: body.productionApproved === true,
  });
  if (!result.ok && result.status === "ABORTED") {
    return NextResponse.json(result, { status: 403 });
  }
  return NextResponse.json(result);
}
