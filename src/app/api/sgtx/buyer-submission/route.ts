import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// ============================================================
// /api/sgtx/buyer-submission
// ------------------------------------------------------------
// Phase 2.5 — Post-Quote Buyer Detail Capture
//
// The buyer, after receiving the seller's quote, must submit:
//   • Consignee (auto-filled from buyer GTID with "same as buyer" checkbox)
//   • Notify parties (1 or more)
//   • Document dispatch addresses (1 or more; each gets specific doc types)
//
// POST  → save submission + accept quote (status QUOTE_ACCEPTED → BUYER_SUBMITTED)
// GET   → fetch existing submission(s) for a trade (by ?ustn=)
// ============================================================

// POST /api/sgtx/buyer-submission
// Body: {
//   ustn, buyerGtid,
//   consigneeSameAsBuyer: boolean,
//   consignee: { name, address, country, city, postalCode, phone, email, taxId },
//   notifyParties: [{ name, address, country, city, postalCode, phone, email }],
//   documentDispatchAddresses: [{ label, address, country, city, postalCode, attention, phone, documentTypes: string[], courier }]
//   acceptQuote: boolean (default true — also transition trade to BUYER_SUBMITTED)
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      buyerGtid,
      consigneeSameAsBuyer,
      consignee,
      notifyParties,
      documentDispatchAddresses,
      acceptQuote = true,
    } = body;

    if (!ustn || !buyerGtid) {
      return NextResponse.json({ error: "ustn and buyerGtid required" }, { status: 400 });
    }

    // Find the trade
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }
    if (trade.buyerGtid !== buyerGtid) {
      return NextResponse.json(
        { error: "Only the buyer of this trade can submit the buyer submission form" },
        { status: 403 },
      );
    }

    // Validate: at least one notify party + one dispatch address
    if (!notifyParties || !Array.isArray(notifyParties) || notifyParties.length === 0) {
      return NextResponse.json(
        { error: "At least one notify party is required" },
        { status: 400 },
      );
    }
    if (
      !documentDispatchAddresses ||
      !Array.isArray(documentDispatchAddresses) ||
      documentDispatchAddresses.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one document dispatch address is required" },
        { status: 400 },
      );
    }

    // Validate consignee (mandatory unless "same as buyer")
    if (!consigneeSameAsBuyer) {
      if (!consignee || !consignee.name || !consignee.address) {
        return NextResponse.json(
          { error: "Consignee name and address are required (or check 'same as buyer')" },
          { status: 400 },
        );
      }
    }

    // Auto-fill buyer snapshot from Tenant record
    const buyerTenant = trade.buyer;
    const buyerLegalName = buyerTenant?.legalName || buyerGtid;
    const buyerCountry = buyerTenant?.country || "";
    const buyerCity = buyerTenant?.city || "";
    const buyerAddress = buyerTenant?.city
      ? `${buyerTenant.city}, ${buyerTenant.country}`
      : buyerTenant?.country || "";
    const buyerTaxId = buyerTenant?.gtid || "";

    // Resolve consignee — if "same as buyer", use buyer snapshot
    const resolvedConsignee = consigneeSameAsBuyer
      ? {
          name: buyerLegalName,
          address: buyerAddress,
          country: buyerCountry,
          city: buyerCity,
          postalCode: "",
          phone: "",
          email: "",
          taxId: buyerTaxId,
        }
      : consignee;

    // Generate submission ID: BS-YYYYMMDD-NNN
    const today = new Date();
    const ymd = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
    const countToday = await db.buyerSubmission.count({
      where: { submissionId: { startsWith: `BS-${ymd}-` } },
    });
    const submissionId = `BS-${ymd}-${String(countToday + 1).padStart(3, "0")}`;

    // Persist submission
    const submission = await db.buyerSubmission.create({
      data: {
        submissionId,
        tradeId: trade.id,
        ustn,
        buyerGtid,
        buyerLegalName,
        buyerCountry,
        buyerCity,
        buyerAddress,
        buyerTaxId,
        consigneeSameAsBuyer: !!consigneeSameAsBuyer,
        consigneeJson: JSON.stringify(resolvedConsignee),
        notifyPartiesJson: JSON.stringify(notifyParties),
        documentDispatchAddressesJson: JSON.stringify(documentDispatchAddresses),
        status: "SUBMITTED",
      },
    });

    // If acceptQuote=true, also transition the trade status.
    // We use "BUYER_SUBMITTED" as an intermediate status between
    // QUOTE_ACCEPTED and CONTRACT_SIGNED. The buyer has now committed
    // to the quote AND provided the details needed to draft the contract.
    let newStatus = trade.status;
    let newPhase = trade.phase;
    if (acceptQuote) {
      if (trade.status !== "QUOTED" && trade.status !== "QUOTE_ACCEPTED" && trade.status !== "BUYER_SUBMITTED") {
        return NextResponse.json(
          { error: `Trade status is ${trade.status} — cannot submit (must be QUOTED, QUOTE_ACCEPTED, or BUYER_SUBMITTED)` },
          { status: 409 },
        );
      }
      newStatus = "BUYER_SUBMITTED";
      newPhase = 3; // ready for contracting
      await db.trade.update({
        where: { id: trade.id },
        data: { status: newStatus, phase: newPhase },
      });

      // Activity log
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: buyerGtid,
          action: "BUYER_SUBMISSION_SUBMITTED",
          type: "SUCCESS",
          description: `Buyer ${buyerLegalName} submitted consignee + ${notifyParties.length} notify part${notifyParties.length === 1 ? "y" : "ies"} + ${documentDispatchAddresses.length} document dispatch address${documentDispatchAddresses.length === 1 ? "" : "es"} for USTN ${ustn}. Submission ID: ${submissionId}. Trade moved to contracting phase.`,
        },
      });

      // Timeline event
      await db.timelineEvent.create({
        data: {
          tradeId: trade.id,
          phase: 2,
          label: "Buyer Submission Received",
          description: `Buyer submitted consignee, ${notifyParties.length} notify part${notifyParties.length === 1 ? "y" : "ies"}, and ${documentDispatchAddresses.length} document dispatch address${documentDispatchAddresses.length === 1 ? "" : "es"}. Submission ID: ${submissionId}.`,
          actorGtid: buyerGtid,
          completed: true,
          completedAt: new Date(),
        },
      });

      // Smart Inbox to seller (priority 80) — seller now has everything needed
      await db.inboxItem.create({
        data: {
          tenantGtid: trade.sellerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 80,
          title: `Buyer submission received — ${ustn.slice(0, 24)}…`,
          description: `Buyer ${buyerLegalName} submitted consignee (${consigneeSameAsBuyer ? "same as buyer" : resolvedConsignee?.name}), ${notifyParties.length} notify part${notifyParties.length === 1 ? "y" : "ies"}, and ${documentDispatchAddresses.length} document dispatch address${documentDispatchAddresses.length === 1 ? "" : "es"}. All details required to draft the contract are now available. Proceed to contract signing.`,
          ctaLabel: "Sign Contract",
        },
      });

      // Smart Inbox to buyer (priority 70) — proceed to contract signing
      await db.inboxItem.create({
        data: {
          tenantGtid: buyerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 70,
          title: `Submission received — proceed to contract signing`,
          description: `Your buyer submission (${submissionId}) was recorded. The seller has been notified. Proceed to sign the contract with your passkey to advance to contract lock.`,
          ctaLabel: "Sign Contract",
        },
      });
    } else {
      // Just record the submission, no status change
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: buyerGtid,
          action: "BUYER_SUBMISSION_UPDATED",
          type: "INFO",
          description: `Buyer ${buyerLegalName} updated submission ${submissionId} for USTN ${ustn}.`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      submissionId,
      tradeStatus: newStatus,
      tradePhase: newPhase,
      message: acceptQuote
        ? "Buyer submission received and quote accepted — proceed to contract signing"
        : "Buyer submission saved",
      submission: {
        id: submission.id,
        submissionId,
        ustn,
        buyerGtid,
        buyerLegalName,
        buyerCountry,
        consigneeSameAsBuyer: !!consigneeSameAsBuyer,
        consignee: resolvedConsignee,
        notifyParties,
        documentDispatchAddresses,
        status: submission.status,
        createdAt: submission.createdAt,
      },
    });
  } catch (e: any) {
    logger.error("[buyer-submission POST] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/buyer-submission?ustn=...
// Returns the latest buyer submission for a trade (if any).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn query param required" }, { status: 400 });
    }
    const submissions = await db.buyerSubmission.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    if (submissions.length === 0) {
      return NextResponse.json({ ok: true, submission: null, submissions: [] });
    }
    const latest = submissions[0];
    return NextResponse.json({
      ok: true,
      submission: {
        id: latest.id,
        submissionId: latest.submissionId,
        ustn: latest.ustn,
        buyerGtid: latest.buyerGtid,
        buyerLegalName: latest.buyerLegalName,
        buyerCountry: latest.buyerCountry,
        buyerCity: latest.buyerCity,
        buyerAddress: latest.buyerAddress,
        buyerTaxId: latest.buyerTaxId,
        consigneeSameAsBuyer: latest.consigneeSameAsBuyer,
        consignee: latest.consigneeJson ? JSON.parse(latest.consigneeJson) : null,
        notifyParties: latest.notifyPartiesJson ? JSON.parse(latest.notifyPartiesJson) : [],
        documentDispatchAddresses: latest.documentDispatchAddressesJson
          ? JSON.parse(latest.documentDispatchAddressesJson)
          : [],
        status: latest.status,
        createdAt: latest.createdAt,
      },
      submissions: submissions.map((s) => ({
        submissionId: s.submissionId,
        status: s.status,
        createdAt: s.createdAt,
      })),
    });
  } catch (e: any) {
    logger.error("[buyer-submission GET] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
