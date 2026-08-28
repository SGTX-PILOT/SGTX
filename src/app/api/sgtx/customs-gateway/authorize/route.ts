// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Authorization API
 * ==================================================
 * POST /api/sgtx/customs-gateway/authorize
 *   body: { brokerGtid, ustn, adapterId, filerCode }
 *   Returns: { authorized, context, reason, checks }
 *
 * CRITICAL: this endpoint NEVER authorizes a submission based on filer code
 * alone. The filer code is checked for consistency with the registered
 * credential's filerCode but is NEVER used as the authorization mechanism.
 * Authorization requires ALL of:
 *   1. Broker GTID exists
 *   2. Authorized relationship with the USTN
 *   3. Filing profile for the adapter
 *   4. ACTIVE credential for the adapter
 *   5. Governor decision approving THIS submission
 *
 * Helper actions:
 *   { action: "register_profile", brokerGtid, adapterId, jurisdiction, governorDecisionId, defaultFilerCode? }
 *   { action: "activate_profile", profileId }
 *   { action: "authorize_relationship", brokerGtid, ustn, governorDecisionId }
 *   { action: "revoke_relationship", brokerGtid, ustn }
 *   { action: "record_governor_decision", decisionId, approved, ustn, brokerGtid, adapterId?, reason? }
 *   { action: "context", brokerGtid, ustn, adapterId }   — get context without enforcing
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  authorizeSubmission,
  registerFilingProfile,
  activateFilingProfile,
  authorizeRelationship,
  revokeRelationship,
  recordGovernorDecision,
  getAuthorizationContext,
} from "@/lib/sgtx/customs-gateway/broker-routing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    const action = body.action || "check";

    if (action === "check") {
      if (!body.brokerGtid || !body.ustn || !body.adapterId) {
        return NextResponse.json(
          { ok: false, error: "check requires: brokerGtid, ustn, adapterId" },
          { status: 400 },
        );
      }
      const result = await authorizeSubmission(
        body.brokerGtid,
        body.ustn,
        body.adapterId,
        body.filerCode || "",
      );
      return NextResponse.json({
        ok: true,
        authorized: result.authorized,
        context: result.context,
        reason: result.reason,
        checks: result.checks,
        securityNote:
          "Filer code is external regulatory metadata and is NEVER used as the authorization mechanism. " +
          "Authorization requires Broker GTID + Authorized Relationship + USTN + Filing Profile + " +
          "Active Credential + Governor Decision.",
      });
    }

    if (action === "context") {
      if (!body.brokerGtid || !body.ustn || !body.adapterId) {
        return NextResponse.json(
          { ok: false, error: "context requires: brokerGtid, ustn, adapterId" },
          { status: 400 },
        );
      }
      const ctx = await getAuthorizationContext(
        body.brokerGtid,
        body.ustn,
        body.adapterId,
      );
      return NextResponse.json({ ok: true, context: ctx });
    }

    if (action === "register_profile") {
      if (!body.brokerGtid || !body.adapterId || !body.governorDecisionId) {
        return NextResponse.json(
          { ok: false, error: "register_profile requires: brokerGtid, adapterId, governorDecisionId" },
          { status: 400 },
        );
      }
      const profile = await registerFilingProfile({
        brokerGtid: body.brokerGtid,
        adapterId: body.adapterId,
        jurisdiction: body.jurisdiction || "UNKNOWN",
        defaultFilerCode: body.defaultFilerCode ?? null,
        governorDecisionId: body.governorDecisionId,
      });
      return NextResponse.json({ ok: !!profile, profile });
    }

    if (action === "activate_profile") {
      if (!body.profileId) {
        return NextResponse.json(
          { ok: false, error: "activate_profile requires: profileId" },
          { status: 400 },
        );
      }
      await activateFilingProfile(body.profileId);
      return NextResponse.json({ ok: true });
    }

    if (action === "authorize_relationship") {
      if (!body.brokerGtid || !body.ustn || !body.governorDecisionId) {
        return NextResponse.json(
          { ok: false, error: "authorize_relationship requires: brokerGtid, ustn, governorDecisionId" },
          { status: 400 },
        );
      }
      const ok = await authorizeRelationship({
        brokerGtid: body.brokerGtid,
        ustn: body.ustn,
        governorDecisionId: body.governorDecisionId,
      });
      return NextResponse.json({ ok });
    }

    if (action === "revoke_relationship") {
      if (!body.brokerGtid || !body.ustn) {
        return NextResponse.json(
          { ok: false, error: "revoke_relationship requires: brokerGtid, ustn" },
          { status: 400 },
        );
      }
      await revokeRelationship(body.brokerGtid, body.ustn);
      return NextResponse.json({ ok: true });
    }

    if (action === "record_governor_decision") {
      if (!body.decisionId || !body.brokerGtid || !body.ustn) {
        return NextResponse.json(
          { ok: false, error: "record_governor_decision requires: decisionId, brokerGtid, ustn" },
          { status: 400 },
        );
      }
      await recordGovernorDecision({
        decisionId: body.decisionId,
        approved: !!body.approved,
        ustn: body.ustn,
        brokerGtid: body.brokerGtid,
        adapterId: body.adapterId ?? null,
        credentialId: body.credentialId ?? null,
        reason: body.reason,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/customs-gateway/authorize] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      usage: {
        check: "POST { action: 'check', brokerGtid, ustn, adapterId, filerCode }",
        context: "POST { action: 'context', brokerGtid, ustn, adapterId }",
        register_profile: "POST { action: 'register_profile', brokerGtid, adapterId, jurisdiction, governorDecisionId, defaultFilerCode? }",
        activate_profile: "POST { action: 'activate_profile', profileId }",
        authorize_relationship: "POST { action: 'authorize_relationship', brokerGtid, ustn, governorDecisionId }",
        revoke_relationship: "POST { action: 'revoke_relationship', brokerGtid, ustn }",
        record_governor_decision: "POST { action: 'record_governor_decision', decisionId, approved, ustn, brokerGtid, adapterId?, reason? }",
      },
      securityInvariants: [
        "Broker A credential can NEVER be used for Broker B",
        "A filer code alone can NEVER authorize a submission",
        "An expired/revoked/suspended credential blocks submission",
        "Governor denial blocks submission",
      ],
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
