// GET /api/sgtx/worldwide-routes/routes — search worldwide port routes.
//
// Query params:
//   origin       string  — origin port UN/LOCODE or name fragment
//   dest         string  — destination port UN/LOCODE or name fragment
//   line         string  — shipping line name (e.g. "Maersk")
//   region       string  — geographic region filter
//   minPrice     number  — minimum price (USD)
//   maxPrice     number  — maximum price (USD)
//   maxTransit   number  — maximum transit days
//   reefer       boolean — only routes that support reefer containers
//   limit        number  — page size (default 50, max 200)
//   offset       number  — page offset (default 0)
//
// Delegates to the Brain orchestrator's `logistics.worldwide-routes-search`
// capability (registered by Task 1-A's worldwide-routes-orchestrator module).
import { NextRequest, NextResponse } from "next/server";
import { brainOrchestrator, logger } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Parse a string query param into a number, returning undefined when absent. */
function parseNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a string query param into a boolean (accepts "1"/"true"/"yes"). */
function parseBoolean(value: string | null): boolean | undefined {
  if (value === null || value === "") return undefined;
  const lower = value.toLowerCase();
  if (["1", "true", "yes", "y"].includes(lower)) return true;
  if (["0", "false", "no", "n"].includes(lower)) return false;
  return undefined;
}

/**
 * GET — search worldwide port routes via the Brain orchestrator.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const rawLimit = parseNumber(sp.get("limit"));
    const rawOffset = parseNumber(sp.get("offset"));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, rawLimit ?? DEFAULT_LIMIT),
    );
    const offset = Math.max(0, rawOffset ?? 0);

    const filters: Record<string, unknown> = { limit, offset };
    const origin = sp.get("origin");
    if (origin) filters.origin = origin;
    const dest = sp.get("dest");
    if (dest) filters.dest = dest;
    const line = sp.get("line");
    if (line) filters.line = line;
    const region = sp.get("region");
    if (region) filters.region = region;
    const minPrice = parseNumber(sp.get("minPrice"));
    if (minPrice !== undefined) filters.minPrice = minPrice;
    const maxPrice = parseNumber(sp.get("maxPrice"));
    if (maxPrice !== undefined) filters.maxPrice = maxPrice;
    const maxTransit = parseNumber(sp.get("maxTransit"));
    if (maxTransit !== undefined) filters.maxTransit = maxTransit;
    const reefer = parseBoolean(sp.get("reefer"));
    if (reefer !== undefined) filters.reefer = reefer;

    const result = await brainOrchestrator.invoke(
      "logistics.worldwide-routes-search",
      filters,
    );
    return NextResponse.json({ ok: true, filters, result });
  } catch (e: any) {
    logger.error("worldwide-routes routes: search failed", {
      component: "worldwide-routes-routes",
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
