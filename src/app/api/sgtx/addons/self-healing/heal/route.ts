// Part 11.3 — Trigger a self-healing action on a specific pod
//
// POST /api/sgtx/addons/self-healing/heal
//   Body: { podName: string, healedBy?: string }
//
// The healing controller picks an action (RESTART / RESCHEDULE / EXPAND)
// based on the pod's current state in the cluster snapshot.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { triggerHealingAction } from "@/lib/sgtx/addons/self-healing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { podName, healedBy } = body as { podName?: string; healedBy?: string };

    if (!podName) {
      return NextResponse.json(
        { error: "podName is required" },
        { status: 400 },
      );
    }

    const result = await triggerHealingAction(
      podName,
      healedBy || "sgtx-self-healing-controller",
    );

    return NextResponse.json(result, {
      status: result.status === "FAILED" ? 400 : 200,
    });
  } catch (e: any) {
    logger.error("[self-healing/heal/route] POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
