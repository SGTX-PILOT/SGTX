// @ts-nocheck
// SGTX Phase 4 §5 — Multi-Agency Workflows API
//   GET  /api/sgtx/government/workflows — list MultiAgencyWorkflow rows
//        Query: ?jurisdictionCode=&operationType=&transportMode=&active=true
//   POST /api/sgtx/government/workflows — upsert a workflow
//        Body = CreateWorkflowInput (name + jurisdictionCode required).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listWorkflows, upsertWorkflow } from "@/lib/sgtx/multi-agency";

export const dynamic = "force-dynamic";

// GET — list workflows filtered by jurisdiction / operationType / transportMode / active.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const operationType = url.searchParams.get("operationType") || undefined;
    const transportMode = url.searchParams.get("transportMode") || undefined;
    // ?active=true → only active workflows; ?active=false → only inactive.
    // Omit → all.
    const activeRaw = url.searchParams.get("active");
    let active: boolean | undefined;
    if (activeRaw === "true") active = true;
    else if (activeRaw === "false") active = false;

    const workflows = await listWorkflows({
      jurisdictionCode,
      operationType,
      transportMode,
      active,
    });
    return NextResponse.json({ workflows, count: workflows.length });
  } catch (err: any) {
    logger.error("[api/sgtx/government/workflows] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a workflow. Body = CreateWorkflowInput.
// The engine finds an existing workflow by (name, jurisdictionCode) and
// updates it; otherwise creates a new one.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.name) {
      return NextResponse.json(
        { error: "name required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const workflow = await upsertWorkflow(body);
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error("[api/sgtx/government/workflows] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
