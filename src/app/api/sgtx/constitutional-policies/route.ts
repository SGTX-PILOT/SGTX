// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getConstitutionalPolicies } from "@/lib/sgtx/constitutional-policies";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/constitutional-policies — list all OPA Rego + WasmEdge modules.
//   → { policies: [{ id, name, type, version, active, content, tier }], count }
export async function GET() {
  try {
    const result = await getConstitutionalPolicies();
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/constitutional-policies] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
