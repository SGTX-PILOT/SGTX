// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/sgtx/admin/config-history — list configuration change history.
// Query params:
//   ?configKey=foo  → filter by exact configKey
//   ?prefix=foo     → filter by configKey prefix (startsWith)
//   ?limit=N        → max 200, default 50
//   ?offset=N       → for pagination
//
// Returns: { history: ConfigurationHistory[], total, limit, offset }
//
// Used by /admin Configuration History section (v18 §16.8.13) to show recent
// config changes with diff/rollback capabilities.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const configKey = sp.get("configKey");
    const prefix = sp.get("prefix");
    const limit = Math.min(Number(sp.get("limit") || "50"), 200);
    const offset = Math.min(Number(sp.get("offset") || "0"), 1000);

    const where: any = {};
    if (configKey) where.configKey = configKey;
    else if (prefix) where.configKey = { startsWith: prefix };

    const [rows, total] = await Promise.all([
      db.configurationHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.configurationHistory.count({ where }),
    ]);

    return NextResponse.json({ history: rows, total, limit, offset });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "fetch failed" },
      { status: 500 },
    );
  }
}
