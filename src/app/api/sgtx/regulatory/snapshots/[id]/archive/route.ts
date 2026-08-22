// @ts-nocheck
// §5 Snapshot Versions — POST archive version (status=ARCHIVED)
// POST /api/sgtx/regulatory/snapshots/[id]/archive
import { NextResponse } from "next/server";
import { archiveVersion } from "@/lib/sgtx/snapshot-versioning";
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
    const version = await archiveVersion(id);
    if (!version) {
      return NextResponse.json(
        { error: "version not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ version });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/snapshots/[id]/archive] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
