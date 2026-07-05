import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { verifyCompany } from "@/lib/sgtx/onboarding/open-registry";

// POST /api/sgtx/onboarding/verify-registry
// Body: { gtid?, companyName?, registrationNumber?, country, vatNumber?, lei? }
// Calls verifyCompany() (GLEIF + EU VIES) and persists the result on Tenant.globalNotes
// (JSON snapshot appended to an array under key "registryVerifications").
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gtid, companyName, registrationNumber, country, vatNumber, lei } = body;
    if (!country) {
      return NextResponse.json({ error: "country is required (ISO 3166-1 alpha-2)" }, { status: 400 });
    }
    if (!companyName && !registrationNumber && !vatNumber && !lei) {
      return NextResponse.json({ error: "Provide at least one of: companyName, registrationNumber, vatNumber, lei" }, { status: 400 });
    }

    const result = await verifyCompany({ companyName, registrationNumber, country, vatNumber, lei });

    // Persist on Tenant.globalNotes if a gtid was provided
    if (gtid) {
      const tenant = await db.tenant.findUnique({ where: { gtid } });
      if (tenant) {
        const notesJson: any = (() => {
          try { return JSON.parse(tenant.globalNotes || "{}"); } catch { return {}; }
        })();
        if (!Array.isArray(notesJson.registryVerifications)) {
          notesJson.registryVerifications = [];
        }
        notesJson.registryVerifications.push({
          checkedAt: result.checkedAt,
          source: result.source,
          verified: result.verified,
          confidence: result.confidence,
          company: result.company,
          matchedFields: result.matchedFields,
          mismatchedFields: result.mismatchedFields,
          warnings: result.warnings,
          input: { companyName, registrationNumber, country, vatNumber, lei },
        });
        // Cap at last 20 verifications
        notesJson.registryVerifications = notesJson.registryVerifications.slice(-20);
        await db.tenant.update({
          where: { gtid },
          data: { globalNotes: JSON.stringify(notesJson) },
        });
        // Activity log
        try {
          await db.activity.create({
            data: {
              actorGtid: gtid,
              action: "REGISTRY_VERIFICATION",
              type: result.verified ? "SUCCESS" : "INFO",
              description: `Open-registry verification via ${result.source}: ${result.verified ? "VERIFIED" : "not verified"} (confidence ${(result.confidence * 100).toFixed(0)}%).`,
            },
          });
        } catch { /* activity logging is non-fatal */ }
      }
    }

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    logger.error("[verify-registry] error:", e);
    return NextResponse.json({ error: e?.message || "Verification failed" }, { status: 500 });
  }
}

// GET /api/sgtx/onboarding/verify-registry?country=DE&companyName=...&vatNumber=...&lei=...&registrationNumber=...&gtid=...
// Quick verification via query params (no persistence if gtid omitted).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const country = sp.get("country");
    if (!country) {
      return NextResponse.json({ error: "country query param required" }, { status: 400 });
    }
    const companyName = sp.get("companyName") || undefined;
    const registrationNumber = sp.get("registrationNumber") || undefined;
    const vatNumber = sp.get("vatNumber") || undefined;
    const lei = sp.get("lei") || undefined;
    const gtid = sp.get("gtid") || undefined;

    if (!companyName && !registrationNumber && !vatNumber && !lei) {
      return NextResponse.json({ error: "Provide at least one of: companyName, registrationNumber, vatNumber, lei" }, { status: 400 });
    }

    const result = await verifyCompany({ companyName, registrationNumber, country, vatNumber, lei });

    if (gtid) {
      const tenant = await db.tenant.findUnique({ where: { gtid } });
      if (tenant) {
        const notesJson: any = (() => {
          try { return JSON.parse(tenant.globalNotes || "{}"); } catch { return {}; }
        })();
        if (!Array.isArray(notesJson.registryVerifications)) notesJson.registryVerifications = [];
        notesJson.registryVerifications.push({
          checkedAt: result.checkedAt,
          source: result.source,
          verified: result.verified,
          confidence: result.confidence,
          company: result.company,
          matchedFields: result.matchedFields,
          mismatchedFields: result.mismatchedFields,
          warnings: result.warnings,
          input: { companyName, registrationNumber, country, vatNumber, lei },
        });
        notesJson.registryVerifications = notesJson.registryVerifications.slice(-20);
        await db.tenant.update({
          where: { gtid },
          data: { globalNotes: JSON.stringify(notesJson) },
        });
      }
    }

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    logger.error("[verify-registry GET] error:", e);
    return NextResponse.json({ error: e?.message || "Verification failed" }, { status: 500 });
  }
}
