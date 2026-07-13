// GET /api/sgtx/fine-tuning/dataset — return dataset stats + paginated examples.
//
// Query params:
//   capability  string  — filter by capability (e.g. "logistics.worldwide-routes-search")
//   minQuality  number  — minimum quality score (0-1)
//   limit       number  — page size (default 50, max 500)
//   offset      number  — page offset (default 0)
//
// Returns: { ok, stats, examples, total, limit, offset }
import { NextRequest, NextResponse } from "next/server";
import { datasetCollector, logger } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** Parse a string query param into a number, returning undefined when absent. */
function parseNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET — return dataset stats + a page of high-quality examples.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const capability = sp.get("capability") ?? undefined;
    const minQuality = parseNumber(sp.get("minQuality"));
    const rawLimit = parseNumber(sp.get("limit"));
    const rawOffset = parseNumber(sp.get("offset"));
    const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit ?? DEFAULT_LIMIT));
    const offset = Math.max(0, rawOffset ?? 0);

    const [stats, page] = await Promise.all([
      datasetCollector.getDatasetStats(),
      datasetCollector.getDataset({ capability, minQuality, limit, offset }),
    ]);

    return NextResponse.json({
      ok: true,
      stats,
      examples: page.examples,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    });
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning dataset: GET failed", {
      component: "fine-tuning-dataset",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}
