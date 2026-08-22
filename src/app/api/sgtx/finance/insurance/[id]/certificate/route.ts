// @ts-nocheck
// §6 Insurance — issue certificate. Body: { certificateNumber }
// POST /api/sgtx/finance/insurance/[id]/certificate
import { NextResponse } from "next/server";
import { issueCertificate } from "@/lib/sgtx/insurance-lifecycle";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.certificateNumber) {
      return NextResponse.json(
        { error: "certificateNumber required" },
        { status: 400 },
      );
    }
    const lifecycle = await issueCertificate(id, body.certificateNumber);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/certificate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
