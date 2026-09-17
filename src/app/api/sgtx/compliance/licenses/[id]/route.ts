// @ts-nocheck
// SGTX Phase 3 §1 — License Engine API
//   GET /api/sgtx/compliance/licenses/[id] — fetch a single TradeLicense by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getTradeLicense } from "@/lib/sgtx/license";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const license = await getTradeLicense(id);
    if (!license) {
      return NextResponse.json(
        { error: "trade license not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ license });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/licenses/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
