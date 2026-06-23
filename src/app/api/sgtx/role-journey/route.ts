import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/role-journey?employeeId=...  (Part 2.9 — Role Journey Maps)
// Returns completion status for every step of every role journey the employee
// is associated with. Used by Company Admin → Role Journeys dashboard.
//
// POST /api/sgtx/role-journey  { employeeId, roleType, stepKey }
// Marks a single journey step as completed for the employee.
//
// Role types per Part 2.9:
//   TRADER_BUYER (2.9.1), TRADER_SELLER (2.9.2), LSP (2.9.3), SHIP (2.9.4),
//   CBR (2.9.5), LAB (2.9.6), QC (2.9.7), FIN (2.9.8), GOV (2.9.9)

export const ROLE_JOURNEYS: Record<string, { label: string; steps: { key: string; label: string }[] }> = {
  TRADER_BUYER: {
    label: "Trader — Buyer (Importer)",
    steps: [
      { key: "day_1_kyb", label: "Register & complete KYB" },
      { key: "day_2_create_request", label: "Create trade request" },
      { key: "day_3_quote_accept", label: "Receive quote → negotiate → accept" },
      { key: "day_4_sign_contract", label: "Sign contract" },
      { key: "day_5_pay_fee", label: "Pay SGTX fee" },
      { key: "day_6_20_track", label: "Track shipment" },
      { key: "day_21_confirm_delivery", label: "Confirm delivery" },
      { key: "day_22_approve_settlement", label: "Approve settlement" },
    ],
  },
  TRADER_SELLER: {
    label: "Trader — Seller (Exporter)",
    steps: [
      { key: "day_1_kyb", label: "Register & complete KYB" },
      { key: "day_2_accept_request", label: "Receive buyer request → accept" },
      { key: "day_3_lock_exw_packing_logistics", label: "Lock EXW, design packing, get logistics quotes" },
      { key: "day_4_submit_quote", label: "Submit quote" },
      { key: "day_5_sign_contract_pay_fee", label: "Receive acceptance, sign contract, pay SGTX fee" },
      { key: "day_6_ack_release", label: "Acknowledge container release" },
      { key: "day_7_load", label: "Load container (warehouse)" },
      { key: "day_8_20_transit", label: "Vessel departure & transit" },
      { key: "day_21_receive_settlement", label: "Receive settlement" },
    ],
  },
  LSP: {
    label: "Logistics Service Provider",
    steps: [
      { key: "day_1_kyb", label: "Register & KYB" },
      { key: "day_2_rfq_quote", label: "Receive RFQ → send quote" },
      { key: "day_3_sign_addendum", label: "Quote accepted → sign addendum" },
      { key: "day_4_ack_release", label: "Acknowledge container release" },
      { key: "day_5_dispatch_load", label: "Dispatch driver → load" },
      { key: "day_6_deliver", label: "Deliver → confirm milestone" },
    ],
  },
  SHIP: {
    label: "Shipping Line",
    steps: [
      { key: "day_1_kyb", label: "Register & KYB" },
      { key: "day_2_booking_quote", label: "Receive booking request → send quote" },
      { key: "day_3_confirm_booking", label: "Quote accepted → confirm booking" },
      { key: "day_4_issue_ebl", label: "Issue eBL" },
      { key: "day_5_milestones", label: "Update milestones (departure, arrival)" },
      { key: "day_6_invoice", label: "Generate freight invoice" },
    ],
  },
  CBR: {
    label: "Customs Broker",
    steps: [
      { key: "day_1_kyb", label: "Register & KYB" },
      { key: "day_2_cert_request_quote", label: "Receive certification request → send quote" },
      { key: "day_3_certify", label: "Review AI declaration → certify" },
      { key: "day_4_physical_handling", label: "Physical document handling (if applicable)" },
    ],
  },
  LAB: {
    label: "Laboratory",
    steps: [
      { key: "day_1_kyb", label: "Register & KYB" },
      { key: "day_2_test_request_quote", label: "Receive test request → send quote" },
      { key: "day_3_sample_receipt", label: "Receive sample → confirm receipt" },
      { key: "day_4_results", label: "Perform tests → submit results" },
      { key: "day_5_certificates", label: "Certificates issued" },
    ],
  },
  QC: {
    label: "QC Inspector",
    steps: [
      { key: "day_1_kyb", label: "Register & KYB" },
      { key: "day_2_accept_job", label: "Receive inspection job → accept" },
      { key: "day_3_perform_inspection", label: "Pair mobile app → inspect → submit report" },
      { key: "day_4_action_plan", label: "Verify action plan (if conditional)" },
    ],
  },
  FIN: {
    label: "Financier (Bank)",
    steps: [
      { key: "day_1_kyb", label: "Register & KYB" },
      { key: "day_2_view_rfq_bid", label: "Receive auto-RFQ → view disclosure → submit bid" },
      { key: "day_3_sign_agreement", label: "Bid accepted → sign financing agreement" },
      { key: "day_4_disburse", label: "Disburse funds" },
      { key: "day_5_60_monitor", label: "Monitor loan (LTV, margin calls)" },
    ],
  },
  GOV: {
    label: "Government Officer",
    steps: [
      { key: "day_1_manual_onboarding", label: "Manual onboarding (diplomatic credentials)" },
      { key: "daily_monitor", label: "Monitor live trades" },
      { key: "as_needed_clear_shipment", label: "Clear shipment" },
      { key: "as_needed_verify_docs", label: "Verify documents" },
      { key: "weekly_compliance", label: "Review compliance metrics" },
    ],
  },
};

