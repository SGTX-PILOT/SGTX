"use client";

// ════════════════════════════════════════════════════════════════════════════
// AddOnsHubScreen — Unified portal surface for SGTX Add-Ons 9-28
//
// Per CB-AUDIT (worklog 15251+): every Add-On 9-26 + 28 has a COMPLETE backend
// (lib + API routes + Prisma models) but ZERO portal surfaces. This file
// closes that gap with one hub exposing 19 sub-tabs (#27 reserved).
//
// Read-mostly · defensive everywhere (normalizeRows handles array, {rows},
// {data}, single object, or {error}) · no new dependencies.
// Exports: AddOnsHubScreen + 5 per-portal wrappers (Demurrage/ColdChain/
// ComplianceCalendar/Grir/ForceMajeure) that pre-select a sub-tab.
// ════════════════════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/sgtx/widgets";
import { useAppStore } from "@/store/app-store";
import { Loader2, ExternalLink, Inbox, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "P0" | "P1" | "P2" | "P3" | "Foundation";
type ParamStrategy = "none" | "tenant" | "ustn" | "country";

interface Column {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  mono?: boolean;
}

interface AddonDef {
  id: string;
  name: string;
  priority: Priority;
  blueprint: string;
  endpoint: string;
  paramStrategy: ParamStrategy;
  /** query key name for tenant-strategy (defaults auto-detected from endpoint). */
  tenantParamKey?: string;
  /** explicit override for the rows array key in the JSON response. */
  rowsKey?: string;
  /** combine multiple row arrays from the response into one (e.g. force-majeure). */
  combineKeys?: string[];
  metricLabel: string;
  metricValue: (rows: any[], raw: any) => string | number;
  metricHint?: string;
  columns: Column[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Defensive row normaliser. Accepts any of:
 *   - a bare array
 *   - { rows: [...] } / { data: [...] }
 *   - { <rowsKey>: [...] } (explicit override)
 *   - { <combineKeys>: [...] } joined together
 *   - an object with one of the well-known probe keys
 *   - an { error: ... } object (returns [])
 *   - null / undefined (returns [])
 */
function normalizeRows(j: any, fallbackKey?: string, combineKeys?: string[]): any[] {
  if (!j) return [];
  if (typeof j !== "object") return [];
  if (Array.isArray(j)) return j;
  if (j.error) return [];
  if (fallbackKey && Array.isArray(j[fallbackKey])) return j[fallbackKey];
  if (Array.isArray(j.rows)) return j.rows;
  if (Array.isArray(j.data)) return j.data;
  if (combineKeys && combineKeys.length > 0) {
    const merged: any[] = [];
    for (const k of combineKeys) {
      if (Array.isArray(j[k])) merged.push(...j[k]);
    }
    if (merged.length > 0) return merged;
  }
  // Probe well-known response keys across all 19 add-ons.
  const probes = [
    "alerts", "policies", "disputes", "anomalies", "accreditations",
    "recommendations", "apis", "results", "claims", "preferences",
    "incidents", "events", "documents", "integrations", "declarations",
    "exposures", "providers", "lcs", "guarantees",
  ];
  for (const k of probes) {
    if (Array.isArray(j[k])) return j[k];
  }
  return [];
}

function fmtDate(v: any): string {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v) : v instanceof Date ? v : null;
    if (!d || isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return String(v);
  }
}

function fmtUsd(v: any): string {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "—";
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function StatusPill({ value }: { value: any }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const s = String(value).toUpperCase();
  const tone =
    /ACTIVE|CONFIRMED|VERIFIED|PASS|ISSUED|SIGNED|MATCHED|RESOLVED|COMPLETE/.test(s)
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : /PENDING|DRAFT|SUBMITTED|WAITING|QUEUED/.test(s)
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : /EXPIRED|CANCELLED|REJECTED|FAILED|CRITICAL|HIGH|DISCREPANT|OPEN|UNRESOLVED|GAP/.test(s)
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
      : "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
  return (
    <Badge variant="outline" className={`text-[0.6rem] font-semibold px-1.5 py-0 ${tone}`}>
      {s}
    </Badge>
  );
}

function PriorityBadge({ p }: { p: Priority }) {
  const map: Record<Priority, string> = {
    P0: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    P1: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    P2: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    P3: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    Foundation: "bg-gold/15 text-gold border-gold/30",
  };
  return (
    <Badge variant="outline" className={`text-[0.6rem] font-semibold px-1.5 py-0 ${map[p]}`}>
      {p}
    </Badge>
  );
}

// ─── AddOn sub-tab (generic) ──────────────────────────────────────────────────

function AddOnSubTab({ def, tenantGtid }: { def: AddonDef; tenantGtid: string | null }) {
  const [ustn, setUstn] = useState("");
  const [committedUstn, setCommittedUstn] = useState("");
  const [country, setCountry] = useState("");
  const [committedCountry, setCommittedCountry] = useState("");

  // Build the fetch URL based on the param strategy.
  const url = useMemo<string | null>(() => {
    if (def.paramStrategy === "none") return def.endpoint;
    if (def.paramStrategy === "tenant") {
      if (!tenantGtid) return null;
      const key =
        def.tenantParamKey ||
        (def.endpoint.includes("broker-liability") ? "brokerGtid"
          : def.endpoint.includes("inspection") ? "agencyGtid"
          : def.endpoint.includes("shippers-declaration") ? "exporterGtid"
          : def.endpoint.includes("back-to-back-lc") ? "buyerGtid"
          : def.endpoint.includes("terminal") ? "terminalGtid"
          : "tenantGtid");
      const sep = def.endpoint.includes("?") ? "&" : "?";
      return `${def.endpoint}${sep}${key}=${encodeURIComponent(tenantGtid)}`;
    }
    if (def.paramStrategy === "ustn") {
      if (!committedUstn) return null;
      const sep = def.endpoint.includes("?") ? "&" : "?";
      return `${def.endpoint}${sep}ustn=${encodeURIComponent(committedUstn)}`;
    }
    if (def.paramStrategy === "country") {
      if (!committedCountry) return null;
      const sep = def.endpoint.includes("?") ? "&" : "?";
      return `${def.endpoint}${sep}country=${encodeURIComponent(committedCountry.toUpperCase())}`;
    }
    return null;
  }, [def, tenantGtid, committedUstn, committedCountry]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["addon-hub", def.id, url],
    queryFn: async () => {
      if (!url) return { rows: [] as any[], raw: null as any };
      try {
        const r = await fetch(url);
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return { rows: [] as any[], raw: { error: `${r.status} ${r.statusText}`, body: body.slice(0, 200) } };
        }
        const j = await r.json();
        return { rows: normalizeRows(j, def.rowsKey, def.combineKeys), raw: j };
      } catch (e: any) {
        return { rows: [] as any[], raw: { error: e?.message || "fetch failed" } };
      }
    },
    staleTime: 30_000,
    enabled: !!url,
    retry: false,
  });

  const rows = data?.rows || [];
  const rawError = data?.raw?.error;
  const metric = def.metricValue(rows, data?.raw);

  // Render filter input for the param strategies that need user input.
  let filterUI: ReactNode = null;
  if (def.paramStrategy === "ustn") {
    filterUI = (
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={ustn}
          onChange={(e) => setUstn(e.target.value)}
          placeholder="Enter USTN (e.g. USTN-EG-2025-0001)"
          className="max-w-xs h-8 text-xs"
          aria-label={`USTN filter for ${def.name}`}
          onKeyDown={(e) => { if (e.key === "Enter") setCommittedUstn(ustn.trim()); }}
        />
        <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setCommittedUstn(ustn.trim())}>
          Fetch
        </Button>
        {committedUstn && (
          <span className="text-[0.65rem] text-muted-foreground">
            Filtered to <span className="font-mono text-foreground">{committedUstn}</span>
          </span>
        )}
      </div>
    );
  } else if (def.paramStrategy === "country") {
    filterUI = (
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="ISO 3166-1 alpha-2 (e.g. EG, SA, AE)"
          className="max-w-[260px] h-8 text-xs uppercase"
          aria-label={`Country filter for ${def.name}`}
          maxLength={2}
          onKeyDown={(e) => { if (e.key === "Enter") setCommittedCountry(country.trim().toUpperCase()); }}
        />
        <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setCommittedCountry(country.trim().toUpperCase())}>
          Fetch
        </Button>
        {committedCountry && (
          <span className="text-[0.65rem] text-muted-foreground">
            Country: <span className="font-mono text-foreground">{committedCountry}</span>
          </span>
        )}
      </div>
    );
  } else if (def.paramStrategy === "tenant" && !tenantGtid) {
    filterUI = (
      <div className="flex items-center gap-2 text-[0.7rem] text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5" />
        No active tenant — switch to a portal context to populate this add-on's data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-semibold text-foreground">{def.name}</h3>
        <PriorityBadge p={def.priority} />
        <span className="text-[0.65rem] text-muted-foreground">{def.blueprint}</span>
      </div>

      {filterUI}

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">{def.metricLabel}</div>
          <div className="text-2xl font-bold text-foreground mt-1">{metric}</div>
          {def.metricHint && <div className="text-[0.6rem] text-muted-foreground mt-1">{def.metricHint}</div>}
        </Card>
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Rows Returned</div>
          <div className="text-2xl font-bold text-foreground mt-1">{rows.length}</div>
          <div className="text-[0.6rem] text-muted-foreground mt-1">From primary list endpoint</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Priority Tier</div>
          <div className="mt-1"><PriorityBadge p={def.priority} /></div>
          <div className="text-[0.6rem] text-muted-foreground mt-1">{def.blueprint}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">API Endpoint</div>
          <a
            href={def.endpoint}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gold hover:underline truncate block mt-1 font-mono"
            aria-label={`Open raw API for ${def.name}`}
          >
            {def.endpoint}
          </a>
        </Card>
      </div>

      {/* Data table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gold" aria-hidden />
            <span className="ml-2 text-sm text-muted-foreground">Loading {def.name}…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center gap-2">
            <Inbox className="w-6 h-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {def.paramStrategy === "ustn" && !committedUstn
                ? "Enter a USTN above and click Fetch to load this add-on's data."
                : def.paramStrategy === "country" && !committedCountry
                ? "Enter a country code above and click Fetch to load this add-on's data."
                : def.paramStrategy === "tenant" && !tenantGtid
                ? "Switch to a tenant context (any portal) to populate this add-on's data."
                : rawError
                ? `Endpoint returned an error: ${rawError}`
                : "No data returned from the endpoint."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  {def.columns.map((c) => (
                    <th key={c.key} scope="col" className="text-left font-semibold p-2.5 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id || r.ustn || r.policyNumber || r.eventId || r.declarationNumber || `${def.id}-${i}`}
                    className="border-t border-border hover:bg-muted/20 transition-colors"
                  >
                    {def.columns.map((c) => (
                      <td
                        key={c.key}
                        className={`p-2.5 align-top whitespace-nowrap ${c.mono ? "font-mono text-[0.65rem]" : ""}`}
                      >
                        {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Footer link */}
      <div className="flex justify-end">
        <a href={def.endpoint} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View raw API <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </a>
      </div>
    </div>
  );
}

