// 7.5.4 — Reconciliation Files (MT940, ISO 20022 camt.053)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateMt940, generateCamt053 } from "@/lib/sgtx/government";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const format = req.nextUrl.searchParams.get("format") || "mt940";
  const instructions = await db.bankSettlementInstruction.findMany({ where: { status: { in: ["SETTLED", "PENDING"] } }, orderBy: { createdAt: "desc" } });

  if (format === "camt053" || format === "iso20022") {
    const xml = generateCamt053(instructions, date);
    return new NextResponse(xml, { headers: { "Content-Type": "application/xml", "Content-Disposition": `attachment; filename="reconciliation-${date}.xml"` } });
  }
  // MT940 default
  const mt940 = generateMt940(instructions, date);
  return new NextResponse(mt940, { headers: { "Content-Type": "text/plain", "Content-Disposition": `attachment; filename="reconciliation-${date}.sta"` } });
}
