import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { eventBus } from "@/lib/sgtx/brain-os";
import { withIdempotency, getIdempotencyKey } from "@/lib/sgtx/idempotency-middleware";

export const dynamic = "force-dynamic";

// POST /api/sgtx/trade-request — create a new trade request (Phase 1 submit)
// Creates: Trade + TradeContainer[] + Shipment[] (if multi-shipment) + Smart Inbox item to seller

// FIX-12-FINAL / Fix 9 — XSS input sanitisation.
// Free-text fields are stripped of HTML tags before persistence so a malicious
// (or careless) submitter cannot inject markup that later renders in the
// portal UI. Audit section S42 flagged the lack of input sanitisation as a
// MEDIUM severity issue (XSS surface). The function is intentionally simple —
// it does NOT attempt to encode entities (the React render layer already does
// that for free via JSX text interpolation). The goal here is to prevent HTML
// payloads from being stored at all.
function sanitizeInput(s: unknown): string | null {
  if (s == null) return null;
  if (typeof s !== "string") return null;
  // Strip any HTML-like tag (`<...>`), then trim. Empty result becomes null
  // so Prisma `String?` columns stay null rather than storing empty strings.
  const cleaned = s.replace(/<[^>]*>/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export async function POST(req: NextRequest) {
  const idempotencyKey = getIdempotencyKey(req);
  const result = await withIdempotency(idempotencyKey, "trade.create", async () => {
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
      blType, // EB_L | ORIGINAL — explicit B/L type selection (Phase 3.12)
      // Part 4.9a — Optional buyer-requested services (extra fees)
      optionalQcInspection,
      qcInspectionType,
      qcInspectionFeeUsd,
      labTestsRequested,
      labTestsFeeUsd,
      optionalServicesTotalUsd,
      // CG-7 fix — caller-supplied QC/LAB provider GTIDs (replaces previously
      // hardcoded GTIDs). When omitted, the route falls back to the first
      // active (VERIFIED) tenant of the matching type so the workflow never
      // silently breaks. The trade-request UI exposes dropdowns populated by
      // /api/sgtx/providers/list?type=QC and ?type=LAB.
      qcProviderGtid,
      labProviderGtid,
      // Part 4.10 — Readiness (advisory)
      readinessScore,
      readinessMissing,
      // Part 4.11 — Trade criticality
      tradeCriticality,
      criticalitySuggested,
      criticalityConfidence,
      criticalityAdjustmentReason,
      // CCL-004 — Buyer Priority & Trade-Off Profile (decision context only).
      // Persisted to Trade.buyerPriorityProfile as JSON string for audit trail.
      buyerPriorityProfile,
    } = body;

    // ── FIX-12-FINAL / Fix 9 — XSS input sanitisation ────────────
    // Strip HTML tags from free-text fields BEFORE validation so a malicious
    // payload cannot bypass the validation step. The sanitised value is then
    // used downstream (DB write, inbox item, activity log). Non-string fields
    // (numbers, booleans, arrays, objects) are NOT touched.
    const sanitizedCommodity = sanitizeInput(commodity) || "";
    const sanitizedPackaging = sanitizeInput(packaging);
    const sanitizedGlobalNotes = sanitizeInput(globalNotes);
    const sanitizedSpecialInstructions = sanitizeInput(specialInstructions);
    const sanitizedPaymentTermsDetails = sanitizeInput(paymentTermsDetails);
    // Re-assign the validated string fields so the rest of the handler reads
    // the cleaned values.
    body.commodity = sanitizedCommodity;
    body.packaging = sanitizedPackaging;
    body.globalNotes = sanitizedGlobalNotes;
    body.specialInstructions = sanitizedSpecialInstructions;
    body.paymentTermsDetails = sanitizedPaymentTermsDetails;

    // ── Validation ──────────────────────────────────────────────
    if (!buyerGtid || !sellerGtid) {
      return { body: { error: "buyerGtid and sellerGtid are required" }, status: 400 };
    }
    if (!sanitizedCommodity || !incoterm) {
      return { body: { error: "commodity and incoterm are required" }, status: 400 };
    }
    if (!containers.length) {
      return { body: { error: "At least one container is required" }, status: 400 };
    }

    // ── Verify buyer & seller exist ────────────────────────────
    const [buyer, seller] = await Promise.all([
      db.tenant.findUnique({ where: { gtid: buyerGtid } }),
      db.tenant.findUnique({ where: { gtid: sellerGtid } }),
    ]);
    if (!buyer) return { body: { error: `Buyer ${buyerGtid} not found` }, status: 404 };
    if (!seller) return { body: { error: `Seller ${sellerGtid} not found` }, status: 404 };

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
        return { body: {
          error: "Governor DENIED trade request",
          verdict: decision.verdict,
          conditions: governorConditions,
          tenantMessage: decision.tenantMessage,
          decisionId: decision.decisionId,
        }, status: 403 };
      }
    } catch (govErr: any) {
      // Governor unavailable — fail safe with ALLOW but log (blueprint 1.15 circuit breaker)
      logger.error("[trade-request] Governor error (fail-safe ALLOW):", govErr);
    }

    // ── Compliance screening (synchronous per blueprint 1.11.4) ───
    try {
      const { runComplianceScreening } = await import("@/lib/sgtx/governor/constitutional-addons");
      await runComplianceScreening({
        tenantGtid: sellerGtid,
        counterpartyGtid: buyerGtid,
      });
    } catch (compErr: any) {
      logger.error("[trade-request] Compliance screening error (non-blocking):", compErr);
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
    } catch (memErr: any) { logger.error("[trade-request] Trade memory capture error:", memErr); }

    // §III: USTN is NOT generated at trade creation. It is minted at
    // contract lock (single-shipment) or per-shipment lock (multi-shipment).
    // The trade is created with ustn=null and status=PENDING_SELLER_RESPONSE.

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
    // FIX-12-FINAL / Fix 9 — sanitised free-text fields are persisted.
    const trade = await db.trade.create({
      data: {
        ustn: `SGTX-PEND-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, // Temporary — replaced at contract lock
        buyer: { connect: { gtid: buyerGtid } },
        seller: { connect: { gtid: sellerGtid } },
        commodity: sanitizedCommodity,
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
        phase: 1, // Phase 1 = Initiation (trade request submission). Phase 0 is pre-trade Foundation onboarding.
        status: "PENDING_SELLER_RESPONSE", // §III: canonical status
        healthScore: 85,
        multiShipment,
        sgtxFeeUsd: sgtxFee,
        coldChain: coldChain === true || coldChain === "yes",
        containerCount: containers.length,
        orderBy: orderBy || null,
        orderValue: orderValue || null,
        paymentTerms: paymentTerms || null,
        paymentTermsDetails: sanitizedPaymentTermsDetails,
        packaging: sanitizedPackaging,
        globalNotes: sanitizedGlobalNotes,
        // Part 4.6 — Special instructions
        specialInstructions: sanitizedSpecialInstructions,
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
        blType: blType || null, // EB_L | ORIGINAL — Bill of Lading type
        // Part 4.9a — Optional buyer-requested services (extra fees)
        optionalQcInspection: optionalQcInspection === true,
        qcInspectionType: qcInspectionType || null,
        qcInspectionFeeUsd: qcInspectionFeeUsd ?? null,
        labTestsRequested: labTestsRequested ? (typeof labTestsRequested === "string" ? labTestsRequested : JSON.stringify(labTestsRequested)) : null,
        labTestsFeeUsd: labTestsFeeUsd ?? null,
        optionalServicesTotalUsd: optionalServicesTotalUsd ?? null,
        // Part 4.10 — Readiness (advisory)
        readinessScore: readinessScore ?? null,
        readinessMissing: readinessMissing ? (typeof readinessMissing === "string" ? readinessMissing : JSON.stringify(readinessMissing)) : null,
        // Part 4.11 — Trade criticality
        tradeCriticality: tradeCriticality || "ROUTINE",
        criticalitySuggested: criticalitySuggested || null,
        criticalityConfidence: criticalityConfidence ?? null,
        criticalityAdjustmentReason: sanitizeInput(criticalityAdjustmentReason),
        // CCL-004 — persist the buyer's trade-off profile as JSON for audit.
        buyerPriorityProfile: buyerPriorityProfile ? (typeof buyerPriorityProfile === "string" ? buyerPriorityProfile : JSON.stringify(buyerPriorityProfile)) : null,
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
          ustn: trade.ustn, // inherit from trade
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
        description: `${sanitizedCommodity} (${commodityHs || "no HS"}) · ${containers.length} container(s) · ${incoterm} · Est. $${estValue.toLocaleString()}. ${paymentTerms ? `Payment: ${paymentTerms}.` : ""} Review and prepare EXW quote.`,
        ctaLabel: "Review & Quote",
      },
    });

    // ── FIX-12-FINAL / Fix 10 — Buyer notification ──────────────
    // Audit section S55 flagged that the buyer was not notified when they
    // created a trade request — the seller got a "New trade request"
    // inbox item but the buyer got nothing, leaving them uncertain whether
    // the request was actually submitted. Create a parallel inbox item for
    // the buyer so they have a visible confirmation in their own portal.
    await db.inboxItem.create({
      data: {
        tenantGtid: buyerGtid,
        tradeId: trade.id,
        category: "GENERAL",
        priority: 70,
        title: `Trade request initiated — ${sanitizedCommodity.slice(0, 30)}`,
        description: `Your trade request for ${sanitizedCommodity} has been submitted to ${seller.legalName}. Awaiting seller review and quote.`,
        ctaLabel: "View Trade",
      },
    }).catch((err: any) => {
      // Non-blocking — the seller inbox + activity log above are the
      // canonical audit trail; a failure here is logged but never blocks
      // the trade creation response.
      logger.error("[trade-request] buyer inbox item creation failed (non-blocking):", err);
    });

    // ── Activity log ───────────────────────────────────────────
    await db.activity.create({
      data: {
        tradeId: trade.id,
        action: "TRADE_INITIATED",
        type: "SUCCESS",
        description: `Trade request submitted by ${buyer.legalName} (${buyerGtid}). Trade ID: ${trade.id}. USTN will be generated at contract lock. ${containers.length} container(s), ${finalGross.toLocaleString()} kg gross.`,
        actorGtid: buyerGtid,
      },
    });

    // ── FIX-12-FINAL / Fix 8 — Brain event publication ──────────
    // Publish `trade.created` so the 38 downstream subscribers fire (audit
    // section S34 — 0 events ever published despite 38 subscriptions).
    // Fire-and-forget: a publish failure never breaks trade creation.
    eventBus
      .publish("trade.created", trade.id, {
        ustn: trade.ustn,
        buyerGtid,
        sellerGtid,
        commodity: sanitizedCommodity,
      }, { source: "trade-request", tenantGtid: buyerGtid })
      .catch(() => { /* event publish failure is non-blocking */ });

    // ── Auto-save contacts to both parties' networks (Part 2.6) ───
    try {
      const { autoSaveContact } = await import("@/lib/sgtx/contacts");
      await Promise.all([
        autoSaveContact(buyerGtid, sellerGtid, "TRADE_CREATED"),
        autoSaveContact(sellerGtid, buyerGtid, "TRADE_CREATED"),
      ]);
    } catch (contactErr: any) {
      logger.error("[trade-request] autoSaveContact error (non-blocking):", contactErr);
    }

    // ── Auto-create QC inspection request (if buyer opted in) ──
    if (optionalQcInspection === true) {
      try {
        // CG-7 fix: resolve the QC provider from the caller-supplied GTID
        // (selected via the provider picker in the wizard). Fall back to the
        // first active QC tenant so the workflow never silently breaks when
        // the caller omits the field. Previously this was hardcoded to a
        // single Egyptian QC provider which gave one provider a monopoly and
        // blocked destination-side inspections.
        let qcGtid = qcProviderGtid;
        if (!qcGtid) {
          const fallbackQc = await db.tenant.findFirst({
            where: { type: "QC", lifecycleState: "VERIFIED" },
            orderBy: { trustScore: "desc" },
          });
          qcGtid = fallbackQc?.gtid || null;
        }
        const qcTenant = qcGtid ? await db.tenant.findUnique({ where: { gtid: qcGtid } }) : null;
        if (qcTenant) {
          await db.qcInspection.create({
            data: {
              tradeId: trade.id,
              qcGtid,
              inspectionType: qcInspectionType || "PRE_SHIPMENT",
              status: "REQUESTED",
              notes: `Buyer-requested optional QC inspection. Provider: ${qcTenant.legalName} (${qcGtid}). Estimated fee: $${qcInspectionFeeUsd || 0}.`,
            },
          });
          await db.inboxItem.create({
            data: {
              tenantGtid: qcGtid, tradeId: trade.id, category: "NEW_OFFER", priority: 70,
              title: `New QC inspection request — ${sanitizedCommodity}`,
              description: `Buyer ${buyer.legalName} requested ${qcInspectionType || "PRE_SHIPMENT"} inspection for trade ${trade.id}. Estimated fee: $${qcInspectionFeeUsd || 0}.`,
              ctaLabel: "Schedule Inspection",
            },
          }).catch(() => null);
        } else {
          logger.warn(`[trade-request] optionalQcInspection requested but no active QC provider found (qcProviderGtid=${qcProviderGtid || "none"}) — inspection request skipped.`);
        }
      } catch (qcErr: any) { logger.error("[trade-request] QC auto-create error (non-blocking):", qcErr); }
    }

    // ── Auto-create lab test requests (if buyer selected any) ──
    if (labTestsRequested) {
      try {
        const tests = Array.isArray(labTestsRequested) ? labTestsRequested : JSON.parse(labTestsRequested);
        // CG-7 fix: resolve the LAB provider from the caller-supplied GTID
        // (provider picker in the wizard). Fall back to the first active LAB
        // tenant. Previously this was hardcoded to a single Egyptian lab.
        let labGtid = labProviderGtid;
        if (!labGtid) {
          const fallbackLab = await db.tenant.findFirst({
            where: { type: "LAB", lifecycleState: "VERIFIED" },
            orderBy: { trustScore: "desc" },
          });
          labGtid = fallbackLab?.gtid || null;
        }
        const labTenant = labGtid ? await db.tenant.findUnique({ where: { gtid: labGtid } }) : null;
        if (labTenant && Array.isArray(tests) && tests.length > 0) {
          await Promise.all(tests.map((t: any) =>
            db.labTest.create({
              data: {
                tradeId: trade.id, labGtid, testType: t.testType,
                sampleRef: `SMP-${trade.id.slice(-8)}-${t.testType.slice(0, 3)}`,
                status: "REQUESTED",
                parameters: JSON.stringify({ feeUsd: t.feeUsd || 0, isExtraCost: t.isExtraCost === true, buyerRequested: true, provider: labTenant.legalName }),
              },
            })
          ));
          await db.inboxItem.create({
            data: {
              tenantGtid: labGtid, tradeId: trade.id, category: "NEW_OFFER", priority: 70,
              title: `New lab test request — ${tests.length} test(s)`,
              description: `Buyer ${buyer.legalName} requested ${tests.map((t: any) => t.testType).join(", ")} for trade ${trade.id}. Provider: ${labTenant.legalName} (${labGtid}). ${tests.some((t: any) => t.isExtraCost) ? `Extra-cost tests: $${labTestsFeeUsd || 0}.` : "All tests are baseline (free)."}`,
              ctaLabel: "Schedule Sampling",
            },
          }).catch(() => null);
        } else {
          logger.warn(`[trade-request] labTestsRequested provided but no active LAB provider found (labProviderGtid=${labProviderGtid || "none"}) — lab test request skipped.`);
        }
      } catch (labErr: any) { logger.error("[trade-request] Lab test auto-create error (non-blocking):", labErr); }
    }

    return { body: {
      ok: true,
      tradeId: trade.id,
      ustn: trade.ustn, // Temporary USTN — replaced at contract lock
      status: "PENDING_SELLER_RESPONSE",
      containerCount: containers.length,
      grossWeightKg: finalGross,
      netWeightKg: finalNet,
      tradeValueUsd: estValue,
      sgtxFeeUsd: sgtxFee,
      governorVerdict,
      governorConditions,
      governorDecisionId,
      message: `Trade request sent to ${seller.legalName}. Status: PENDING_SELLER_RESPONSE. USTN will be generated at contract lock. Governor: ${governorVerdict}.`,
    }, status: 200 };
  } catch (e: any) {
    logger.error("[trade-request/create] error:", e);
    return { body: { error: e.message || "Failed to create trade request" }, status: 500 };
  }
  });
  return NextResponse.json(result.body, { status: result.status });
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
