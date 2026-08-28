// @ts-nocheck
// POST /api/sgtx/compliance/sanctions-screen
// Body: { "name": "...", "type": "person|company|vessel|country", "aliases"?: [...], "imo"?: "..." }
//
// Returns the unified screening result for the entity. For country queries,
// the name may be a country name or ISO2 code (e.g. "IR", "Iran").
import { NextRequest, NextResponse } from "next/server";
import { screenEntity, EntityType } from "@/lib/sgtx/compliance/sanctions-screening-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const type = String(body?.type ?? "person").trim() as EntityType;
    const aliases = Array.isArray(body?.aliases) ? body.aliases.map(String) : [];
    const imo = body?.imo ? String(body.imo) : undefined;
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Required body: { name, type: 'person'|'company'|'vessel'|'country' }" },
        { status: 400 },
      );
    }
    const validTypes: EntityType[] = ["person", "company", "vessel", "country"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { ok: false, error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }
    const result = await screenEntity(name, type, { aliases, imo });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("sanctions-screen POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
