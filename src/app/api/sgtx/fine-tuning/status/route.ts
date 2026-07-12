// GET /api/sgtx/fine-tuning/status — overall fine-tuning pipeline status.
//
// Returns the dataset stats, readyForFineTuning gate, threshold, the latest
// completed job per framework, and the full lineage (chain of completed
// jobs). One round-trip for a dashboard.
import { NextResponse } from "next/server";
import {
  datasetCollector,
  fineTuningJobManager,
  logger,
} from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/**
 * GET — return overall fine-tuning pipeline status.
 */
export async function GET() {
  try {
    const [datasetStats, unsloth, axolotl, llamaFactory, trl, lineage] =
      await Promise.all([
        datasetCollector.getDatasetStats(),
        fineTuningJobManager.getLatestCompletedJob("unsloth"),
        fineTuningJobManager.getLatestCompletedJob("axolotl"),
        fineTuningJobManager.getLatestCompletedJob("llama-factory"),
        fineTuningJobManager.getLatestCompletedJob("trl"),
        fineTuningJobManager.getLineage(),
      ]);

    return NextResponse.json({
      ok: true,
      datasetStats,
      readyForFineTuning: datasetStats.readyForFineTuning,
      threshold: datasetStats.threshold,
      latestJobs: {
        unsloth,
        axolotl,
        llamaFactory,
        trl,
      },
      lineage,
    });
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning status: GET failed", {
      component: "fine-tuning-status",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}
