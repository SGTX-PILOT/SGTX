// @ts-nocheck
/**
 * SGTX Customs Gateway — Colombia VUCE API (§15)
 * ===========================================================================
 *
 * POST /api/sgtx/customs-gateway/colombia
 *   body: { declaration: { ustn, brokerGtid, credentialReference, ... } }
 *   — Submit a declaration to VUCE / DIAN sendas via simulated firma
 *     electrónica acknowledgement.
 *
 * GET  /api/sgtx/customs-gateway/colombia?ref=<DECLARATION_NUMBER>
 *   — Poll VUCE / DIAN sendas for the status of a previously-submitted
 *     declaration.
 *
 * GET  /api/sgtx/customs-gateway/colombia?descriptor=1
 *   — Return the CO-VUCE adapter descriptor (for the adapter registry).
 *
 * L0 (NON-MARKETPLACE): the broker + Governor choose this adapter; the
 *     API never auto-selects it. The brokerGtid is the authorization
 *     identity — not the DIAN user ID.
 *
 * Critical (§15): VUCE (www.vuce.gov.co) is Colombia's single window for
 *     foreign trade — integrates DIAN/SICEX customs declarations + INVIMA /
 *     ICA / MINMINAS sector permits. Declaration submission via DIAN sendas
 *     (SOAP/XML web services) requires a Colombian SIA (customs
 *     intermediary) or UAP/ALTEX importer with a firma electrónica
 *     (ONAC-accredited digital signature certificate). SGTX operates the
 *     software boundary only. CORE_READY: sandbox simulation; PRODUCTION
 *     requires broker BYOC + Governor approval. CLASS_B — do NOT claim
 *     CLASS_A until technical authorization verified.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  submitCODeclaration,
  getCODeclarationStatus,
  getCOAdapterDescriptor,
  ADAPTER_ID,
  ADAPTER_JURISDICTION,
  ADAPTER_CLASSIFICATION,
} from "@/lib/sgtx/customs-gateway/adapters/colombia-adapter";

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

    const result = await submitCODeclaration(declaration);
    return NextResponse.json({ ok: result.ok, result });
  } catch (err: any) {
    logger.error("[api/customs-gateway/colombia] POST failed", { error: err?.message });
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
      const desc = await getCOAdapterDescriptor();
      return NextResponse.json({
        ok: true,
        adapter: desc,
        note:
          "CO-VUCE adapter descriptor. §15: VUCE / DIAN sendas requires a Colombian SIA " +
          "(customs intermediary) or UAP/ALTEX importer with a firma electrónica (ONAC " +
          "certificate). SGTX operates software boundary only. NON-MARKETPLACE: the registry " +
          "LISTS this adapter; it NEVER auto-selects it.",
      });
    }

    // ── ?ref=<DECLARATION_NUMBER> → poll status ────────────────────────
    if (ref) {
      const status = await getCODeclarationStatus(ref);
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
        "§15 Colombia Implementation. VUCE (www.vuce.gov.co) integrates DIAN/SICEX customs " +
        "declarations + INVIMA / ICA / MINMINAS sector permits. Declaration submission via " +
        "DIAN sendas (SOAP/XML web services) requires a Colombian SIA or UAP/ALTEX importer " +
        "with a firma electrónica (ONAC-accredited certificate). SGTX operates software " +
        "boundary only. CORE_READY: sandbox simulation; PRODUCTION requires broker BYOC + " +
        "Governor approval. CLASS_B — do NOT claim CLASS_A until technical authorization " +
        "verified (§15).",
      fallback: {
        portalUrl: "https://www.vuce.gov.co",
        broker: "Licensed Colombian customs intermediary (SIA) with firma electrónica",
      },
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/colombia] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
