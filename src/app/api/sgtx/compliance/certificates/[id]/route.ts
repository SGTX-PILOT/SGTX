// @ts-nocheck
// SGTX Phase 3 §3 — Certificate Engine API
//   GET /api/sgtx/compliance/certificates/[id] — fetch a single RegulatoryCertificate by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRegulatoryCertificate } from "@/lib/sgtx/certificate";

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
    const certificate = await getRegulatoryCertificate(id);
    if (!certificate) {
      return NextResponse.json(
        { error: "regulatory certificate not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ certificate });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/certificates/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
