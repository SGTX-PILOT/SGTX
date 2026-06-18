// 3B.5.3 — Financier Preferences (CRUD)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const financierGtid = req.nextUrl.searchParams.get("financierGtid");
  if (!financierGtid) return NextResponse.json({ error: "financierGtid required" }, { status: 400 });

  let pref = await db.financierPreference.findUnique({ where: { financierGtid } });
  if (!pref) {
    // Create defaults
    pref = await db.financierPreference.create({
      data: {
        financierGtid,
        acceptedBorrowerCountries: JSON.stringify(["EG", "DE", "VN", "AE", "SA", "US"]),
        preferredFinancingTypes: JSON.stringify(["PRE_SHIPMENT", "POST_SHIPMENT", "INVOICE_FINANCING"]),
        preferredSettlementMethods: JSON.stringify(["BANK_TRANSFER", "STABLECOIN"]),
        excludedCommodities: JSON.stringify([]),
        geographicMode: "ALL",
      },
    });
  }
  return NextResponse.json({
    preference: {
      ...pref,
      acceptedBorrowerCountries: JSON.parse(pref.acceptedBorrowerCountries),
      preferredFinancingTypes: JSON.parse(pref.preferredFinancingTypes),
      preferredSettlementMethods: JSON.parse(pref.preferredSettlementMethods),
      excludedCommodities: JSON.parse(pref.excludedCommodities),
      geographicList: pref.geographicList ? JSON.parse(pref.geographicList) : [],
    },
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { financierGtid, acceptedBorrowerCountries, minTrustScore, minTradeValue, maxFinancedPerRequest, preferredFinancingTypes, preferredSettlementMethods, excludedCommodities, geographicMode, geographicList, minTrancheSize, defaultAprBenchmark, enableDeFi, notificationsEnabled, webhookUrl } = body;

    if (!financierGtid) return NextResponse.json({ error: "financierGtid required" }, { status: 400 });

    const data = {
      acceptedBorrowerCountries: JSON.stringify(acceptedBorrowerCountries || []),
      minTrustScore: +(minTrustScore || 70),
      minTradeValue: +(minTradeValue || 10000),
      maxFinancedPerRequest: +(maxFinancedPerRequest || 500000),
      preferredFinancingTypes: JSON.stringify(preferredFinancingTypes || []),
      preferredSettlementMethods: JSON.stringify(preferredSettlementMethods || []),
      excludedCommodities: JSON.stringify(excludedCommodities || []),
      geographicMode: geographicMode || "ALL",
      geographicList: geographicList ? JSON.stringify(geographicList) : null,
      minTrancheSize: +(minTrancheSize || 10000),
      defaultAprBenchmark: +(defaultAprBenchmark || 5.0),
      enableDeFi: !!enableDeFi,
      notificationsEnabled: notificationsEnabled !== false,
      webhookUrl: webhookUrl || null,
      updatedAt: new Date(),
    };

    const pref = await db.financierPreference.upsert({
      where: { financierGtid },
      update: data,
      create: { financierGtid, ...data },
    });

    return NextResponse.json({ ok: true, preferenceId: pref.id });
  } catch (e: any) {
    console.error("[financing/preferences]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
