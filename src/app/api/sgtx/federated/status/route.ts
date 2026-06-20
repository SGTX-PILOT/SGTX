import { NextResponse } from "next/server";
import { getFederatedModelStatus } from "@/lib/sgtx/addons";

// GET /api/sgtx/federated/status
// Returns the status of the three federated models (Part 11.4).
export async function GET() {
  return NextResponse.json(getFederatedModelStatus());
}
