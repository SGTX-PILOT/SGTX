import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/onboarding/state?gtid=...  (Part 2.2 + 2.11 — TenantOnboardingState)
// Returns the current 6-step onboarding progress for a tenant.
//
// POST /api/sgtx/onboarding/state  { gtid, currentStep?, stepData?, sandboxActive?, completed? }
// Upserts the onboarding state — used by the OnboardingWizard to persist
// progress between page reloads (Part 2.2 — wizard must be resumable).

export async function GET(req: NextRequest) {
  const gtid = (req.nextUrl.searchParams.get("gtid") || "").trim().toUpperCase();
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });

  const tenant = await db.tenant.findUnique({ where: { gtid } });
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  let state = await db.tenantOnboardingState.findUnique({ where: { tenantGtid: gtid } });
  if (!state) {
    // Default state for a fresh tenant: step 1, sandbox active, not completed.
    state = await db.tenantOnboardingState.create({
      data: {
        tenantGtid: gtid,
        currentStep: 1,
        stepData: "{}",
        sandboxActive: tenant.lifecycleState === "REGISTERED" || tenant.lifecycleState === "ONBOARDING",
        completed: tenant.lifecycleState === "VERIFIED",
      },
    });
  }

  // Map wizard step numbers to blueprint step names (Part 2.2.1 — 6 steps).
  const stepNames: Record<number, string> = {
    1: "welcome_gtid_confirmation", // Part 2.2.2
    2: "organization_details",      // Part 2.2.3
    3: "kyb_kyc_verification",      // Part 2.2.4
    4: "profile_configuration",     // Part 2.2.5
    5: "create_first_resource",     // Part 2.2.6
    6: "enter_sandbox",             // Part 2.2.7
  };

  return NextResponse.json({
    gtid,
    currentStep: state.currentStep,
    currentStepName: stepNames[state.currentStep] || "unknown",
    stepNames,
    stepData: JSON.parse(state.stepData || "{}"),
    sandboxActive: state.sandboxActive,
    completed: state.completed,
    lifecycleState: tenant.lifecycleState,
    updatedAt: state.updatedAt,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const gtid = (body.gtid || "").trim().toUpperCase();
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });

  const tenant = await db.tenant.findUnique({ where: { gtid } });
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const currentStep = Number.isInteger(body.currentStep) && body.currentStep >= 1 && body.currentStep <= 6 ? body.currentStep : undefined;
  const stepData = body.stepData && typeof body.stepData === "object" ? JSON.stringify(body.stepData) : undefined;
  const sandboxActive = typeof body.sandboxActive === "boolean" ? body.sandboxActive : undefined;
  const completed = typeof body.completed === "boolean" ? body.completed : undefined;

  const data: any = {};
  if (currentStep !== undefined) data.currentStep = currentStep;
  if (stepData !== undefined) data.stepData = stepData;
  if (sandboxActive !== undefined) data.sandboxActive = sandboxActive;
  if (completed !== undefined) data.completed = completed;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update — supply currentStep/stepData/sandboxActive/completed" }, { status: 400 });
  }

  const state = await db.tenantOnboardingState.upsert({
    where: { tenantGtid: gtid },
    update: data,
    create: { tenantGtid: gtid, currentStep: currentStep ?? 1, stepData: stepData ?? "{}", sandboxActive: sandboxActive ?? true, completed: completed ?? false },
  });

  // Activity log
  await db.activity.create({
    data: {
      actorGtid: gtid,
      action: "ONBOARDING_STATE_SAVED",
      type: "INFO",
      description: `Onboarding state for ${gtid} saved: step=${state.currentStep}, sandbox=${state.sandboxActive}, completed=${state.completed}.`,
      metadata: JSON.stringify(data),
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, state });
}
