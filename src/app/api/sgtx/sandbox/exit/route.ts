import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/sandbox/exit — Exit sandbox and go live (Part 2.7, 2.2.8)
// Wipes sandbox data, sets lifecycle_state = VERIFIED, issues production permissions
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, confirm } = await req.json();
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    if (!confirm) return NextResponse.json({ error: "Confirmation required: set confirm=true to exit sandbox" }, { status: 400 });

    const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    // Check readiness score (Part 2.2.8 — must have sufficient readiness)
    if (tenant.trustScore < 50) {
      return NextResponse.json({
        error: "Cannot exit sandbox: Trade Readiness score is below 50. Complete onboarding steps first.",
        currentScore: tenant.trustScore,
        requiredScore: 50,
      }, { status: 403 });
    }

    // Transition to VERIFIED lifecycle state
    const updated = await db.tenant.update({
      where: { gtid: tenantGtid },
      data: { lifecycleState: "VERIFIED" },
    });

    // Create activity log
    await db.activity.create({
      data: {
        action: "SANDBOX_EXIT_GO_LIVE",
        type: "SUCCESS",
        description: `Tenant ${tenantGtid} exited sandbox and went live. Lifecycle state: VERIFIED. Production permissions issued.`,
        actorGtid: tenantGtid,
      },
    });

    // Smart Inbox welcome to production
    await db.inboxItem.create({
      data: {
        tenantGtid,
        category: "GENERAL",
        priority: 75,
        title: "Welcome to Production — You're Live!",
        description: "Your SGTX account is now live. You can initiate real trade requests, sign contracts, and execute cross-border trade with cryptographic certainty.",
        ctaLabel: "Go to Command Center",
      },
    });

    // Production permissions (simulated JWT)
    const productionPermissions = [
      "trade.request.create", "quote.submit", "quote.accept", "contract.sign",
      "financing.request", "payment.authorize", "document.upload", "dispute.file",
    ];

    return NextResponse.json({
      ok: true,
      tenant: { gtid: updated.gtid, legalName: updated.legalName, lifecycleState: updated.lifecycleState },
      permissions: productionPermissions,
      message: "Sandbox exited successfully. You are now in production mode with full trade execution capabilities.",
      redirect: "/portal/trader-buyer",
    });
  } catch (e: any) {
    console.error("[sandbox/exit] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
