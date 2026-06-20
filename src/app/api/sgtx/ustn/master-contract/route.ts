// Part 3.6 — Master Contract aggregation endpoint.
// GET /api/sgtx/ustn/master-contract?masterContractId=MC-...
// Returns all shipments (Trade rows) grouped under a master contract.
import { NextRequest, NextResponse } from "next/server";
import { getMasterContractShipments } from "@/lib/sgtx/ustn";

export async function GET(req: NextRequest) {
  const masterContractId = req.nextUrl.searchParams.get("masterContractId");
  if (!masterContractId) {
    return NextResponse.json(
      { error: "masterContractId query parameter required (format: MC-{buyer6}-{seller6}-{timestamp})" },
      { status: 400 }
    );
  }
  // Light format validation — must start with MC- and contain at least one hyphenated suffix pair.
  if (!/^MC-[A-Z0-9]{6}-[A-Z0-9]{6}-\d{14}$/.test(masterContractId)) {
    return NextResponse.json(
      { error: "Invalid masterContractId format. Expected: MC-{buyer6}-{seller6}-{YYYYMMDDHHMMSS}" },
      { status: 400 }
    );
  }
  const result = await getMasterContractShipments(masterContractId);
  if (result.shipmentCount === 0) {
    return NextResponse.json(
      { error: "No shipments found for this master contract", masterContractId, shipmentCount: 0, shipments: [] },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}
