// @ts-nocheck
// §1 Country Activation — GET 20-step checklist (renders in admin portal)
// GET /api/sgtx/regulatory/activation/[id]/checklist
import { NextResponse } from "next/server";
import { getActivationChecklist } from "@/lib/sgtx/country-activation";
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
    const checklist = await getActivationChecklist(id);
    if (!checklist) {
      return NextResponse.json(
        { error: "workflow not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ checklist });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/[id]/checklist] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
