// @ts-nocheck
// §4 Post-Clearance Actions — list (GET) + create (POST)
// GET  /api/sgtx/completion/post-clearance?ustn=X&actionType=Y&status=Z
// POST /api/sgtx/completion/post-clearance  body: CreateActionInput
import { NextResponse } from "next/server";
import {
  listActions,
  createPostClearanceAction,
} from "@/lib/sgtx/post-clearance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const actionType = url.searchParams.get("actionType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (actionType) filters.actionType = actionType;
    if (status) filters.status = status;
    const actions = await listActions(filters);
    return NextResponse.json({ actions });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance] GET failed", {
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
    if (!body.actionType) {
      return NextResponse.json(
        { error: "actionType required" },
        { status: 400 },
      );
    }
    if (!body.ustn && !body.tradeId) {
      return NextResponse.json(
        { error: "ustn or tradeId required" },
        { status: 400 },
      );
    }
    const action = await createPostClearanceAction(body);
    return NextResponse.json({ action });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
