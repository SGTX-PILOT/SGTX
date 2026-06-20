import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";

// SGTX Trade Memory Layer (Blueprint Part 19)
// POST /api/sgtx/trade-memory/event — capture a trade memory event.
//
// Body: { ustn?, tenantGtid?, category, eventType, eventValue?, eventMetadata? }
// category: LOGISTICS_DELAY | CUSTOMS_HOLD | DOC_REJECTION | FINANCING_OUTCOME | DISPUTE_OUTCOME | MILESTONE
//
// Anonymisation: sha256(tenantGtid + monthly-rotating pepper) → 16-hex prefix.
// The pepper rotates monthly so the same tenant resolves to a different
// anonymisedId each calendar month — preserving longitudinal analytics
// within a month while preventing permanent cross-month re-identification.

const VALID_CATEGORIES = new Set([
  "LOGISTICS_DELAY",
  "CUSTOMS_HOLD",
  "DOC_REJECTION",
  "FINANCING_OUTCOME",
  "DISPUTE_OUTCOME",
  "MILESTONE",
]);

function computeAnonymizedId(tenantGtid: string | null | undefined): string | null {
  if (!tenantGtid) return null;
  // Pepper suffix is the current ISO year-month (e.g. "2025-06"), so the
  // pepper rotates automatically at month boundaries without operator action.
  const pepper = `sgtx-pepper-${new Date().toISOString().slice(0, 7)}`;
  return createHash("sha256")
    .update(tenantGtid + pepper)
    .digest("hex")
    .slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { ustn, tenantGtid, category, eventType, eventValue, eventMetadata } = body as {
      ustn?: string;
      tenantGtid?: string;
      category?: string;
      eventType?: string;
      eventValue?: number;
      eventMetadata?: unknown;
    };

    // ── Validate required fields ─────────────────────────────────
    if (!category || !VALID_CATEGORIES.has(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${[...VALID_CATEGORIES].join(", ")}` },
        { status: 400 },
      );
    }
    if (!eventType || typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType is required (string)" }, { status: 400 });
    }
    if (!ustn && !tenantGtid) {
      return NextResponse.json(
        { error: "Either ustn or tenantGtid must be provided" },
        { status: 400 },
      );
    }
    if (eventValue !== undefined && typeof eventValue !== "number") {
      return NextResponse.json({ error: "eventValue must be a number" }, { status: 400 });
    }

    // ── Serialise metadata ───────────────────────────────────────
    let metadataJson: string | null = null;
    if (eventMetadata !== undefined && eventMetadata !== null) {
      try {
        metadataJson = JSON.stringify(eventMetadata);
      } catch {
        return NextResponse.json(
          { error: "eventMetadata must be JSON-serialisable" },
          { status: 400 },
        );
      }
    }

    // ── Compute monthly-rotating anonymised id ───────────────────
    const anonymizedId = computeAnonymizedId(tenantGtid);

    // ── Persist ──────────────────────────────────────────────────
    const event = await db.tradeMemoryEvent.create({
      data: {
        ustn: ustn || null,
        tenantGtid: tenantGtid || null,
        category,
        eventType,
        eventValue: typeof eventValue === "number" ? eventValue : null,
        eventMetadata: metadataJson,
        anonymizedId,
      },
    });

    return NextResponse.json({ ok: true, eventId: event.id });
  } catch (e: any) {
    console.error("[trade-memory/event] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to capture trade memory event" },
      { status: 500 },
    );
  }
}
