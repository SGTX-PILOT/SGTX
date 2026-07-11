import { NextResponse } from "next/server";
import { getAllPesticideDatabaseStats } from "@/lib/sgtx/compliance/multi-region-pesticides";
import { REGION_META } from "@/lib/sgtx/compliance/regional-pesticides";
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getAllPesticideDatabaseStats();
  return NextResponse.json({
    ok: true,
    ...stats,
    description: "SGTX Brain AI multi-region pesticide MRL system. 6 sources: EU + Codex + USA (EPA) + Japan (MHLW) + Australia (APVMA) + Canada (PMRA). The strictest MRL applies per WTO SPS Agreement Article 3.",
    regions: REGION_META,
  });
}
