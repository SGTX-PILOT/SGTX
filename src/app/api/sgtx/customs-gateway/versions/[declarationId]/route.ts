// @ts-nocheck
/**
 * SGTX Customs Gateway — Declaration Version History API
 * GET /api/sgtx/customs-gateway/versions/<declarationId>
 *   Returns: DeclarationVersion[] (oldest first), full provenance
 * GET /api/sgtx/customs-gateway/versions/<declarationId>?latest=1
 *   Returns: the most recent DeclarationVersion
 * GET /api/sgtx/customs-gateway/versions/<declarationId>?compare=v1:v2
 *   Returns: structured diff between two versions
 *
 * IMUTABLE: versions are never modified or deleted. Every version is a
 * legally material record with full provenance (createdBy, reason, hash chain).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getVersionHistory,
  getLatestVersion,
  compareVersions,
} from "@/lib/sgtx/customs-gateway/declaration-versioning";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ declarationId: string }> },
) {
  try {
    const { declarationId } = await params;
    if (!declarationId) {
      return NextResponse.json(
        { ok: false, error: "declarationId is required in the path" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const latest = searchParams.get("latest");
    const compare = searchParams.get("compare");

    if (latest === "1") {
      const version = await getLatestVersion(declarationId);
      if (!version) {
        return NextResponse.json(
          { ok: false, error: "no versions found for this declaration" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, declarationId, latest: version });
    }

    if (compare) {
      // Format: "v1:v2" or "1:2"
      const parts = compare.split(":").map((s) => parseInt(s.replace(/^v/i, ""), 10));
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
        return NextResponse.json(
          { ok: false, error: "invalid compare format — expected 'v1:v2' or '1:2'" },
          { status: 400 },
        );
      }
      const diff = await compareVersions(declarationId, parts[0], parts[1]);
      return NextResponse.json({
        ok: true,
        declarationId,
        version1: parts[0],
        version2: parts[1],
        diff,
      });
    }

    const history = await getVersionHistory(declarationId);
    return NextResponse.json({
      ok: true,
      declarationId,
      count: history.length,
      versions: history,
      immutable: true,
      note: "Versions are immutable — every version is a legally material record with full provenance.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/versions] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
