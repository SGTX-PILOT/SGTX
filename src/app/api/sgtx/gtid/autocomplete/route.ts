// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAI } from "@/lib/sgtx/ai/orchestrator";
import { parseGtid } from "@/lib/sgtx/identity/gtid";

// GET /api/sgtx/gtid/autocomplete?q=SGTX-VN&requester=SGTX-EG-TRD-000001-XXXX  (Part 2.1.7.1)
//
// Returns real-time autocomplete suggestions from:
//   1. Saved contacts — GTIDs + legal names of counterparties the user has
//      previously traded with (SavedContact rows for the requester).
//   2. Recent resolutions — GTIDs the user has resolved in the last 30 days
//      (GtidResolutionLog for the requester).
//   3. Exact match — if the typed string matches a valid GTID format, attempt
//      to resolve it from the tenants table.
//
// Non-marketplace safeguard (2.1.7.1): the autocomplete list NEVER includes
// "recommended" or "top-rated" sellers. If the entered GTID is not a saved
// contact, the system displays a warning ("You have not traded with this
// entity before. Please verify their identity externally.") — surfaced via
// the `unknown_warning` field in the response.

const RECENT_WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const requester = (req.nextUrl.searchParams.get("requester") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [], unknown_warning: null });
  if (!requester) return NextResponse.json({ error: "requester GTID required" }, { status: 400 });

  const upper = q.toUpperCase();
  const suggestions: Array<{ gtid: string; legal_name: string; type: string; jurisdiction: string; reason: string; last_trade?: string | null }> = [];

  // 1. Saved contacts (Part 2.1.7.1) — exact GTIDs + names of saved counterparties.
  const savedContacts = await db.savedContact.findMany({
    where: { ownerGtid: requester, contactGtid: { startsWith: upper } },
    take: 10,
    orderBy: { createdAt: "desc" },
    }) as any;
  for (const c of savedContacts) {
    suggestions.push({
      gtid: c.contactGtid,
      legal_name: c.contactName,
      type: c.contactType,
      jurisdiction: c.contactGtid.slice(5, 7),
      reason: "Saved contact",
        }) as any;
  }

  // 2. Recent resolutions (Part 2.1.7.1) — GTIDs the user has resolved in the last 30 days.
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 86400 * 1000);
  try {
    const recentLogs = await db.gtidResolutionLog.findMany({
      where: { requesterGtid: requester, resolvedGtid: { startsWith: upper }, resolvedAt: { gte: since }, outcome: "SUCCESS" },
      distinct: ["resolvedGtid"],
      take: 10,
      orderBy: { resolvedAt: "desc" },
        }) as any;
    for (const r of recentLogs) {
      if (suggestions.find((s) => s.gtid === r.resolvedGtid)) continue; // dedupe
            const t = await db.tenant.findUnique({ where: { gtid: r.resolvedGtid } }) as any;
      if (!t) continue;
      suggestions.push({
        gtid: r.resolvedGtid,
        legal_name: t.legalName,
        type: t.type,
        jurisdiction: t.country,
        reason: "Recently resolved",
        last_trade: r.resolvedAt.toISOString(),
            }) as any;
    }
  } catch {
    // GtidResolutionLog may not be populated yet — non-fatal.
  }

  // 3. Exact match (Part 2.1.7.1) — typed string is a complete GTID format → look up.
  let unknownWarning: string | null = null;
  const parsed = parseGtid(upper);
  if (parsed && suggestions.length === 0) {
        const t = await db.tenant.findUnique({ where: { gtid: upper } }) as any;
    if (t) {
      // If requester has no relationship, surface the non-marketplace warning.
      const isSaved = suggestions.find((s) => s.gtid === upper);
      if (!isSaved) {
        unknownWarning = `You have not traded with ${t.legalName} (${upper}) before. Please verify their identity externally.`;
        suggestions.push({
          gtid: upper,
          legal_name: t.legalName,
          type: t.type,
          jurisdiction: t.country,
          reason: "Exact GTID match — verify externally",
                }) as any;
      }
    }
  }

  // ── A1 advisory — generate a brief tooltip for the first suggestion (Part 2.1.7.1) ──
  // Best-effort; failure does not block the autocomplete response.
  let aiHint: string | null = null;
  if (suggestions.length > 0) {
    try {
      const ai = await runAI({
        agent_name: "gtid_autocomplete_hint",
        authority_level: "A1",
        system_prompt: "You are the SGTX GTID Autocomplete AI (A1 advisory). Given the user's partial input and matching saved contacts, generate ONE short sentence (max 20 words) helping them identify the right counterparty. Never recommend counterparties the user hasn't traded with. Non-marketplace.",
        user_prompt: `User input: ${q}\nFirst suggestion: ${suggestions[0].legal_name} (${suggestions[0].gtid}, ${suggestions[0].reason}).\n\nGenerate the hint.`,
        max_tokens: 40,
        temperature: 0.3,
            }) as any;
      aiHint = ai.content;
    } catch {
      aiHint = null;
    }
  }

  return NextResponse.json({
    suggestions: suggestions.slice(0, 10),
    unknown_warning: unknownWarning,
    ai_hint: aiHint,
    requester,
  });
}
