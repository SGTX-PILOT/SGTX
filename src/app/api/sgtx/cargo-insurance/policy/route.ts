// POST /api/sgtx/cargo-insurance/policy — create insurance policy
//
// Body:
//   {
//     ustn?: string,                 // optional — link to a shipment
//     providerId?: string,           // optional — issuing provider
//     policyNumber: string,          // required
//     coverageType: string,          // required (e.g., ALL_RISKS, TOTAL_LOSS_ONLY, WAR_RISK)
//     coverageAmount: number,        // required — insured value
//     premiumAmount: number,         // required — premium paid
//     currency?: string,             // optional — default USD
//     validFrom?: string,            // optional ISO date
//     validTo?: string,              // optional ISO date
//     certificateUrl?: string,       // optional
//     status?: string                // optional — default ACTIVE
//   }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      providerId,
      policyNumber,
      coverageType,
      coverageAmount,
      premiumAmount,
      currency,
      validFrom,
      validTo,
      certificateUrl,
      status,
    } = body || {};

    const missing: string[] = [];
    if (!policyNumber) missing.push("policyNumber");
    if (!coverageType) missing.push("coverageType");
    if (coverageAmount == null) missing.push("coverageAmount");
    if (premiumAmount == null) missing.push("premiumAmount");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const covAmount = Number(coverageAmount);
    const premAmount = Number(premiumAmount);
    if (isNaN(covAmount) || covAmount <= 0) {
      return NextResponse.json({ error: "coverageAmount must be a positive number" }, { status: 400 });
    }
    if (isNaN(premAmount) || premAmount < 0) {
      return NextResponse.json({ error: "premiumAmount must be a non-negative number" }, { status: 400 });
    }

    const data: any = {
      policyNumber: String(policyNumber).trim(),
      coverageType: String(coverageType).trim(),
      coverageAmount: +covAmount.toFixed(2),
      premiumAmount: +premAmount.toFixed(2),
      currency: currency || "USD",
      status: status || "ACTIVE",
    };
    if (ustn) data.ustn = ustn;
    if (providerId) data.providerId = providerId;
    if (validFrom) data.validFrom = new Date(validFrom);
    if (validTo) data.validTo = new Date(validTo);
    if (certificateUrl) data.certificateUrl = certificateUrl;

    const policy = await (db as any).insurancePolicy.create({ data });

    logger.info("[cargo-insurance/policy] created", {
      policyId: policy.id,
      ustn: ustn || null,
      policyNumber: data.policyNumber,
    });

    return NextResponse.json({ ok: true, policyId: policy.id, status: data.status });
  } catch (e: any) {
    logger.error("[cargo-insurance/policy] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
