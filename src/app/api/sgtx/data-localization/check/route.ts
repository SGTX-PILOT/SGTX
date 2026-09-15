// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  classifyDataObject,
  checkResidencyCompliance,
} from "@/lib/sgtx/data-residency-engine";

export const dynamic = "force-dynamic";

// POST /api/sgtx/data-localization/check — Check if data can be stored in a region (v17 §20.110)
//
// Body:
//   {
//     "country": "EG",
//     "data_type": "CUSTOMER_PII_EG",
//     "proposed_region": "US"
//   }
//
// Returns:
//   {
//     "allowed": false,
//     "reason": "EGYPT_ONLY data cannot be transferred outside Egypt",
//     "alternativeRegions": ["EG"],
//     "verdict": "BLOCK",
//     "classification": { ... },
//     "residencyCheck": { ... }
//   }
//
// Public read endpoint. Rate-limited 50 req/min/IP via the middleware
// anonymous bucket.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { country, data_type, proposed_region } = body;

    if (!country || !proposed_region) {
      return NextResponse.json(
        { error: "country and proposed_region are required" },
        { status: 400 },
      );
    }

    const cc = String(country).toUpperCase().trim();
    const proposed = String(proposed_region).toUpperCase().trim();
    const dataType = data_type || "TRADE_RECORD";

    // Step 1: classify the data object.
    const classification = await classifyDataObject(dataType, cc);

    // Step 2: run the residency compliance check (source → proposed).
    const residencyCheck = await checkResidencyCompliance(
      { objectType: dataType },
      cc,
      proposed,
    );

    // Step 3: derive alternative regions (regions that WOULD be allowed
    // for this data type, based on the storageCountryRequired from the
    // classification).
    const alternativeRegions: string[] = [];
    if (classification.storageCountryRequired === "ANY") {
      alternativeRegions.push("ANY");
    } else if (classification.storageCountryRequired === "EU") {
      alternativeRegions.push("AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE");
    } else if (classification.storageCountryRequired === "GCC") {
      alternativeRegions.push("SA","AE","BH","KW","OM","QA");
    } else if (classification.storageCountryRequired === "ASEAN") {
      alternativeRegions.push("BN","KH","ID","LA","MY","MM","PH","SG","TH","TL","VN");
    } else if (classification.storageCountryRequired === "USMCA") {
      alternativeRegions.push("US","CA","MX");
    } else {
      alternativeRegions.push(classification.storageCountryRequired);
    }

    // Filter out the proposed region from the alternatives.
    const filteredAlternatives = alternativeRegions.filter((r) => r !== proposed);

    // Step 4: derive a human-readable reason.
    let reason = "Transfer permitted";
    if (residencyCheck.verdict === "BLOCK") {
      reason = "BLOCK — " + (residencyCheck.correctiveActions[0] || "transfer refused");
    } else if (residencyCheck.verdict === "REQUIRES_APPROVAL") {
      reason = "REQUIRES_APPROVAL — " + (residencyCheck.requiredApprovals.join("; ") || "approval required before transfer");
    } else if (residencyCheck.verdict === "ALLOW_WITH_CONTROLS") {
      reason = "ALLOW_WITH_CONTROLS — " + (residencyCheck.requiredControls.join("; ") || "transfer permitted with controls");
    } else if (residencyCheck.verdict === "ALLOW") {
      reason = "ALLOW — transfer permitted";
    }

    return NextResponse.json(
      {
        allowed: residencyCheck.verdict === "ALLOW" || residencyCheck.verdict === "ALLOW_WITH_CONTROLS",
        reason,
        verdict: residencyCheck.verdict,
        alternativeRegions: filteredAlternatives,
        classification: {
          objectType: classification.objectType,
          jurisdiction: classification.jurisdiction,
          tier: classification.tier,
          storageCountryRequired: classification.storageCountryRequired,
          backupCountryRequired: classification.backupCountryRequired,
          drCountryRequired: classification.drCountryRequired,
          crossBorderReplicationAllowed: classification.crossBorderReplicationAllowed,
          applicableLaws: classification.applicableLaws,
        },
        residencyCheck,
        egyptDrContradictionResolved: residencyCheck.egyptDrContradictionResolved,
        evaluatedAt: residencyCheck.evaluatedAt,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e: any) {
    logger.error("[api/sgtx/data-localization/check] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Data localization check failed" },
      { status: 500 },
    );
  }
}
