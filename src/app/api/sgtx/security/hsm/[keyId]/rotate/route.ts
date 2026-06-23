import { NextRequest, NextResponse } from "next/server";
import { rotateKey, getHSMStatus, type HSMKeyType } from "@/lib/sgtx/security";

// POST /api/sgtx/security/hsm/[keyId]/rotate — rotate an HSM key
//
// Blueprint Part 14.4 — rotates the specified HSM key. The old key is
// archived (status=ARCHIVED) and a new key is installed (status=ACTIVE)
// with a bumped sequence number. The rotation event is Loom-anchored via
// ConfigurationHistory (configKey=`hsm_key.<purpose>`).
//
// Path param:
//   keyId — e.g. "HSM-GOVERNOR_SIGNING-001" (URL-encoded)
//
// Body (all optional):
//   {
//     reason?: string              — defaults to "scheduled_rotation"
//     multisigApproved?: boolean   — defaults to true (caller asserts)
//     newAlgorithm?: HSMKeyType    — defaults to the old algorithm
//   }
//
// Returns:
//   { ok, oldKeyId, newKeyId, algorithm, purpose, oldFingerprint, newFingerprint,
//     rotatedAt, rotationDueAt, loomAnchor, auditTrailId, reason }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  try {
    const { keyId: rawKeyId } = await params;
    const keyId = decodeURIComponent(rawKeyId);

    // Validate the key exists before rotation
    const preStatus = getHSMStatus();
    const existing = preStatus.keys.find((k) => k.keyId === keyId);
    if (!existing) {
      return NextResponse.json(
        {
          error: `HSM key not found: ${keyId}`,
          known: preStatus.keys.map((k) => k.keyId),
        },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const multisigApproved = body?.multisigApproved !== false; // default true
    if (!multisigApproved) {
      return NextResponse.json(
        {
          error: "Multisig approval required to rotate an HSM key",
          keyId,
          required: `${existing.custodyQuorum}-of-5 Platform Governance Authority approvals`,
        },
        { status: 403 },
      );
    }

    const newAlgorithm: HSMKeyType | undefined = body?.newAlgorithm;
    if (newAlgorithm) {
      const valid: HSMKeyType[] = [
        "Ed25519",
        "Dilithium3",
        "RSA-2048",
        "ECDSA-P256",
        "HMAC-SHA256",
        "Kyber768",
      ];
      if (!valid.includes(newAlgorithm)) {
        return NextResponse.json(
          {
            error: `Invalid algorithm: ${newAlgorithm}`,
            valid,
          },
          { status: 400 },
        );
      }
    }

    const result = await rotateKey(keyId, {
      reason: body?.reason,
      multisigApproved,
      newAlgorithm,
    });

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...result,
      natsSubject: "hsm.key.rotated",
      multisigApproved,
    });
  } catch (e: any) {
    console.error("[security/hsm/rotate POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "HSM key rotation failed" },
      { status: 500 },
    );
  }
}
