import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/contacts/auto-saved?tenantGtid=...
// Blueprint Part 2.6 — list contacts auto-saved on the tenant's behalf
// (TRADE_CREATED, QUOTE_ACCEPTED, FINANCING_SIGNED triggers). Optionally
// filter by ?trigger=TRADE_CREATED.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tenantGtid = sp.get("tenantGtid");
  if (!tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }

  const where: any = { ownerGtid: tenantGtid, autoSaved: true };
  // Optional trigger filter (e.g. ?trigger=TRADE_CREATED) — we don't store the
  // trigger on SavedContact directly, but the relationship field carries a
  // hint. Filter by relationship as a proxy.
  const trigger = sp.get("trigger");
  if (trigger === "TRADE_CREATED") where.relationship = "trader";
  if (trigger === "FINANCING_SIGNED") where.relationship = "financier";

  const contacts = await db.savedContact.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    contacts,
    count: contacts.length,
    tenantGtid,
    trigger: trigger || "all",
  });
}
