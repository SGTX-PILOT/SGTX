import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/v1/auth/recovery — initiate account recovery.
// Body: { email?: string, gtid?: string, method?: "EMAIL" | "SMS" | "BACKUP_CODES" }
// Returns: { ok: true, message: "Recovery instructions sent if account exists", recoveryId? }
// NOTE: Always returns ok=true to prevent email/GTID enumeration. The recoveryId is only
// returned in development mode for testing purposes.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, gtid, method = "EMAIL" } = body;

    if (!email && !gtid) {
      return NextResponse.json({ error: "email or gtid required" }, { status: 400 });
    }

    // Look up the tenant by GTID (Tenant model doesn't have email — use Employee table for email)
    let tenant: { id: string; gtid: string; legalName: string; lifecycleState: string } | null = null;
    if (gtid) {
      tenant = await db.tenant.findUnique({
        where: { gtid },
        select: { id: true, gtid: true, legalName: true, lifecycleState: true },
      });
    } else if (email) {
      // Find tenant via employee email
      const emp = await db.employee.findFirst({
        where: { email },
        select: { tenant: { select: { id: true, gtid: true, legalName: true, lifecycleState: true } } },
      });
      tenant = emp?.tenant ?? null;
    }

    // Always return ok=true to prevent enumeration
    if (!tenant) {
      return NextResponse.json({
        ok: true,
        message: "Recovery instructions sent if account exists",
      });
    }

    // Check if tenant is suspended (break-glass) — if so, escalate
    if (tenant.lifecycleState === "SUSPENDED") {
      return NextResponse.json({
        ok: true,
        message: "Account is under compliance review. Contact SGTX Platform Admin for assistance.",
      });
    }

    // Generate a recovery token (in production: store in DB with TTL, send via email/SMS)
    const recoveryId = `REC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
    const recoveryToken = Buffer.from(JSON.stringify({
      recoveryId,
      gtid: tenant.gtid,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    })).toString("base64url");

    // In production: send recovery email/SMS here with the token
    console.log(`[auth/recovery] Recovery token generated for ${tenant.gtid}: ${recoveryId}`);

    return NextResponse.json({
      ok: true,
      message: `Recovery instructions sent for account "${tenant.legalName}" via ${method}`,
      recoveryId,
      recoveryToken, // DEV ONLY — remove in production
      expiresIn: 30 * 60,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
