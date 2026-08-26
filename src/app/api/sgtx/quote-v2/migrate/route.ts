// @ts-nocheck
// SGTX v13.1 — REC-P0 / Recommendation #1 — Quote v2 migrate endpoint
//
// POST /api/sgtx/quote-v2/migrate
//   Body: (none required — accepts optional { dryRun: boolean } for future use)
//   Triggers `migrateQuotesFromGlobalNotes()` which scans every Trade where
//   `globalNotes` contains a legacy quote JSON blob (looks for the
//   `"totalQuote"` key) and creates a dedicated Quote row for each. The
//   original `globalNotes` value is NEVER modified or deleted — the audit
//   trail is preserved verbatim.
//
//   The migration is idempotent: Trades that already have a Quote row are
//   skipped on subsequent runs.
import { NextResponse } from "next/server";
import { migrateQuotesFromGlobalNotes } from "@/lib/sgtx/quote";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    logger.info("[api/sgtx/quote-v2/migrate] starting migration");
    const result = await migrateQuotesFromGlobalNotes();
    logger.info("[api/sgtx/quote-v2/migrate] migration complete", {
      scanned: result.scanned,
      migrated: result.migrated,
      skipped: result.skipped,
      errors: result.errors,
    });
    return NextResponse.json({
      ok: result.ok,
      scanned: result.scanned,
      migrated: result.migrated,
      skipped: result.skipped,
      errors: result.errors,
      quoteIds: result.quoteIds,
      details: result.details,
      message:
        result.migrated > 0
          ? `Migrated ${result.migrated} quote(s) from Trade.globalNotes into the dedicated Quote table. The original Trade.globalNotes values were preserved (non-destructive).`
          : result.scanned === 0
            ? "No legacy quote blobs found in Trade.globalNotes — nothing to migrate."
            : `Migration scan completed. ${result.skipped} already-migrated row(s) skipped, ${result.errors} error(s).`,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/quote-v2/migrate] failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
