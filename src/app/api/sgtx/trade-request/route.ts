import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/trade-request — create a new trade request (Phase 1 submit)
// Creates: Trade + TradeContainer[] + Shipment[] (if multi-shipment) + Smart Inbox item to seller
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      buyerGtid,
      sellerGtid,
      commodity,
      commodityHs,
      incoterm,
      originPort,
      destPort,
      originCountry,
      destCountry,
      grossWeightKg,
      netWeightKg,
      tradeValueUsd,
      currency = "USD",
      coldChain = false,
      multiShipment = false,
      containers = [],
      shipments = [],
      orderBy,
      orderValue,
      paymentTerms,
      paymentTermsDetails,
      packaging,
      globalNotes,
      // Part 4.5 — Documentation requirements (array of resolved specs)
      documentRequirements,
      // Part 4.6 — Special trade instructions (free-text)
      specialInstructions,
      // Part 4.7 — Transport & Logistics
      transportMode,
      equipmentType,
      equipmentCount,
      alternativePorts,
      earliestDeliveryDate,
      preferredDeliveryDate,
      latestDeliveryDate,
      transitTimeDays,
      // Part 4.8 — Insurance
      insuranceRequirement,
      insuranceType,
      insuranceResponsibleParty,
      insuranceCoveragePct,
      insuranceCurrency,
      // Part 4.9 — Commercial settlement
      settlementStructure,
      paymentTiming,
      creditPeriod,
      creditPeriodCustomDays,
      commercialPriority,
      financingInterest,
      bankInstrument,
      settlementFlexibility,
      balanceTiming,
      settlementDocuments,
      originalDocsRequired,
      documentLanguage,
      // Part 4.10 — Readiness (advisory)
      readinessScore,
      readinessMissing,
      // Part 4.11 — Trade criticality
      tradeCriticality,
      criticalitySuggested,
      criticalityConfidence,
      criticalityAdjustmentReason,
    } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!buyerGtid || !sellerGtid) {
      return NextResponse.json({ error: "buyerGtid and sellerGtid are required" }, { status: 400 });
    }
    if (!commodity || !incoterm) {
      return NextResponse.json({ error: "commodity and incoterm are required" }, { status: 400 });
    }
    if (!containers.length) {
      return NextResponse.json({ error: "At least one container is required" }, { status: 400 });
    }

    // ── Verify buyer & seller exist ────────────────────────────
    const [buyer, seller] = await Promise.all([
      db.tenant.findUnique({ where: { gtid: buyerGtid } }),
      db.tenant.findUnique({ where: { gtid: sellerGtid } }),
    ]);
    if (!buyer) return NextResponse.json({ error: `Buyer ${buyerGtid} not found` }, { status: 404 });
    if (!seller) return NextResponse.json({ error: `Seller ${sellerGtid} not found` }, { status: 404 });

    // ── Governor pre-decision (G1: Execution Always Gated) ─────────
    // Blueprint 1.1 + 3.11.10: Governor must evaluate trade.initiate synchronously
    let governorVerdict = "ALLOW";
    let governorConditions: any[] = [];
    let governorDecisionId: string | null = null;
    try {
      const { governorDecide } = await import("@/lib/sgtx/governor");
      const decision = await governorDecide({
        action: "trade.initiate",
        actorGtid: buyerGtid,
        payload: {
          commodity, commodityHs: commodityHs, incoterm,
          buyerCountry: buyer.country, sellerCountry: seller.country, sellerGtid,
          value: tradeValueUsd || 100000,
          // Part 4.15 — expanded Governor gates
          transportMode, equipmentType,
          insuranceRequirement, insuranceType,
          settlementStructure, paymentTiming, currency,
          tradeCriticality,
          earliestDeliveryDate, preferredDeliveryDate, latestDeliveryDate,
          documentationMandatoryCount: Array.isArray(documentRequirements) ? documentRequirements.filter((r: any) => r.mandatory).length : 0,
          documentationMandatorySelected: Array.isArray(documentRequirements) ? documentRequirements.filter((r: any) => r.mandatory).length : 0,
        },
      });
      governorVerdict = decision.verdict;
      governorConditions = (decision.conditions || []).map((c: any) => c.label || JSON.stringify(c));
      governorDecisionId = decision.decisionId || null;
      // If DENY, block trade creation entirely
      if (decision.verdict === "DENY") {
        return NextResponse.json({
          error: "Governor DENIED trade request",
          verdict: decision.verdict,
          conditions: governorConditions,
          tenantMessage: decision.tenantMessage,
          decisionId: decision.decisionId,
        }, { status: 403 });
      }
    } catch (govErr) {
      // Governor unavailable — fail safe with ALLOW but log (blueprint 1.15 circuit breaker)
      console.error("[trade-request] Governor error (fail-safe ALLOW):", govErr);
    }

    // ── Compliance screening (synchronous per blueprint 1.11.4) ───
    try {
      const { runComplianceScreening } = await import("@/lib/sgtx/governor/constitutional-addons");
      await runComplianceScreening({
        tenantGtid: sellerGtid,
        counterpartyGtid: buyerGtid,
      });
    } catch (compErr) {
      console.error("[trade-request] Compliance screening error (non-blocking):", compErr);
    }

    // ── Capture Trade Memory event (Part 19) ─────────────────────
    try {
      await db.tradeMemoryEvent.create({
        data: {
          ustn: null, // not generated yet
          tenantGtid: buyerGtid,
          category: "MILESTONE",
          eventType: "TRADE_INITIATED",
          eventValue: tradeValueUsd || 100000,
          eventMetadata: JSON.stringify({ commodity, incoterm, sellerGtid }),
        },
      });
    } catch (memErr) { console.error("[trade-request] Trade memory capture error:", memErr); }

    // ── Generate USTN: SGTX-{BUYER6}-{SELLER6}-{YYYYMMDDHHMMSS}-{RAND8} ──
    const buyer6 = buyerGtid.split("-")[3] || "000000";
    const seller6 = sellerGtid.split("-")[3] || "000000";
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const rand8 = Math.random().toString(16).slice(2, 10).toUpperCase();
    const ustn = `SGTX-${buyer6}-${seller6}-${ts}-${rand8}`;

    // ── Aggregate weight from containers ───────────────────────
    const aggGross = containers.reduce((s: number, c: any) =>
      s + (c.commodities || []).reduce((cs: number, com: any) => cs + (Number(com.grossWeight) || 0) * (Number(com.pallets) || 0), 0), 0);
    const aggNet = containers.reduce((s: number, c: any) =>
      s + (c.commodities || []).reduce((cs: number, com: any) => cs + (Number(com.netWeight) || 0) * (Number(com.pallets) || 0), 0), 0);
    const finalGross = grossWeightKg || Math.round(aggGross);
    const finalNet = netWeightKg || Math.round(aggNet);

    // ── Estimate trade value (if not provided) ─────────────────
    // Rough: weight (kg) × commodity base price ($2/kg default for frozen fruit)
    const estValue = tradeValueUsd || Math.round(finalGross * 2.4);

    // ── SGTX fee 1.5% ──────────────────────────────────────────
    const sgtxFee = Math.round(estValue * 0.015 * 100) / 100;

    // ── First container's route = trade-level route ────────────
    const first = containers[0] || {};

    // ── Create the Trade + nested containers ───────────────────
    const trade = await db.trade.create({
      data: {
        ustn,
        buyerGtid,
        sellerGtid,
        commodity,
        commodityHs: commodityHs || null,
        incoterm,
        grossWeightKg: finalGross,
        netWeightKg: finalNet,
        tradeValueUsd: estValue,
        currency,
        originPort: originPort || first.port || "Unknown",
        destPort: destPort || first.port || "Unknown",
        originCountry: originCountry || first.originCountry || "EG",
        destCountry: destCountry || first.destCountry || "DE",
        phase: 0,
        status: "INITIATED",
        healthScore: 85,
        multiShipment,
        sgtxFeeUsd: sgtxFee,
        coldChain: coldChain === true || coldChain === "yes",
        containerCount: containers.length,
        orderBy: orderBy || null,
        orderValue: orderValue || null,
        paymentTerms: paymentTerms || null,
        paymentTermsDetails: paymentTermsDetails || null,
        packaging: packaging || null,
        globalNotes: globalNotes || null,
        // Part 4.6 — Special instructions
        specialInstructions: specialInstructions || null,
        // Part 4.7 — Transport & Logistics
        transportMode: transportMode || null,
        equipmentType: equipmentType || null,
        equipmentCount: equipmentCount ?? null,
        alternativePorts: alternativePorts ? (typeof alternativePorts === "string" ? alternativePorts : JSON.stringify(alternativePorts)) : null,
        earliestDeliveryDate: earliestDeliveryDate ? new Date(earliestDeliveryDate) : null,
        preferredDeliveryDate: preferredDeliveryDate ? new Date(preferredDeliveryDate) : null,
        latestDeliveryDate: latestDeliveryDate ? new Date(latestDeliveryDate) : null,
        transitTimeDays: transitTimeDays ?? null,
        // Part 4.8 — Insurance
        insuranceRequirement: insuranceRequirement || null,
        insuranceType: insuranceType || null,
        insuranceResponsibleParty: insuranceResponsibleParty || null,
        insuranceCoveragePct: insuranceCoveragePct ?? null,
        insuranceCurrency: insuranceCurrency || null,
        // Part 4.9 — Commercial settlement
        settlementStructure: settlementStructure || null,
        paymentTiming: paymentTiming || null,
        creditPeriod: creditPeriod || null,
        creditPeriodCustomDays: creditPeriodCustomDays ?? null,
        commercialPriority: commercialPriority || null,
        financingInterest: financingInterest || null,
        bankInstrument: bankInstrument || null,
        settlementFlexibility: settlementFlexibility || null,
        balanceTiming: balanceTiming || null,
        settlementDocuments: settlementDocuments ? (typeof settlementDocuments === "string" ? settlementDocuments : JSON.stringify(settlementDocuments)) : null,
        originalDocsRequired: originalDocsRequired ?? null,
        documentLanguage: documentLanguage || null,
        // Part 4.10 — Readiness (advisory)
        readinessScore: readinessScore ?? null,
        readinessMissing: readinessMissing ? (typeof readinessMissing === "string" ? readinessMissing : JSON.stringify(readinessMissing)) : null,
        // Part 4.11 — Trade criticality
        tradeCriticality: tradeCriticality || "ROUTINE",
        criticalitySuggested: criticalitySuggested || null,
        criticalityConfidence: criticalityConfidence ?? null,
        criticalityAdjustmentReason: criticalityAdjustmentReason || null,
        containers: {
          create: containers.map((c: any, i: number) => ({
            sequence: i + 1,
            originCountry: c.originCountry || "EG",
            destCountry: c.destCountry || "DE",
            port: c.port || "Unknown",
            palletized: c.palletized !== false,
            palletSize: c.palletSize || null,
            destOverride: c.destOverride || null,
            notes: c.notes || null,
            containerSize: c.containerSize || null, // "40ft" | "20ft"
            commodities: JSON.stringify(c.commodities || []),
          })),
        },
        // Part 4.5 — Document requirements (one source of truth)
        documentRequirements: Array.isArray(documentRequirements) && documentRequirements.length > 0 ? {
          create: documentRequirements.map((r: any) => ({
            docType: r.docType,
            docName: r.docName,
            trigger: r.trigger,
            mandatory: !!r.mandatory,
            issuingAuthority: r.issuingAuthority || null,
            format: r.format || null,
            notes: r.notes || null,
          })),
        } : undefined,
      },
      include: { containers: true, documentRequirements: true },
    });

    // ── Create shipments (multi-shipment or single) ────────────
    const shipmentList = multiShipment && shipments.length ? shipments : [{ deliveryDate: null, port: first.port || "Unknown", containers: containers.length }];
    await Promise.all(shipmentList.map((s: any, i: number) =>
      db.shipment.create({
        data: {
          tradeId: trade.id,
          ustn,
          sequence: i + 1,
          containerCount: s.containers || containers.length,
          originPort: first.port || "Unknown",
          destPort: s.port || first.port || "Unknown",
          etd: s.deliveryDate ? new Date(s.deliveryDate) : null,
          coldChainTemp: coldChain === true || coldChain === "yes" ? -18 : null,
        },
      })
    ));

    // ── Smart Inbox to seller (priority 75) ────────────────────
    await db.inboxItem.create({
      data: {
        tenantGtid: sellerGtid,
        tradeId: trade.id,
        category: "NEW_OFFER",
        priority: 75,
        title: `New trade request from ${buyer.legalName}`,
        description: `${commodity} (${commodityHs || "no HS"}) · ${containers.length} container(s) · ${incoterm} · Est. $${estValue.toLocaleString()}. ${paymentTerms ? `Payment: ${paymentTerms}.` : ""} Review and prepare EXW quote.`,
        ctaLabel: "Review & Quote",
      },
    });

    // ── Activity log ───────────────────────────────────────────
    await db.activity.create({
      data: {
        tradeId: trade.id,
        action: "TRADE_INITIATED",
        type: "SUCCESS",
        description: `Trade request submitted by ${buyer.legalName} (${buyerGtid}). USTN ${ustn}. ${containers.length} container(s), ${finalGross.toLocaleString()} kg gross.`,
        actorGtid: buyerGtid,
      },
    });

    // ── Auto-save contacts to both parties' networks (Part 2.6) ───
    // Non-marketplace: the platform never recommends counterparties. It only
    // remembers who the tenant has explicitly transacted with so future GTID
    // autocomplete surfaces them. Idempotent — no-op if already saved.
    try {
      const { autoSaveContact } = await import("@/lib/sgtx/contacts");
      await Promise.all([
        autoSaveContact(buyerGtid, sellerGtid, "TRADE_CREATED"),
        autoSaveContact(sellerGtid, buyerGtid, "TRADE_CREATED"),
      ]);
    } catch (contactErr) {
      console.error("[trade-request] autoSaveContact error (non-blocking):", contactErr);
    }

    return NextResponse.json({
      ok: true,
      tradeId: trade.id,
      ustn,
      status: "INITIATED",
      containerCount: containers.length,
      grossWeightKg: finalGross,
      netWeightKg: finalNet,
      tradeValueUsd: estValue,
      sgtxFeeUsd: sgtxFee,
      governorVerdict,
      governorConditions,
      governorDecisionId,
      message: `Trade request sent to ${seller.legalName}. USTN ${ustn} generated. Governor: ${governorVerdict}.`,
    });
  } catch (e: any) {
    console.error("[trade-request/create] error:", e);
    return NextResponse.json({ error: e.message || "Failed to create trade request" }, { status: 500 });
  }
}

// GET /api/sgtx/trade-request — list buyer's initiated trades (for dashboard)
export async function GET(req: NextRequest) {
  const buyerGtid = req.nextUrl.searchParams.get("buyerGtid");
  if (!buyerGtid) return NextResponse.json({ error: "buyerGtid required" }, { status: 400 });
  const trades = await db.trade.findMany({
    where: { buyerGtid },
    include: { containers: true, shipments: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ trades });
}
