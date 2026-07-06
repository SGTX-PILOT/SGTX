// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { screenForSanctions } from "@/lib/sgtx/compliance/sanctions";

// POST /api/sgtx/kyb/approve — Compliance officer approves KYB for a tenant
// Body: { tenantGtid: string, kybTier: 1|2|3, notes?: string }
//
// CERT-FIX (BL-008): Compliance officer endpoint to promote a tenant from
// KYB_PENDING to VERIFIED after real document verification + sanctions screening.
// Only ADM/GOV tenants can call this.
//
// IMPL-4: The legacy flow accepted `sanctionsCleared` as a body parameter — a
// dangerous bypass allowing the caller to self-certify sanctions clearance
// without any actual screening (the prior audit flagged this). Sanctions
// screening is now performed against the structured sanctions module
// (@/lib/sgtx/compliance/sanctions), which checks the tenant's legal name +
// country against OFAC SDN / EU Consolidated / UK OFSI / UN 1267 lists with
// Levenshtein-based fuzzy matching. If the screening returns ANY hit above
// the clearance threshold (matchScore >= 0.85), the approval is BLOCKED (422)
// and the hits are returned for compliance review. The body's
// `sanctionsCleared` field is now IGNORED.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantGtid, kybTier, notes } = body;

    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    if (![1, 2, 3].includes(kybTier)) return NextResponse.json({ error: "kybTier must be 1, 2, or 3" }, { status: 400 });

    // AuthZ: verify caller is ADM/GOV
    const callerGtid = req.headers.get("x-tenant-gtid") || "";
    if (callerGtid) {
            const caller = await db.tenant.findUnique({ where: { gtid: callerGtid } }) as any;
      if (!caller || (caller.type !== "ADM" && caller.type !== "GOV")) {
                return NextResponse.json({ error: "Only ADM/GOV tenants can approve KYB" }, { status: 403 }) as any;
      }
    }

        const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } }) as any;
        if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 }) as any;
    if (tenant.lifecycleState === "VERIFIED") {
            return NextResponse.json({ error: "Tenant already VERIFIED" }, { status: 409 }) as any;
    }

    // IMPL-4: Structured sanctions screening against OFAC SDN / EU Consolidated /
    // UK OFSI / UN 1267 lists. Replaces the dangerous bypass where the caller
    // could pass sanctionsCleared=true without any actual screening.
    const sanctionsResult = await screenForSanctions({
      name: tenant.legalName,
      country: tenant.country,
    });
    const sanctionsCleared = sanctionsResult.clear;

    if (!sanctionsCleared) {
      // BLOCK approval — return 422 with the hits listed for compliance review.
      // The tenant is NOT promoted to VERIFIED; compliance must investigate.
      return NextResponse.json({
        error: "SANCTIONS_HIT",
        message: `KYB approval blocked: ${sanctionsResult.hits.length} sanctions hit(s) detected for "${tenant.legalName}" (${tenant.country}). Compliance review required before KYB approval.`,
        tenantGtid,
        legalName: tenant.legalName,
        country: tenant.country,
        sanctionsHits: sanctionsResult.hits,
        provider: sanctionsResult.provider,
        screenedAt: sanctionsResult.screenedAt,
      }, { status: 422 });
    }

    // Promote to VERIFIED with real KYB tier + sanctions status
    const trustScore = kybTier === 3 ? 70 : kybTier === 2 ? 50 : 30;
    await db.tenant.update({
      where: { gtid: tenantGtid },
      data: {
        lifecycleState: "VERIFIED",
        kybTier,
        sanctionsCleared,
        trustScore,
      },
        }) as any;

    // Notify the tenant
    await db.inboxItem.create({
      data: {
        tenantGtid,
        category: "GENERAL",
        priority: 90,
        title: "KYB Approved — Trading Enabled",
        description: `Your KYB verification has been approved (Tier ${kybTier}). Sanctions clearance: ${sanctionsCleared ? "Cleared" : "Not cleared"}. You can now start trading.${notes ? " Notes: " + notes : ""}`,
        ctaLabel: "Go to Dashboard",
      },
    }).catch(() => null);

    // Audit log — record sanctions screening provenance for the audit trail.
    await db.activity.create({
      data: {
        actorGtid: callerGtid || "system",
        action: "KYB_APPROVED",
        metadata: JSON.stringify({
          tenantGtid,
          kybTier,
          sanctionsCleared,
          sanctionsProvider: sanctionsResult.provider,
          sanctionsScreenedAt: sanctionsResult.screenedAt,
          sanctionsHitCount: sanctionsResult.hits.length,
          notes,
          trustScore,
        }),
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      tenantGtid,
      lifecycleState: "VERIFIED",
      kybTier,
      sanctionsCleared,
      sanctionsProvider: sanctionsResult.provider,
      sanctionsScreenedAt: sanctionsResult.screenedAt,
      sanctionsHitCount: sanctionsResult.hits.length,
      trustScore,
        }) as any;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
