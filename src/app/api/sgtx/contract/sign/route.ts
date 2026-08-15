import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { governorDecide } from "@/lib/sgtx/governor";
import type { GovernorResponse } from "@/lib/sgtx/governor";
import { db } from "@/lib/db";
import { withBrainPrescreen } from "@/lib/sgtx/ai/with-brain-prescreen";
import type { BrainPrescreenContext, BrainPrescreenResult, BrainHandlerContext } from "@/lib/sgtx/ai/with-brain-prescreen";
import { autoCheckCompliance } from "@/lib/sgtx/ai/compliance-gate";
import type { ComplianceGateInput } from "@/lib/sgtx/ai/compliance-gate";
import { eventBus } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

// POST /api/sgtx/contract/sign - Records a digital signature on the contract (Phase 3.10-3.13)
// Body: { ustn, signerGtid, signerRole ("BUYER"|"SELLER"), signatureType ("STANDARD"|"AES"|"QES") }
// Creates a QesSignature record + Activity log + TimelineEvent
//
// IMPL-5: This route is now wrapped with `withBrainPrescreen(autoCheckCompliance, ...)`.
// The SGTX Brain AI runs a pre-contract compliance gate BEFORE the Governor + QES
// signature logic. Flow:
//   1. HOC parses body, runs `prescreen()` which looks up Trade + Tenant rows
//      from body.ustn and calls `autoCheckCompliance`.
//   2. Brain verdict DENY    → HTTP 422 with signed denial payload (handler
//      NEVER runs, no DB writes, no QES signature recorded).
//   3. Brain verdict CONDITIONAL → handler runs with `body._brainConditions`
//      attached; an additional Activity entry audits the Brain verdict.
//   4. Brain verdict ALLOW   → handler runs normally.
//   5. Inside the handler, the Governor runs SECOND (Brain first, then Governor
//      — both must clear for the signature to be recorded).
//
// FIX-12-FINAL:
//   Fix 4 (HIGH) — status gate: contract can only be signed after quote
//     acceptance (QUOTE_ACCEPTED) OR re-signed when already CONTRACT_SIGNED.
//     Any other trade status returns 409.
//   Fix 6 (HIGH) — idempotency: when the caller sends an `Idempotency-Key`
//     header, we look up an existing QesSignature with the same
//     (ustn, signerGtid, signerRole) tuple. If found, the existing signature
//     is returned without writing a duplicate. Repeated retries therefore
//     return the original 200 response.
//   Fix 8 (HIGH) — Brain event publication: a `trade.contract.signed` event is
//     published to the Brain event bus after a successful signature so the 38
//     downstream subscribers fire (audit section S34 — 0 events ever published).
//   Quality — removed `@ts-nocheck`. The prescreen function now returns a
//     typed `BrainPrescreenResult`; the handler ctx is typed as
//     `BrainHandlerContext`. Body remains `any` (input payload).

/**
 * Pre-screen function: looks up Trade + Tenant rows from `body.ustn`, builds a
 * `ComplianceGateInput`, and calls `autoCheckCompliance`.
 *
 * Fail-open policy for missing data: if `body.ustn` is absent, the trade row
 * is not found, or the DB lookup throws, the prescreen returns ALLOW with low
 * confidence — letting the handler's existing validation reject the request
 * (400 / 404 / 500). This is deliberate: the Brain gate's job is to BLOCK bad
 * contracts, not to BLOCK requests with incomplete data. The HOC itself is
 * fail-CLOSED on prescreen FUNCTION errors (thrown exceptions → HTTP 500).
 */
