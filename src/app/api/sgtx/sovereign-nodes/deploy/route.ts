// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Deploy a new sovereign node (simulated)
// ═══════════════════════════════════════════════════════════════════════════════
//
// POST /api/sgtx/sovereign-nodes/deploy
//   body: {
//     region: "frankfurt",
//     country?: "DE",
//     role?: "regional",
//     cpuCores?: 128,
//     memoryGb?: 512,
//     diskTb?: 8,
//     networkGbps?: 100,
//     autoActivate?: false   // dev-only: skip the 30-min provisioning wait
//   }
//
// Deploys a new sovereign node in the given region. The node starts in
// PROVISIONING state (or OPERATIONAL if autoActivate=true). The actual
// provisioning — K3s install, Postgres replica setup, NATS cluster join,
// HSM partition creation — would take ~30 minutes in production.
//
// Returns: { nodeId, status, endpoints, message }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { deploySovereignNode } from "@/lib/sgtx/sovereign-nodes";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const region: string = body?.region || "";
    const config = {
      country: body?.country || body?.countryCode,
      role: body?.role,
      cpuCores: body?.cpuCores,
      memoryGb: body?.memoryGb,
      diskTb: body?.diskTb,
      networkGbps: body?.networkGbps,
      autoActivate: body?.autoActivate === true,
    };

    if (!region || typeof region !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "body.region must be a non-empty string (e.g. 'frankfurt', 'singapore', 'nairobi')",
          example: {
            region: "frankfurt",
            country: "DE",
            role: "regional",
            cpuCores: 128,
            memoryGb: 512,
            diskTb: 8,
            networkGbps: 100,
          },
        },
        { status: 400 },
      );
    }

    const result = deploySovereignNode(region, config);

    if (result.status === "FAILED") {
      return NextResponse.json(
        {
          ok: false,
          error: result.message,
          region,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      region,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/sovereign-nodes/deploy] POST failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
