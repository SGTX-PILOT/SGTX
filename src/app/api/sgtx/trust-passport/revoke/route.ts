import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/trust-passport/revoke  (Part 2.10.4 — Step 4: Revoke Access)
// Body: { token, reason?, revokedBy? }
//
// Revokes a Trust Passport sharing token IMMEDIATELY. Any subsequent attempt
// to verify that token returns { valid: false, reason: "revoked" } (Part 2.10.4).
//
// Also creates a TrustPassportRevocation record (audit trail) per blueprint
// 2.10.4 and 2.11 (trust_passport_revocations table).

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, reason, revokedBy } = body;
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const tokenRec = await db.trustPassportToken.findUnique({ where: { token } });
  if (!tokenRec) return NextResponse.json({ error: "token not found", valid: false }, { status: 404 });

  if (tokenRec.revoked) {
    return NextResponse.json({ ok: true, already_revoked: true, message: "Token was already revoked." });
  }

  // Mark the token as revoked + create revocation record (audit trail)
  await db.$transaction([
    db.trustPassportToken.update({ where: { id: tokenRec.id }, data: { revoked: true } }),
    db.trustPassportRevocation.create({
      data: {
        passportId: tokenRec.passportId,
        reason: reason || "revoked by tenant admin",
        revokedBy: revokedBy || "tenant-admin",
      },
    }),
  ]);

  // Activity log
  await db.activity.create({
    data: {
      action: "TRUST_PASSPORT_TOKEN_REVOKED",
      type: "INFO",
      description: `Trust passport sharing token revoked. Passport ID: ${tokenRec.passportId}. Reason: ${reason || "n/a"}.`,
      metadata: JSON.stringify({ passportId: tokenRec.passportId, token, reason, revokedBy }),
    },
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    revoked: true,
    passportId: tokenRec.passportId,
    revokedAt: new Date().toISOString(),
    message: "Token revoked. Any subsequent verification attempt will return { valid: false, reason: 'revoked' }.",
  });
}

// GET /api/sgtx/trust-passport/revoke?tenant=GTID — list revocations for a tenant's passports
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });

  const passport = await db.trustPassport.findUnique({ where: { tenantGtid: tenant } });
  if (!passport) return NextResponse.json({ revocations: [] });

  const revocations = await db.trustPassportRevocation.findMany({
    where: { passportId: passport.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ revocations, count: revocations.length });
}
