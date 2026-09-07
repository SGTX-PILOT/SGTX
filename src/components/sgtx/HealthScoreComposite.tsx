"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Trade Health Score composite card (v17 §16.3 TCC + §12G.7)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Renders a single, prominent card at the top of /home summarising the tenant's
// portfolio health across all active trades. The composite is a 0-100 score
// blended from six weighted dimensions:
//
//   Compliance (0-100)    × 0.20   — sanctions & regulatory clearance
//   Documentation (0-100) × 0.20  — verified vs required documents
//   Logistics (0-100)    × 0.15  — shipment milestones on-time
//   Payment (0-100)      × 0.15   — payment legs settled vs pending
//   Risk (0-100)         × 0.20   — open disputes, exception events
//   Timeline (0-100)     × 0.10   — delivery date proximity vs planned
//
// Colour banding:
//   GREEN   ≥ 80   — Healthy, no action needed
//   YELLOW  60-79 — On track, monitor
//   ORANGE  40-59 — At risk, attention required
//   RED     < 40  — Critical, intervene now
//
// When the tenant has no active trades, the score shows "—" with a friendly
// empty state — the card never invents a number.
// ═══════════════════════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import {
  Activity,
  ShieldCheck,
  FileCheck2,
  Truck,
  Banknote,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthCompositeResponse {
  overall_score: number | null;
  dimensions: {
    compliance: number;
    documentation: number;
    logistics: number;
    payment: number;
    risk: number;
    timeline: number;
  };
  weights: {
    compliance: number;
    documentation: number;
    logistics: number;
    payment: number;
    risk: number;
    timeline: number;
  };
  trade_count: number;
  computed_at: string;
}

type HealthBand = "GREEN" | "YELLOW" | "ORANGE" | "RED";

interface DimensionDef {
  key: keyof HealthCompositeResponse["dimensions"];
  label: string;
  weight: number;
  icon: LucideIcon;
  hint: string;
}

