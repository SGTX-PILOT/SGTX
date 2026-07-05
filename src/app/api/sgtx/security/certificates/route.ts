import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getCertificateInventory } from "@/lib/sgtx/security";

// GET /api/sgtx/security/certificates — full certificate inventory across
// all SGTX services.
//
// Blueprint Part 14.5 — aggregated certificate view spanning:
//   - 4 government adapter mTLS certs (Nafeza, CargoX, ETA, CBE)
//   - 4 PSP mTLS / HMAC certs (FAWRY, PAYMOB, STRIPE, CBE_IPN)
//   - 10 internal service mesh mTLS certs (Cilium)
//   - 1 QES signing cert (PAdES-LT)
//
// Returns:
//   {
//     certificates: Cert[],          // 19 total
//     expiringIn30Days: Cert[],      // subset expiring <30 days
//     expired: Cert[],               // subset already expired
//     total, activeCount, rotatingCount,
//     byService: Record<service, count>,
//     checkedAt: ISO timestamp
//   }
export async function GET() {
  try {
    const inventory = getCertificateInventory();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...inventory,
    });
  } catch (e: any) {
    logger.error("[security/certificates GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch certificate inventory" },
      { status: 500 },
    );
  }
}
