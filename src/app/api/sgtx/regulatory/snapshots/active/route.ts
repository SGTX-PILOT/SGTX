// @ts-nocheck
// §5 Snapshot Versions — GET active version for a jurisdiction
// GET /api/sgtx/regulatory/snapshots/active?jurisdictionCode=X
import { NextResponse } from "next/server";
import { getActiveVersion } from "@/lib/sgtx/snapshot-versioning";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode");
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const version = await getActiveVersion(jurisdictionCode);
    if (!version) {
      return NextResponse.json(
        { error: "no active snapshot version for this jurisdiction" },
        { status: 404 },
      );
    }
    return NextResponse.json({ version });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/snapshots/active] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
