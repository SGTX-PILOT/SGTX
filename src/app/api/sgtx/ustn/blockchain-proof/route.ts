import { NextRequest, NextResponse } from "next/server";
import { getBlockchainProof } from "@/lib/sgtx/ustn";

// GET /api/sgtx/ustn/blockchain-proof?ustn=...  (Part 3.9)
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const result = await getBlockchainProof(ustn);
  if (result.error) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
