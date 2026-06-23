// GET /api/sgtx/contracts/[contractId]
// Returns the full contract: metadata, all 30 clauses, JSON, HTML, signatures.
import { NextRequest, NextResponse } from "next/server";
import { freshDb } from "@/lib/db-fresh";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await params;

    const contract = await freshDb.tradeContract.findUnique({
      where: { contractId },
      include: {
        trade: {
          include: {
            buyer: true,
            seller: true,
            shipments: true,
            containers: true,
            documents: true,
            documentRequirements: true,
            labTests: true,
            qcInspections: true,
            customsDecls: true,
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: `Contract ${contractId} not found` },
        { status: 404 },
      );
    }

    // Parse JSON representation
    let contractJson: any = null;
    if (contract.contractJson) {
      try {
        contractJson = JSON.parse(contract.contractJson);
      } catch {
        contractJson = null;
      }
    }

    // Parse signers
    let signedBy: string[] = [];
    if (contract.signedBy) {
      try {
        signedBy = JSON.parse(contract.signedBy);
      } catch {
        signedBy = [];
      }
    }

    // Fetch all QES signatures recorded against this contract's USTN
    const qesSignatures = await freshDb.qesSignature.findMany({
      where: { ustn: contract.ustn, documentType: "CONTRACT" },
      orderBy: { createdAt: "asc" },
    });

    // Activity entries related to this contract
    const activities = await freshDb.activity.findMany({
      where: {
        tradeId: contract.tradeId,
        action: { in: ["CONTRACT_GENERATED", "CONTRACT_AMENDED", "SIGNED_CONTRACT", "CONTRACT_LOCKED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // All versions of this contract (audit trail)
    const allVersions = await freshDb.tradeContract.findMany({
      where: { tradeId: contract.tradeId },
      orderBy: { contractVersion: "asc" },
      select: {
        contractId: true,
        contractVersion: true,
        status: true,
        governingLaw: true,
        arbitrationClause: true,
        hashSha256: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      contract: {
        id: contract.id,
        contractId: contract.contractId,
        ustn: contract.ustn,
        tradeId: contract.tradeId,
        contractVersion: contract.contractVersion,
        contractType: contract.contractType,
        governingLaw: contract.governingLaw,
        arbitrationClause: contract.arbitrationClause,
        arbitrationSeat: contract.arbitrationSeat,
        language: contract.language,
        hashSha256: contract.hashSha256,
        signedBy,
        signedAt: contract.signedAt,
        status: contract.status,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
      },
      clauses: contractJson?.clauses ?? [],
      contractJson,
      contractHtml: contract.contractHtml,
      trade: contract.trade,
      signatures: qesSignatures,
      activities,
      versionHistory: allVersions,
    });
  } catch (e: any) {
    console.error("[contracts/get] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch contract" },
      { status: 500 },
    );
  }
}
