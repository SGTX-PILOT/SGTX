// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, buyerGtid, sellerGtid, bankGtid, amountUsd, currency = "USD", lcType = "IRREVOCABLE", expiryDays = 90 } = body;

    if (!ustn || !buyerGtid || !sellerGtid || !bankGtid || !amountUsd) {
      return NextResponse.json({ error: "ustn, buyerGtid, sellerGtid, bankGtid, amountUsd required" }, { status: 400 });
    }

    // Find the trade to get tradeId
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    const lcId = `LC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const lc = await db.invoice.create({
      data: {
        tradeId: trade.id,
        type: "LETTER_OF_CREDIT",
        number: lcId,
        amountUsd,
        currency,
        status: "LC_REQUESTED",
        payerGtid: buyerGtid,
        payeeGtid: sellerGtid,
        dueDate: expiryDate,
      },
    }) as any;

    await db.inboxItem.create({
      data: {
        tenantGtid: bankGtid,
        category: "NEEDS_APPROVAL",
        priority: 90,
        title: `LC Request — ${lcId} ($${amountUsd} ${currency})`,
        description: `Letter of Credit request from ${buyerGtid} for ${sellerGtid}. USTN: ${ustn}. Type: ${lcType}. Expiry: ${expiryDate.toISOString().slice(0, 10)}.`,
        ctaLabel: "Review LC Request",
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    }).catch(() => null);

    await db.inboxItem.create({
      data: {
        tenantGtid: sellerGtid,
        category: "GENERAL",
        priority: 75,
        title: `LC Issued — ${lcId}`,
        description: `Letter of Credit ${lcId} for $${amountUsd} ${currency} has been requested. Issuing bank: ${bankGtid}. Expiry: ${expiryDate.toISOString().slice(0, 10)}.`,
        ctaLabel: "View LC Details",
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      lcId,
      lc: {
        id: lc.id, lcId, ustn, buyerGtid, sellerGtid, bankGtid,
        amountUsd, currency, lcType,
        expiryDate: expiryDate.toISOString(),
        status: "LC_REQUESTED",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    const lcs = await db.invoice.findMany({
      where: { tradeId: trade.id, type: "LETTER_OF_CREDIT" },
      orderBy: { createdAt: "desc" },
    }) as any[];

    return NextResponse.json({
      ok: true, count: lcs.length,
      lettersOfCredit: lcs.map(lc => ({
        lcId: lc.number, amountUsd: lc.amountUsd, currency: lc.currency,
        status: lc.status, buyerGtid: lc.payerGtid, sellerGtid: lc.payeeGtid,
        expiryDate: lc.dueDate,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
