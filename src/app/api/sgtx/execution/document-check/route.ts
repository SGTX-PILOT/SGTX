// 3B.6.1 — Document Requirements Check (RIA-driven checklist)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkDocumentRequirements } from "@/lib/sgtx/execution";
import { documentValidation } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const includeAi = req.nextUrl.searchParams.get("includeAi") === "true";
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

  const result = await checkDocumentRequirements(ustn);
  const trade = await db.trade.findUnique({ where: { ustn }, include: { documents: true } });

  let aiValidation: any = null;
  if (includeAi && trade) {
    try {
      const r = await documentValidation({
        ustn, commodity: trade.commodity, originCountry: trade.originCountry, destCountry: trade.destCountry,
        documents: trade.documents.map(d => ({ type: d.type, status: d.status, title: d.title })),
      });
      try { aiValidation = JSON.parse(r.content); } catch { aiValidation = { raw: r.content }; }
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ...result, aiValidation });
}
