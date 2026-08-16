// GET /api/sgtx/compliance/ofac/screen?name=NAME[&aliases=alias1,alias2]
import { NextRequest, NextResponse } from "next/server";
import { screenAgainstOfac } from "@/lib/sgtx/compliance/ofac-sdn-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name") ?? "";
    const aliasesRaw = searchParams.get("aliases") ?? "";
    const aliases = aliasesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name) {
      return NextResponse.json(
        { error: "Required: ?name=NAME[&aliases=A1,A2]" },
        { status: 400 },
      );
    }
    const result = await screenAgainstOfac(name, aliases);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("ofac screen GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
