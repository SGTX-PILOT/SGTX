import { NextRequest, NextResponse } from "next/server";
import { confirmRollOn } from "@/lib/sgtx/tcn/roro-manifest";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * POST /api/sgtx/tcn/roro-manifest/roll-on
 *
 * Body: { scheduleId, ustn, confirmedBy? }
 *
 * Confirms roll-on of all cargo items in the manifest for the given USTN onto
 * the specified vessel schedule. Two-phase commit:
 *   1. Mark items as ROLLED_ON (vehicle/trailer on the vessel)
 *   2. Mark items as SECURED (lashed + chocked per CSS Code)
 * Also stamps rollOnAt timestamp and updates manifest status to ROLLED_ON.
 */
export async function POST(req: NextRequest) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const { scheduleId, ustn, confirmedBy } = body as {
      scheduleId?: string;
      ustn?: string;
      confirmedBy?: string;
    };
    if (!scheduleId) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const result = await confirmRollOn(scheduleId, ustn, confirmedBy);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status = /not found|already performed|must be performed|cannot/i.test(e.message) ? 400 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
