import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// GET /api/sgtx/contract/customs-broker-assign?ustn=SGTX-...
// Phase 3.13 — Returns the current customs broker assignments for a trade.
// Used by the Contract Signing screen to show whether each side (buyer/seller)
// has designated their broker yet, and who.
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        buyer: true,
        seller: true,
        customsDecls: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Fetch the broker tenants (if assigned) to surface their legal names
    const [buyerBroker, sellerBroker] = await Promise.all([
      trade.buyerCustomsBrokerGtid
        ? db.tenant.findUnique({ where: { gtid: trade.buyerCustomsBrokerGtid } })
        : Promise.resolve(null),
      trade.sellerCustomsBrokerGtid
        ? db.tenant.findUnique({ where: { gtid: trade.sellerCustomsBrokerGtid } })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      ustn,
      tradeStatus: trade.status,
      buyer: {
        gtid: trade.buyerGtid,
        legalName: trade.buyer?.legalName,
        customsBroker: trade.buyerCustomsBrokerGtid
          ? {
              gtid: trade.buyerCustomsBrokerGtid,
              legalName: buyerBroker?.legalName,
              type: buyerBroker?.type,
              assignedAt: trade.buyerCustomsBrokerAssignedAt,
            }
          : null,
      },
      seller: {
        gtid: trade.sellerGtid,
        legalName: trade.seller?.legalName,
        customsBroker: trade.sellerCustomsBrokerGtid
          ? {
              gtid: trade.sellerCustomsBrokerGtid,
              legalName: sellerBroker?.legalName,
              type: sellerBroker?.type,
              assignedAt: trade.sellerCustomsBrokerAssignedAt,
            }
          : null,
      },
      declarations: trade.customsDecls.map((d) => ({
        id: d.id,
        regime: d.regime,
        status: d.status,
        brokerGtid: d.brokerGtid,
        declarationNo: d.declarationNo,
        dutyUsd: d.dutyUsd,
        createdAt: d.createdAt,
        clearedAt: d.clearedAt,
      })),
    });
  } catch (e: any) {
    logger.error("[contract/customs-broker-assign GET] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sgtx/contract/customs-broker-assign
// Phase 3.13 — Post-Contract Customs Broker Assignment
//
// After the contract is locked (CONTRACT_SIGNED), both buyer and seller must
// designate a licensed customs broker for their respective side of clearance:
//   - Seller side → EXPORT clearance (sellerCustomsBrokerGtid)
//   - Buyer side  → IMPORT clearance (buyerCustomsBrokerGtid)
//
// They may designate either:
//   (a) Their freight forwarder IF that forwarder also holds a customs broker
//       licence (i.e., an LSP tenant that offers customs broker services), OR
//   (b) A dedicated customs broker (CBR tenant).
//
// The designated broker receives:
//   - A Smart Inbox notification containing the USTN
//   - A DRAFT CustomsDeclaration record linked to their GTID
//   - An Activity log entry
//
// The broker can then upload clearance documents later from the CBR portal
// (Documents tab) — this is the primary mechanism while documentation is not
// yet fully digitalised. Licensed customs brokers are required by law in
// virtually every country to file customs declarations, so this assignment
// is mandatory before the trade can advance to IN_EXECUTION.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      role,            // "BUYER" | "SELLER"
      brokerGtid,      // the designated customs broker's GTID
      assignerGtid,    // the buyer/seller making the assignment
      brokerType,      // "DEDICATED_CBR" | "FORWARDER_WITH_CBR" (advisory)
      notes,
    } = body;

    if (!ustn || !role || !brokerGtid) {
      return NextResponse.json(
        { error: "ustn, role, and brokerGtid are required" },
        { status: 400 },
      );
    }
    if (role !== "BUYER" && role !== "SELLER") {
      return NextResponse.json(
        { error: "role must be 'BUYER' or 'SELLER'" },
        { status: 400 },
      );
    }

    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Contract must be locked (CONTRACT_SIGNED or later) before broker
    // assignment is allowed. We also allow IN_EXECUTION / DELIVERED / SETTLED
    // for the case where a broker needs to be re-assigned mid-flow.
    const allowedStatuses = ["CONTRACT_SIGNED", "IN_EXECUTION", "DELIVERED", "SETTLED"];
    if (!allowedStatuses.includes(trade.status)) {
      return NextResponse.json(
        {
          error: `Customs broker assignment requires contract to be locked (CONTRACT_SIGNED). Current status: ${trade.status}`,
        },
        { status: 409 },
      );
    }

    // Verify the designated broker tenant exists and is a CBR (or an LSP that
    // also offers customs broker services). We accept both CBR tenants and
    // LSP tenants (forwarders often dual-role). SHIP / LAB / QC / BANK / GOV
    // tenants are rejected.
    const broker = await db.tenant.findUnique({ where: { gtid: brokerGtid } });
    if (!broker) {
      return NextResponse.json(
        { error: `Broker tenant ${brokerGtid} not found` },
        { status: 404 },
      );
    }
    const allowedBrokerTypes = ["CBR", "LSP"];
    if (!allowedBrokerTypes.includes(broker.type)) {
      return NextResponse.json(
        {
          error: `Tenant ${brokerGtid} is of type ${broker.type}, not a licensed customs broker. Only CBR or LSP (forwarder-with-broker) tenants can be assigned.`,
        },
        { status: 422 },
      );
    }
    if (broker.lifecycleState !== "VERIFIED") {
      return NextResponse.json(
        { error: `Broker tenant ${brokerGtid} is ${broker.lifecycleState}, not VERIFIED.` },
        { status: 422 },
      );
    }

    // Authorization: only the buyer can assign the buyer's broker, only the
    // seller can assign the seller's broker.
    const expectedAssignerGtid = role === "BUYER" ? trade.buyerGtid : trade.sellerGtid;
    if (assignerGtid && assignerGtid !== expectedAssignerGtid) {
      return NextResponse.json(
        {
          error: `Only the ${role.toLowerCase()} of this trade (${expectedAssignerGtid}) may assign the ${role.toLowerCase()} customs broker.`,
        },
        { status: 403 },
      );
    }

    // Persist the assignment
    const updateData: any =
      role === "BUYER"
        ? {
            buyerCustomsBrokerGtid: brokerGtid,
            buyerCustomsBrokerAssignedAt: new Date(),
          }
        : {
            sellerCustomsBrokerGtid: brokerGtid,
            sellerCustomsBrokerAssignedAt: new Date(),
          };
    await db.trade.update({ where: { id: trade.id }, data: updateData });

    const regime = role === "SELLER" ? "EXPORT" : "IMPORT";
    const sideLabel = role === "SELLER" ? "export" : "import";

    // Create a DRAFT CustomsDeclaration linked to this broker (if one doesn't
    // already exist for this trade + broker + regime). The broker will fill
    // in the declaration details + upload supporting documents from the CBR
    // portal once they pick up the job.
    const existingDecl = await db.customsDeclaration.findFirst({
      where: { tradeId: trade.id, brokerGtid, regime },
    });
    let declarationId: string | null = null;
    if (!existingDecl) {
      const decl = await db.customsDeclaration.create({
        data: {
          tradeId: trade.id,
          brokerGtid,
          regime,
          status: "DRAFT",
        },
      });
      declarationId = decl.id;
    } else {
      declarationId = existingDecl.id;
    }

    // Smart Inbox to the customs broker — includes USTN so they can pull
    // the full trade context from the CBR portal.
    const inboxTitle = `${regime} clearance assignment — ${trade.commodity} (${ustn.slice(0, 24)}…)`;
    const inboxDesc =
      `${role === "SELLER" ? "Seller" : "Buyer"} ${role === "SELLER" ? trade.seller?.legalName : trade.buyer?.legalName} has designated you as their licensed customs broker for ${sideLabel} clearance of this shipment.\n\n` +
      `USTN: ${ustn}\n` +
      `Commodity: ${trade.commodity}\n` +
      `Incoterm: ${trade.incoterm}\n` +
      `Route: ${trade.originPort} → ${trade.destPort}\n` +
      `Gross weight: ${trade.grossWeightKg} kg · Net: ${trade.netWeightKg} kg\n` +
      `Trade value: $${trade.tradeValueUsd?.toLocaleString() || "—"} ${trade.currency}\n\n` +
      `Action required: review the trade in your CBR portal, then file the ${regime.toLowerCase()} declaration and upload supporting documents (commercial invoice, packing list, certificate of origin, bill of lading, etc.).${notes ? `\n\nNotes from ${role.toLowerCase()}: ${notes}` : ""}`;
    await db.inboxItem.create({
      data: {
        tenantGtid: brokerGtid,
        tradeId: trade.id,
        category: "NEEDS_APPROVAL",
        priority: 85,
        title: inboxTitle,
        description: inboxDesc,
        ctaLabel: "Open in CBR Portal",
      },
    });

    // Activity log
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: expectedAssignerGtid,
        action: "CUSTOMS_BROKER_ASSIGNED",
        type: "SUCCESS",
        description:
          `${role} assigned customs broker ${broker.legalName} (${brokerGtid}) for ${regime} clearance. ` +
          `Broker type: ${brokerType || (broker.type === "CBR" ? "DEDICATED_CBR" : "FORWARDER_WITH_CBR")}. ` +
          `DRAFT ${regime} declaration ${declarationId ? `(${declarationId.slice(-8)})` : ""} created. ` +
          `Broker notified via Smart Inbox with USTN.${notes ? ` Notes: ${notes}` : ""}`,
      },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      role,
      brokerGtid,
      brokerLegalName: broker.legalName,
      brokerType: broker.type,
      regime,
      declarationId,
      message: `${role === "SELLER" ? "Export" : "Import"} customs broker assigned: ${broker.legalName} (${brokerGtid}). Broker notified via Smart Inbox with USTN. DRAFT ${regime} declaration created.`,
    });
  } catch (e: any) {
    logger.error("[contract/customs-broker-assign] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