const DIMENSIONS: DimensionDef[] = [
  {
    key: "compliance",
    label: "Compliance",
    weight: 0.20,
    icon: ShieldCheck,
    hint: "Sanctions & regulatory clearance",
  },
  {
    key: "documentation",
    label: "Documentation",
    weight: 0.20,
    icon: FileCheck2,
    hint: "Verified vs required documents",
  },
  {
    key: "logistics",
    label: "Logistics",
    weight: 0.15,
    icon: Truck,
    hint: "Shipment milestones on-time",
  },
  {
    key: "payment",
    label: "Payment",
    weight: 0.15,
    icon: Banknote,
    hint: "Payment legs settled vs pending",
  },
  {
    key: "risk",
    label: "Risk",
    weight: 0.20,
    icon: AlertTriangle,
    hint: "Open disputes, exception events",
  },
  {
    key: "timeline",
    label: "Timeline",
    weight: 0.10,
    icon: CalendarClock,
    hint: "Delivery date vs plan",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function bandFor(score: number): HealthBand {
  if (score >= 80) return "GREEN";
  if (score >= 60) return "YELLOW";
  if (score >= 40) return "ORANGE";
  return "RED";
}

const BAND_HEX: Record<HealthBand, string> = {
  GREEN: "#10b981",
  YELLOW: "#fbbf24",
  ORANGE: "#fb923c",
  RED: "#f87171",
};

const BAND_LABEL: Record<HealthBand, string> = {
  GREEN: "Healthy",
  YELLOW: "On track",
  ORANGE: "At risk",
  RED: "Critical",
};

const BAND_ACTION: Record<HealthBand, string> = {
  GREEN: "No action needed — keep going.",
  YELLOW: "Monitor — a few items need attention.",
  ORANGE: "Action required — several items are off track.",
  RED: "Intervene now — portfolio is at risk.",
};

function hexFor(score: number): string {
  return BAND_HEX[bandFor(score)];
}

// ── Component ──────────────────────────────────────────────────────────────────

export function HealthScoreComposite() {
  const { payload, ready } = useSession();

  const { data, isLoading, isError } = useQuery<HealthCompositeResponse>({
    queryKey: ["health-composite", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/dashboard/health-composite?tenant=${encodeURIComponent(
          payload!.tenantGtid!,
        )}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load health composite (${res.status})`);
      }
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
    staleTime: 60_000, // refresh at most once a minute
  });

  if (!ready || isLoading) {
    return <HealthScoreCompositeSkeleton />;
  }

  // Distinguish "no active trades" (legitimate empty state) from a fetch error
  // (which still renders the empty state but with a different message + amber
  // banner at the bottom).
  const hasError = isError && !data;
  const noTrades =
    hasError || !data || data.trade_count === 0 || data.overall_score === null;
  const overall = noTrades ? null : (data!.overall_score as number);
  const band = overall === null ? null : bandFor(overall);
  const color = overall === null ? null : hexFor(overall);

  return (
    <Card className="p-5 sm:p-6 gap-0">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        {/* ── Score block ─────────────────────────────────────────────── */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Trade Health Score
            </p>
          </div>
          <p className="text-[0.65rem] text-muted-foreground/80 mb-3">
            Composite across {noTrades ? "0" : data?.trade_count} active{" "}
            {noTrades ? "trades" : data!.trade_count === 1 ? "trade" : "trades"}
          </p>

          <div className="flex items-baseline gap-2">
            <span
              className="text-5xl sm:text-6xl font-bold font-display tabular-nums leading-none"
              style={overall === null ? undefined : { color: color || undefined }}
            >
              {overall === null ? "—" : overall}
            </span>
            {overall !== null && (
              <span className="text-lg text-muted-foreground font-medium">/100</span>
            )}
          </div>

          {overall === null ? (
            <Badge
              variant="outline"
              className="mt-3 text-muted-foreground border-border bg-muted/40"
            >
              No active trades
            </Badge>
          ) : (
            <div className="mt-3 flex flex-col gap-1">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold w-fit"
                style={{
                  color: color || undefined,
                  background: `${color}1a`,
                  border: `1px solid ${color}40`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: color || undefined }}
                />
                {BAND_LABEL[band!]}
              </span>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5 leading-snug max-w-[220px]">
                {BAND_ACTION[band!]}
              </p>
            </div>
          )}
        </div>

        {/* ── Dimension breakdown ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {noTrades ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-6">
              <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center mb-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {hasError ? "Health score unavailable" : "No active trades yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {hasError
                  ? "We could not load your portfolio health right now. Please try again in a moment."
                  : "Your portfolio health score will appear here once you have a trade in execution. Start by creating a new trade request."}
              </p>
              {!hasError && (
                <Link
                  href="/trades/new"
                  className="mt-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border bg-card/60 hover:bg-muted text-xs font-medium transition"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  New trade request
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Stacked composite bar — visualises each dimension's
                  weighted contribution to the overall score. The width of
                  each segment is the dimension's weight (sums to 100%) and
                  the saturation is the dimension's 0-100 health. */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                    Weighted contribution
                  </p>
                  <p className="text-[0.6rem] text-muted-foreground/70">
                    Segment width = weight · saturation = health
                  </p>
                </div>
                <div className="flex h-3 w-full rounded-full overflow-hidden border border-border">
                  {DIMENSIONS.map((d, i) => {
                    const val = data!.dimensions[d.key];
                    const segColor = hexFor(val);
                    const opacity = Math.max(0.15, val / 100);
                    return (
                      <motion.div
                        key={d.key}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: `${d.weight * 100}%`, opacity }}
                        transition={{ duration: 0.6, delay: i * 0.05 }}
                        title={`${d.label} — ${val}/100 (${Math.round(d.weight * 100)}%)`}
                        className="h-full"
                        style={{
                          background: segColor,
                          borderRight:
                            i < DIMENSIONS.length - 1
                              ? "1px solid rgba(255,255,255,0.4)"
                              : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* 6 mini-bars — one per dimension with weight + score */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {DIMENSIONS.map((d, i) => {
                  const val = data!.dimensions[d.key];
                  const dColor = hexFor(val);
                  const Icon = d.icon;
                  return (
                    <motion.div
                      key={d.key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 + i * 0.04 }}
                      className="rounded-lg border border-border bg-card/40 p-3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon
                            className="w-3 h-3 flex-shrink-0"
                            style={{ color: dColor }}
                          />
                          <span className="text-[0.7rem] font-medium text-foreground truncate">
                            {d.label}
                          </span>
                          <span className="text-[0.55rem] text-muted-foreground/70 flex-shrink-0">
                            {Math.round(d.weight * 100)}%
                          </span>
                        </div>
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{ color: dColor }}
                        >
                          {val}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${val}%` }}
                          transition={{ duration: 0.7, delay: 0.15 + i * 0.04 }}
                          className="h-full rounded-full"
                          style={{ background: dColor }}
                        />
                      </div>
                      <p className="text-[0.55rem] text-muted-foreground/70 mt-1.5 leading-tight">
                        {d.hint}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
                <p className="text-[0.55rem] text-muted-foreground/70">
                  Formula: compliance·20 + docs·20 + logistics·15 + payment·15 +
                  risk·20 + timeline·10
                </p>
                {data?.computed_at && (
                  <p className="text-[0.55rem] text-muted-foreground/60">
                    Computed {new Date(data.computed_at).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isError && data && (
        <p className="text-[0.65rem] text-amber-600 dark:text-amber-400 mt-3">
          Health score unavailable — showing last known state. Will retry.
        </p>
      )}
    </Card>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function HealthScoreCompositeSkeleton() {
  return (
    <Card className="p-5 sm:p-6 gap-0">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="lg:w-56 flex-shrink-0">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-3 w-40 mb-3" />
          <Skeleton className="h-16 w-32" />
          <Skeleton className="h-5 w-24 mt-3" />
        </div>
        <div className="flex-1 min-w-0">
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-full mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default HealthScoreComposite;
