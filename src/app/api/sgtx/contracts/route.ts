// GET /api/sgtx/contracts?ustn=SGTX-...
// Lists all contracts (all versions) for a given trade USTN.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { freshDb } from "@/lib/db-fresh";

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn query parameter required" }, { status: 400 });
    }

    const contracts = await freshDb.tradeContract.findMany({
      where: { ustn },
      orderBy: [{ contractVersion: "desc" }],
      select: {
        id: true,
        contractId: true,
        ustn: true,
        tradeId: true,
        contractVersion: true,
        contractType: true,
        governingLaw: true,
        arbitrationClause: true,
        arbitrationSeat: true,
        language: true,
        hashSha256: true,
        signedBy: true,
        signedAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (contracts.length === 0) {
      return NextResponse.json(
        { ustn, contracts: [], message: "No contracts found for this USTN." },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ustn,
      count: contracts.length,
      latestVersion: contracts[0]?.contractVersion ?? 0,
      currentContractId: contracts.find((c) => c.status !== "AMENDED")?.contractId ?? contracts[0]?.contractId,
      contracts,
    });
  } catch (e: any) {
    logger.error("[contracts/list] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to list contracts" }, { status: 500 });
  }
}
