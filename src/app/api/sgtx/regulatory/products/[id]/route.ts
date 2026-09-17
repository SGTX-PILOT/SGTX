// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Product Regulatory Profile API
//   GET /api/sgtx/regulatory/products/[id] — fetch a single profile by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getProductProfileById } from "@/lib/sgtx/classification";

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
    const profile = await getProductProfileById(id);
    if (!profile) {
      return NextResponse.json(
        { error: "product profile not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ profile });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/products/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
