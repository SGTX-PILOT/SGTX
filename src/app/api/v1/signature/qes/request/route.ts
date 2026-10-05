// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createHash, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/v1/signature/qes/request — QES signature request (v18 §3.5.10.3)
//
// v18 §3.5.10: Cryptographic Signing & Qualified Electronic Signature (QES).
// This endpoint initiates a QES signing flow with the user's preferred TSP
// (Trust Service Provider). The TSP issues a one-time signing URL the user
// visits to sign with their QES certificate.
//
// Auth: Bearer JWT — the caller must be the signer.
//
// Request body (v18 §3.5.10.3):
//   {
//     "document_sha256": "abc123def456...",
//     "document_type": "CONTRACT" | "ADDENDUM" | "INVOICE" | "BL" | "PHYTO" | "COO" | ...,
//     "ustn": "SGTX-EG-26-F3A-1",
//     "signer_gtid": "SGTX-EG-TRD-002139-7F3A",
//     "signer_tsp": "EGYPT_TRUST" | "MISR" | "OTHER",
//     "callback_url": "https://api.sgtx.io/v1/signature/qes/callback"
//   }
//
// Response shape (v18 §3.5.10.3):
//   {
//     "request_id": "QES-20260415-001",
//     "tsp_request_url": "https://ts.egypttrust.com.eg/sign/abc123",
//     "expires_at": "2026-04-15T12:00:00Z",
//     "status": "PENDING"
//   }

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
}

function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const VALID_TSPS = new Set(["EGYPT_TRUST", "MISR", "OTHER"]);
const VALID_DOC_TYPES = new Set([
  "CONTRACT",
  "ADDENDUM",
  "INVOICE",
  "BILL_OF_LADING",
  "PHYTOSANITARY",
  "CERTIFICATE_OF_ORIGIN",
  "INSURANCE_CERT",
  "LAB_REPORT",
  "QC_REPORT",
  "CUSTOMS_DECLARATION",
  "FINANCING_AGREEMENT",
]);

// In-memory rate limiter (20 req/min per signer — QES is a deliberate action)
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function checkRateLimit(key: string) {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Invalid JSON body" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const documentSha256 = body?.document_sha256;
    const documentType = (body?.document_type || "").toUpperCase();
    const ustn = (body?.ustn || "").toUpperCase();
    const signerGtid = (body?.signer_gtid || "").toUpperCase();
    const signerTsp = (body?.signer_tsp || "").toUpperCase();
    const callbackUrl = body?.callback_url;

    // Validate fields
    if (!documentSha256 || typeof documentSha256 !== "string" || documentSha256.length < 8) {
      return NextResponse.json(
        { error: "INVALID_DOCUMENT_SHA256", message: "document_sha256 is required (min 8 chars)" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!VALID_DOC_TYPES.has(documentType)) {
      return NextResponse.json(
        { error: "INVALID_DOCUMENT_TYPE", message: `document_type must be one of: ${Array.from(VALID_DOC_TYPES).join(", ")}` },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!ustn) {
      return NextResponse.json(
        { error: "INVALID_USTN", message: "ustn is required" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!signerGtid) {
      return NextResponse.json(
        { error: "INVALID_SIGNER_GTID", message: "signer_gtid is required" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!VALID_TSPS.has(signerTsp)) {
      return NextResponse.json(
        { error: "INVALID_SIGNER_TSP", message: `signer_tsp must be one of: ${Array.from(VALID_TSPS).join(", ")}` },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Caller must be the signer
    if (caller.gtid !== signerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "Caller must be the signer_gtid or an ADM/GOV" },
        { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const rl = checkRateLimit(signerGtid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } },
      );
    }

    // Generate request ID + TSP request URL (in production this would call the
    // TSP's API to get a real signing URL; here we synthesize one)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const requestId = `QES-${dateStr}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const tspHost =
      signerTsp === "EGYPT_TRUST" ? "ts.egypttrust.com.eg" :
      signerTsp === "MISR" ? "ts.misr.com.eg" :
      "ts.other-tsp.example";
    const tspRequestUrl = `https://${tspHost}/sign/${randomBytes(12).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    // Persist the QES request (best-effort — table may not exist in dev)
    const { freshDb } = await import("@/lib/db-fresh");
    let persisted = false;
    try {
      // Use a generic activity log to record the QES request
      await freshDb.activity.create({
        data: {
          action: "QES_SIGNATURE_REQUEST",
          type: "INFO",
          description: `QES request ${requestId} for ${documentType} (USTN ${ustn}) by ${signerGtid} via ${signerTsp}`,
          actorGtid: signerGtid,
        },
      });
      persisted = true;
    } catch (e: any) {
      logger.warn("[v1/signature/qes/request] Activity log failed (non-fatal):", { error: e?.message });
    }

    return NextResponse.json(
      {
        request_id: requestId,
        tsp_request_url: tspRequestUrl,
        expires_at: expiresAt.toISOString(),
        status: "PENDING",
        document_sha256: documentSha256,
        document_type: documentType,
        ustn,
        signer_gtid: signerGtid,
        signer_tsp: signerTsp,
        callback_url: callbackUrl || null,
        persisted,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
          "X-RateLimit-Remaining": String(rl.remaining),
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/signature/qes/request] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "QES request failed" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
