/**
 * GET /api/sgtx/ports/search?q=alex&limit=10&type=sea&country=EG
 *
 * Fuzzy-search the unified port database (worldwide-routes sea ports +
 * onboarding sea / air / inland / river ports, deduped by canonical
 * UN/LOCODE) by name OR UN/LOCODE OR country.
 *
 * Query params:
 *   * `q`      — required search query (≥1 char). Matched against name,
 *                UN/LOCODE, and country; Levenshtein < 3 fuzzy match on name.
 *   * `limit`  — optional max results (default 10, capped at 100).
 *   * `type`   — optional filter: `"sea" | "air" | "inland" | "river"`.
 *   * `country`— optional ISO 3166-1 alpha-2 country filter (e.g. "EG", "DE").
 *
 * Response (200):
 *   {
 *     ok: true,
 *     query: "alex",
 *     count: 3,
 *     ports: UnifiedPort[]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  searchPorts,
  getUnifiedPortCount,
  type UnifiedPort,
} from "@/lib/sgtx/shipping/worldwide-port-routes";

export const dynamic = "force-dynamic";

/**
 * Validate and coerce the `type` query param into the typed union accepted
 * by `getUnifiedPorts`. Returns `undefined` for missing / unknown values.
 */
function parseTypeFilter(raw: string | null): "sea" | "air" | "inland" | "river" | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v === "sea" || v === "air" || v === "inland" || v === "river") return v;
  return undefined;
}

/**
 * Coerce the `limit` query param to an integer clamped to [1, 100].
 * Defaults to 10 when missing / invalid.
 */
function parseLimit(raw: string | null): number {
  if (!raw) return 10;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

/**
 * GET handler — fuzzy port search across the unified port database.
 *
 * Returns 400 when `q` is missing or empty, 200 otherwise (even with zero
 * results). The total unified DB size is included so clients can show
 * "x of N ports" hints.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q");
    if (!q || !q.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "q query parameter is required",
        },
        { status: 400 },
      );
    }
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const type = parseTypeFilter(req.nextUrl.searchParams.get("type"));
    const country = req.nextUrl.searchParams.get("country") || undefined;

    // Run the fuzzy search, then apply the optional type/country filters
    // on the result set so clients can both fuzzy-match AND narrow by type.
    let results: UnifiedPort[] = searchPorts(q.trim(), Math.max(limit, 100));
    if (type) {
      results = results.filter((p) => p.type === type);
    }
    if (country) {
      const c = country.toUpperCase();
      results = results.filter((p) => p.country === c);
    }
    results = results.slice(0, limit);

    return NextResponse.json({
      ok: true,
      query: q.trim(),
      count: results.length,
      totalUnifiedPorts: getUnifiedPortCount(),
      filters: { type: type ?? null, country: country ?? null, limit },
      ports: results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg || "internal_error" },
      { status: 500 },
    );
  }
}
