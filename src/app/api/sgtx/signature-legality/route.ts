// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getSignatureLegality,
  getCountrySignatureLaws,
  listSupportedCountries,
  listSignatureTypes,
} from "@/lib/sgtx/digital-signature-legality";

export const dynamic = "force-dynamic";

// GET /api/sgtx/signature-legality — Digital signature legality (v17 §20.111)
//
// Query params:
//   ?country=X                — get the legality of signature types in country X
//   ?country=X&signature_type=Y — get the legality of a specific signature type in country X
//   ?country=X&laws=true       — get the country's signature laws + QTSP list
//   ?countries=true            — list all supported countries
//   ?types=true                — list all supported signature types
//
// Returns:
//   {
//     "country": "EG",
//     "signatureType": "QUALIFIED",
//     "legalStatus": "LEGALLY_EQUIVALENT",
//     "evidenceValue": "...",
//     "legalBasis": "Egypt Law 15/2004 Art. 16 + ...",
//     "requirements": [...],
//     "notes": "...",
//     "crossBorderRecognition": [
//       { "jurisdiction": "EU", "recognitionLevel": "PARTIAL", "notes": "..." },
//       ...
//     ]
//   }
//
// Public read endpoint — the legality registry is global reference data.
// Rate-limited 50 req/min/IP via the middleware anonymous bucket.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const country = sp.get("country") || "";
    const signatureType = sp.get("signature_type") || sp.get("signatureType") || "";
    const wantLaws = sp.get("laws") === "true";
    const wantCountries = sp.get("countries") === "true";
    const wantTypes = sp.get("types") === "true";

    if (wantCountries) {
      return NextResponse.json({
        countries: listSupportedCountries(),
        count: listSupportedCountries().length,
      });
    }
    if (wantTypes) {
      return NextResponse.json({ types: listSignatureTypes() });
    }
    if (!country) {
      return NextResponse.json(
        {
          error:
            "country query parameter required (use ?countries=true to list supported countries)",
        },
        { status: 400 },
      );
    }

    if (wantLaws) {
      const laws = getCountrySignatureLaws(country);
      return NextResponse.json(laws, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    if (signatureType) {
      const upper = signatureType.toUpperCase();
      if (!["SIMPLE", "ADVANCED", "QUALIFIED"].includes(upper)) {
        return NextResponse.json(
          { error: "signature_type must be one of: SIMPLE, ADVANCED, QUALIFIED" },
          { status: 400 },
        );
      }
      const result = getSignatureLegality(country, upper as any);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    // No specific signatureType — return all three.
    const all: any = {
      country: result_country(country),
      SIMPLE: getSignatureLegality(country, "SIMPLE"),
      ADVANCED: getSignatureLegality(country, "ADVANCED"),
      QUALIFIED: getSignatureLegality(country, "QUALIFIED"),
    };
    all.country = (all.SIMPLE as any).country;
    return NextResponse.json(all, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (e: any) {
    logger.error("[api/sgtx/signature-legality] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Signature legality query failed" },
      { status: 500 },
    );
  }
}

function result_country(country: string): string {
  // Helper to normalise the country code via the same logic as the lib.
  // We use the lib's getSignatureLegality to do this (the country field
  // of the returned object is already normalised).
  return getSignatureLegality(country, "SIMPLE").country;
}
