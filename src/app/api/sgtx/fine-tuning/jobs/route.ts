// GET  /api/sgtx/fine-tuning/jobs    — list fine-tuning jobs.
// POST /api/sgtx/fine-tuning/jobs    — create a new fine-tuning job.
//
// GET query: status, framework, limit (default 50, max 500), offset (default 0)
// POST body: { framework, baseModel, exampleCount, configArtifact?, datasetArtifact?, notes? }
import { NextRequest, NextResponse } from "next/server";
import {
  fineTuningJobManager,
  logger,
} from "@/lib/sgtx/brain-os";
import type {
  FineTuningFramework,
  FineTuningJobStatus,
} from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const VALID_FRAMEWORKS: ReadonlySet<FineTuningFramework> = new Set([
  "unsloth",
  "axolotl",
  "llama-factory",
  "trl",
]);

const VALID_STATUSES: ReadonlySet<FineTuningJobStatus> = new Set([
  "pending",
  "config-generated",
  "submitted",
  "running",
  "completed",
  "failed",
]);

/** Parse a string query param into a number, returning undefined when absent. */
function parseNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET — list fine-tuning jobs (paginated, optional status/framework filters).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const rawLimit = parseNumber(sp.get("limit"));
    const rawOffset = parseNumber(sp.get("offset"));
    const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit ?? DEFAULT_LIMIT));
    const offset = Math.max(0, rawOffset ?? 0);
    const statusParam = sp.get("status") ?? undefined;
    const frameworkParam = sp.get("framework") ?? undefined;
    const status: FineTuningJobStatus | undefined =
      statusParam && VALID_STATUSES.has(statusParam as FineTuningJobStatus)
        ? (statusParam as FineTuningJobStatus)
        : undefined;
    const framework: FineTuningFramework | undefined =
      frameworkParam && VALID_FRAMEWORKS.has(frameworkParam as FineTuningFramework)
        ? (frameworkParam as FineTuningFramework)
        : undefined;

    const page = await fineTuningJobManager.listJobs({
      status,
      framework,
      limit,
      offset,
    });
    return NextResponse.json({
      ok: true,
      jobs: page.jobs,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    });
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning jobs: GET failed", {
      component: "fine-tuning-jobs",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/**
 * POST — create a new fine-tuning job. The job starts in `pending` status.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      framework?: FineTuningFramework;
      baseModel?: string;
      exampleCount?: number;
      configArtifact?: string;
      datasetArtifact?: string;
      notes?: string;
    };
    if (!body || !body.framework || !VALID_FRAMEWORKS.has(body.framework)) {
      return NextResponse.json(
        {
          ok: false,
          error: "framework is required and must be one of: unsloth | axolotl | llama-factory | trl",
        },
        { status: 400 },
      );
    }
    if (!body.baseModel || typeof body.baseModel !== "string") {
      return NextResponse.json(
        { ok: false, error: "baseModel is required" },
        { status: 400 },
      );
    }
    if (
      typeof body.exampleCount !== "number" ||
      !Number.isFinite(body.exampleCount) ||
      body.exampleCount < 0
    ) {
      return NextResponse.json(
        { ok: false, error: "exampleCount must be a non-negative number" },
        { status: 400 },
      );
    }

    const job = await fineTuningJobManager.createJob({
      framework: body.framework,
      baseModel: body.baseModel,
      exampleCount: body.exampleCount,
      configArtifact: body.configArtifact,
      datasetArtifact: body.datasetArtifact,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning jobs: POST failed", {
      component: "fine-tuning-jobs",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}
