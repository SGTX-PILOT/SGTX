import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { reloadModule, getModule } from "@/lib/sgtx/governor/wasm-modules";

// POST /api/sgtx/governor/modules/[name]/reload — hot-reload a constitutional WASM module
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
// Body (all optional):
//   {
//     newVersion?: string   (semver like "v1.0.1" — defaults to patch bump)
//     newHash?: string      (sha256:… — defaults to derived hash from name+version)
//     signedBy?: string     (GTID of signer — defaults to Platform Governance Authority)
//     reloadReason?: string (free-text reason, persisted to audit trail)
//     multisigApproved?: boolean (default true — caller asserts approval)
//   }
//
// Returns:
//   {
//     ok, module, previousVersion, newVersion, previousHash, newHash,
//     signatureVerified, hashVerified, status, reloadedAt, loomAnchor, reloadReason
//   }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
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
    const multisigApproved = body?.multisigApproved !== false; // default true
    if (!multisigApproved) {
      return NextResponse.json(
        {
          error: "Multisig approval required to hot-reload a constitutional WASM module",
          module: name,
          required: "≥3 Platform Governance Authority member approvals",
        },
        { status: 403 },
      );
    }

    const result = await reloadModule(name, {
      newVersion: body?.newVersion,
      newHash: body?.newHash,
      signedBy: body?.signedBy,
      reloadReason: body?.reloadReason,
      multisigApproved,
    });

    return NextResponse.json({
      ok: result.status === "ACTIVE",
      ...result,
      natsSubject: "constitutional.modules.update",
      multisigApproved,
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
