import { NextRequest, NextResponse } from "next/server";
import { getRequiredDocuments } from "@/lib/sgtx/grire";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const country = url.searchParams.get("country");
  const hsCode = url.searchParams.get("hsCode") || undefined;
  if (!country) return NextResponse.json({ ok: false, error: "country required" }, { status: 400 });
  const docs = await getRequiredDocuments(country, hsCode);
  return NextResponse.json({ ok: true, country, hsCode: hsCode || "all", documents: docs, count: docs.length });
}
