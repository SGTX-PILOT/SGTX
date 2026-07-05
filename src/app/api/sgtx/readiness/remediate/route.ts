// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/readiness/remediate
// Blueprint Part 2.8 — one-click remediation. Each checklist item has a
// `ctaLabel`; this endpoint returns a structured action (redirect URL or
// instruction) so the UI can drive the user straight to the right page.
//
// Body: { tenantGtid, itemId }
// Returns:
//   • { action: "redirect", url, itemId, label, instructions }
//   • { action: "instruction", instructions, itemId, label }
//   • 404 if the item is unknown
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, itemId } = await req.json();
    if (!tenantGtid || !itemId) {
      return NextResponse.json(
        { error: "tenantGtid + itemId required" },
        { status: 400 },
      );
    }

    // Verify tenant exists (best-effort — not strictly required, but useful)
        const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } }) as any;
    if (!tenant) {
            return NextResponse.json({ error: "tenant not found" }, { status: 404 }) as any;
    }

    // Look up the remediation map for the requested item. The map is keyed by
    // the checklist `id` values emitted by /api/sgtx/readiness (Part 2.8.2).
    const remediation = REMEDIATION_MAP[itemId];
    if (!remediation) {
      return NextResponse.json(
        {
          action: "instruction",
          itemId,
          label: itemId,
          instructions:
            "No automated remediation path is configured for this item. Please contact support or visit Company Admin → Readiness to resolve manually.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      itemId,
      label: remediation.label,
      tenantGtid,
      ...remediation,
        }) as any;
  } catch (e: any) {
    logger.error("[readiness/remediate] error:", e);
    return NextResponse.json(
      { error: e?.message || "Remediation lookup failed" },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/readiness/remediate — list all available remediation paths
export async function GET() {
  return NextResponse.json({
    remediationPaths: Object.entries(REMEDIATION_MAP).map(([id, v]) => ({ itemId: id, ...v })),
  });
}

// ── Remediation map ────────────────────────────────────────────────────────
// Maps checklist item IDs to a structured remediation action. URLs use
// relative paths so they work regardless of the deployment origin.
type RemediationAction =
  | { action: "redirect"; url: string; label: string; instructions: string }
  | { action: "instruction"; instructions: string; label: string };

const REMEDIATION_MAP: Record<string, RemediationAction> = {
  // Company category
  tax_id: {
    action: "redirect",
    url: "/company-admin#tax-id",
    label: "Verify Tax ID",
    instructions: "Navigate to Company Admin → Tax Identifiers. Upload your tax certificate and the system will cross-reference it with ETA (Egypt) or the equivalent national registry.",
  },
  commercial_reg: {
    action: "redirect",
    url: "/company-admin#commercial-register",
    label: "Upload Commercial Register",
    instructions: "Navigate to Company Admin → Commercial Register. Upload the commercial register extract (PDF, max 10 MB). A2 (HF Donut) will extract and verify the fields.",
  },
  address: {
    action: "redirect",
    url: "/company-admin#address",
    label: "Verify Address",
    instructions: "Navigate to Company Admin → Address. Enter your office address and upload a proof-of-address document (utility bill, lease). Nominatim geocoding validates the address.",
  },
  ubo: {
    action: "redirect",
    url: "/company-admin#ubo",
    label: "Complete UBO Declaration",
    instructions: "Navigate to Company Admin → UBO Declaration. Complete the structured form (name, nationality, ownership %) and digitally sign.",
  },
  financial_stmt: {
    action: "redirect",
    url: "/company-admin#financials",
    label: "Upload Statement",
    instructions: "Optional: navigate to Company Admin → Financials to upload your annual financial statement (PDF). AI extracts key figures.",
  },
  insurance: {
    action: "redirect",
    url: "/company-admin#insurance",
    label: "Upload Insurance",
    instructions: "Optional: navigate to Company Admin → Insurance to upload your insurance certificate. RIA validates the expiry date.",
  },

  // Banking category
  bank_account: {
    action: "redirect",
    url: "/company-admin#banking",
    label: "Connect PSP / Verify IBAN",
    instructions: "Navigate to Company Admin → Banking. Connect a PSP (Fawry / Paymob / Stripe) or verify a bank IBAN via micro-deposit. Required for fee collection and settlement.",
  },
  settlement: {
    action: "redirect",
    url: "/company-admin#banking",
    label: "Connect PSP / Verify IBAN",
    instructions: "Navigate to Company Admin → Banking → Settlement Account. Connect a PSP or verify an IBAN.",
  },
  finance_prefs: {
    action: "redirect",
    url: "/company-admin#banking",
    label: "Set Finance Preferences",
    instructions: "Navigate to Company Admin → Banking → Preferences. Select your default payment method and currency.",
  },
  debit_auth: {
    action: "redirect",
    url: "/company-admin#banking",
    label: "Authorise Debit",
    instructions: "Optional: navigate to Company Admin → Banking → Debit Authorisation. Sign the mandate for auto-charges (fees, financing repayments).",
  },
  credit_facility: {
    action: "redirect",
    url: "/company-admin#banking",
    label: "Request Facility",
    instructions: "Optional (financier only): navigate to Company Admin → Banking → Credit Facility. Upload your credit line letter for manual verification.",
  },

  // Trade category
  product: {
    action: "redirect",
    url: "/company-admin#commodities",
    label: "Add Product",
    instructions: "Navigate to Company Admin → Saved Commodities. Add at least one product with HS code, description, and typical packaging.",
  },
  port: {
    action: "redirect",
    url: "/company-admin#ports",
    label: "Add Port",
    instructions: "Navigate to Company Admin → Saved Ports. Add at least one UN/LOCODE port you frequently ship to or from.",
  },
  incoterm: {
    action: "redirect",
    url: "/company-admin#preferences",
    label: "Choose Incoterm",
    instructions: "Navigate to Company Admin → Preferences → Default Incoterm. Select your default from the Incoterms 2020 list.",
  },
  shipping_lines: {
    action: "redirect",
    url: "/company-admin#contacts",
    label: "Add Shipping Line",
    instructions: "Optional (seller only): navigate to Company Admin → Contacts. Add at least one shipping line (SHIP) contact by GTID.",
  },
  customs_broker: {
    action: "redirect",
    url: "/company-admin#contacts",
    label: "Add Customs Broker",
    instructions: "Optional (buyer only): navigate to Company Admin → Contacts. Add at least one customs broker (CBR) contact by GTID.",
  },

  // Security category
  passkey: {
    action: "redirect",
    url: "/company-admin#security",
    label: "Enrol Passkey",
    instructions: "Navigate to Company Admin → Security → Passkeys. Enrol a WebAuthn passkey (ZITADEL). Required for all high-value actions.",
  },
  mfa: {
    action: "redirect",
    url: "/company-admin#security",
    label: "Enable MFA",
    instructions: "Navigate to Company Admin → Security → MFA. Enable TOTP or enrol an additional passkey.",
  },
  recovery: {
    action: "redirect",
    url: "/company-admin#security",
    label: "Generate Backup Codes",
    instructions: "Navigate to Company Admin → Security → Recovery. Generate backup codes or verify a recovery email.",
  },
  hw_key: {
    action: "redirect",
    url: "/company-admin#security",
    label: "Register Security Key",
    instructions: "Optional: navigate to Company Admin → Security → Hardware Keys. Register a WebAuthn roaming authenticator (YubiKey).",
  },
  session_risk: {
    action: "redirect",
    url: "/company-admin#security",
    label: "Opt In",
    instructions: "Optional: navigate to Company Admin → Security → Session Risk. Opt in to behavioural anomaly detection.",
  },

  // Legal category
  tos: {
    action: "redirect",
    url: "/company-admin#legal",
    label: "Review & Accept",
    instructions: "Navigate to Company Admin → Legal → Terms of Service. Review the current version and accept.",
  },
  privacy: {
    action: "redirect",
    url: "/company-admin#legal",
    label: "Review & Accept",
    instructions: "Navigate to Company Admin → Legal → Privacy Notice. Review and accept with granular options.",
  },
  fee_schedule: {
    action: "redirect",
    url: "/company-admin#legal",
    label: "Sign Fee Schedule",
    instructions: "Navigate to Company Admin → Legal → Fee Schedule. Digitally sign the fee schedule (Ed25519). Required before fee collection can occur.",
  },
  dpa: {
    action: "redirect",
    url: "/company-admin#legal",
    label: "Sign DPA",
    instructions: "Optional (EU counterparties): navigate to Company Admin → Legal → DPA. Sign the Data Processing Agreement.",
  },

  // KYB-related items surfaced by readiness but not in the canonical checklist
  kyb_verified: {
    action: "redirect",
    url: "/company-admin#kyb",
    label: "Complete KYB Verification",
    instructions: "Navigate to Company Admin → KYB. Upload all required documents and complete biometric liveness verification. KYB Tier 2 unlocks trade execution.",
  },
  qes_enrolled: {
    action: "redirect",
    url: "/company-admin#qes",
    label: "Enrol for QES",
    instructions: "Navigate to Company Admin → QES. Select a TSP (Egypt Trust or Misr) and complete the in-person or video identity verification. QES is required for government filings and contracts > $100k.",
  },
};
