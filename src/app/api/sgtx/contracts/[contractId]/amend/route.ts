// POST /api/sgtx/contracts/[contractId]/amend
// Creates an amended version (v2, v3, ...) of an existing contract.
// Body: { governingLaw?, arbitrationClause?, arbitrationSeat?, language? }
// Returns the new generated amended contract (persisted).
import { NextRequest, NextResponse } from "next/server";
import { freshDb } from "@/lib/db-fresh";
import {
  amendContract,
  type GoverningLaw,
  type ArbitrationRules,
  type ArbitrationSeat,
  type ContractLanguage,
} from "@/lib/sgtx/contracts/generator";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await params;
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const overrides: {
      governingLaw?: GoverningLaw;
      arbitrationClause?: ArbitrationRules;
      arbitrationSeat?: ArbitrationSeat;
      language?: ContractLanguage;
    } = {};
    if (body.governingLaw) overrides.governingLaw = body.governingLaw;
    if (body.arbitrationClause) overrides.arbitrationClause = body.arbitrationClause;
    if (body.arbitrationSeat) overrides.arbitrationSeat = body.arbitrationSeat;
    if (body.language) overrides.language = body.language;

    const existing = await freshDb.tradeContract.findUnique({
      where: { contractId },
      select: { contractId: true, ustn: true, status: true, tradeId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: `Contract ${contractId} not found` },
        { status: 404 },
      );
    }

    const amended = await amendContract(contractId, overrides);

    // Mark the existing contract as AMENDED
    await freshDb.tradeContract.update({
      where: { contractId },
      data: { status: "AMENDED" },
    });

    // Persist the new amended version
    const persisted = await freshDb.tradeContract.create({
      data: {
        contractId: amended.contractId,
        tradeId: amended.tradeId,
        ustn: amended.ustn,
        contractVersion: amended.contractVersion,
        contractType: amended.contractType,
        governingLaw: amended.governingLaw,
        arbitrationClause: amended.arbitrationClause,
        arbitrationSeat: amended.arbitrationSeat,
        language: amended.language,
        contractJson: amended.contractJson,
        contractHtml: amended.contractHtml,
        hashSha256: amended.hashSha256,
        status: "GENERATED",
      },
    });

    await freshDb.activity.create({
      data: {
        tradeId: amended.tradeId,
        action: "CONTRACT_AMENDED",
        type: "INFO",
        description: `Contract ${contractId} (v${amended.contractVersion - 1}) amended to ${amended.contractId} (v${amended.contractVersion}). Changes: ${Object.keys(overrides).length === 0 ? "no overrides — re-issued" : Object.keys(overrides).join(", ")}. New SHA-256: ${amended.hashSha256.slice(0, 24)}…`,
      },
    });

    await freshDb.timelineEvent.create({
      data: {
        tradeId: amended.tradeId,
        phase: 3,
        label: `Contract amended to v${amended.contractVersion}`,
        description: `${amended.contractId} — supersedes ${contractId}`,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Notify both parties
    await Promise.all([
      freshDb.inboxItem.create({
        data: {
          tenantGtid: amended.metadata.seller.gtid,
          tradeId: amended.tradeId,
          category: "NEGOTIATION",
          priority: 85,
          title: `Contract amended — ${amended.contractId}`,
          description: `Contract ${contractId} (v${amended.contractVersion - 1}) has been amended. New version: ${amended.contractId} (v${amended.contractVersion}). ${Object.keys(overrides).length === 0 ? "Re-issued." : `Overrides: ${Object.keys(overrides).join(", ")}.`} Please review and re-sign.`,
          ctaLabel: "Review Amended Contract",
        },
      }),
      freshDb.inboxItem.create({
        data: {
          tenantGtid: amended.metadata.buyer.gtid,
          tradeId: amended.tradeId,
          category: "NEGOTIATION",
          priority: 85,
          title: `Contract amended — ${amended.contractId}`,
          description: `Contract ${contractId} (v${amended.contractVersion - 1}) has been amended. New version: ${amended.contractId} (v${amended.contractVersion}). ${Object.keys(overrides).length === 0 ? "Re-issued." : `Overrides: ${Object.keys(overrides).join(", ")}.`} Please review and re-sign.`,
          ctaLabel: "Review Amended Contract",
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      amended: true,
      previousContractId: contractId,
      newContractId: amended.contractId,
      contractVersion: amended.contractVersion,
      contractType: amended.contractType,
      governingLaw: amended.governingLaw,
      arbitrationClause: amended.arbitrationClause,
      arbitrationSeat: amended.arbitrationSeat,
      language: amended.language,
      hashSha256: amended.hashSha256,
      contractHtml: amended.contractHtml,
      contractJson: amended.contractJson,
      clauses: amended.clauses,
      metadata: amended.metadata,
      persistedId: persisted.id,
    });
  } catch (e: any) {
    console.error("[contracts/amend] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to amend contract" },
      { status: 500 },
    );
  }
}
