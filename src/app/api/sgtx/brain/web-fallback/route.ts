// SGTX Brain OS — Web Fallback API
// =============================================================================
// Manual trigger + health check for the Brain's web search + web reader
// fallback layer.
//
//   POST /api/sgtx/brain/web-fallback
//     Body: { query: string, numResults?: number, maxPagesToRead?: number }
//     → runs `webSearchAndRead(query, opts)` and returns the WebFallbackResult.
//
//   GET  /api/sgtx/brain/web-fallback
//     → health check: returns whether the web fallback adapter is available
//       (SDK loaded, API key configured) + cache stats.
//
// This route is server-only. The z-ai-web-dev-sdk is imported lazily inside
// the adapter, so importing this route module has no side effects.
// =============================================================================

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  webSearchAndRead,
  isWebFallbackAvailable,
  getWebFallbackCacheStats,
  type WebFallbackResult,
} from "@/lib/sgtx/brain-os/adapters/web-fallback-adapter";

/**
 * POST /api/sgtx/brain/web-fallback
 *
 * Manually trigger the Brain's web search + web reader fallback chain.
 * Useful for: testing the adapter, refreshing real-time data on demand,
 * or feeding the synthesised context into another AI call.
 *
 * @param req.body.query           Required. Natural-language search query.
 * @param req.body.numResults      Optional. Number of search hits (1-20, default 5).
 * @param req.body.maxPagesToRead  Optional. Pages to read in full (0-5, default 3).
 * @returns 200 with `WebFallbackResult` on success (including soft-failure
 *          cases where `success=false`), 400 on missing query, 500 on
 *          unexpected error.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => null)) as
      | { query?: string; numResults?: number; maxPagesToRead?: number }
      | null;

    if (!body || typeof body.query !== "string" || !body.query.trim()) {
      return NextResponse.json(
        { error: "Body must include a non-empty 'query' string." },
        { status: 400 },
      );
    }

    const numResults =
      typeof body.numResults === "number"
        ? Math.min(20, Math.max(1, Math.floor(body.numResults)))
        : undefined;
    const maxPagesToRead =
      typeof body.maxPagesToRead === "number"
        ? Math.min(5, Math.max(0, Math.floor(body.maxPagesToRead)))
        : undefined;

    const result: WebFallbackResult = await webSearchAndRead(body.query, {
      numResults,
      maxPagesToRead,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sgtx/brain/web-fallback
 *
 * Health check for the web fallback adapter. Returns whether the SDK is
 * available + current cache stats. Cheap (no network calls).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const available = isWebFallbackAvailable();
    const cache = getWebFallbackCacheStats();
    return NextResponse.json({
      ok: true,
      available,
      cache,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
