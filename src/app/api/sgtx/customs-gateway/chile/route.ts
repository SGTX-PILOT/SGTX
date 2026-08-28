// @ts-nocheck
/**
 * SGTX Customs Gateway — Chile SICEX API (§18)
 * ===========================================================================
 *
 * POST /api/sgtx/customs-gateway/chile
 *   body: { declaration: { ustn, brokerGtid, credentialReference, ... } }
 *   — Submit a declaration to SICEX via simulated firma electrónica
 *     avanzada acknowledgement.
 *
 * GET  /api/sgtx/customs-gateway/chile?ref=<DECLARATION_NUMBER>
 *   — Poll SICEX for the status of a previously-submitted declaration.
 *
 * GET  /api/sgtx/customs-gateway/chile?descriptor=1
 *   — Return the CL-SICEX adapter descriptor (for the adapter registry).
 *
 * L0 (NON-MARKETPLACE): the broker + Governor choose this adapter; the
 *     API never auto-selects it. The brokerGtid is the authorization
 *     identity — not the Aduanas user ID.
 *
 * Critical (§18): SICEX (aduana.cl/sicex) is Chile's customs electronic
 *     system — covers DIN (import), DUS (export), tránsito, almacén, and
 *     aforo (examination) channels. Declaration submission via SICEX web
 *     services (XML/SOAP) requires a licensed Chilean Despachador de
 *     Aduana or enrolled importer/exporter with a firma electrónica
 *     avanzada (SUBTEL-accredited certificate). SGTX operates the software
 *     boundary only. CORE_READY: sandbox simulation; PRODUCTION requires
 *     broker BYOC + Governor approval. CLASS_B — do NOT implement
 *     unsupported direct government access.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  submitCLDeclaration,
  getCLDeclarationStatus,
  getCLAdapterDescriptor,
  ADAPTER_ID,
  ADAPTER_JURISDICTION,
  ADAPTER_CLASSIFICATION,
} from "@/lib/sgtx/customs-gateway/adapters/chile-adapter";

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

    const result = await submitCLDeclaration(declaration);
    return NextResponse.json({ ok: result.ok, result });
  } catch (err: any) {
    logger.error("[api/customs-gateway/chile] POST failed", { error: err?.message });
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
      const desc = await getCLAdapterDescriptor();
      return NextResponse.json({
        ok: true,
        adapter: desc,
        note:
          "CL-SICEX adapter descriptor. §18: SICEX web services require a licensed Chilean " +
          "Despachador de Aduana or enrolled importer/exporter with a firma electrónica " +
          "avanzada (SUBTEL certificate). SGTX operates software boundary only. " +
          "NON-MARKETPLACE: the registry LISTS this adapter; it NEVER auto-selects it.",
      });
    }

    // ── ?ref=<DECLARATION_NUMBER> → poll status ────────────────────────
    if (ref) {
      const status = await getCLDeclarationStatus(ref);
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
        "§18 Chile Implementation. SICEX (aduana.cl/sicex) covers DIN (import), DUS (export), " +
        "tránsito, almacén, and aforo channels. Declaration submission via SICEX web services " +
        "(XML/SOAP) requires a licensed Chilean Despachador de Aduana or enrolled " +
        "importer/exporter with a firma electrónica avanzada (SUBTEL-accredited certificate). " +
        "SGTX operates software boundary only. CORE_READY: sandbox simulation; PRODUCTION " +
        "requires broker BYOC + Governor approval. CLASS_B — do NOT implement unsupported " +
        "direct government access (§18).",
      fallback: {
        portalUrl: "https://www.aduana.cl/sicex",
        broker: "Licensed Chilean Despachador de Aduana with firma electrónica avanzada",
      },
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/chile] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
