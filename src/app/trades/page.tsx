"use client";

// COCKPIT-Phase 0: /trades list route.
//
// Lists the user's trades with filters: active / draft / history.
// Each trade row links to /trades/[ustn] — the canonical workspace.

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
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
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");

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
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
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
            <h1 className="text-2xl font-semibold tracking-tight">Trades</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {allTrades.length} total · {allTrades.filter(t => STATUS_ACTIVE.has(t.status)).length} active · {allTrades.filter(t => STATUS_DRAFT.has(t.status)).length} drafts
            </p>
          </div>
          <Link href="/trades/new">
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New trade request
            </Button>
          </Link>
        </header>

        {/* Filters + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-md border border-border bg-card/40">
            {(["active", "drafts", "history", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 h-8 rounded text-xs font-medium capitalize transition",
                  filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by commodity, USTN, or counterparty…"
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading trades…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {allTrades.length === 0
                ? "You don't have any trades yet. Start by creating a new trade request."
                : "No trades match this filter."}
            </p>
            {allTrades.length === 0 && (
              <Link href="/trades/new" className="mt-4 inline-block">
                <Button size="sm" variant="outline">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Create your first trade
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {filtered.map((t) => (
              <li key={t.ustn}>
                <Link
                  href={`/trades/${t.ustn}`}
                  className="flex items-center justify-between gap-3 p-3.5 hover:bg-muted/40 transition group"
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
                  <div className="hidden sm:block text-xs text-muted-foreground font-mono">
                    {t.ustn?.substring(0, 22)}…
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CockpitShell>
  );
}
