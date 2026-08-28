// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker BYOC Credentials API
 * ====================================================
 * GET    /api/sgtx/customs-gateway/credentials?brokerGtid=<GTID>[&adapterId=<ID>]
 *        — list a broker's credentials (public shape; never returns secret material)
 * POST   /api/sgtx/customs-gateway/credentials
 *        — register a new BYOC credential (HSM reference only — never the secret)
 * DELETE /api/sgtx/customs-gateway/credentials?id=<ID>&reason=<REASON>
 *        — revoke a credential (permanent)
 *
 * Other lifecycle ops (suspend / reinstate / rotate / activate / verify) are
 * exposed via POST with { action: ... }.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  registerCredential,
  listCredentials,
  revokeCredential,
  suspendCredential,
  reinstateCredential,
  rotateCredential,
  activateCredential,
  verifyCredential,
} from "@/lib/sgtx/customs-gateway/broker-byoc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerGtid = searchParams.get("brokerGtid");
    const adapterId = searchParams.get("adapterId") || undefined;

    if (!brokerGtid) {
      return NextResponse.json(
        {
          ok: false,
          error: "brokerGtid query parameter is required",
          usage: {
            list: "GET ?brokerGtid=<GTID>[&adapterId=<ID>]",
            register: "POST with { action: 'register', brokerGtid, adapterId, credentialType, credentialReference, governorDecisionId, ... }",
            revoke: "DELETE ?id=<ID>&reason=<REASON>  OR  POST { action: 'revoke', id, reason }",
            suspend: "POST { action: 'suspend', id, reason }",
            reinstate: "POST { action: 'reinstate', id }",
            rotate: "POST { action: 'rotate', id }",
            activate: "POST { action: 'activate', id, governorDecisionId }",
            verify: "POST { action: 'verify', id }",
          },
        },
        { status: 400 },
      );
    }

    const credentials = await listCredentials(brokerGtid, adapterId);
    return NextResponse.json({
      ok: true,
      brokerGtid,
      adapterId: adapterId || null,
      count: credentials.length,
      credentials,
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/credentials] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    const action = body.action || "register";

    if (action === "register") {
      if (!body.brokerGtid || !body.adapterId || !body.credentialType || !body.credentialReference || !body.governorDecisionId) {
        return NextResponse.json(
          {
            ok: false,
            error: "register requires: brokerGtid, adapterId, credentialType, credentialReference, governorDecisionId",
          },
          { status: 400 },
        );
      }
      const cred = await registerCredential({
        brokerGtid: body.brokerGtid,
        jurisdiction: body.jurisdiction || "UNKNOWN",
        adapterId: body.adapterId,
        credentialType: body.credentialType,
        credentialReference: body.credentialReference,
        filerCode: body.filerCode ?? null,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        certificateThumbprint: body.certificateThumbprint ?? null,
        governorDecisionId: body.governorDecisionId,
      });
      return NextResponse.json({ ok: !!cred.id, credential: cred });
    }

    if (action === "verify") {
      if (!body.id) {
        return NextResponse.json({ ok: false, error: "verify requires: id" }, { status: 400 });
      }
      const result = await verifyCredential(body.id);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "suspend") {
      if (!body.id) {
        return NextResponse.json({ ok: false, error: "suspend requires: id" }, { status: 400 });
      }
      await suspendCredential(body.id, body.reason || "");
      return NextResponse.json({ ok: true });
    }

    if (action === "reinstate") {
      if (!body.id) {
        return NextResponse.json({ ok: false, error: "reinstate requires: id" }, { status: 400 });
      }
      await reinstateCredential(body.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "rotate") {
      if (!body.id) {
        return NextResponse.json({ ok: false, error: "rotate requires: id" }, { status: 400 });
      }
      const newCred = await rotateCredential(body.id);
      return NextResponse.json({ ok: !!newCred.id, credential: newCred });
    }

    if (action === "activate") {
      if (!body.id || !body.governorDecisionId) {
        return NextResponse.json(
          { ok: false, error: "activate requires: id, governorDecisionId" },
          { status: 400 },
        );
      }
      const cred = await activateCredential(body.id, body.governorDecisionId);
      return NextResponse.json({ ok: !!cred, credential: cred });
    }

    if (action === "revoke") {
      if (!body.id) {
        return NextResponse.json({ ok: false, error: "revoke requires: id" }, { status: 400 });
      }
      await revokeCredential(body.id, body.reason || "");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/customs-gateway/credentials] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const reason = searchParams.get("reason") || "revoked via API";
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id query parameter is required" },
        { status: 400 },
      );
    }
    await revokeCredential(id, reason);
    return NextResponse.json({ ok: true, id, reason });
  } catch (err: any) {
    logger.error("[api/customs-gateway/credentials] DELETE failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
