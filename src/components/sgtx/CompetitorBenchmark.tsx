"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX Competitor Benchmark — Recommendation #10 (Strategic)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Admin-portal surface that compares SGTX against TradeLens, Maersk Spot,
// Flexport and CargoX across 8 platform dimensions, plus a "Why SGTX Wins"
// section listing the 7 unique capabilities.
//
// Data source: GET /api/sgtx/competitor-benchmark (hardcoded 2026 data — NO
// competitor scraping). The component uses useQuery so it auto-refreshes on
// window focus and is cached for 5 minutes (staleTime is short because the
// data is static; refetch is cheap).
//
// Responsive: full comparison TABLE on desktop (≥lg), card-based layout on
// mobile. SGTX row is always highlighted with the sovereign gold gradient
// regardless of viewport.
//
// Uses the `sgtx-*` CSS classes from globals.css for sovereign-grade
// visuals (gold gradients, glass surfaces, sovereign glow).
// ═══════════════════════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/sgtx/widgets";
import {
  Award, Check, X, ShieldCheck, Globe2, Sparkles, Loader2, AlertTriangle,
  type LucideIcon,
} from "lucide-react";

type PlatformProfile = {
  name: string;
  status: string;
  tradeExecutionTime: string;
  costPerTrade: string;
  coverage: string;
  aiCapabilities: string;
  nonCustodial: boolean;
  ustnTracking: boolean;
  regulatorySnapshots: boolean;
  evidencePackages: boolean;
};

type ComparisonDimension = {
  key: keyof Omit<PlatformProfile, "name" | "status">;
  label: string;
  type: "boolean" | "text";
  sgtxAdvantage: boolean;
};

type BenchmarkResponse = {
  ok: boolean;
  generatedAt?: string;
  sgtx: PlatformProfile;
  competitors: PlatformProfile[];
  comparisonDimensions: ComparisonDimension[];
  sgtxLeads: Record<string, Record<string, boolean>>;
  sgtxAdvantages: string[];
  competitorSummaries: { name: string; summary: string }[];
  source?: string;
  error?: string;
};

const SAFE_FALLBACK: BenchmarkResponse = {
  ok: false,
  sgtx: {
    name: "SGTX",
    status: "ACTIVE",
    tradeExecutionTime: "1-3 days",
    costPerTrade: "$50-200",
    coverage: "195+ countries (via GRiRE)",
    aiCapabilities: "Multi-model consensus (Gemini + Groq + HuggingFace)",
    nonCustodial: true,
    ustnTracking: true,
    regulatorySnapshots: true,
    evidencePackages: true,
  },
  competitors: [],
  comparisonDimensions: [],
  sgtxLeads: {},
  sgtxAdvantages: [],
  competitorSummaries: [],
};

