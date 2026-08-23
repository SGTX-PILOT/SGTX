// @ts-nocheck
// §91 Recovery Vault — GET a vault entry by its row id
// GET /api/sgtx/constitutional/recovery-vault/[id]
import { NextResponse } from "next/server";
import { getEntry } from "@/lib/sgtx/recovery-vault";
import { logger } from "@/lib/sgtx/logger";

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
    const entry = await getEntry(id);
    if (!entry) {
      return NextResponse.json(
        { error: "vault entry not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/constitutional/recovery-vault/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
