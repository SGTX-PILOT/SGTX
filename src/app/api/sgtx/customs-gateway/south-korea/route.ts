// @ts-nocheck
/**
 * SGTX Customs Gateway — South Korea UNI-PASS API (§16)
 * ===========================================================================
 *
 * POST /api/sgtx/customs-gateway/south-korea
 *   body: { declaration: { ustn, brokerGtid, credentialReference, ... } }
 *   — Submit a declaration to UNI-PASS via simulated GPKI acknowledgement.
 *
 * GET  /api/sgtx/customs-gateway/south-korea?ref=<DECLARATION_NUMBER>
 *   — Poll UNI-PASS for the status of a previously-submitted declaration.
 *
 * GET  /api/sgtx/customs-gateway/south-korea?descriptor=1
 *   — Return the KR-UNIPASS adapter descriptor (for the adapter registry).
 *
 * L0 (NON-MARKETPLACE): the broker + Governor choose this adapter; the
 *     API never auto-selects it. The brokerGtid is the authorization
 *     identity — not the KCS user ID.
 *
 * Critical (§16): UNI-PASS Open API exposes status / HS / FX / AEO lookup,
 *     but declaration SUBMISSION is restricted to licensed 관세사 (Korea
 *     customs brokers) with GPKI / 공동인증서 certificates. SGTX operates
 *     the software boundary only — the broker owns and controls the
 *     credential. CORE_READY: sandbox simulation; PRODUCTION requires
 *     broker BYOC + Governor approval.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  submitKRDeclaration,
  getKRDeclarationStatus,
  getKRAdapterDescriptor,
  ADAPTER_ID,
  ADAPTER_JURISDICTION,
  ADAPTER_CLASSIFICATION,
} from "@/lib/sgtx/customs-gateway/adapters/south-korea-adapter";

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

    const declaration = body.declaration || body;
    if (!declaration) {
      return NextResponse.json(
        { ok: false, error: "declaration is required" },
        { status: 400 },
      );
    }

    const result = await submitKRDeclaration(declaration);
    return NextResponse.json({ ok: result.ok, result });
  } catch (err: any) {
    logger.error("[api/customs-gateway/south-korea] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get("ref");
    const descriptor = searchParams.get("descriptor");

    // ── ?descriptor=1 → return adapter descriptor ──────────────────────
    if (descriptor === "1") {
      const desc = await getKRAdapterDescriptor();
      return NextResponse.json({
        ok: true,
        adapter: desc,
        note:
          "KR-UNIPASS adapter descriptor. §16: UNI-PASS Open API (unipass.customs.go.kr) " +
          "exposes status / HS / FX / AEO lookup; declaration SUBMISSION restricted to " +
          "licensed 관세사 with GPKI certificate. SGTX operates software boundary only. " +
          "NON-MARKETPLACE: the registry LISTS this adapter; it NEVER auto-selects it.",
      });
    }

    // ── ?ref=<DECLARATION_NUMBER> → poll status ────────────────────────
    if (ref) {
      const status = await getKRDeclarationStatus(ref);
      return NextResponse.json({ ok: true, status });
    }

    // ── Default → usage info ───────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      adapterId: ADAPTER_ID,
      jurisdiction: ADAPTER_JURISDICTION,
      classification: ADAPTER_CLASSIFICATION,
      status: "CORE_READY",
      mode: "SIMULATION",
      usage: {
        submit: "POST with { declaration: { ustn, brokerGtid, credentialReference, ... } }",
        status: "GET ?ref=<DECLARATION_NUMBER>",
        descriptor: "GET ?descriptor=1",
      },
      legalNotes:
        "§16 South Korea Implementation. UNI-PASS Open API portal exposes status / HS / FX / " +
        "AEO lookup. Declaration SUBMISSION restricted to licensed 관세사 with GPKI / " +
        "공동인증서 certificate. SGTX operates software boundary only. CORE_READY: sandbox " +
        "simulation; PRODUCTION requires broker BYOC + Governor approval. Classified CLASS_B " +
        "(broker-gateway) per §9 / §33 evidence-based scoring.",
      fallback: {
        portalUrl: "https://unipass.customs.go.kr",
        broker: "Licensed Korea customs broker (관세사) with GPKI certificate",
      },
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/south-korea] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
