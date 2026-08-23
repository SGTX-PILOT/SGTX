// @ts-nocheck
// §67 Obligation Graph — add a dependency edge from [id] -> dependsOnId
// POST /api/sgtx/constitutional/obligations/[id]/dependency  body: { dependsOnId, type? }
import { NextResponse } from "next/server";
import { addDependency } from "@/lib/sgtx/obligation-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "obligationId required" },
        { status: 400 },
      );
    }
    const body = await req.json().catch(() => ({}));
    const { dependsOnId, type } = body || {};
    if (!dependsOnId) {
      return NextResponse.json(
        { error: "dependsOnId required" },
        { status: 400 },
      );
    }
    const ok = await addDependency(id, String(dependsOnId), type || "PREREQUISITE");
    if (!ok) {
      return NextResponse.json(
        { error: "addDependency failed — see logs (cross-USTN or missing obligation)" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, obligationId: id, dependsOnId });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/obligations/[id]/dependency] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
