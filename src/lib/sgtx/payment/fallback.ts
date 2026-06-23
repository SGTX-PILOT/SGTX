// SGTX Part 6.5.2 — Automatic PSP Fallback
// If the primary PSP fails (webhook timeout, 5xx error), the router
// automatically retries with the next PSP in the fallback chain.
// The user is notified via Smart Inbox but does not need to reauthenticate.
//
// Health Monitoring (Part 6.5.2):
//   - psp-health-monitor pings each PSP's health endpoint every 30s
//   - health score <80 → DEGRADED
//   - health score <50 → DISABLED; automatic fallback triggered
//
// PSP chain per Part 6.5.2 (per country):
//   Egypt (EGP):  Fawry → PayMob → CBE IPN
//   Egypt (USD):  Stripe → PayMob (USD)
//   UAE (USD):    Payoneer → Stripe
//   EU (EUR):     Stripe → Adyen

import { db as _db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { selectOptimalPsp, processPspSplit, PspProvider, PSP_PROVIDERS } from "./psp-split";

// Use freshDb (non-cached PrismaClient) so writes work even when the globalThis-
// cached `db` has a stale SQLite connection (e.g. after `bun run db:push`
// replaces the DB file mid-dev-session). After a dev-server restart, both
// `db` and `freshDb` are equivalent.
const db = (freshDb ?? _db) as typeof _db;

// Use freshDb when accessing newly-added models (PaymentAggregator, PspHealthLog).
// After a dev-server restart, `db` from `@/lib/db` will also have these models.
const DB = db;

export interface PspHealthSnapshot {
  provider: PspProvider;
  healthScore: number;       // 0-100
  latencyMs: number;
  errorRate: number;         // 0-1
  status: "HEALTHY" | "DEGRADED" | "DISABLED";
  lastCheckedAt: string | null;
}

export interface FallbackExecutionResult {
  ustn: string;
  stage: "STAGE1" | "STAGE2";
  attemptedChain: Array<{
    provider: PspProvider;
    success: boolean;
    failureReason?: string;
    pspReference?: string;
    paymentAttemptId?: string;
    durationMs: number;
  }>;
  finalPspProvider: PspProvider | null;
  finalPaymentAttemptId: string | null;
  finalPspReference: string | null;
  feeLockStatus: string;
  fallbackUsed: boolean;
  ok: boolean;
}

// ── Per-country fallback chains (Part 6.5.2) ──────────────────────────
const COUNTRY_FALLBACK_CHAINS: Record<string, PspProvider[]> = {
  "EG-EGP": ["FAWRY", "PAYMOB", "CBE_IPN"],
  "EG-USD": ["STRIPE", "PAYMOB"],
  "AE-USD": ["STRIPE", "PAYMOB"],          // Payoneer not in PSP_PROVIDERS; STRIPE primary
  "AE-AED": ["STRIPE", "PAYMOB"],
  "EU-EUR": ["STRIPE", "PAYMOB"],
  "DE-EUR": ["STRIPE", "PAYMOB"],
  "FR-EUR": ["STRIPE", "PAYMOB"],
  "DEFAULT-USD": ["STRIPE", "PAYMOB", "FAWRY"],
  "DEFAULT-EGP": ["FAWRY", "PAYMOB", "CBE_IPN"],
};

export function resolveFallbackChain(
  payerCountry: string,
  currency: string
): PspProvider[] {
  const key = `${payerCountry}-${currency}`;
  if (COUNTRY_FALLBACK_CHAINS[key]) return COUNTRY_FALLBACK_CHAINS[key];
  const defaultKey = `DEFAULT-${currency}`;
  return COUNTRY_FALLBACK_CHAINS[defaultKey] ?? ["STRIPE", "PAYMOB", "FAWRY"];
}

// ── PSP Health Monitoring (Part 6.5.2) ────────────────────────────────
// Computes a 0-100 health score from recent PspHealthLog rows.
// <80 → DEGRADED, <50 → DISABLED.
export async function getPspHealth(provider: PspProvider): Promise<PspHealthSnapshot> {
  // Use DB (freshDb) so new models added mid-session are accessible without dev-server restart.
  const pspHealthLog = (DB as any).pspHealthLog;
  if (!pspHealthLog) {
    return { provider, healthScore: 95, latencyMs: 200, errorRate: 0.01, status: "HEALTHY", lastCheckedAt: null };
  }
  const recent: any[] = await pspHealthLog.findMany({
    where: { aggregatorName: provider },
    orderBy: { checkedAt: "desc" },
    take: 5,
  });
  if (recent.length === 0) {
    // No monitoring data → assume healthy (default score 95)
    return {
      provider,
      healthScore: 95,
      latencyMs: 200,
      errorRate: 0.01,
      status: "HEALTHY",
      lastCheckedAt: null,
    };
  }
  const avgScore = recent.reduce((s, r) => s + r.healthScore, 0) / recent.length;
  const avgLatency = recent.reduce((s, r) => s + (r.latencyMs || 0), 0) / recent.length;
  const avgErrorRate = recent.reduce((s, r) => s + (r.errorRate || 0), 0) / recent.length;
  const status: PspHealthSnapshot["status"] =
    avgScore < 50 ? "DISABLED" : avgScore < 80 ? "DEGRADED" : "HEALTHY";
  return {
    provider,
    healthScore: Math.round(avgScore * 100) / 100,
    latencyMs: Math.round(avgLatency),
    errorRate: Math.round(avgErrorRate * 10000) / 10000,
    status,
    lastCheckedAt: recent[0].checkedAt.toISOString(),
  };
}

export async function getAllPspHealth(): Promise<PspHealthSnapshot[]> {
  return Promise.all(PSP_PROVIDERS.map(p => getPspHealth(p)));
}

// Record a health check (called by the psp-health-monitor cron, real or simulated)
export async function recordPspHealthCheck(
  provider: PspProvider,
  healthScore: number,
  latencyMs: number,
  errorRate: number
): Promise<PspHealthSnapshot> {
  const status: PspHealthSnapshot["status"] =
    healthScore < 50 ? "DISABLED" : healthScore < 80 ? "DEGRADED" : "HEALTHY";
  const pspHealthLog = (DB as any).pspHealthLog;
  if (pspHealthLog) {
    await pspHealthLog.create({
      data: {
        aggregatorName: provider,
        healthScore,
        latencyMs,
        errorRate,
        status,
      },
    });
  }
  // Update aggregator's lastHealthCheck (defensive)
  const paymentAggregator = (DB as any).paymentAggregator;
  if (paymentAggregator) {
    await paymentAggregator.updateMany({
      where: { name: provider },
      data: { lastHealthCheck: new Date(), uptimeScore: healthScore },
    });
  }
  return {
    provider,
    healthScore,
    latencyMs,
    errorRate,
    status,
    lastCheckedAt: new Date().toISOString(),
  };
}

// Seed default PaymentAggregator rows (idempotent) so health checks have rows to update.
export async function ensurePaymentAggregatorsSeeded(): Promise<void> {
  const defaults: Array<{ name: string; displayName: string; countries: string[]; currencies: string[]; isPrimary: boolean; fallbackPriority: number; apiEndpoint: string }> = [
    { name: "FAWRY",   displayName: "Fawry",                   countries: ["EG"], currencies: ["EGP", "USD"], isPrimary: true,  fallbackPriority: 0, apiEndpoint: "https://www.atfawry.com/EBC_Driver/" },
    { name: "PAYMOB",  displayName: "PayMob",                  countries: ["EG", "AE"], currencies: ["EGP", "USD", "EUR"], isPrimary: false, fallbackPriority: 1, apiEndpoint: "https://accept.paymobsolutions.com/api/" },
    { name: "STRIPE",  displayName: "Stripe",                  countries: ["DE", "FR", "IT", "ES", "NL", "AE", "US"], currencies: ["USD", "EUR"], isPrimary: true, fallbackPriority: 0, apiEndpoint: "https://api.stripe.com/" },
    { name: "CBE_IPN", displayName: "CBE Instant Payment Network", countries: ["EG"], currencies: ["EGP"], isPrimary: false, fallbackPriority: 2, apiEndpoint: "https://ipn.cbe.org.eg/" },
  ];
  // Use DB (freshDb) — new PrismaClient instance with the latest generated client,
  // so newly-added PaymentAggregator model is accessible without dev-server restart.
  const paymentAggregator = (DB as any).paymentAggregator;
  if (!paymentAggregator) return;
  for (const a of defaults) {
    await paymentAggregator.upsert({
      where: { name: a.name },
      update: {
        displayName: a.displayName,
        countryCodes: JSON.stringify(a.countries),
        supportedCurrencies: JSON.stringify(a.currencies),
        apiEndpoint: a.apiEndpoint,
      },
      create: {
        name: a.name,
        displayName: a.displayName,
        countryCodes: JSON.stringify(a.countries),
        supportedCurrencies: JSON.stringify(a.currencies),
        apiEndpoint: a.apiEndpoint,
        supportsSplit: true,
        isPrimary: a.isPrimary,
        fallbackPriority: a.fallbackPriority,
        isActive: true,
      },
    });
  }
}

// ── Simulated PSP call (Part 6.5.2 — used to demonstrate fallback) ────
// Returns true = success, false = simulated failure.
// In production this is the real PSP API call + webhook verification.
async function simulatePspCall(
  provider: PspProvider,
  ustn: string,
  amount: number,
  forceFail: boolean
): Promise<{ success: boolean; pspReference: string | null; failureReason?: string; durationMs: number }> {
  const start = Date.now();
  // If forceFail is set, simulate a 5xx / webhook timeout on this provider.
  if (forceFail) {
    return {
      success: false,
      pspReference: null,
      failureReason: `Simulated 5xx from ${provider} (webhook timeout)`,
      durationMs: Date.now() - start,
    };
  }
  // Otherwise — actually execute the PSP split through the existing orchestrator.
  try {
    const result = await processPspSplit(ustn, "STAGE1", provider);
    return {
      success: result.ok,
      pspReference: result.pspReference,
      failureReason: result.ok ? undefined : "PSP returned FAILED",
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      success: false,
      pspReference: null,
      failureReason: e.message || "PSP call exception",
      durationMs: Date.now() - start,
    };
  }
}

// ── Execute fallback chain (Part 6.5.2) ───────────────────────────────
// Tries primary → fallback1 → fallback2 in order, skipping any PSP whose
// health is DISABLED. Returns the first success. If all fail, ok=false.
export async function executePspFallbackChain(input: {
  ustn: string;
  stage: "STAGE1" | "STAGE2";
  payerCountry: string;
  currency: string;
  amount: number;
  forceFailProviders?: PspProvider[];  // for testing — simulate failures
  healthCheckEnabled?: boolean;        // default true
}): Promise<FallbackExecutionResult> {
  const {
    ustn,
    stage,
    payerCountry,
    currency,
    amount,
    forceFailProviders = [],
    healthCheckEnabled = true,
  } = input;

  // 1. Resolve fallback chain via PSP router (Part 6.5.1) — but use the
  //    per-country table for the explicit chain (Part 6.5.2).
  const router = await selectOptimalPsp(payerCountry, amount, currency);
  const chain: PspProvider[] = [
    router.provider,
    ...(router.fallbackChain ?? resolveFallbackChain(payerCountry, currency)
            .filter(p => p !== router.provider)),
  ];
  // Dedupe while preserving order
  const uniqueChain = Array.from(new Set(chain));

  const attempted: FallbackExecutionResult["attemptedChain"] = [];
  let finalProvider: PspProvider | null = null;
  let finalAttemptId: string | null = null;
  let finalPspRef: string | null = null;
  let feeLockStatus = "PENDING";

  for (const provider of uniqueChain) {
    // Health gate (Part 6.5.2): skip DISABLED providers
    if (healthCheckEnabled) {
      const health = await getPspHealth(provider);
      if (health.status === "DISABLED") {
        attempted.push({
          provider,
          success: false,
          failureReason: `PSP ${provider} is DISABLED (health ${health.healthScore}/100) — skipped`,
          durationMs: 0,
        });
        continue;
      }
    }

    const forceFail = forceFailProviders.includes(provider);
    const callResult = await simulatePspCall(provider, ustn, amount, forceFail);

    if (callResult.success) {
      // Look up the payment attempt that processPspSplit created
      const attempt = await db.paymentAttempt.findFirst({
        where: { ustn, pspProvider: provider, stage },
        orderBy: { attemptedAt: "desc" },
      });
      if (attempt) {
        // Mark fallbackUsed if this wasn't the first attempted provider
        if (attempted.length > 0) {
          await db.paymentAttempt.update({
            where: { id: attempt.id },
            data: { fallbackUsed: true },
          });
        }
        finalAttemptId = attempt.id;
        finalPspRef = callResult.pspReference ?? attempt.pspReference;
      }
      feeLockStatus = stage === "STAGE1"
        ? (await db.feeLock.findFirst({ where: { ustn }, orderBy: { createdAt: "desc" } }))?.status ?? "ACTIVE"
        : "ACTIVE";
      attempted.push({
        provider,
        success: true,
        pspReference: callResult.pspReference ?? finalPspRef ?? undefined,
        paymentAttemptId: finalAttemptId ?? undefined,
        durationMs: callResult.durationMs,
      });
      finalProvider = provider;
      break;
    }

    // Failure → record + continue to next in chain
    attempted.push({
      provider,
      success: false,
      failureReason: callResult.failureReason,
      durationMs: callResult.durationMs,
    });

    // Mark the most recent attempt for this provider as FAILED with reason
    const failedAttempt = await db.paymentAttempt.findFirst({
      where: { ustn, pspProvider: provider, stage },
      orderBy: { attemptedAt: "desc" },
    });
    if (failedAttempt) {
      await db.paymentAttempt.update({
        where: { id: failedAttempt.id },
        data: {
          status: "FAILED",
          failureReason: callResult.failureReason ?? null,
          retryCount: (failedAttempt.retryCount ?? 0) + 1,
        },
      });
    }
  }

  const ok = finalProvider !== null;
  const fallbackUsed = ok && attempted.length > 1 && attempted[attempted.length - 1].success && !attempted[0].success;

  // Smart Inbox notification (Part 6.5.2) — only if fallback was used
  if (fallbackUsed) {
    const trade = await db.trade.findUnique({ where: { ustn } });
    const tenantGtid = trade?.sellerGtid ?? "SGTX-EG-TRD-002139-7F3A";
    await db.inboxItem.create({
      data: {
        tenantGtid,
        category: "SHIPMENT_ALERT",
        priority: 75,
        title: `PSP fallback used — ${ustn.slice(0, 24)}…`,
        description:
          `Primary PSP ${attempted[0].provider} failed (${attempted[0].failureReason}). ` +
          `Payment automatically retried via ${finalProvider}. No reauthentication required. ` +
          `PSP ref ${finalPspRef}.`,
        ctaLabel: "View Payment",
      },
    });
  }

  return {
    ustn,
    stage,
    attemptedChain: attempted,
    finalPspProvider: finalProvider,
    finalPaymentAttemptId: finalAttemptId,
    finalPspReference: finalPspRef,
    feeLockStatus,
    fallbackUsed,
    ok,
  };
}
