// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Onboarding API
 * ==============================================
 * GET  /api/sgtx/customs-gateway/onboarding?brokerGtid=<GTID>   — get onboarding record
 * GET  /api/sgtx/customs-gateway/onboarding?list=1              — list all onboarding records
 * GET  /api/sgtx/customs-gateway/onboarding?progress=1&brokerGtid=<GTID> — progress summary
 * POST /api/sgtx/customs-gateway/onboarding
 *      body: { action: 'start' | 'complete' | 'fail' | 'reset' | 'startStep', brokerGtid, step?, notes? }
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  startOnboarding,
  getOnboarding,
  completeStep,
  failStep,
  resetStep,
  startStep,
  getOnboardingProgress,
  listOnboardings,
  ONBOARDING_STEPS,
} from "@/lib/sgtx/customs-gateway/broker-onboarding";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerGtid = searchParams.get("brokerGtid");
    const list = searchParams.get("list");
    const progress = searchParams.get("progress");

    if (list === "1") {
      const items = await listOnboardings(100);
      return NextResponse.json({ ok: true, count: items.length, onboardings: items });
    }

    if (!brokerGtid) {
      return NextResponse.json(
        {
          ok: false,
          error: "brokerGtid query parameter is required (or use ?list=1)",
          steps: ONBOARDING_STEPS,
          usage: {
            get: "GET ?brokerGtid=<GTID>",
            list: "GET ?list=1",
            progress: "GET ?progress=1&brokerGtid=<GTID>",
            start: "POST { action: 'start', brokerGtid }",
            complete: "POST { action: 'complete', brokerGtid, step, notes }",
            fail: "POST { action: 'fail', brokerGtid, step, reason }",
            reset: "POST { action: 'reset', brokerGtid, step }",
            startStep: "POST { action: 'startStep', brokerGtid, step }",
          },
        },
        { status: 400 },
      );
    }

    if (progress === "1") {
      const p = await getOnboardingProgress(brokerGtid);
      return NextResponse.json({ ok: true, progress: p });
    }

    const onboarding = await getOnboarding(brokerGtid);
    if (!onboarding) {
      return NextResponse.json(
        { ok: false, error: "Onboarding not started for this brokerGtid" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, onboarding });
  } catch (err: any) {
    logger.error("[api/customs-gateway/onboarding] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    const action = body.action || "start";

    if (action === "start") {
      if (!body.brokerGtid) {
        return NextResponse.json(
          { ok: false, error: "start requires: brokerGtid" },
          { status: 400 },
        );
      }
      const onboarding = await startOnboarding(body.brokerGtid);
      return NextResponse.json({ ok: !!onboarding.id, onboarding });
    }

    if (action === "complete") {
      if (!body.brokerGtid || !body.step) {
        return NextResponse.json(
          { ok: false, error: "complete requires: brokerGtid, step, notes" },
          { status: 400 },
        );
      }
      const onboarding = await completeStep(body.brokerGtid, body.step, body.notes || "");
      return NextResponse.json({ ok: true, onboarding });
    }

    if (action === "fail") {
      if (!body.brokerGtid || !body.step) {
        return NextResponse.json(
          { ok: false, error: "fail requires: brokerGtid, step, reason" },
          { status: 400 },
        );
      }
      const onboarding = await failStep(body.brokerGtid, body.step, body.reason || "");
      return NextResponse.json({ ok: !!onboarding, onboarding });
    }

    if (action === "reset") {
      if (!body.brokerGtid || !body.step) {
        return NextResponse.json(
          { ok: false, error: "reset requires: brokerGtid, step" },
          { status: 400 },
        );
      }
      const onboarding = await resetStep(body.brokerGtid, body.step);
      return NextResponse.json({ ok: !!onboarding, onboarding });
    }

    if (action === "startStep") {
      if (!body.brokerGtid || !body.step) {
        return NextResponse.json(
          { ok: false, error: "startStep requires: brokerGtid, step" },
          { status: 400 },
        );
      }
      const onboarding = await startStep(body.brokerGtid, body.step);
      return NextResponse.json({ ok: !!onboarding, onboarding });
    }

    return NextResponse.json(
      { ok: false, error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/customs-gateway/onboarding] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
