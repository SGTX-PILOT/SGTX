// @ts-nocheck
// §7 Accounting — list entries (GET) + create (POST)
// GET  /api/sgtx/finance/accounting/entries?ustn=X&category=Y&status=Z&period=W
// POST /api/sgtx/finance/accounting/entries  body: CreateEntryInput
import { NextResponse } from "next/server";
import {
  listEntries,
  createEntry,
} from "@/lib/sgtx/accounting";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const period = url.searchParams.get("period") || undefined;
    if (ustn) filters.ustn = ustn;
    if (category) filters.category = category;
    if (status) filters.status = status;
    if (period) filters.period = period;
    const entries = await listEntries(filters);
    return NextResponse.json({ entries });
  } catch (err: any) {
    logger.error("[api/finance/accounting/entries] GET failed", {
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
    if (!body.category) {
      return NextResponse.json(
        { error: "category required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        { error: "lines must be a non-empty array" },
        { status: 400 },
      );
    }
    const entry = await createEntry(body);
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/finance/accounting/entries] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
