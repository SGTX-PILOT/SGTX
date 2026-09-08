// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  classifyDataObject,
  listObjectTypes,
  listTiers,
  listVerdicts,
} from "@/lib/sgtx/data-residency-engine";

export const dynamic = "force-dynamic";

// GET /api/sgtx/data-localization — Data localization rules for a country (v17 §20.110)
//
// Query params:
//   ?country=X                  — get the residency rules for the country's object types
//   ?country=X&object_type=Y    — get the residency rule for a specific object type
//   ?object_types=true          — list all registered object types
//   ?tiers=true                 — list all classification tiers
//   ?verdicts=true              — list all residency verdicts
//
// Returns (for ?country=X):
//   {
//     "country": "EG",
//     "residencyRequired": true,
//     "allowedRegions": ["EG"],
//     "prohibitedRegions": ["US", "EU", "ANY_FOREIGN"],
//     "crossBorderRules": [...],
//     "encryptionRequired": true
//   }
//
// Public read endpoint — the data residency registry is global reference data.
// Rate-limited 50 req/min/IP via the middleware anonymous bucket.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const country = sp.get("country") || "";
    const objectType = sp.get("object_type") || sp.get("objectType") || "";
    const wantObjectTypes = sp.get("object_types") === "true";
    const wantTiers = sp.get("tiers") === "true";
    const wantVerdicts = sp.get("verdicts") === "true";

    if (wantObjectTypes) {
      return NextResponse.json({ object_types: listObjectTypes() });
    }
    if (wantTiers) {
      return NextResponse.json({ tiers: listTiers() });
    }
    if (wantVerdicts) {
      return NextResponse.json({ verdicts: listVerdicts() });
    }
    if (!country) {
      return NextResponse.json(
        {
          error:
            "country query parameter required (use ?object_types=true to list registered object types)",
        },
        { status: 400 },
      );
    }

    const cc = country.toUpperCase().trim();

    if (objectType) {
      // Specific object type residency for the country.
      const classification = await classifyDataObject(objectType, cc);
      return NextResponse.json(
        {
          country: classification.jurisdiction,
          objectType: classification.objectType,
          tier: classification.tier,
          residencyRequired: classification.tier !== "GLOBAL_ALLOWED",
          storageCountryRequired: classification.storageCountryRequired,
          backupCountryRequired: classification.backupCountryRequired,
          drCountryRequired: classification.drCountryRequired,
          allowedRegions: deriveAllowedRegions(classification.storageCountryRequired),
          prohibitedRegions: deriveProhibitedRegions(classification.tier, classification.storageCountryRequired),
          crossBorderRules: classification.reasoning,
          encryptionRequired: classification.tier !== "GLOBAL_ALLOWED",
          crossBorderReplicationAllowed: classification.crossBorderReplicationAllowed,
          applicableLaws: classification.applicableLaws,
        },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      );
    }

    // No specific object_type — return the country's residency posture
    // (the rules that apply to ALL sensitive object types in the country).
    // We use the country's most restrictive tier as the default posture.
    const sensitiveObjectTypes = listObjectTypes().filter((t) =>
      t.includes("_" + cc) ||
      (cc === "EG" && t.includes("EGP_")) ||
      (cc === "EG" && t.includes("_EG"))
    );

    // If no object types are registered for the country, fall back to a
    // generic posture based on the country code.
    let posture: any;
    if (sensitiveObjectTypes.length > 0) {
      const classifications = await Promise.all(
        sensitiveObjectTypes.map((t) => classifyDataObject(t, cc)),
      );
      // Pick the most restrictive tier (EGYPT_ONLY > COUNTRY_ONLY > REGIONAL > APPROVED_CROSS_BORDER > GLOBAL_ALLOWED)
      const tierOrder = ["EGYPT_ONLY", "COUNTRY_ONLY", "REGIONAL", "APPROVED_CROSS_BORDER", "GLOBAL_ALLOWED"];
      const sorted = classifications.sort(
        (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier),
      );
      posture = sorted[0];
    } else {
      posture = await classifyDataObject("TRADE_RECORD", cc);
    }

    return NextResponse.json(
      {
        country: cc,
        residencyRequired: posture.tier !== "GLOBAL_ALLOWED",
        allowedRegions: deriveAllowedRegions(posture.storageCountryRequired),
        prohibitedRegions: deriveProhibitedRegions(posture.tier, posture.storageCountryRequired),
        crossBorderRules: posture.reasoning,
        encryptionRequired: posture.tier !== "GLOBAL_ALLOWED",
        defaultTier: posture.tier,
        registeredObjectTypes: sensitiveObjectTypes,
        applicableLaws: posture.applicableLaws,
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (e: any) {
    logger.error("[api/sgtx/data-localization] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Data localization query failed" },
      { status: 500 },
    );
  }
}

function deriveAllowedRegions(storageCountry: string): string[] {
  if (!storageCountry || storageCountry === "ANY") return ["ANY"];
  // EU is a region, not a single country.
  if (storageCountry === "EU") {
    return ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
  }
  if (storageCountry === "GCC") return ["SA","AE","BH","KW","OM","QA"];
  if (storageCountry === "ASEAN") return ["BN","KH","ID","LA","MY","MM","PH","SG","TH","TL","VN"];
  if (storageCountry === "USMCA") return ["US","CA","MX"];
  return [storageCountry];
}

function deriveProhibitedRegions(tier: string, storageCountry: string): string[] {
  if (tier === "GLOBAL_ALLOWED") return [];
  if (tier === "EGYPT_ONLY") {
    return ["US","EU","UK","SA","AE","CN","ANY_FOREIGN"];
  }
  if (tier === "COUNTRY_ONLY") {
    return ["ANY_FOREIGN"];
  }
  if (tier === "REGIONAL") {
    return ["ANY_OTHER_REGION"];
  }
  if (tier === "APPROVED_CROSS_BORDER") {
    return [];
  }
  return [];
}
