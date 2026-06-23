import { NextRequest, NextResponse } from "next/server";
import { submitLocalTrainingResults } from "@/lib/sgtx/addons";

// POST /api/sgtx/federated/contribute
// Body: {
//   nodeGtid: string,
//   modelName: "fraud_detection" | "margin_estimation" | "credit_scoring",
//   metrics: { accuracy: number, samples: number },
//   trainingDurationSeconds?: number
// }
// Persists a LocalTrainingMetadata row + updates the FederatedModel row's
// participants / accuracy counters (Part 11.2.3).
//
// Per Part 11.2.2: differential privacy (ε=0.5) is applied clientside BEFORE
// upload — the server only ever sees DP-noised gradients/metrics.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.nodeGtid !== "string" ||
    typeof body.modelName !== "string" ||
    !body.metrics ||
    typeof body.metrics.accuracy !== "number" ||
    typeof body.metrics.samples !== "number"
  ) {
    return NextResponse.json(
      {
        error:
          "nodeGtid (string), modelName (string), and metrics { accuracy: number, samples: number } are required",
      },
      { status: 400 },
    );
  }
  const result = await submitLocalTrainingResults(
    body.nodeGtid,
    body.modelName,
    {
      accuracy: body.metrics.accuracy,
      samples: body.metrics.samples,
    },
    typeof body.trainingDurationSeconds === "number" ? body.trainingDurationSeconds : undefined,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
