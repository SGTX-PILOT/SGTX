// Part 11.3 — Trigger a chaos engineering experiment
//
// POST /api/sgtx/addons/self-healing/chaos-test
//   Body: { testType: "POD_KILL"|"NETWORK_DELAY"|"DISK_FAILURE"|"IO_STRESS"|"DNS_HIJACK", triggeredBy?: string }
//
// Production: Chaos Mesh applies the experiment to the configured blast
// radius (namespace: sgtx-prod). The SRE controller watches recovery and
// records the measured recovery time.
//
// Simulation: we deterministically pick a recovery time + outcome based
// on the test type and return immediately.

import { NextRequest, NextResponse } from "next/server";
import {
  runChaosTest,
  type ChaosTestType,
} from "@/lib/sgtx/addons/self-healing";

const ALLOWED_TYPES: ChaosTestType[] = [
  "POD_KILL",
  "NETWORK_DELAY",
  "DISK_FAILURE",
  "IO_STRESS",
  "DNS_HIJACK",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testType, triggeredBy } = body as {
      testType?: ChaosTestType;
      triggeredBy?: string;
    };

    if (!testType) {
      return NextResponse.json(
        {
          error: "testType is required. Allowed: " + ALLOWED_TYPES.join(", "),
          allowedTypes: ALLOWED_TYPES,
        },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES.includes(testType)) {
      return NextResponse.json(
        {
          error: `Invalid testType. Allowed: ${ALLOWED_TYPES.join(", ")}`,
          allowedTypes: ALLOWED_TYPES,
        },
        { status: 400 },
      );
    }

    const record = await runChaosTest(
      testType,
      triggeredBy || "sgtx-chaos-cron",
    );
    return NextResponse.json(record, { status: 201 });
  } catch (e: any) {
    console.error("[self-healing/chaos-test/route] POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
