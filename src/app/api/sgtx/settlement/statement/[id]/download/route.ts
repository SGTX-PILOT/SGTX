// 3B.7.6 — Statement Download (PDF/CSV/JSON)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateStatementDownload } from "@/lib/sgtx/settlement";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") || "json";

  const statement = await db.monthlyStatement.findUnique({ where: { id } });
  if (!statement) return NextResponse.json({ error: "Statement not found" }, { status: 404 });

  const content = generateStatementDownload(statement, format as "pdf" | "csv" | "json");

  if (format === "json") {
    return new NextResponse(content, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${statement.statementId}.json"` } });
  }
  if (format === "csv") {
    return new NextResponse(content, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${statement.statementId}.csv"` } });
  }
  // PDF (text placeholder for now)
  return new NextResponse(content, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${statement.statementId}.pdf"` } });
}
