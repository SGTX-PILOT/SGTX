// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getConstitutionalPolicy, getPolicyVersionHistory } from "@/lib/sgtx/constitutional-policies";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/constitutional-policies/[id]                — policy detail
// GET /api/sgtx/constitutional-policies/[id]?history=true  — policy + version history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "policy id required" }, { status: 400 });
  try {
    const policy = await getConstitutionalPolicy(id);
    if (!policy) return NextResponse.json({ error: "policy not found" }, { status: 404 });

    if (req.nextUrl.searchParams.get("history") === "true") {
      const history = await getPolicyVersionHistory(id);
      return NextResponse.json({ policy, history });
    }
    return NextResponse.json({ policy });
  } catch (e: any) {
    logger.error("[api/constitutional-policies/[id]] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
