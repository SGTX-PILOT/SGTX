// @ts-nocheck
// §5 Snapshot Versions — POST activate version (mark ACTIVE + supersede previous)
// POST /api/sgtx/regulatory/snapshots/[id]/activate
import { NextResponse } from "next/server";
import { activateVersion } from "@/lib/sgtx/snapshot-versioning";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const version = await activateVersion(id);
    if (!version) {
      return NextResponse.json(
        { error: "version not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ version });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/snapshots/[id]/activate] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