export async function GET(req: NextRequest) {
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  const completions = await db.roleJourneyCompletion.findMany({ where: { employeeId } });
  const completedKeys = new Set(completions.map((c) => `${c.roleType}:${c.stepKey}`));

  // Build full journey map with completion status per step
  const journeys = Object.entries(ROLE_JOURNEYS).map(([roleType, def]) => {
    const steps = def.steps.map((s) => ({
      ...s,
      completed: completedKeys.has(`${roleType}:${s.key}`),
    }));
    const completedCount = steps.filter((s) => s.completed).length;
    return {
      roleType,
      label: def.label,
      steps,
      totalSteps: steps.length,
      completedSteps: completedCount,
      progressPct: Math.round((completedCount / steps.length) * 100),
    };
  });

  return NextResponse.json({ employeeId, journeys });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employeeId, roleType, stepKey } = body;
  if (!employeeId || !roleType || !stepKey) {
    return NextResponse.json({ error: "employeeId, roleType, stepKey required" }, { status: 400 });
  }
  if (!ROLE_JOURNEYS[roleType]) {
    return NextResponse.json({ error: `Invalid roleType. Allowed: ${Object.keys(ROLE_JOURNEYS).join(", ")}` }, { status: 400 });
  }
  if (!ROLE_JOURNEYS[roleType].steps.find((s) => s.key === stepKey)) {
    return NextResponse.json({ error: `Invalid stepKey for role ${roleType}. Allowed: ${ROLE_JOURNEYS[roleType].steps.map((s) => s.key).join(", ")}` }, { status: 400 });
  }

  const completion = await db.roleJourneyCompletion.upsert({
    where: { employeeId_roleType_stepKey: { employeeId, roleType, stepKey } },
    update: {}, // idempotent — re-marking is a no-op
    create: { employeeId, roleType, stepKey },
  });

  // Activity log
  await db.activity.create({
    data: {
      action: `ROLE_JOURNEY_STEP_COMPLETED_${roleType}`,
      type: "INFO",
      description: `Employee ${employeeId} completed role journey step: ${roleType}/${stepKey}.`,
      metadata: JSON.stringify({ employeeId, roleType, stepKey }),
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, completion });
}
