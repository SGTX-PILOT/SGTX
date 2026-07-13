// GET   /api/sgtx/fine-tuning/jobs/[id]  — get a single fine-tuning job.
// PATCH /api/sgtx/fine-tuning/jobs/[id]  — update a job's status/metrics.
//
// PATCH body: { status?, metrics?, notes?, modelVersion? }
//   status:        pending | config-generated | submitted | running | completed | failed
//   metrics:       { loss?, evalLoss?, learningRate?, epoch? }
//   notes:         string
//   modelVersion:  string
import { NextRequest, NextResponse } from "next/server";
import {
  fineTuningJobManager,
  logger,
} from "@/lib/sgtx/brain-os";
import type { FineTuningJobStatus, FineTuningMetrics } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlySet<FineTuningJobStatus> = new Set([
  "pending",
  "config-generated",
  "submitted",
  "running",
  "completed",
  "failed",
]);

/**
 * GET — return a single fine-tuning job.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const job = await fineTuningJobManager.getJob(id);
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning job detail: GET failed", {
      component: "fine-tuning-job-detail",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/**
 * PATCH — update a job's status, metrics, notes, or model version. External
 * runners call this to report progress (status: running) and final results
 * (status: completed + metrics + modelVersion).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      status?: FineTuningJobStatus;
      metrics?: FineTuningMetrics;
      notes?: string;
      modelVersion?: string;
    };
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Empty patch body" },
        { status: 400 },
      );
    }
    if (body.status && !VALID_STATUSES.has(body.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid status: ${body.status}. Expected one of: ${Array.from(VALID_STATUSES).join(" | ")}`,
        },
        { status: 400 },
      );
    }

    const job = await fineTuningJobManager.updateJobStatus(id, body);
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning job detail: PATCH failed", {
      component: "fine-tuning-job-detail",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}
