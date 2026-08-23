// @ts-nocheck
// §11 Closure Policy — get active (GET) + create new (POST)
// GET  /api/sgtx/constitutional/closure-policy
// POST /api/sgtx/constitutional/closure-policy  body: full CreateClosurePolicyInput
import { NextResponse } from "next/server";
import {
  getActiveClosurePolicy,
  createClosurePolicy,
} from "@/lib/sgtx/closure-policy";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const policy = await getActiveClosurePolicy();
    if (!policy) {
      return NextResponse.json(
        { error: "no active closure policy", policy: null },
        { status: 404 },
      );
    }
    return NextResponse.json({ policy });
  } catch (err: any) {
    logger.error("[api/constitutional/closure-policy] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || !body.policyName) {
      return NextResponse.json(
        { error: "policyName required" },
        { status: 400 },
      );
    }
    const policy = await createClosurePolicy(body);
    if (!policy) {
      return NextResponse.json(
        { error: "createClosurePolicy failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ policy });
  } catch (err: any) {
    logger.error("[api/constitutional/closure-policy] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