// ── Helper: cell renderer for boolean dimensions ──────────────────────────
function BooleanCell({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <Check className="w-3.5 h-3.5" aria-label="supported" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
      <X className="w-3.5 h-3.5" aria-label="not supported" />
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isDiscontinued = /discontinued/i.test(status);
  const isActive = /^active$/i.test(status);
  return (
    <Badge
      variant="outline"
      className={
        isDiscontinued
          ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : isActive
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
      }
    >
      {status}
    </Badge>
  );
}

// ── Mobile card renderer — one card per competitor ────────────────────────
function MobileCompetitorCard({
  profile,
  dimensions,
  isSgtx,
  leads,
}: {
  profile: PlatformProfile;
  dimensions: ComparisonDimension[];
  isSgtx: boolean;
  leads: Record<string, boolean>;
}) {
  return (
    <Card
      className={
        isSgtx
          ? "p-4 border-2 border-gold/40 sgtx-bg-gold-soft sgtx-sovereign-glow"
          : "p-4 border border-border/60"
      }
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-sm flex items-center gap-1.5">
            {isSgtx && <Award className="w-3.5 h-3.5 text-gold" />}
            {profile.name}
          </p>
          <p className="text-[0.6rem] text-muted-foreground mt-0.5">{profile.status}</p>
        </div>
        <StatusBadge status={profile.status} />
      </div>
      <ul className="space-y-1.5">
        {dimensions.map((dim) => {
          const value = (profile as any)[dim.key];
          return (
            <li key={dim.key} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-muted-foreground flex-1 min-w-0 truncate">
                {dim.label}
              </span>
              <span className="font-medium text-right">
                {dim.type === "boolean" ? <BooleanCell value={value} /> : value}
              </span>
            </li>
          );
        })}
      </ul>
      {isSgtx && (
        <p className="mt-3 text-[0.65rem] text-gold font-medium tracking-wide uppercase">
          Sovereign-grade · 7 unique capabilities
        </p>
      )}
      {!isSgtx && Object.values(leads).some(Boolean) && (
        <p className="mt-3 text-[0.6rem] text-muted-foreground">
          SGTX leads on {Object.values(leads).filter(Boolean).length} dimensions
        </p>
      )}
    </Card>
  );
}

// ── Desktop table renderer ────────────────────────────────────────────────
function DesktopComparisonTable({
  sgtx,
  competitors,
  dimensions,
  sgtxLeads,
}: {
  sgtx: PlatformProfile;
  competitors: PlatformProfile[];
  dimensions: ComparisonDimension[];
  sgtxLeads: Record<string, Record<string, boolean>>;
}) {
  const allProfiles = [sgtx, ...competitors];
  return (
    <div className="overflow-x-auto scroll-gold rounded-xl border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            <th scope="col" className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/30 z-10">
              Platform
            </th>
            {dimensions.map((dim) => (
              <th
                key={dim.key}
                scope="col"
                className="p-3 font-medium text-muted-foreground text-center min-w-[120px]"
              >
                {dim.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allProfiles.map((profile) => {
            const isSgtx = profile.name === "SGTX";
            const leads = isSgtx ? {} : sgtxLeads[profile.name] || {};
            return (
              <tr
                key={profile.name}
                className={
                  isSgtx
                    ? "sgtx-bg-gold-soft border-y-2 border-gold/40"
                    : "border-b border-border/40 hover:bg-muted/20"
                }
              >
                <th
                  scope="row"
                  className={
                    isSgtx
                      ? "p-3 text-left font-semibold text-foreground sticky left-0 sgtx-bg-gold-soft z-10"
                      : "p-3 text-left font-medium text-foreground sticky left-0 bg-background z-10"
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {isSgtx && <Award className="w-3.5 h-3.5 text-gold flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="truncate">{profile.name}</p>
                      <p className="text-[0.55rem] text-muted-foreground truncate">{profile.status}</p>
                    </div>
                  </div>
                </th>
                {dimensions.map((dim) => {
                  const value = (profile as any)[dim.key];
                  const isLeadCell = !isSgtx && leads[dim.key as string];
                  return (
                    <td
                      key={dim.key}
                      className={
                        isSgtx
                          ? "p-3 text-center font-medium"
                          : isLeadCell
                            ? "p-3 text-center bg-gold/5"
                            : "p-3 text-center"
                      }
                    >
                      {dim.type === "boolean" ? (
                        <BooleanCell value={value} />
                      ) : (
                        <span className={isSgtx ? "text-foreground" : "text-muted-foreground"}>
                          {value}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── "Why SGTX Wins" — the 7 unique advantages ────────────────────────────
const ADVANTAGE_ICONS: LucideIcon[] = [
  Sparkles,    // Multi-model AI consensus
  Globe2,      // USTN tracking
  ShieldCheck, // Regulatory snapshots
  Award,       // Evidence packages
  Globe2,      // 4 transport engines
  Globe2,      // GRiRE
  ShieldCheck, // Governor + OPA + WasmEdge
];

export function CompetitorBenchmark() {
  const { data, isLoading, isError } = useQuery<BenchmarkResponse>({
    queryKey: ["sgtx-competitor-benchmark"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/competitor-benchmark");
        if (!r.ok) return SAFE_FALLBACK;
        const j = (await r.json()) as BenchmarkResponse;
        if (!j || j.ok === false) return SAFE_FALLBACK;
        return j;
      } catch {
        return SAFE_FALLBACK;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — data is static
  });

  const payload = data || SAFE_FALLBACK;
  const { sgtx, competitors, comparisonDimensions, sgtxLeads, sgtxAdvantages, competitorSummaries, source } = payload;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Competitor Benchmark"
        subtitle="SGTX vs TradeLens · Maersk Spot · Flexport · CargoX — public 2026 data"
      />

      {/* Header card — quick context */}
      <Card className="p-4 sm:p-5 border-gold/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg sgtx-bg-gold-sovereign flex items-center justify-center flex-shrink-0">
              <Award className="w-5 h-5 text-sovereign" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-foreground">
                SGTX Competitive Position
              </h2>
              <p className="text-xs text-muted-foreground">
                8 dimensions · {competitors.length} competitors · {sgtxAdvantages.length} unique capabilities
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[0.65rem]">
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3 mr-1" /> SGTX leads all dimensions
            </Badge>
          </div>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading benchmark data…
        </Card>
      )}

      {isError && !isLoading && (
        <Card className="p-6 flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4" />
          <p className="text-xs">Could not load benchmark data — showing limited view.</p>
        </Card>
      )}

      {/* Desktop: full comparison table; Mobile: card-per-platform */}
      <div className="hidden lg:block">
        <DesktopComparisonTable
          sgtx={sgtx}
          competitors={competitors}
          dimensions={comparisonDimensions}
          sgtxLeads={sgtxLeads}
        />
      </div>
      <div className="lg:hidden space-y-3">
        <MobileCompetitorCard
          profile={sgtx}
          dimensions={comparisonDimensions}
          isSgtx
          leads={{}}
        />
        {competitors.map((c) => (
          <MobileCompetitorCard
            key={c.name}
            profile={c}
            dimensions={comparisonDimensions}
            isSgtx={false}
            leads={sgtxLeads[c.name] || {}}
          />
        ))}
      </div>

      {/* Per-competitor summary chips — quick "where SGTX wins" recap */}
      {competitorSummaries.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Where SGTX Wins (per competitor)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {competitorSummaries.map((s) => (
              <div key={s.name} className="text-xs p-2.5 rounded-lg border border-border/60 bg-muted/20">
                <p className="font-medium text-foreground mb-0.5">{s.name}</p>
                <p className="text-muted-foreground">{s.summary}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Why SGTX Wins — the 7 unique capabilities */}
      <Card className="p-4 sm:p-5 border-gold/30">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-4 h-4 text-gold" />
          <h3 className="font-semibold text-sm">Why SGTX Wins — Unique Capabilities</h3>
          <Badge variant="outline" className="ml-auto border-gold/40 text-gold text-[0.55rem]">
            {sgtxAdvantages.length} unique
          </Badge>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sgtxAdvantages.map((adv, idx) => {
            const Icon = ADVANTAGE_ICONS[idx % ADVANTAGE_ICONS.length];
            return (
              <li
                key={idx}
                className="flex items-start gap-2 p-2.5 rounded-lg border border-gold/20 bg-gold/5"
              >
                <span className="w-5 h-5 rounded-full bg-gold/20 text-gold flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-3 h-3" />
                </span>
                <span className="text-xs text-foreground">{adv}</span>
              </li>
            );
          })}
        </ul>
        {source && (
          <p className="text-[0.6rem] text-muted-foreground mt-4 italic">
            Source: {source}
          </p>
        )}
      </Card>
    </div>
  );
}
