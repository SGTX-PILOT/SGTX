// @ts-nocheck
// §91 Recovery Vault — store entry (POST) + list entries by USTN (GET)
// POST /api/sgtx/constitutional/recovery-vault  body: { ustn?, entryType, content, options? }
// GET  /api/sgtx/constitutional/recovery-vault?ustn=X
import { NextResponse } from "next/server";
import { storeEntry, getEntriesByUstn } from "@/lib/sgtx/recovery-vault";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, entryType, content, options } = body || {};
    if (!entryType) {
      return NextResponse.json(
        { error: "entryType required" },
        { status: 400 },
      );
    }
    const entry = await storeEntry(ustn, entryType, content, options);
    if (!entry) {
      return NextResponse.json(
        { error: "storeEntry failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/constitutional/recovery-vault] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const entries = await getEntriesByUstn(ustn);
    return NextResponse.json({ entries, count: entries.length });
  } catch (err: any) {
    logger.error("[api/constitutional/recovery-vault] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
