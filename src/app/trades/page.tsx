"use client";

// COCKPIT-Phase 0: /trades list route.
//
// Lists the user's trades with filters: active / draft / history.
// Each trade row links to /trades/[ustn] — the canonical workspace.

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Briefcase, Plus, Search, Loader2, ChevronRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string };
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
}

type Filter = "active" | "drafts" | "history" | "all";

const STATUS_ACTIVE = new Set([
  "PENDING_SELLER_RESPONSE", "BUYER_SUBMITTED", "QUOTE_ACCEPTED",
  "CONTRACT_SIGNED", "IN_EXECUTION", "INSPECTION_REQUIRED",
  "CUSTOMS_PENDING", "PAYMENT_DUE",
]);
const STATUS_DRAFT = new Set(["DRAFT"]);
const STATUS_HISTORY = new Set(["CLOSED", "COMPLETED", "SETTLED", "CANCELLED", "REJECTED"]);

function statusLabel(status: string): string {
  return (status || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function TradesPage() {
  const { payload, ready } = useSession();
  const { t } = useCockpitLocale();
  const pathname = usePathname() || "/trades";
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");

  // Sync filter with URL query param
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const urlFilter = urlParams.get("filter") as Filter | null;
    if (urlFilter && urlFilter !== filter) setFilter(urlFilter);
  }

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  const allTrades = useMemo(() => {
    if (!data) return [];
    // Dedup by USTN (a dual-mode trader may see the same trade as buyer + seller).
    const seen = new Set<string>();
    const out: any[] = [];
    for (const t of [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])]) {
      if (t.ustn && !seen.has(t.ustn)) {
        seen.add(t.ustn);
        out.push({ ...t, _perspective: t.buyerGtid === payload?.tenantGtid ? "Buyer" : "Seller" });
      }
    }
    return out;
  }, [data, payload?.tenantGtid]);

  const filtered = useMemo(() => {
    let out = allTrades;
    if (filter !== "all") {
      out = out.filter((t) => {
        if (filter === "active") return STATUS_ACTIVE.has(t.status);
        if (filter === "drafts") return STATUS_DRAFT.has(t.status);
        if (filter === "history") return STATUS_HISTORY.has(t.status);
        return true;
      });
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((t) =>
        (t.commodity || "").toLowerCase().includes(q) ||
        (t.ustn || "").toLowerCase().includes(q) ||
        (t.buyer?.legalName || "").toLowerCase().includes(q) ||
        (t.seller?.legalName || "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [allTrades, filter, query]);

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("common.loadingSession")}</div>;
  }
  if (!payload) return null;

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={data?.tenant?.legalName}
      showAdmin={shouldShowAdmin(data?.tenant?.type)}
    >
      <div className="space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("trades.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {allTrades.length} {t("trades.subtitle")} · {allTrades.filter(t => STATUS_ACTIVE.has(t.status)).length} {t("trades.filter.active")} · {allTrades.filter(t => STATUS_DRAFT.has(t.status)).length} {t("trades.filter.drafts")}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/trades/new" className="focus-visible:outline-none">
              <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t("trades.newTrade")}
            </Link>
          </Button>
        </header>

        {/* Sub-tab navigation (restored from the legacy workspace) */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
          <Link href="/trades/new" className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[36px] inline-flex items-center", pathname === "/trades/new" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            <Plus className="w-3.5 h-3.5 inline me-1" aria-hidden="true" /> {t("trades.newTrade")}
          </Link>
          <Link href="/trades?filter=active" className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[36px] inline-flex items-center", filter === "active" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            {t("trades.filter.active")}
          </Link>
          <Link href="/trades?filter=drafts" className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[36px] inline-flex items-center", filter === "drafts" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            {t("trades.filter.drafts")}
          </Link>
          <Link href="/trades?filter=history" className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[36px] inline-flex items-center", filter === "history" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            {t("trades.filter.history")}
          </Link>
          <Link href="/trades?filter=all" className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[36px] inline-flex items-center", filter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            {t("trades.filter.all")}
          </Link>
        </div>

        {/* Filters + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-md border border-border bg-card/40">
            {(["active", "drafts", "history", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "px-3 h-9 rounded text-xs font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]",
                  filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("trades.searchPlaceholder")}
              className="ps-8 h-9"
              aria-label={t("common.search")}
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-10" role="status" aria-live="polite">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t("common.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {allTrades.length === 0
                ? t("trades.empty")
                : t("trades.emptyFiltered")}
            </p>
            {allTrades.length === 0 && (
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href="/trades/new" className="focus-visible:outline-none">
                  <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t("trades.newTrade")}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {filtered.map((t) => (
              <TradeRow key={t.ustn} trade={t} />
            ))}
          </ul>
        )}
      </div>
    </CockpitShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 — TradeRow (extracted so we can call useQuery per row for Payment Health)
// ═══════════════════════════════════════════════════════════════════════════════
//
// React hooks can't be called inside .map() callbacks — so each trade row is
// rendered by this dedicated component which owns its own useQuery for the
// Payment Health endpoint. The query uses retry:false so a 404 (trade exists
// but no health data yet — e.g. FeeLock not yet activated) surfaces
// immediately as a gray "—" badge instead of retrying.

function TradeRow({ trade: t }: { trade: any }) {
  return (
    <li>
      <Link
        href={`/trades/${t.ustn}`}
        className="flex items-center justify-between gap-3 p-3.5 hover:bg-muted/40 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded-sm"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{t.commodity || "Untitled trade"}</span>
            <Badge variant="outline" className="text-[0.6rem]">{statusLabel(t.status)}</Badge>
            <span className="text-xs text-muted-foreground/70">{t._perspective}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {t.origin || t.originCountry || "—"} → {t.destination || t.destinationCountry || "—"}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span>{fmtDate(t.createdAt)}</span>
          </div>
        </div>
        {/* v18 — Payment Health badge (per-row useQuery) */}
        <PaymentHealthBadge ustn={t.ustn} />
        <div className="hidden sm:block text-xs text-muted-foreground font-mono">
          {t.ustn?.substring(0, 22)}…
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}

// v18 — Payment Health badge
// GREEN (≥80) · YELLOW (60-79) · RED (<60) · gray "—" on 404.
function PaymentHealthBadge({ ustn }: { ustn: string }) {
  const q = useQuery({
    queryKey: ["trade-list-health", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/payment/${encodeURIComponent(ustn)}/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
    staleTime: 60_000, // cache for 1 minute — avoids re-fetching on every render
  });

  if (q.isLoading) {
    return (
      <span className="text-[0.55rem] text-muted-foreground/60 flex items-center gap-1" aria-label="Loading payment health">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
      </span>
    );
  }

  // Error or no score → gray "—" badge
  if (q.isError || !q.data) {
    return (
      <Badge
        variant="outline"
        className="text-[0.55rem] border-muted-foreground/40 text-muted-foreground/60"
        aria-label="No payment health data"
        title="No payment health data yet"
      >
        —
      </Badge>
    );
  }

  const score: number | undefined = q.data.score ?? q.data.health_score;
  const band: string | undefined = q.data.band ?? q.data.health_band;

  if (typeof score !== "number") {
    return (
      <Badge
        variant="outline"
        className="text-[0.55rem] border-muted-foreground/40 text-muted-foreground/60"
        title="No score returned"
      >
        —
      </Badge>
    );
  }

  const tone =
    score >= 80 ? "green"
    : score >= 60 ? "yellow"
    : "red";

  const cls =
    tone === "green" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
    : tone === "yellow" ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
    : "border-red-500/40 text-red-700 dark:text-red-300";

  const dot =
    tone === "green" ? "bg-emerald-500"
    : tone === "yellow" ? "bg-amber-500"
    : "bg-red-500";

  const label = band || `${score}`;

  return (
    <Badge
      variant="outline"
      className={`text-[0.55rem] flex items-center gap-1 ${cls}`}
      title={`Payment health: ${score}/100${band ? ` (${band})` : ""}`}
      aria-label={`Payment health ${score} out of 100`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}
