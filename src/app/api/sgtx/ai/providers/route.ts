import { NextResponse } from "next/server";
import { getMultiProviderStatus, checkProviderHealth } from "@/lib/sgtx/ai/providers";

// GET /api/sgtx/ai/providers
// Returns the multi-provider AI system configuration + live health check.
export async function GET(req: Request) {
  const status = getMultiProviderStatus();
  const url = new URL(req.url);
  const healthCheck = url.searchParams.get("health");

  if (healthCheck === "true") {
    const health = await checkProviderHealth();
    return NextResponse.json({ ok: true, ...status, health });
  }

  return NextResponse.json({ ok: true, ...status });
}
