// POST /api/sgtx/contracts/generate
// Generates a full, court-ready international trade contract with 30 clauses
// compliant with CISG, Incoterms® 2020, UCP 600, ISM Code, local laws and
// international arbitration rules.
// Body: { ustn: string, governingLaw?, arbitrationClause?, arbitrationSeat?, language? }
// Returns: { contractId, contractHtml, contractJson, clauses, metadata, persisted }
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { freshDb } from "@/lib/db-fresh";
import { generateContract, type GenerateContractInput } from "@/lib/sgtx/contracts/generator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, governingLaw, arbitrationClause, arbitrationSeat, language } = body;
    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json({ error: "ustn is required" }, { status: 400 });
    }

    const input: GenerateContractInput = {
      ustn,
      governingLaw,
      arbitrationClause,
      arbitrationSeat,
      language,
    };

    const generated = await generateContract(input);

    // Persist as a new TradeContract row. We mark previous GENERATED/SENT
    // contracts for the same trade as AMENDED so the latest is always the
    // current contract.
    await freshDb.tradeContract.updateMany({
      where: { tradeId: generated.tradeId, status: { in: ["GENERATED", "SENT"] } },
      data: { status: "AMENDED" },
    });

    const persisted = await freshDb.tradeContract.create({
      data: {
        contractId: generated.contractId,
        tradeId: generated.tradeId,
        ustn: generated.ustn,
        contractVersion: generated.contractVersion,
        contractType: generated.contractType,
        governingLaw: generated.governingLaw,
        arbitrationClause: generated.arbitrationClause,
        arbitrationSeat: generated.arbitrationSeat,
        language: generated.language,
        contractJson: generated.contractJson,
        contractHtml: generated.contractHtml,
        hashSha256: generated.hashSha256,
        status: "GENERATED",
      },
    });

    // Activity log
    await freshDb.activity.create({
      data: {
        tradeId: generated.tradeId,
        action: "CONTRACT_GENERATED",
        type: "SUCCESS",
        description: `International Trade Contract ${generated.contractId} v${generated.contractVersion} generated under USTN ${generated.ustn}. Type: ${generated.contractType}. Governing law: ${generated.governingLaw}. Arbitration: ${generated.arbitrationClause} (${generated.arbitrationSeat}). 30 clauses. SHA-256: ${generated.hashSha256.slice(0, 24)}…`,
      },
    });

    // Timeline event
    await freshDb.timelineEvent.create({
      data: {
        tradeId: generated.tradeId,
        phase: 3,
        label: `Contract v${generated.contractVersion} generated`,
        description: `${generated.contractId} — ${generated.contractType.replace("_CONTRACT", "")} — ${generated.governingLaw} / ${generated.arbitrationClause}`,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Smart Inbox to both parties
    await Promise.all([
      freshDb.inboxItem.create({
        data: {
          tenantGtid: generated.metadata.seller.gtid,
          tradeId: generated.tradeId,
          category: "NEGOTIATION",
          priority: 80,
          title: `Contract generated — ${generated.contractId}`,
          description: `International Sale Contract v${generated.contractVersion} (${generated.contractType.replace("_CONTRACT", "")}) has been generated under USTN ${generated.ustn}. Governing law: ${generated.governingLaw}. Arbitration: ${generated.arbitrationClause} (${generated.arbitrationSeat}). Review and proceed to QES signature.`,
          ctaLabel: "Review Contract",
        },
      }),
      freshDb.inboxItem.create({
        data: {
          tenantGtid: generated.metadata.buyer.gtid,
          tradeId: generated.tradeId,
          category: "NEGOTIATION",
          priority: 80,
          title: `Contract generated — ${generated.contractId}`,
          description: `International Sale Contract v${generated.contractVersion} (${generated.contractType.replace("_CONTRACT", "")}) has been generated under USTN ${generated.ustn}. Governing law: ${generated.governingLaw}. Arbitration: ${generated.arbitrationClause} (${generated.arbitrationSeat}). Review and proceed to QES signature.`,
          ctaLabel: "Review Contract",
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      contractId: generated.contractId,
      ustn: generated.ustn,
      tradeId: generated.tradeId,
      contractVersion: generated.contractVersion,
      contractType: generated.contractType,
      governingLaw: generated.governingLaw,
      arbitrationClause: generated.arbitrationClause,
      arbitrationSeat: generated.arbitrationSeat,
      language: generated.language,
      hashSha256: generated.hashSha256,
      contractHtml: generated.contractHtml,
      contractJson: generated.contractJson,
      clauses: generated.clauses,
      metadata: generated.metadata,
      persistedId: persisted.id,
    });
  } catch (e: any) {
    logger.error("[contracts/generate] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to generate contract" },
      { status: 500 },
    );
  }
}
