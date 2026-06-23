import { NextRequest, NextResponse } from "next/server";
import { seedCorridorNetwork } from "@/lib/sgtx/corridor";

// POST /api/sgtx/corridor/seed
// Seeds 3 RoRo corridors (EGY-ITA, EGY-KSA, EGY-UAE) with full
// passport, port digital twin, compliance gate, government node, and
// analytics data. Idempotent — running twice will upsert, not duplicate.
export async function POST(_req: NextRequest) {
  try {
    const result = await seedCorridorNetwork();
    return NextResponse.json({
      ok: true,
      message: "Trade Corridor Network seed complete (idempotent upsert).",
      seeded: result,
      corridors: [
        { code: "EGY-ITA-RORO-001", name: "Egypt–Italy RoRo (Mediterranean)", ports: "Damietta → Trieste" },
        { code: "EGY-KSA-RORO-001", name: "Egypt–Saudi Arabia RoRo (Red Sea)", ports: "Safaga → Jeddah" },
        { code: "EGY-UAE-RORO-001", name: "Egypt–UAE RoRo (Red Sea / Gulf)", ports: "Damietta → Jebel Ali" },
      ],
    });
  } catch (e: any) {
    console.error("[corridor/seed]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
