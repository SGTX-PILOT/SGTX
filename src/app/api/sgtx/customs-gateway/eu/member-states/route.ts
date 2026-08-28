// @ts-nocheck
/**
 * SGTX Customs Gateway — EU Member-State Registry API
 * ===========================================================================
 *
 * GET /api/sgtx/customs-gateway/eu/member-states
 *   Returns the list of all 27 EU Member-State adapter descriptors.
 *
 * Optional query params:
 *   ?status=NOT_ACTIVE            — filter by adapter status
 *   ?countryCode=DE               — single Member-State lookup
 *   ?transactionType=TRANSIT      — filter by supported transaction type
 *   ?summary=1                    — return status aggregate summary instead of list
 *
 * L0 (NON-MARKETPLACE): the registry LISTS Member-State adapters; it NEVER
 *     auto-selects one. The broker + Governor choose the destination
 *     Member State when creating a declaration.
 *
 * Critical (§57-58): each Member-State adapter has DIFFERENT authentication,
 * representation, certification, and submission-channel capabilities. Do NOT
 * assume all EU Member States have identical capabilities.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listMemberStates,
  getMemberStateAdapter,
  getMemberStateStatus,
  getMemberStateStatusSummary,
  findMemberStatesByTransactionType,
} from "@/lib/sgtx/customs-gateway/adapters/eu-gateway/member-state-registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const countryCode = searchParams.get("countryCode");
    const transactionType = searchParams.get("transactionType");
    const summary = searchParams.get("summary");

    // ── ?summary=1 → status aggregate ──────────────────────────────────
    if (summary === "1") {
      const s = getMemberStateStatusSummary();
      return NextResponse.json({
        ok: true,
        summary: s,
        note:
          "Per-Member-State readiness summary. Most Member States are NOT_ACTIVE — " +
          "SGTX has not yet wired a national adapter. PRODUCTION activation requires " +
          "per-Member-State legal authorisation + eIDAS QSeal + sandbox tests + Governor approval.",
      });
    }

    // ── ?countryCode=DE → single Member-State lookup ───────────────────
    if (countryCode) {
      const ms = getMemberStateAdapter(countryCode);
      if (!ms) {
        return NextResponse.json(
          {
            ok: false,
            error: `Unknown EU Member State code: ${countryCode}. Valid codes are the 27 ISO-2 codes of EU Member States.`,
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        memberState: ms,
        note:
          "Member-State adapter descriptor. Each Member State has DIFFERENT authentication, " +
          "representation, certification, and submission-channel capabilities (§57-58).",
      });
    }

    // ── Default / ?status= / ?transactionType= → list ──────────────────
    let memberStates = listMemberStates();
    if (statusFilter) {
      memberStates = memberStates.filter((ms) => ms.status === statusFilter);
    }
    if (transactionType) {
      memberStates = findMemberStatesByTransactionType(transactionType);
    }

    const statusTable = getMemberStateStatus();

    return NextResponse.json({
      ok: true,
      count: memberStates.length,
      totalRegistered: 27,
      memberStates,
      statusSummary: getMemberStateStatusSummary(),
      statusTable,
      note:
        "EU Member-State Adapter Registry (§57-58). The registry LISTS adapters; it NEVER " +
        "auto-selects one. The broker + Governor choose the destination Member State. " +
        "Each Member State runs its OWN national customs system with DIFFERENT authentication + " +
        "certification regimes — do NOT assume identical capabilities.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/eu/member-states] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
