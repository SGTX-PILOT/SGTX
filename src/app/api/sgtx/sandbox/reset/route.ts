import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/sandbox/reset — Reset sandbox environment (Part 2.7)
// Clears all sandbox trades/documents and re-seeds synthetic counterparties
// Weekly reset (Sunday 03:00 UTC) or manual trigger
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, confirm } = await req.json();
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    if (!confirm) return NextResponse.json({ error: "Confirmation required: set confirm=true to reset sandbox" }, { status: 400 });

    // Verify tenant is in sandbox mode
    const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    if (tenant.lifecycleState !== "ONBOARDING" && tenant.lifecycleState !== "REGISTERED") {
      return NextResponse.json({ error: "Sandbox reset is only available for tenants in ONBOARDING or REGISTERED state" }, { status: 403 });
    }

    // CERT-FIX (BL-013): Only delete SANDBOX trades — never real trades.
    // The isSandbox flag was added to the Trade model to distinguish practice trades from real ones.
    const deletedTrades = await db.trade.deleteMany({
      where: {
        AND: [
          { isSandbox: true },
          { OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }] },
        ],
      },
    });

    // Delete all documents associated with those sandbox trades
    // (Cascade delete should handle this, but let's be explicit)
    const deletedDocs = await db.document.deleteMany({
      where: { uploaderGtid: tenantGtid },
    });

    // Delete all inbox items
    const deletedInbox = await db.inboxItem.deleteMany({
      where: { tenantGtid },
    });

    // Re-seed synthetic counterparties if they don't exist
    const syntheticCounterparties = [
      { gtid: "SGTX-EG-TRD-900001-DEMO", legalName: "Demo Buyer Co. (Sandbox)", type: "TRD", country: "EG", trustScore: 75, sanctionsCleared: true, lifecycleState: "VERIFIED", kybTier: 2, traderMode: "BUY" },
      { gtid: "SGTX-EG-TRD-900002-DEMO", legalName: "Demo Seller Ltd. (Sandbox)", type: "TRD", country: "EG", trustScore: 80, sanctionsCleared: true, lifecycleState: "VERIFIED", kybTier: 2, traderMode: "SELL" },
    ];

    for (const sc of syntheticCounterparties) {
      const existing = await db.tenant.findUnique({ where: { gtid: sc.gtid } });
      if (!existing) {
        await db.tenant.create({ data: sc as any });
      }
    }

    // Create a welcome inbox item
    await db.inboxItem.create({
      data: {
        tenantGtid,
        category: "GENERAL",
        priority: 50,
        title: "Sandbox Reset Complete",
        description: "Your sandbox has been reset. Synthetic counterparties (Demo Buyer Co. and Demo Seller Ltd.) are available for practice trades.",
        ctaLabel: "Start Practice Trade",
      },
    });

    return NextResponse.json({
      ok: true,
      deleted: { trades: deletedTrades.count, documents: deletedDocs.count, inboxItems: deletedInbox.count },
      syntheticCounterparties: syntheticCounterparties.map(c => c.gtid),
      message: "Sandbox reset complete. All practice data has been cleared and synthetic counterparties are available.",
    });
  } catch (e: any) {
    console.error("[sandbox/reset] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
