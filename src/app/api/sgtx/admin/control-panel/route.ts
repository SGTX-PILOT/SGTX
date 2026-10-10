// @ts-nocheck
import { NextResponse } from "next/server";
import {
  SYSTEM_KPIs, SYSTEM_HEALTH, LIVE_GOVERNOR_FEED, TENANT_REGISTRY,
  CONSTITUTION_STATE, MULTISIG_KEYHOLDERS, MULTISIG_PENDING_CEREMONIES,
  AI_AGENT_REGISTRY, ATTACK_SURFACE, PASSKEY_RECOVERY_QUEUE,
  FEATURE_FLAGS, FEE_BOUNDS, CRON_JOBS, ADDON_ACTIVATIONS,
  PLATFORM_METRICS,
} from "@/lib/sgtx/admin/control-panel-data";

// GET /api/sgtx/admin/control-panel — platform owner's command center data.
// NOTE: This route is NOT public — admin actions require 3-of-5 multisig.
// The data is read-only for display; mutations go through the Governor.

export async function GET() {
  return NextResponse.json({
    ok: true,
    metrics: PLATFORM_METRICS,
    kpis: SYSTEM_KPIs,
    health: SYSTEM_HEALTH,
    governorFeed: LIVE_GOVERNOR_FEED,
    tenants: TENANT_REGISTRY,
    constitution: CONSTITUTION_STATE,
    multisig: { keyholders: MULTISIG_KEYHOLDERS, ceremonies: MULTISIG_PENDING_CEREMONIES },
    aiAgents: AI_AGENT_REGISTRY,
    security: { attackSurface: ATTACK_SURFACE, passkeyQueue: PASSKEY_RECOVERY_QUEUE },
    config: { featureFlags: FEATURE_FLAGS, feeBounds: FEE_BOUNDS, addOns: ADDON_ACTIVATIONS },
    cronJobs: CRON_JOBS,
  });
}
