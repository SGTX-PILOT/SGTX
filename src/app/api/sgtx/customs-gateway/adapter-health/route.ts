// @ts-nocheck
/**
 * SGTX Customs Gateway — Adapter Health + Feature Flags + Country Config API
 * (§111, §134, §168, §169)
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/adapter-health
 *   Query: ?adapterId=<ID>            → single adapter health
 *          ?check=1&adapterId=<ID>     → perform live health check
 *          ?flags=1                    → also return feature flags
 *          ?countries=1                → also return country configurations
 *          ?flag=<flagId>&enabled=<bool>&governorDecisionId=<ID>
 *                                       → toggle a governed feature flag
 *   Returns: { ok, adapters, flags?, countries?, healthStates }
 *
 * L0: §169 — governed feature flag toggles REQUIRE a Governor decision
 * (verdict=ALLOW). On any internal error or missing/denied decision,
 * the toggle is DENIED (fail-closed).
 *
 * L0: §113 — a HEALTHY adapter is NOT a customs clearance. It only
 * means the adapter is operational.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAdapterHealth,
  getAllAdapterHealth,
  performHealthCheck,
  getFeatureFlags,
  toggleFeatureFlag,
  getCountryConfiguration,
  listCountryConfigurations,
  HEALTH_STATES,
} from "@/lib/sgtx/customs-gateway/adapter-health";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const adapterId = searchParams.get("adapterId");
    const doCheck = searchParams.get("check") === "1";
    const includeFlags = searchParams.get("flags") === "1";
    const includeCountries = searchParams.get("countries") === "1";
    const flagId = searchParams.get("flag");
    const enabledParam = searchParams.get("enabled");
    const governorDecisionId = searchParams.get("governorDecisionId") || undefined;

    // Feature flag toggle (if requested via query params).
    let flagToggled: any = null;
    if (flagId && (enabledParam === "true" || enabledParam === "false")) {
      flagToggled = await toggleFeatureFlag(
        flagId,
        enabledParam === "true",
        governorDecisionId,
      );
    }

    // Adapter health (single or all).
    let adapters: any[] = [];
    if (adapterId) {
      if (doCheck) {
        const single = await performHealthCheck(adapterId);
        adapters = [single];
      } else {
        const single = await getAdapterHealth(adapterId);
        adapters = single ? [single] : [];
      }
    } else {
      adapters = await getAllAdapterHealth();
    }

    const response: any = {
      ok: true,
      adapters,
      healthStates: HEALTH_STATES,
      // §113 reminder
      _notice:
        "A HEALTHY adapter is NOT a customs clearance (§113). It only means the adapter is operational.",
    };
    if (flagToggled) response.flagToggled = flagToggled;
    if (includeFlags) response.flags = await getFeatureFlags();
    if (includeCountries) {
      const cc = searchParams.get("country");
      if (cc) {
        response.countries = (await getCountryConfiguration(cc)) ? [await getCountryConfiguration(cc)] : [];
      } else {
        response.countries = await listCountryConfigurations();
      }
    }
    return NextResponse.json(response);
  } catch (err: any) {
    logger.error("[api/adapter-health] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
