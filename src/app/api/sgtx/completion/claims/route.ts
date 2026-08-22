// @ts-nocheck
// §2 Claims — list (GET) + file claim (POST)
// GET  /api/sgtx/completion/claims?ustn=X&parentUstn=Y&claimType=Z&status=W&claimantGtid=V
// POST /api/sgtx/completion/claims  body: FileClaimInput
import { NextResponse } from "next/server";
import { listClaims, fileClaim } from "@/lib/sgtx/claim";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const parentUstn = url.searchParams.get("parentUstn") || undefined;
    const claimType = url.searchParams.get("claimType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const claimantGtid = url.searchParams.get("claimantGtid") || undefined;
    if (ustn) filters.ustn = ustn;
    if (parentUstn) filters.parentUstn = parentUstn;
    if (claimType) filters.claimType = claimType;
    if (status) filters.status = status;
    if (claimantGtid) filters.claimantGtid = claimantGtid;
    const claims = await listClaims(filters);
    return NextResponse.json({ claims });
  } catch (err: any) {
    logger.error("[api/completion/claims] GET failed", {
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
    if (!body.claimType) {
      return NextResponse.json(
        { error: "claimType required" },
        { status: 400 },
      );
    }
    if (!body.ustn && !body.tradeId && !body.parentUstn) {
      return NextResponse.json(
        { error: "ustn, tradeId, or parentUstn required" },
        { status: 400 },
      );
    }
    const claim = await fileClaim(body);
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
