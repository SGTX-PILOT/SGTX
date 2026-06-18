import { NextRequest, NextResponse } from "next/server";
import { signDocument, type SignatureType } from "@/lib/sgtx/governor/constitutional-addons";

// POST /api/sgtx/qes/sign  { signerGtid, signerName, documentHash, ustn?, tradeValueUsd?, forceType? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.signerGtid || !body.documentHash) return NextResponse.json({ error: "signerGtid + documentHash required" }, { status: 400 });
  const result = await signDocument(body);
  return NextResponse.json(result);
}