async function prescreen({ body }: BrainPrescreenContext): Promise<BrainPrescreenResult> {
  const ustn = body?.ustn;
  if (!ustn) {
    // No USTN in body — let the handler's field validation return 400.
    return {
      verdict: "ALLOW",
      conditions: [],
      brainModule: "autoCheckCompliance",
      aiConfidence: 0.50,
    };
  }

  // Look up the trade + tenants to gather compliance inputs.
  let trade: {
    buyer?: { legalName?: string | null; country?: string | null; sanctionsCleared?: boolean } | null;
    seller?: { legalName?: string | null; country?: string | null; sanctionsCleared?: boolean } | null;
    commodityHs?: string | null;
    commodity?: string | null;
    destCountry?: string | null;
    originCountry?: string | null;
    originPort?: string | null;
    destPort?: string | null;
    grossWeightKg?: number | null;
  } | null = null;
  try {
    trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true },
    });
  } catch (err) {
    logger.error("[contract/sign prescreen] trade lookup threw", {
      ustn,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail-open: the handler will also attempt the DB lookup and surface the
    // 500. Brain gate does not block on transient DB issues.
    return {
      verdict: "ALLOW",
      conditions: [],
      brainModule: "autoCheckCompliance",
      aiConfidence: 0.40,
    };
  }

  if (!trade) {
    // Trade not found — let the handler return 404.
    return {
      verdict: "ALLOW",
      conditions: [],
      brainModule: "autoCheckCompliance",
      aiConfidence: 0.40,
    };
  }

  // Build the compliance input from trade + tenant rows. Body fields override
  // (callers can pass richer data — e.g. hasGeoLocationData, carbonIntensity —
  // when they have it).
  const input: ComplianceGateInput = {
    ustn,
    buyerName: body?.buyerName || trade.buyer?.legalName || undefined,
    buyerCountry: body?.buyerCountry || trade.buyer?.country || undefined,
    sellerName: body?.sellerName || trade.seller?.legalName || undefined,
    sellerCountry: body?.sellerCountry || trade.seller?.country || undefined,
    hsCode: body?.hsCode || trade.commodityHs || "",
    commodity: body?.commodity || trade.commodity || undefined,
    destCountry: body?.destCountry || trade.destCountry || undefined,
    originCountry: body?.originCountry || trade.originCountry || undefined,
    loadingPort: body?.loadingPort || trade.originPort || undefined,
    dischargePort: body?.dischargePort || trade.destPort || undefined,
    weightTonnes:
      body?.weightTonnes ||
      (trade.grossWeightKg ? trade.grossWeightKg / 1000 : undefined),
    carbonIntensityKgCO2e: body?.carbonIntensityKgCO2e,
    hasGeoLocationData: body?.hasGeoLocationData,
    hasDueDiligenceStatement: body?.hasDueDiligenceStatement,
  };

  return autoCheckCompliance(input);
}

/**
 * Original contract-sign handler, now wrapped by `withBrainPrescreen`.
 *
 * Signature change vs. pre-IMPL-5:
 *   • Old: `POST(req)` — parsed `await req.json()` itself.
 *   • New: `postHandler(req, ctx)` — receives `ctx.body` (already parsed by
 *     the HOC) and `ctx.prescreen` (the BrainPrescreenResult).
 *
 * ALL existing logic preserved (Governor, field validation, trade lookup,
 * signer validation, QES signature, Activity, TimelineEvent). Only ADDITIVE
 * changes:
 *   • Uses `ctx.body` instead of re-parsing `req.json()`.
 *   • Audits the Brain verdict (when != ALLOW) via a separate Activity entry
 *     so the trade's activity feed shows the Brain gate ran.
 *   • Adds `brainVerdict` + `brainModule` to the success response so callers
 *     can see the Brain's decision.
 *   • FIX-12-FINAL — Status check (Fix 4), idempotency (Fix 6), Brain event
 *     publish (Fix 8).
 */
async function postHandler(req: NextRequest, ctx: BrainHandlerContext) {
  try {
    const body = ctx.body; // already parsed by the HOC — do NOT re-call req.json()

    // Governor enforcement (G1 — Execution Always Gated). Brain prescreen has
    // already run (ctx.prescreen); Governor runs SECOND.
    const govDecision = await governorDecide({
      action: "contract.sign",
      actorGtid:
        body?.filedByGtid || body?.actorGtid || body?.payerGtid || "SYSTEM",
    }).catch((err: unknown): GovernorResponse => {
      logger.error("[contract/sign] Governor unavailable, fail-safe ALLOW", { err: err instanceof Error ? err.message : String(err) });
      return {
        decisionId: "fail-safe",
        verdict: "ALLOW",
        conditions: [],
        loomHash: "",
        previousHash: null,
        signature: "",
        moduleVersions: {},
        createdAt: new Date().toISOString(),
      };
    });
    if (govDecision.verdict === "DENY") {
      return NextResponse.json(
        {
          error: `Governor denied: ${
            govDecision.conditions?.map((c: { label?: string }) => c.label).join("; ") ||
            "action not permitted"
          }`,
        },
        { status: 403 },
      );
    }

    const { ustn, signerGtid, signerRole, signatureType } = body as {
      ustn?: string; signerGtid?: string; signerRole?: string; signatureType?: string;
    };

    if (!ustn || !signerGtid || !signerRole || !signatureType) {
      return NextResponse.json(
        { error: "ustn, signerGtid, signerRole, signatureType required" },
        { status: 400 },
      );
    }
    if (!["BUYER", "SELLER"].includes(signerRole)) {
      return NextResponse.json(
        { error: "signerRole must be BUYER or SELLER" },
        { status: 400 },
      );
    }
    if (!["STANDARD", "AES", "QES"].includes(signatureType)) {
      return NextResponse.json(
        { error: "signatureType must be STANDARD, AES, or QES" },
        { status: 400 },
      );
    }

    // Find the trade
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // FIX-12-FINAL / Fix 4 — Status gate. The contract may only be signed
    // after the buyer accepts the seller's quote (QUOTE_ACCEPTED). Re-signing
    // (e.g. the counterparty signs after the first party) is allowed when the
    // trade is already CONTRACT_SIGNED. Any other state returns 409.
    if (trade.status !== "QUOTE_ACCEPTED" && trade.status !== "CONTRACT_SIGNED") {
      return NextResponse.json(
        {
          error: `Contract can only be signed after quote acceptance (current status: ${trade.status})`,
        },
        { status: 409 },
      );
    }

    // Validate signer is the correct party
    const expectedGtid = signerRole === "BUYER" ? trade.buyerGtid : trade.sellerGtid;
    if (signerGtid !== expectedGtid) {
      return NextResponse.json(
        { error: `signerGtid does not match the ${signerRole} of this trade` },
        { status: 403 },
      );
    }

    // FIX-12-FINAL / Fix 6 — Idempotency. When the caller retries the same
    // (ustn, signerGtid, signerRole) tuple, return the existing QesSignature
    // result without writing a duplicate. This makes the contract/sign
    // endpoint safe to retry on transient network failures (audit S33).
    //
    // NOTE: The QesSignature table does not have a `signerRole` column —
    // the role is implied by `signerGtid` (each GTID is a single tenant
    // that plays exactly one role on a given trade: buyer OR seller).
    // We therefore look up by (ustn, signerGtid, documentType="CONTRACT") —
    // the signerGtid uniquely identifies the role within the trade.
    const existingSignature = await db.qesSignature.findFirst({
      where: { ustn, signerGtid, documentType: "CONTRACT" },
      orderBy: { createdAt: "desc" },
    });
    if (existingSignature) {
      // Re-publish the Brain event so subscribers that may have missed the
      // first emission get a deterministic idempotent signal. Non-blocking.
      eventBus
        .publish("trade.contract.signed", ustn, {
          ustn,
          signerGtid,
          signerRole,
          signatureType: existingSignature.signatureType,
          legalEffect: existingSignature.legalEffect,
          documentHash: existingSignature.documentHash,
          idempotent: true,
        }, { source: "contract.sign", tenantGtid: signerGtid })
        .catch(() => { /* event publish failure is non-blocking */ });

      return NextResponse.json({
        ok: true,
        signed: true,
        signerGtid: existingSignature.signerGtid,
        signerRole,
        signatureType: existingSignature.signatureType,
        legalEffect: existingSignature.legalEffect,
        documentHash: existingSignature.documentHash,
        idempotent: true,
        // Preserve Brain verdict fields so the response shape is stable.
        brainVerdict: ctx.prescreen?.verdict ?? "ALLOW",
        brainModule: ctx.prescreen?.brainModule ?? "autoCheckCompliance",
        brainConditions: ctx.prescreen?.conditions ?? [],
      });
    }

    // Resolve signer tenant
    const signerTenant = signerRole === "BUYER" ? trade.buyer : trade.seller;
    const signerName = signerTenant?.legalName || signerGtid;

    // Map signatureType to legal effect per Part 1.9 / SGTX QES Layer
    const legalEffect =
      signatureType === "QES"
        ? "handwritten_equivalent"
        : signatureType === "AES"
          ? "integrity_presumption"
          : "binding";

    // Compute document hash (sha256 of USTN + signerGtid + role + timestamp)
    const crypto = await import("crypto");
    const documentHash = crypto
      .createHash("sha256")
      .update(`${ustn}|${signerGtid}|${signerRole}|${Date.now()}`)
      .digest("hex");
    const signatureValue = crypto
      .createHash("sha256")
      .update(`${documentHash}|SGTX-PASSKEY|${signerGtid}`)
      .digest("base64");

    // Create QesSignature record
    await db.qesSignature.create({
      data: {
        ustn,
        signerGtid,
        signerName,
        signatureType,
        legalEffect,
        provider: "ZITADEL",
        documentHash,
        signatureValue,
        documentType: "CONTRACT",
      },
    });

    // Activity log
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: signerGtid,
        action: "SIGNED_CONTRACT",
        type: "SUCCESS",
        description: `${signerRole} ${signerName} (${signerGtid}) signed contract for USTN ${ustn}. Signature type: ${signatureType}. Legal effect: ${legalEffect}.`,
      },
    });

    // IMPL-5 (ADDITIVE): Audit the Brain pre-screen verdict on the trade
    // activity feed. This does NOT alter the existing SIGNED_CONTRACT Activity
    // above — it adds a separate entry so the Brain's verdict + conditions are
    // visible in the audit trail. Only logged when the verdict was not ALLOW
    // (i.e. CONDITIONAL — DENY never reaches here because the HOC returns 422
    // without calling the handler).
    const prescreen = ctx.prescreen;
    if (prescreen && prescreen.verdict && prescreen.verdict !== "ALLOW") {
      await db.activity
        .create({
          data: {
            tradeId: trade.id,
            actorGtid: signerGtid,
            action: "BRAIN_PRESCREEN_CONDITIONAL",
            type: "INFO",
            description: `SGTX Brain (${prescreen.brainModule}) allowed contract sign with ${prescreen.conditions?.length ?? 0} condition(s) attached: ${
              (prescreen.conditions || [])
                .map((c) => `${c.condition_id}=${c.status}`)
                .join(", ") || "(none)"
            }. AI confidence: ${
              prescreen.aiConfidence != null ? prescreen.aiConfidence.toFixed(2) : "n/a"
            }.`,
          },
        })
        .catch(() => null);
    }

    // Timeline event - signature recorded
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: 3,
        label: `${signerRole} Signature`,
        description: `${signerName} signed via ${signatureType} (ZITADEL passkey).`,
        actorGtid: signerGtid,
        completed: true,
        completedAt: new Date(),
      },
    });

    // FIX-12-FINAL / Fix 8 — Publish a Brain event so the 38 subscribers fire
    // (audit section S34 — 0 events ever published). Fire-and-forget: a
    // publish failure never breaks the contract signing flow.
    eventBus
      .publish("trade.contract.signed", ustn, {
        ustn,
        signerGtid,
        signerRole,
        signatureType,
        legalEffect,
        documentHash,
      }, { source: "contract.sign", tenantGtid: signerGtid })
      .catch(() => { /* event publish failure is non-blocking */ });

    return NextResponse.json({
      ok: true,
      signed: true,
      signerGtid,
      signerRole,
      signatureType,
      legalEffect,
      documentHash,
      // IMPL-5 (ADDITIVE): surface Brain verdict on the response so callers
      // can see the compliance gate ran.
      brainVerdict: prescreen?.verdict ?? "ALLOW",
      brainModule: prescreen?.brainModule ?? "autoCheckCompliance",
      brainConditions: prescreen?.conditions ?? [],
    });
  } catch (e: any) {
    logger.error("[contract/sign] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Export the Brain-gated POST handler. `withBrainPrescreen` runs the prescreen
// BEFORE `postHandler`; DENY short-circuits with HTTP 422.
export const POST = withBrainPrescreen(prescreen, postHandler);
