// 9.1-9.5 — Service Catalogue (by provider)
import { NextRequest, NextResponse } from "next/server";
import { getProviderCatalogue } from "@/lib/sgtx/providers";

export async function GET(req: NextRequest) {
  const providerGtid = req.nextUrl.searchParams.get("providerGtid");
  if (!providerGtid) return NextResponse.json({ error: "providerGtid required" }, { status: 400 });
  const catalogue = await getProviderCatalogue(providerGtid);
  return NextResponse.json({ catalogue, total: catalogue.length });
}
