// @ts-nocheck
// GET /api/sgtx/road/adapters — list jurisdiction adapters.
// Reads from the JurisdictionAdapter Prisma table (seeded lazily on first call).
import { NextResponse } from "next/server";
import {
  listJurisdictionAdapters,
  seedJurisdictionAdapters,
} from "@/lib/sgtx/road-corridor/jurisdiction-adapter";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Ensure the table is seeded (idempotent) before listing
    await seedJurisdictionAdapters().catch((e: any) => {
      logger.warn("[api/road/adapters] seed failed (continuing)", {
        error: e?.message,
      });
    });
    const adapters = await listJurisdictionAdapters();
    return NextResponse.json({ adapters, count: adapters.length });
  } catch (err: any) {
    logger.error("[api/road/adapters] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
