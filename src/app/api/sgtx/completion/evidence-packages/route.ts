// @ts-nocheck
// §5 Evidence Packages — list (GET) + create (POST)
// GET  /api/sgtx/completion/evidence-packages?ustn=X&status=Y
// POST /api/sgtx/completion/evidence-packages  body: CreatePackageInput
import { NextResponse } from "next/server";
import {
  listEvidencePackages,
  createEvidencePackage,
} from "@/lib/sgtx/evidence-package";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (status) filters.status = status;
    const packages = await listEvidencePackages(filters);
    return NextResponse.json({ packages });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages] GET failed", {
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
    if (!body.ustn && !body.tradeId) {
      return NextResponse.json(
        { error: "ustn or tradeId required" },
        { status: 400 },
      );
    }
    const pkg = await createEvidencePackage(body);
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
