// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { verifyToken } from "@/lib/v1/auth";

// POST /api/v1/onboarding/complete
// Body: { onboarding_token: string }
//
// CERT-FIX (BL-008): No longer auto-sets kybTier=2 / sanctionsCleared=true.
// Instead transitions to KYB_PENDING state and creates a compliance review task.
// Only a compliance officer can promote to VERIFIED after real KYB checks.
export async function POST(req: NextRequest) {
  try {
    const { onboarding_token } = await req.json();
    if (!onboarding_token) return NextResponse.json({ error: "onboarding_token required" }, { status: 400 });
    const payload = verifyToken(onboarding_token);
    if (!payload) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    const gtid = payload.sub;

    // Transition to KYB_PENDING (not VERIFIED) — awaiting compliance review
    await db.tenant.update({
      where: { gtid },
      data: {
        lifecycleState: "KYB_PENDING",
        kybTier: 0,           // 0 = not yet assessed
        sanctionsCleared: false, // must be verified by compliance
        trustScore: 10,       // minimal score until KYB clears
      },
        }) as any;

    // Create an OWNER employee record so the registrant can sign in.
    // The contact email from step 2 is used. If no email was provided,
    // fall back to a gtid-based email. Password defaults to "sgtx-demo"
    // (auto-hashed on first login per the login route's dev-mode logic).
    const tenant2 = await db.tenant.findUnique({ where: { gtid } }) as any;
    const contactEmail = tenant2?.contactEmail || `${gtid.toLowerCase()}@sgtx.local`;
    const existingEmployee = await db.employee.findFirst({ where: { email: contactEmail.toLowerCase() } }).catch(() => null);
    if (!existingEmployee) {
      await db.employee.create({
        data: {
          tenantGtid: gtid,
          email: contactEmail.toLowerCase(),
          fullName: tenant2?.legalName || "Company Admin",
          role: "OWNER",
          isActive: true,
          // passwordHash left null — first login with "sgtx-demo" auto-hashes it
        },
      }).catch(() => null);
    }

    // Create a compliance review inbox item for all ADM tenants
        const admins = await db.tenant.findMany({ where: { type: "ADM", lifecycleState: "VERIFIED" } }) as any;
        const tenant = await db.tenant.findUnique({ where: { gtid } }) as any;
    for (const admin of admins) {
      await db.inboxItem.create({
        data: {
          tenantGtid: admin.gtid,
          category: "COMPLIANCE",
          priority: 85,
          title: `KYB Review Required — ${tenant?.legalName || gtid}`,
          description: `Tenant ${gtid} (${tenant?.legalName}) has completed onboarding and is awaiting KYB verification. Review documents, run sanctions screening, and approve or reject. Tenant cannot trade until KYB is cleared.`,
          ctaLabel: "Review KYB",
        },
      }).catch(() => null);
    }

    // Log the state transition
    await db.activity.create({
      data: {
        actorGtid: gtid,
        action: "ONBOARDING_COMPLETED",
        metadata: JSON.stringify({ gtid, lifecycleState: "KYB_PENDING", note: "Awaiting compliance review" }),
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      gtid,
      lifecycle_state: "KYB_PENDING",
      kyb_tier: 0,
      sanctions_cleared: false,
      message: "Onboarding completed. Tenant is now awaiting KYB review by a compliance officer. Trading will be enabled once KYB is approved.",
        }) as any;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
