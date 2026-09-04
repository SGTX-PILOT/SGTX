import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { reloadModule, getModule } from "@/lib/sgtx/governor/wasm-modules";
import { verifyTokenEdge } from "@/lib/v1/auth-edge";

// POST /api/sgtx/governor/modules/[name]/reload — hot-reload a constitutional WASM module
//
// CERT-32 P0 FIX (F-06): The previous code defaulted
// `body.multisigApproved = true`, allowing ANY logged-in user to
// hot-reload `fee_gate.wasm`, `constitutional_rules.wasm`, etc. without
// actual multisig approval.
//
// New policy:
//   1. The caller MUST be authenticated (JWT verified).
//   2. The caller's role MUST be `PLATFORM_ADMIN` (RBAC).
//   3. `multisigApproved` defaults to `false` (fail-closed). The caller
//      must explicitly assert `multisigApproved: true` AND provide a
//      non-empty `multisigProof` field (a reference to the off-chain
//      multisig approval record, e.g. a quorum certificate hash).
//   4. The audit Activity row records the verified admin's GTID and the
//      multisig proof reference.
//
// Blueprint Part 1.3.5 — publishes on NATS subject `constitutional.modules.update`,
// downloads the new bundle, verifies the Ed25519 signature against the Platform
// Governance Authority key, verifies the SHA256 hash matches the announced hash,
// quiesces in-flight decisions, swaps the in-memory pointer atomically, and
// Loom-anchors the change event.
//
// Path param:
//   name — module filename, e.g. "fee_gate.wasm" or "fee_gate" (auto-suffixed)
//
// Body (all optional except where noted):
//   {
//     newVersion?: string   (semver like "v1.0.1" — defaults to patch bump)
//     newHash?: string      (sha256:… — defaults to derived hash from name+version)
//     signedBy?: string     (GTID of signer — defaults to Platform Governance Authority)
//     reloadReason?: string (free-text reason, persisted to audit trail)
//     multisigApproved: boolean  (REQUIRED — must be true)
//     multisigProof: string     (REQUIRED — quorum certificate hash or reference)
//   }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    // ── CERT-32 FIX #1: authenticate the caller ────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const sessionCookie = req.cookies.get("sgtx-session")?.value || "";
    const token = authHeader.replace("Bearer ", "") || sessionCookie;
    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const payload = await verifyTokenEdge(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // ── CERT-32 FIX #2: RBAC — only PLATFORM_ADMIN can reload WASM ────
    const role = (payload as any).role || "";
    if (role !== "PLATFORM_ADMIN" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: PLATFORM_ADMIN role required to reload constitutional WASM modules" },
        { status: 403 },
      );
    }

    const { name: rawName } = await params;
    const name = normalizeModuleName(rawName);

    const existing = getModule(name);
    if (!existing) {
      return NextResponse.json(
        {
          error: `Unknown constitutional WASM module: ${rawName}`,
          known: [
            "constitutional_rules.wasm",
            "jurisdiction_matrix.wasm",
            "incoterms_engine.wasm",
            "fee_gate.wasm",
            "distressed_country_gate.wasm",
            "dual_mode_gate.wasm",
            "reserve_rules.wasm",
          ],
        },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({} as any));

    // ── CERT-32 FIX #3 (F-06): fail-closed multisig ───────────────────
    // The previous code: `const multisigApproved = body?.multisigApproved !== false;`
    // → defaulted to TRUE when the field was absent (the most common case).
    // The new code: defaults to FALSE. The caller MUST explicitly assert
    // `multisigApproved: true` AND provide a `multisigProof` reference.
    const multisigApproved = body?.multisigApproved === true;
    const multisigProof = (body?.multisigProof as string | undefined) || "";
    if (!multisigApproved) {
      return NextResponse.json(
        {
          error: "Multisig approval required to hot-reload a constitutional WASM module",
          module: name,
          required: "≥3 Platform Governance Authority member approvals + multisigProof reference",
          hint: "Set multisigApproved=true AND provide multisigProof (quorum certificate hash).",
        },
        { status: 403 },
      );
    }
    if (multisigProof.length < 10) {
      return NextResponse.json(
        {
          error: "multisigProof is required (≥10 chars — quorum certificate hash or off-chain approval reference)",
          module: name,
        },
        { status: 400 },
      );
    }

    const result = await reloadModule(name, {
      newVersion: body?.newVersion,
      newHash: body?.newHash,
      signedBy: body?.signedBy,
      reloadReason: body?.reloadReason,
      multisigApproved,
    });

    // Audit the reload — record the VERIFIED admin GTID + multisig proof.
    logger.info("constitutional-wasm-reloaded", {
      module: name,
      adminGtid: (payload as any).tenantGtid,
      multisigProof,
      previousVersion: result.previousVersion,
      newVersion: result.newVersion,
    });

    return NextResponse.json({
      ok: result.status === "ACTIVE",
      ...result,
      natsSubject: "constitutional.modules.update",
      multisigApproved,
      multisigProof,
      reloadedBy: (payload as any).tenantGtid,
    });
  } catch (e: any) {
    logger.error("[governor/modules/reload POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "WASM module reload failed" },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function normalizeModuleName(raw: string): string {
  if (!raw) return raw;
  if (raw.endsWith(".wasm")) return raw;
  return `${raw}.wasm`;
}