// ─── GRiRE special sub-tab (no list endpoint; uses /discover + per-country profile) ──

function GrireSubTab({ tenantGtid }: { tenantGtid: string | null }) {
  // (tenantGtid unused but kept in signature for AddOnSubTab call-site parity.)
  void tenantGtid;

  // Seed-status fetch (GET /grire/discover).
  const seedQ = useQuery({
    queryKey: ["addon-hub", "28", "discover-seed"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/grire/discover");
        if (!r.ok) return { ok: false, message: `${r.status} ${r.statusText}`, totalCountries: 0 };
        const j = await r.json();
        return { ok: !!j.ok, message: j.message || "—", totalCountries: j.totalCountries || 0 };
      } catch (e: any) {
        return { ok: false, message: e?.message || "fetch failed", totalCountries: 0 };
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  // Per-country profile (user-triggered).
  const [country, setCountry] = useState("");
  const [committedCountry, setCommittedCountry] = useState("");
  const profileQ = useQuery({
    queryKey: ["addon-hub", "28", "profile", committedCountry],
    queryFn: async () => {
      if (!committedCountry) return null;
      try {
        const r = await fetch(`/api/sgtx/grire/country-profile?country=${encodeURIComponent(committedCountry)}`);
        if (!r.ok) return { error: `${r.status} ${r.statusText}` };
        const j = await r.json();
        return j;
      } catch (e: any) {
        return { error: e?.message || "fetch failed" };
      }
    },
    enabled: !!committedCountry,
    staleTime: 60_000,
    retry: false,
  });

  const profile = profileQ.data?.profile;
  const profileErr = profileQ.data?.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-semibold text-foreground">GRiRE Engine</h3>
        <PriorityBadge p="Foundation" />
        <span className="text-[0.65rem] text-muted-foreground">Add-On 28 · Global Regulatory Intelligence & Requirements Engine</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Country Profiles Seeded</div>
          <div className="text-2xl font-bold text-foreground mt-1">{seedQ.data?.totalCountries ?? "—"}</div>
          <div className="text-[0.6rem] text-muted-foreground mt-1">{seedQ.data?.message || "Seeding status"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Coverage Target</div>
          <div className="text-2xl font-bold text-foreground mt-1">195</div>
          <div className="text-[0.6rem] text-muted-foreground mt-1">Countries (per v13.1 spec)</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Tariff Schedules</div>
          <div className="text-2xl font-bold text-foreground mt-1">150+</div>
          <div className="text-[0.6rem] text-muted-foreground mt-1">HS-code mappings</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Ports Covered</div>
          <div className="text-2xl font-bold text-foreground mt-1">1,200+</div>
          <div className="text-[0.6rem] text-muted-foreground mt-1">UN/LOCODE entries</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground mb-2">Country profile lookup</div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="ISO 3166-1 alpha-2 (e.g. EG, SA, AE, US, CN, DE)"
            className="max-w-[260px] h-8 text-xs uppercase"
            aria-label="Country code for GRiRE profile lookup"
            maxLength={2}
            onKeyDown={(e) => { if (e.key === "Enter") setCommittedCountry(country.trim().toUpperCase()); }}
          />
          <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setCommittedCountry(country.trim().toUpperCase())}>
            Fetch Profile
          </Button>
          {committedCountry && (
            <span className="text-[0.65rem] text-muted-foreground">
              Country: <span className="font-mono text-foreground">{committedCountry}</span>
            </span>
          )}
        </div>

        {profileQ.isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gold" aria-hidden />
            <span className="ml-2 text-sm text-muted-foreground">Loading country profile…</span>
          </div>
        )}

        {profileErr && !profileQ.isLoading && (
          <div className="text-center py-8 text-xs text-red-700 dark:text-red-300">
            Profile fetch failed: {profileErr}
          </div>
        )}

        {profile && !profileQ.isLoading && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              ["Country", profile.country || committedCountry],
              ["Customs Authority", profile.customsAuthority],
              ["Currency", profile.currency],
              ["Single Window", profile.singleWindowSystem],
              ["VAT Rate", profile.vatRate != null ? `${profile.vatRate}%` : null],
              ["Discovered", fmtDate(profile.discoveredAt || profile.updatedAt)],
            ].map(([k, v]) => (
              <Card key={String(k)} className="p-2.5">
                <div className="text-[0.6rem] text-muted-foreground uppercase">{k}</div>
                <div className="text-sm font-semibold mt-0.5 truncate">{v || "—"}</div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <a href="/api/sgtx/grire/discover" target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View raw /grire/discover <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </a>
      </div>
    </div>
  );
}

// ─── Addon definitions ─────────────────────────────────────────────────────────
//
// Each entry below drives a single sub-tab in the hub. The columns are
// chosen to surface the most useful identifying fields from the response;
// missing fields render as "—" gracefully.

const ADDONS: AddonDef[] = [
  // ── #9 Demurrage & Detention ──────────────────────────────────────────────
  {
    id: "9",
    name: "Demurrage & Detention",
    priority: "P0",
    blueprint: "Add-On 9 · Part 3B.3.5 Mode C",
    endpoint: "/api/sgtx/demurrage/alerts",
    paramStrategy: "none",
    rowsKey: "alerts",
    metricLabel: "Active Demurrage Alerts",
    metricValue: (rows) => rows.filter((r) => !r.acknowledged).length || rows.length,
    metricHint: "Unacknowledged alerts (or total if all acked)",
    columns: [
      { key: "ustn", label: "USTN", mono: true },
      { key: "alertType", label: "Type", render: (r) => <StatusPill value={r.alertType} /> },
      { key: "severity", label: "Severity", render: (r) => <StatusPill value={r.severity} /> },
      { key: "portUnlocode", label: "Port", mono: true, render: (r) => r.portUnlocode || r.demurrage?.portUnlocode || "—" },
      { key: "acknowledged", label: "Acked?", render: (r) => (r.acknowledged ? "Yes" : "No") },
      { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
    ],
  },
  // ── #10 Broker Liability & Insurance ──────────────────────────────────────
  {
    id: "10",
    name: "Broker Liability",
    priority: "P0",
    blueprint: "Add-On 10 · Broker liability + declaration errors",
    endpoint: "/api/sgtx/broker-liability/list",
    paramStrategy: "tenant",
    tenantParamKey: "brokerGtid",
    rowsKey: "policies",
    metricLabel: "Coverage Gap",
    metricValue: (_rows, raw) => (raw?.coverageGap?.hasGap ? "YES" : "None"),
    metricHint: "From /broker-liability/list coverageGap field",
    columns: [
      { key: "policyNumber", label: "Policy #", mono: true },
      { key: "insurer", label: "Insurer" },
      { key: "coverageAmount", label: "Coverage", render: (r) => fmtUsd(r.coverageAmount) },
      { key: "effectiveStatus", label: "Status", render: (r) => <StatusPill value={r.effectiveStatus || r.status} /> },
      { key: "verifiedAt", label: "Verified", render: (r) => fmtDate(r.verifiedAt) },
      { key: "expiryDate", label: "Expires", render: (r) => fmtDate(r.expiryDate) },
    ],
  },
  // ── #11 Customs Valuation Intelligence ─────────────────────────────────────
  {
    id: "11",
    name: "Customs Valuation",
    priority: "P1",
    blueprint: "Add-On 11 · Governor PreScreen G1U35 + A2 duty model",
    endpoint: "/api/sgtx/valuation/disputes",
    paramStrategy: "ustn",
    rowsKey: "disputes",
    metricLabel: "Open Valuation Disputes",
    metricValue: (rows) => rows.filter((r) => (r.status || "").toUpperCase() === "OPEN" || (r.status || "").toUpperCase() === "PENDING").length,
    metricHint: "Disputes in OPEN/PENDING status",
    columns: [
      { key: "ustn", label: "USTN", mono: true },
      { key: "disputeType", label: "Type", render: (r) => <StatusPill value={r.disputeType} /> },
      { key: "declaredValue", label: "Declared", render: (r) => fmtUsd(r.declaredValue) },
      { key: "marketPrice", label: "Market", render: (r) => fmtUsd(r.marketPrice) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "createdAt", label: "Filed", render: (r) => fmtDate(r.createdAt) },
    ],
  },
  // ── #12 Cold Chain Quality Management ──────────────────────────────────────
  {
    id: "12",
    name: "Cold Chain",
    priority: "P1",
    blueprint: "Add-On 12 · PTI · A2 LSTM anomaly detection",
    endpoint: "/api/sgtx/cold-chain/anomalies",
    paramStrategy: "ustn",
    rowsKey: "anomalies",
    metricLabel: "Unresolved Anomalies",
    metricValue: (rows) => rows.filter((r) => !r.resolved).length,
    metricHint: "Anomalies not yet marked resolved",
    columns: [
      { key: "ustn", label: "USTN", mono: true },
      { key: "anomalyType", label: "Type", render: (r) => <StatusPill value={r.anomalyType} /> },
      { key: "severity", label: "Severity", render: (r) => <StatusPill value={r.severity} /> },
      { key: "readingValue", label: "Reading", render: (r) => `${r.readingValue ?? "—"}${r.unit ? " " + r.unit : ""}` },
      { key: "resolved", label: "Resolved?", render: (r) => (r.resolved ? "Yes" : "No") },
      { key: "recordedAt", label: "Recorded", render: (r) => fmtDate(r.recordedAt) },
    ],
  },
  // ── #13 Inspection Agency Accreditation ─────────────────────────────────────
  {
    id: "13",
    name: "Inspection Accreditation",
    priority: "P1",
    blueprint: "Add-On 13 · ISO 17020 standard tracking",
    endpoint: "/api/sgtx/inspection/accreditations",
    paramStrategy: "tenant",
    tenantParamKey: "agencyGtid",
    rowsKey: "accreditations",
    metricLabel: "Accreditation Gap",
    metricValue: (_rows, raw) => (raw?.accreditationGap?.hasGap ? "YES" : "None"),
    metricHint: "From /inspection/accreditations accreditationGap field",
    columns: [
      { key: "accreditationBody", label: "Body" },
      { key: "standard", label: "Standard", mono: true },
      { key: "certificateNumber", label: "Cert #", mono: true },
      { key: "validFrom", label: "Valid From", render: (r) => fmtDate(r.validFrom) },
      { key: "validUntil", label: "Valid Until", render: (r) => fmtDate(r.validUntil) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
    ],
  },
  // ── #14 Currency Risk Management ───────────────────────────────────────────
  {
    id: "14",
    name: "Currency Risk",
    priority: "P1",
    blueprint: "Add-On 14 · ECB daily XML feed · hedge recommendations",
    endpoint: "/api/sgtx/currency-risk/recommendations",
    paramStrategy: "tenant",
    tenantParamKey: "tenantGtid",
    rowsKey: "recommendations",
    metricLabel: "Open FX Exposures",
    metricValue: (_rows, raw) => Array.isArray(raw?.openExposures) ? raw.openExposures.length : 0,
    metricHint: "From /currency-risk/recommendations openExposures field",
    columns: [
      { key: "currencyPair", label: "Pair", mono: true },
      { key: "exposureAmount", label: "Exposure", render: (r) => fmtUsd(r.exposureAmount) },
      { key: "recommendationType", label: "Hedge", render: (r) => <StatusPill value={r.recommendationType} /> },
      { key: "recommendedRatio", label: "Ratio", render: (r) => (r.recommendedRatio != null ? `${(r.recommendedRatio * 100).toFixed(0)}%` : "—") },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
    ],
  },
  // ── #15 Government API Sandbox ──────────────────────────────────────────────
  {
    id: "15",
    name: "Gov Sandbox",
    priority: "P1",
    blueprint: "Add-On 15 · Nafeza · CargoX · ETA · ICS2 · TRACES · FASAH · ACE · CDS",
    endpoint: "/api/sgtx/gov-sandbox/apis",
    paramStrategy: "none",
    rowsKey: "apis",
    metricLabel: "Government APIs",
    metricValue: (rows) => rows.length,
    metricHint: "Total sandbox APIs discovered",
    columns: [
      { key: "apiName", label: "API Name" },
      { key: "countryCode", label: "Country", mono: true },
      { key: "governmentSystem", label: "System" },
      { key: "endpointUrl", label: "Endpoint", mono: true, render: (r) => r.endpointUrl || "—" },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "lastTestedAt", label: "Last Test", render: (r) => fmtDate(r.lastTestedAt) },
    ],
  },
  // ── #16 FTA Preference Management ──────────────────────────────────────────
  {
    id: "16",
    name: "FTA Preferences",
    priority: "P1",
    blueprint: "Add-On 16 · Egypt-EU · AfCFTA · GAFTA · USMCA · RCEP · 9 FTAs",
    endpoint: "/api/sgtx/fta/preferences",
    paramStrategy: "none",
    rowsKey: "preferences",
    metricLabel: "FTA Preference Records",
    metricValue: (rows) => rows.length,
    metricHint: "Total preferences across all FTAs",
    columns: [
      { key: "ftaName", label: "FTA" },
      { key: "originCountry", label: "Origin", mono: true },
      { key: "destinationCountry", label: "Dest", mono: true },
      { key: "hsCode", label: "HS Code", mono: true },
      { key: "preferentialRate", label: "Pref Rate", render: (r) => (r.preferentialRate != null ? `${r.preferentialRate}%` : "—") },
      { key: "validUntil", label: "Valid Until", render: (r) => fmtDate(r.validUntil) },
    ],
  },
  // ── #17 Piracy & Security Risk Engine ─────────────────────────────────────
  {
    id: "17",
    name: "Piracy & Security",
    priority: "P1",
    blueprint: "Add-On 17 · IMB Piracy Reporting Centre · corridor scores",
    endpoint: "/api/sgtx/security/incidents?scope=maritime",
    paramStrategy: "none",
    rowsKey: "incidents",
    metricLabel: "Maritime Incidents",
    metricValue: (rows) => rows.length,
    metricHint: "Total maritime security incidents logged",
    columns: [
      { key: "incidentId", label: "Incident #", mono: true },
      { key: "corridor", label: "Corridor", mono: true },
      { key: "incidentType", label: "Type", render: (r) => <StatusPill value={r.incidentType} /> },
      { key: "severity", label: "Severity", render: (r) => <StatusPill value={r.severity} /> },
      { key: "vesselName", label: "Vessel", render: (r) => r.vesselName || "—" },
      { key: "occurredAt", label: "Occurred", render: (r) => fmtDate(r.occurredAt) },
    ],
  },
  // ── #18 Trade Compliance Calendar ──────────────────────────────────────────
  {
    id: "18",
    name: "Compliance Calendar",
    priority: "P1",
    blueprint: "Add-On 18 · 7 event types · 30/14/7/1-day reminders",
    endpoint: "/api/sgtx/compliance-calendar/events",
    paramStrategy: "tenant",
    tenantParamKey: "tenantGtid",
    rowsKey: "events",
    metricLabel: "Upcoming Events (90d)",
    metricValue: (rows) => rows.length,
    metricHint: "Compliance events in the next 90 days",
    columns: [
      { key: "eventType", label: "Type", render: (r) => <StatusPill value={r.eventType} /> },
      { key: "title", label: "Title" },
      { key: "jurisdiction", label: "Jurisdiction", mono: true },
      { key: "dueDate", label: "Due Date", render: (r) => fmtDate(r.dueDate) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "reminderDays", label: "Reminders", render: (r) => Array.isArray(r.reminderDays) ? r.reminderDays.join("/") : (r.reminderDays || "30/14/7/1") },
    ],
  },
  // ── #19 Cargo Insurance Integration ─────────────────────────────────────────
  {
    id: "19",
    name: "Cargo Insurance",
    priority: "P2",
    blueprint: "Add-On 19 · Allianz · Zurich · AIG · Egyptian · Saudi National",
    endpoint: "/api/sgtx/cargo-insurance/policies",
    paramStrategy: "ustn",
    rowsKey: "policies",
    metricLabel: "Active Policies",
    metricValue: (rows) => rows.filter((r) => (r.status || "").toUpperCase() === "ACTIVE").length,
    metricHint: "Policies with ACTIVE status",
    columns: [
      { key: "policyNumber", label: "Policy #", mono: true },
      { key: "insurer", label: "Insurer" },
      { key: "coverageType", label: "Type", render: (r) => <StatusPill value={r.coverageType} /> },
      { key: "coverageAmount", label: "Coverage", render: (r) => fmtUsd(r.coverageAmount) },
      { key: "premium", label: "Premium", render: (r) => fmtUsd(r.premium) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
    ],
  },
  // ── #20 Trade Finance Documentation ─────────────────────────────────────────
  {
    id: "20",
    name: "Trade Finance Docs",
    priority: "P2",
    blueprint: "Add-On 20 · LC Application · LC Confirmation · BoE · Assignment",
    endpoint: "/api/sgtx/trade-finance/documents",
    paramStrategy: "ustn",
    rowsKey: "documents",
    metricLabel: "Finance Documents",
    metricValue: (rows) => rows.length,
    metricHint: "Total trade finance documents for the USTN",
    columns: [
      { key: "docType", label: "Type", render: (r) => <StatusPill value={r.docType} /> },
      { key: "documentNumber", label: "Doc #", mono: true },
      { key: "issuingParty", label: "Issuer" },
      { key: "amount", label: "Amount", render: (r) => fmtUsd(r.amount) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
    ],
  },
  // ── #21 Back-to-Back LC Management ──────────────────────────────────────────
  {
    id: "21",
    name: "Back-to-Back LC",
    priority: "P2",
    blueprint: "Add-On 21 · Primary LC → Secondary LC (supplier)",
    endpoint: "/api/sgtx/back-to-back-lc/list",
    paramStrategy: "tenant",
    tenantParamKey: "buyerGtid",
    rowsKey: "lcs",
    metricLabel: "Back-to-Back LCs",
    metricValue: (rows) => rows.length,
    metricHint: "Total back-to-back LCs for this buyer",
    columns: [
      { key: "primaryLcNumber", label: "Primary LC", mono: true, render: (r) => r.primaryLcNumber || r.primaryLcId || "—" },
      { key: "secondaryLcNumber", label: "Secondary LC", mono: true, render: (r) => r.secondaryLcNumber || r.secondaryLcId || "—" },
      { key: "issuingBank", label: "Issuing Bank" },
      { key: "amount", label: "Amount", render: (r) => fmtUsd(r.amount) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "confirmedAt", label: "Confirmed", render: (r) => fmtDate(r.confirmedAt) },
    ],
  },
  // ── #22 Force Majeure Handling ──────────────────────────────────────────────
  {
    id: "22",
    name: "Force Majeure",
    priority: "P2",
    blueprint: "Add-On 22 · RIA scraping · 5 event types · extension workflow",
    endpoint: "/api/sgtx/force-majeure/events",
    paramStrategy: "none",
    combineKeys: ["dbEvents", "inMemoryEvents"],
    metricLabel: "Active FM Events",
    metricValue: (rows) => rows.length,
    metricHint: "DB + in-memory active events combined",
    columns: [
      { key: "eventName", label: "Event" },
      { key: "eventType", label: "Type", render: (r) => <StatusPill value={r.eventType} /> },
      { key: "severity", label: "Severity", render: (r) => <StatusPill value={r.severity} /> },
      { key: "jurisdiction", label: "Jurisdiction", mono: true, render: (r) => r.jurisdiction || r.country || "—" },
      { key: "startDate", label: "Start", render: (r) => fmtDate(r.startDate || r.effectiveFrom) },
      { key: "endDate", label: "End", render: (r) => fmtDate(r.endDate || r.effectiveUntil) },
    ],
  },
  // ── #23 Shipper's Declaration & Export Docs ─────────────────────────────────
  {
    id: "23",
    name: "Shipper's Declaration",
    priority: "P2",
    blueprint: "Add-On 23 · Shipper's Declaration · EAD · Export Licence · COO · EUR.1",
    endpoint: "/api/sgtx/shippers-declaration/list",
    paramStrategy: "tenant",
    tenantParamKey: "exporterGtid",
    rowsKey: "declarations",
    metricLabel: "Export Declarations",
    metricValue: (rows) => rows.length,
    metricHint: "Total declarations filed by this exporter",
    columns: [
      { key: "declarationNumber", label: "Decl #", mono: true },
      { key: "ustn", label: "USTN", mono: true },
      { key: "destinationCountry", label: "Dest", mono: true },
      { key: "hsCode", label: "HS Code", mono: true },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "signedAt", label: "Signed", render: (r) => fmtDate(r.signedAt || r.createdAt) },
    ],
  },
  // ── #24 Port & Terminal Integration ─────────────────────────────────────────
  {
    id: "24",
    name: "Port & Terminal",
    priority: "P2",
    blueprint: "Add-On 24 · EDI EDIFACT · 5 integration points · gate-in/out",
    endpoint: "/api/sgtx/terminal/integrations",
    paramStrategy: "none",
    rowsKey: "integrations",
    metricLabel: "Terminal Integrations",
    metricValue: (rows) => rows.filter((r) => (r.status || "").toUpperCase() === "ACTIVE").length,
    metricHint: "Active terminal integrations",
    columns: [
      { key: "terminalName", label: "Terminal" },
      { key: "terminalGtid", label: "GTID", mono: true },
      { key: "portUnlocode", label: "Port", mono: true, render: (r) => r.portUnlocode || "—" },
      { key: "ediStandard", label: "EDI", mono: true, render: (r) => r.ediStandard || "—" },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "lastEventAt", label: "Last Event", render: (r) => fmtDate(r.lastEventAt || r.lastSyncAt) },
    ],
  },
  // ── #25 Payment Guarantee Confirmation ──────────────────────────────────────
  {
    id: "25",
    name: "Payment Guarantee",
    priority: "P3",
    blueprint: "Add-On 25 (Optional) · SWIFT MT700 · URDG 758 · 4 verification methods",
    endpoint: "/api/sgtx/payment-guarantee/status",
    paramStrategy: "ustn",
    rowsKey: "guarantees",
    metricLabel: "Confirmed Guarantees",
    metricValue: (_rows, raw) => raw?.confirmedCount ?? 0,
    metricHint: "From /payment-guarantee/status confirmedCount field",
    columns: [
      { key: "guaranteeId", label: "Guarantee #", mono: true },
      { key: "ustn", label: "USTN", mono: true },
      { key: "guaranteeType", label: "Type", render: (r) => <StatusPill value={r.guaranteeType} /> },
      { key: "amount", label: "Amount", render: (r) => fmtUsd(r.amount) },
      { key: "currency", label: "Ccy", mono: true },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
    ],
  },
  // ── #26 Demurrage Dispute Resolution ─────────────────────────────────────────
  {
    id: "26",
    name: "Demurrage Dispute",
    priority: "P3",
    blueprint: "Add-On 26 · Extends Part 10 Dispute · mediation workflow",
    endpoint: "/api/sgtx/demurrage-dispute/list",
    paramStrategy: "ustn",
    rowsKey: "disputes",
    metricLabel: "Open Demurrage Disputes",
    metricValue: (rows) => rows.filter((r) => (r.status || "").toUpperCase() === "PENDING").length,
    metricHint: "Disputes in PENDING status",
    columns: [
      { key: "disputeId", label: "Dispute #", mono: true },
      { key: "ustn", label: "USTN", mono: true },
      { key: "disputeReason", label: "Reason", render: (r) => <StatusPill value={r.disputeReason} /> },
      { key: "requestedAmount", label: "Requested", render: (r) => fmtUsd(r.requestedAmount) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
      { key: "createdAt", label: "Filed", render: (r) => fmtDate(r.createdAt) },
    ],
  },
  // ── #28 GRiRE — handled by GrireSubTab (no list endpoint) ───────────────────
  // The GrireSubTab component is rendered directly when id === "28" — see the
  // hub dispatcher below. We keep an entry in ADDONS only for the tab trigger.
  {
    id: "28",
    name: "GRiRE Engine",
    priority: "Foundation",
    blueprint: "Add-On 28 · Foundation · 195 countries · 150+ tariff schedules",
    endpoint: "/api/sgtx/grire/discover",
    paramStrategy: "none",
    rowsKey: undefined,
    metricLabel: "Foundation Tier",
    metricValue: () => "—",
    columns: [],
  },
];

// ─── Main hub screen ──────────────────────────────────────────────────────────

export function AddOnsHubScreen({ defaultSubTab = "9" }: { defaultSubTab?: string }) {
  const tenantGtid = useAppStore((s) => s.activeTenantGtid);

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader
        title="SGTX Add-Ons Hub (9–28)"
        subtitle="Unified surface for all 19 implemented add-ons · backend-complete per CB-AUDIT · this hub closes the portal UI gap · read-mostly"
      />

      <Tabs defaultValue={defaultSubTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1 rounded-lg w-full justify-start">
          {ADDONS.map((a) => (
            <TabsTrigger
              key={a.id}
              value={a.id}
              className="text-[0.7rem] px-2.5 py-1 h-auto flex-none"
              aria-label={`Open ${a.name} sub-tab`}
            >
              <span className="text-muted-foreground mr-1 tabular-nums">{a.id}</span>
              <span>{a.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {ADDONS.map((a) => (
          <TabsContent key={a.id} value={a.id} className="mt-4 focus-visible:outline-none">
            {a.id === "28" ? (
              <GrireSubTab tenantGtid={tenantGtid} />
            ) : (
              <AddOnSubTab def={a} tenantGtid={tenantGtid} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Per-portal thin wrappers (Part 3 of the task) ────────────────────────────
//
// Each wrapper renders AddOnsHubScreen pre-set to the appropriate sub-tab.
// These exist so portal-specific tabs (e.g. trader-buyer → Demurrage) can
// deep-link into the hub without duplicating any of the rendering logic.

export function DemurragePanel() { return <AddOnsHubScreen defaultSubTab="9" />; }
export function ColdChainPanel() { return <AddOnsHubScreen defaultSubTab="12" />; }
export function ComplianceCalendarPanel() { return <AddOnsHubScreen defaultSubTab="18" />; }
export function GrirPanel() { return <AddOnsHubScreen defaultSubTab="28" />; }
export function ForceMajeurePanel() { return <AddOnsHubScreen defaultSubTab="22" />; }
