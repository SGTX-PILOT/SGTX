// @ts-nocheck
// §6 Trade Closure — link a SEALED evidence package to the closure state.
// Body: { ustn, packageId }
// POST /api/sgtx/completion/closure/link-evidence
import { NextResponse } from "next/server";
import { linkEvidencePackage } from "@/lib/sgtx/trade-closure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body.packageId) {
      return NextResponse.json(
        { error: "packageId required" },
        { status: 400 },
      );
    }
    const state = await linkEvidencePackage(body.ustn, body.packageId);
    return NextResponse.json({ closureState: state });
  } catch (err: any) {
    logger.error("[api/completion/closure/link-evidence] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
