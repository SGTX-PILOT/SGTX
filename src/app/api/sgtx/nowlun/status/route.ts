import { NextResponse } from "next/server";
import { getNowlunStats, getNowlunBlogs } from "@/lib/sgtx/compliance/nowlun-integration";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET() {
  const [rates, ports, transit] = await Promise.all([
    db.nowlunFreightRate.count(),
    db.nowlunPortStatus.count(),
    db.nowlunTransitData.count(),
  ]);
  const suspended = await db.nowlunPortStatus.count({ where: { status: "SUSPENDED" } });
  const congested = await db.nowlunPortStatus.count({ where: { status: "CONGESTED" } });
  const normal = await db.nowlunPortStatus.count({ where: { status: "NORMAL" } });
  return NextResponse.json({
    ok: true,
    database: { rates, ports, transit, portStatus: { normal, congested, suspended } },
    platform: getNowlunStats(),
    blogs: getNowlunBlogs(),
    source: "https://nowlun.com/en",
    linkedSgtxFeatures: [
      "freight-pricing (src/lib/sgtx/ai/freight-pricing.ts)",
      "transit-time (src/lib/sgtx/ai/transit-time.ts)",
      "force-majeure (src/lib/sgtx/compliance/force-majeure.ts)",
      "route-optimization (src/lib/sgtx/ai/brain-intelligence.ts)",
      "market-intelligence (src/lib/sgtx/ai/brain.ts)",
    ],
  });
}
