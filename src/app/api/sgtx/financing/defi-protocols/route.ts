// 3B.5.12.1 — DeFi Protocols registry with risk scores
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { defiProtocolActionability } from "@/lib/sgtx/financing";

export async function GET() {
  const protocols = await db.deFiProtocol.findMany({ orderBy: { riskScore: "desc" } });
  const annotated = protocols.map((p) => ({
    ...p,
    actionability: defiProtocolActionability(p.riskScore),
  }));
  return NextResponse.json({ protocols: annotated });
}
