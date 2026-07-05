import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getKeyRotationPolicy, triggerKeyRotation } from "@/lib/sgtx/security";

// GET /api/sgtx/security/key-rotation — key rotation policy + cadence
//
// Blueprint Part 14.4 — returns the HSM key rotation policy:
//   - Per-algorithm rotation cadence (Ed25519=180d, HMAC=90d, Dilithium3=365d)
//   - Last + next rotation timestamps
//   - Active algorithms in use
//   - Policy description
//
// POST /api/sgtx/security/key-rotation — trigger key rotation
//
// Body (optional):
//   {
//     keyId?: string              — rotate a specific key (omit = rotate all overdue)
//     reason?: string             — defaults to "policy_rotation"
//     multisigApproved?: boolean  — defaults to true
//   }
//
// Returns: { ok, rotations: KeyRotationResult[], policy: KeyRotationPolicy }

export async function GET() {
  try {
    const policy = getKeyRotationPolicy();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      policy,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[security/key-rotation GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch key rotation policy" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const multisigApproved = body?.multisigApproved !== false; // default true
    if (!multisigApproved) {
      return NextResponse.json(
        {
          error: "Multisig approval required to trigger HSM key rotation",
          required: "3-of-5 Platform Governance Authority approvals",
        },
        { status: 403 },
      );
    }

    const result = await triggerKeyRotation({
      keyId: body?.keyId,
      reason: body?.reason,
      multisigApproved,
    });

    if (result.rotations.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: "SIMULATION",
        message: body?.keyId
          ? `Key ${body.keyId} is not eligible for rotation`
          : "No overdue keys to rotate",
        rotations: [],
        policy: result.policy,
      });
    }

    return NextResponse.json({
      ok: result.ok,
      mode: "SIMULATION",
      rotatedCount: result.rotations.length,
      rotations: result.rotations,
      policy: result.policy,
      natsSubject: "hsm.key.rotated",
      multisigApproved,
    });
  } catch (e: any) {
    logger.error("[security/key-rotation POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Key rotation trigger failed" },
      { status: 500 },
    );
  }
}
