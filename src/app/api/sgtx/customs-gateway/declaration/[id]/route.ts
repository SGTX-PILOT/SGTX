// @ts-nocheck
/**
 * SGTX Customs Gateway — Declaration get + transition API
 * ===========================================================================
 * GET   /api/sgtx/customs-gateway/declaration/[id]
 *   Returns: { ok, declaration }  (+ ?history=1 appends `history[]`)
 *
 * PATCH /api/sgtx/customs-gateway/declaration/[id]
 *   Body: { newState, actorGtid, reason }
 *   Returns: { ok, declaration }
 *
 * L0: transitions are validated against declaration-lifecycle.ts; Governor-
 * required transitions verify a recorded GovernorDecision before applying.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDeclaration,
  transitionDeclaration,
  getDeclarationHistory,
} from "@/lib/sgtx/customs-gateway";
import { isValidTransition, requiresGovernorApproval, getValidTransitions } from "@/lib/sgtx/customs-gateway/declaration-lifecycle";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const declaration = await getDeclaration(id);
    if (!declaration) {
      return NextResponse.json({ ok: false, error: "Declaration not found" }, { status: 404 });
    }
    const { searchParams } = new URL(req.url);
    const includeHistory = searchParams.get("history") === "1";
    const history = includeHistory ? await getDeclarationHistory(id) : undefined;
    return NextResponse.json({
      ok: true,
      declaration,
      validTransitions: getValidTransitions(declaration.state),
      ...(history ? { history } : {}),
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/declaration/[id]] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const body = await req.json();
    const { newState, actorGtid, reason } = body || {};
    if (!newState) {
      return NextResponse.json({ ok: false, error: "newState is required" }, { status: 400 });
    }

    const current = await getDeclaration(id);
    if (!current) {
      return NextResponse.json({ ok: false, error: "Declaration not found" }, { status: 404 });
    }
    if (!isValidTransition(current.state, newState)) {
      return NextResponse.json({
        ok: false,
        error: `Invalid transition: ${current.state} → ${newState}`,
        validTransitions: getValidTransitions(current.state),
      }, { status: 400 });
    }
    const governorRequired = requiresGovernorApproval(current.state, newState);

    const declaration = await transitionDeclaration(id, newState, actorGtid || current.brokerGtid, reason || "");
    return NextResponse.json({
      ok: true,
      declaration,
      governorApprovalRequired: governorRequired,
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/declaration/[id]] PATCH failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
