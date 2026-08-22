// @ts-nocheck
// §5 Snapshot Versions — list (GET) + create (POST)
// GET  /api/sgtx/regulatory/snapshots?jurisdictionCode=X&changeId=Y&status=Z
//      → listSnapshotVersions
// POST /api/sgtx/regulatory/snapshots  body: CreateSnapshotInput  → createSnapshotVersion
import { NextResponse } from "next/server";
import {
  listSnapshotVersions,
  createSnapshotVersion,
} from "@/lib/sgtx/snapshot-versioning";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;
    const changeId = url.searchParams.get("changeId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (jurisdictionCode) filters.jurisdictionCode = jurisdictionCode;
    if (changeId) filters.changeId = changeId;
    if (status) filters.status = status;
    const versions = await listSnapshotVersions(filters);
    return NextResponse.json({ versions });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/snapshots] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.jurisdictionCode || typeof body.jurisdictionCode !== "string") {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const version = await createSnapshotVersion(body);
    return NextResponse.json({ version });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/snapshots] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
