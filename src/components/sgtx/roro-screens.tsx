"use client";

// SGTX Part 30 — RoRo Trade Corridor Network (TCN) UI Screens
//
// Three screens covering the full RoRo workflow:
//   1. RoRoCorridorSelector  — corridor selection widget for the trade request wizard
//                              (drop-in component that calls onSelect with the chosen
//                              corridor code + optional schedule)
//   2. RoRoDashboardScreen   — government portal dashboard: all corridors, schedules,
//                              live compliance status, capacity, recent bookings
//   3. RoRoManifestScreen    — manage a RoRo cargo manifest for a USTN:
//                              add items, view compliance gates, confirm roll-on/off
//
// All API calls go through the /api/sgtx/tcn/* endpoints (Part 30.7-30.11).

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader, ExecutiveCards } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, fmtDateTime, fmtKg, statusColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import {
  Ship, Anchor, Truck, Container, Loader2, RefreshCw, Plus, CheckCircle2,
  AlertTriangle, ShieldCheck, Gauge, MapPin, Calendar, Activity, FileCheck,
  ClipboardList, ArrowDownToLine, ArrowUpFromLine, Search, Globe2,
} from "lucide-react";

// ----------------------------- helpers -----------------------------

function useTenantGtid(): string | null {
  return useAppStore((s) => s.activeTenantGtid);
}

async function jfetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json();
}

const RORO_CORRIDORS = [
  { code: "EGY-ITA-RORO-001", name: "Egypt → Italy", origin: "EG", dest: "IT", ports: "Damietta → Trieste", transitDays: 6 },
  { code: "EGY-KSA-RORO-001", name: "Egypt → Saudi Arabia", origin: "EG", dest: "SA", ports: "Safaga → Jeddah", transitDays: 3 },
  { code: "EGY-UAE-RORO-001", name: "Egypt → UAE", origin: "EG", dest: "AE", ports: "Alexandria → Jebel Ali", transitDays: 5 },
];

// =================================================================
// 1. RoRoCorridorSelector — for the trade request wizard
// =================================================================
//
// Drop-in widget: caller passes `onSelect(corridorCode, scheduleId?)`.
// Shows the 3 RoRo corridors with capacity summary and (optionally) a
// schedule picker for the chosen corridor. Designed to be embedded in
// NewTradeRequestScreen when transport mode = "RORO".

export interface RoRoCorridorSelectorProps {
  onSelect?: (corridorCode: string, scheduleId?: string) => void;
  initialCorridor?: string;
  initialSchedule?: string;
}

export function RoRoCorridorSelector({
  onSelect,
  initialCorridor,
  initialSchedule,
}: RoRoCorridorSelectorProps) {
  const [selectedCorridor, setSelectedCorridor] = useState<string | undefined>(initialCorridor);
  const [selectedSchedule, setSelectedSchedule] = useState<string | undefined>(initialSchedule);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Load schedules for the selected corridor
  useEffect(() => {
    if (!selectedCorridor) {
      // Defer to avoid synchronous setState within effect body
      const t = setTimeout(() => setSchedules([]), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    setTimeout(() => !cancelled && setLoadingSchedules(true), 0);
    jfetch(`/api/sgtx/tcn/vessel-schedules?corridor=${encodeURIComponent(selectedCorridor)}`)
      .then((d) => !cancelled && setSchedules(d.schedules || []))
      .catch(() => !cancelled && setSchedules([]))
      .finally(() => !cancelled && setLoadingSchedules(false));
    return () => {
      cancelled = true;
    };
  }, [selectedCorridor]);

  const handleCorridorPick = (code: string) => {
    setSelectedCorridor(code);
    setSelectedSchedule(undefined);
    onSelect?.(code, undefined);
  };

  const handleSchedulePick = (schedId: string) => {
    setSelectedSchedule(schedId);
    onSelect?.(selectedCorridor, schedId);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="RoRo Corridor Selection"
        subtitle="Part 30 · Pick the trade corridor for this RoRo shipment · 3 active corridors (EGY→ITA / EGY→KSA / EGY→UAE)"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {RORO_CORRIDORS.map((c) => {
          const active = selectedCorridor === c.code;
          return (
            <Card
              key={c.code}
              onClick={() => handleCorridorPick(c.code)}
              className={`p-4 cursor-pointer transition-all hover:border-gold/50 ${
                active ? "border-gold ring-2 ring-gold/30 bg-gold/5" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Ship className="w-4 h-4 text-gold" />
                  <span className="text-sm font-semibold">{c.name}</span>
                </div>
                {active && <CheckCircle2 className="w-4 h-4 text-gold" />}
              </div>
              <p className="text-[0.65rem] font-mono text-muted-foreground mb-2">{c.code}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[0.6rem] text-muted-foreground">Route</p>
                  <p className="font-medium text-[0.7rem]">{c.ports}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-muted-foreground">Transit</p>
                  <p className="font-medium">{c.transitDays}d</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedCorridor && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Vessel Schedules</p>
              <p className="text-sm font-semibold">{schedules.length} sailing(s) available</p>
            </div>
            {loadingSchedules && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {schedules.length === 0 && !loadingSchedules ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No schedules seeded for this corridor.</p>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => {
                const active = selectedSchedule === s.scheduleId;
                return (
                  <div
                    key={s.scheduleId}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      active ? "border-gold bg-gold/5" : "border-border hover:border-gold/40"
                    }`}
                    onClick={() => handleSchedulePick(s.scheduleId)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Anchor className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-semibold">{s.vesselName}</span>
                        <Badge variant="outline" className="text-[0.55rem] font-mono">{s.vesselImo}</Badge>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[0.55rem]"
                        style={{ color: statusColor(s.bookingStatus) }}
                      >
                        {s.bookingStatus}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-[0.6rem] text-muted-foreground">Departure</p>
                        <p className="font-medium">{fmtDate(s.etd)}</p>
                      </div>
                      <div>
                        <p className="text-[0.6rem] text-muted-foreground">Arrival</p>
                        <p className="font-medium">{fmtDate(s.eta)}</p>
                      </div>
                      <div>
                        <p className="text-[0.6rem] text-muted-foreground">Ports</p>
                        <p className="font-medium text-[0.7rem]">{s.departurePort} → {s.arrivalPort}</p>
                      </div>
                      <div>
                        <p className="text-[0.6rem] text-muted-foreground">Available</p>
                        <p className="font-medium">{s.availableSlots} slots</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {selectedCorridor && selectedSchedule && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            RoRo corridor <strong>{selectedCorridor}</strong> + schedule <strong>{selectedSchedule}</strong> selected.
          </p>
        </div>
      )}
    </div>
  );
}

// =================================================================
// 2. RoRoDashboardScreen — Government Portal
// =================================================================
//
// Government-facing dashboard showing all RoRo corridors, vessel schedules,
// live compliance gate status per corridor, capacity utilisation, and recent
// bookings across the network. Read-only (oversight perspective).

export function RoRoDashboardScreen() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [corridors, setCorridors] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCorridorFilter, setSelectedCorridorFilter] = useState<string>("ALL");
  const [complianceModal, setComplianceModal] = useState<{ corridorCode: string; ustn: string } | null>(null);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setTimeout(() => !cancelled && setLoading(true), 0);
    Promise.all([
      jfetch("/api/sgtx/tcn/vessel-schedules").catch(() => ({ schedules: [] })),
      jfetch("/api/sgtx/tcn/corridor/list").catch(() => ({ corridors: [] })),
      jfetch("/api/sgtx/tcn/roro-manifest").catch(() => ({ manifests: [] })),
    ])
      .then(([schedRes, corrRes, manRes]) => {
        if (cancelled) return;
        setSchedules(schedRes.schedules || []);
        setCorridors(corrRes.corridors || []);
        setManifests(manRes.manifests || []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredSchedules = useMemo(() => {
    if (selectedCorridorFilter === "ALL") return schedules;
    return schedules.filter((s) => s.corridorCode === selectedCorridorFilter);
  }, [schedules, selectedCorridorFilter]);

  // Aggregate metrics
  const totalSchedules = schedules.length;
  const openSchedules = schedules.filter((s) => s.bookingStatus === "OPEN").length;
  const totalCapacity = schedules.reduce((s, x) => s + (x.trailerCapacity + x.vehicleCapacity + x.reeferCapacity), 0);
  const totalAvailable = schedules.reduce((s, x) => s + (x.availableSlots || 0), 0);
  const utilization = totalCapacity > 0 ? Math.round((1 - totalAvailable / totalCapacity) * 100) : 0;
  const activeManifests = manifests.filter((m) => m.status !== "CLOSED").length;

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="RoRo Corridor Network — Government Oversight"
        subtitle="Part 30 · 3 strategic RoRo corridors (EGY→ITA, EGY→KSA, EGY→UAE) · vessel schedules · compliance gates · capacity utilisation"
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        }
      />

      <ExecutiveCards
        cards={[
          { label: "Active Corridors", value: String(corridors.length), icon: Globe2, accent: "#1a6fb0" },
          { label: "Vessel Schedules", value: String(totalSchedules), sub: `${openSchedules} open for booking`, icon: Ship, accent: "#0d6efd" },
          { label: "Capacity Utilisation", value: `${utilization}%`, sub: `${totalAvailable}/${totalCapacity} slots available`, icon: Gauge, accent: "#10b981" },
          { label: "Active Manifests", value: String(activeManifests), icon: ClipboardList, accent: "#fbbf24" },
        ]}
      />

      {/* Corridor cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {corridors.map((c) => {
          const corridorSchedules = schedules.filter((s) => s.corridorCode === c.corridorCode);
          const corridorManifests = manifests.filter((m) => m.corridorCode === c.corridorCode);
          return (
            <Card key={c.corridorCode} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold">{c.corridorName}</p>
                  <p className="text-[0.6rem] font-mono text-muted-foreground">{c.corridorCode}</p>
                </div>
                <Badge
                  variant="outline"
                  className="text-[0.55rem]"
                  style={{ color: statusColor(c.status) }}
                >
                  {c.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                <div>
                  <p className="text-[0.6rem] text-muted-foreground">Origin → Dest</p>
                  <p className="font-medium text-[0.7rem]">{c.originCountry} → {c.destinationCountry}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-muted-foreground">Type</p>
                  <p className="font-medium">{c.corridorType}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-muted-foreground">Schedules</p>
                  <p className="font-medium">{corridorSchedules.length}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-muted-foreground">Manifests</p>
                  <p className="font-medium">{corridorManifests.length}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filter + schedules table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm">Vessel Schedules</h3>
            <p className="text-[0.65rem] text-muted-foreground">{filteredSchedules.length} sailing(s)</p>
          </div>
          <Select value={selectedCorridorFilter} onValueChange={setSelectedCorridorFilter}>
            <SelectTrigger className="w-[260px] h-8 text-xs">
              <SelectValue placeholder="Filter by corridor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All corridors</SelectItem>
              {RORO_CORRIDORS.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Vessel</th>
                <th className="text-left font-medium px-3 py-2.5">Corridor</th>
                <th className="text-left font-medium px-3 py-2.5">Route</th>
                <th className="text-left font-medium px-3 py-2.5">ETD</th>
                <th className="text-left font-medium px-3 py-2.5">ETA</th>
                <th className="text-left font-medium px-3 py-2.5">Capacity (T/V/R)</th>
                <th className="text-left font-medium px-3 py-2.5">Available</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No schedules found. Run the seed at <code>/api/sgtx/tcn/vessel-schedules?seed=true</code>.
                  </td>
                </tr>
              ) : (
                filteredSchedules.map((s) => (
                  <tr key={s.scheduleId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Ship className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-[0.75rem]">{s.vesselName}</p>
                          <p className="text-[0.6rem] font-mono text-muted-foreground">{s.scheduleId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-mono">{s.corridorCode}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">
                      <span className="font-mono">{s.departurePort}</span> → <span className="font-mono">{s.arrivalPort}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[0.7rem]">{fmtDate(s.etd)}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">{fmtDate(s.eta)}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">
                      <span className="font-mono">{s.trailerCapacity}/{s.vehicleCapacity}/{s.reeferCapacity}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-semibold">{s.availableSlots}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[0.55rem]" style={{ color: statusColor(s.bookingStatus) }}>
                        {s.bookingStatus}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent manifests */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Recent RoRo Manifests</h3>
          <p className="text-[0.65rem] text-muted-foreground">{manifests.length} manifest(s) across all corridors</p>
        </div>
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">USTN</th>
                <th className="text-left font-medium px-3 py-2.5">Corridor</th>
                <th className="text-left font-medium px-3 py-2.5">Items</th>
                <th className="text-left font-medium px-3 py-2.5">Weight</th>
                <th className="text-left font-medium px-3 py-2.5">Roll-on</th>
                <th className="text-left font-medium px-3 py-2.5">Roll-off</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-left font-medium px-3 py-2.5">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {manifests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No manifests submitted yet.
                  </td>
                </tr>
              ) : (
                manifests.slice(0, 20).map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-[0.7rem] font-mono">{m.ustn?.slice(0, 36)}…</td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-mono">{m.corridorCode || "—"}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">{m.totalItems}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">{fmtKg(m.totalWeightKg)}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">{m.rollOnAt ? fmtDateTime(m.rollOnAt) : "—"}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">{m.rollOffAt ? fmtDateTime(m.rollOffAt) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[0.55rem]" style={{ color: statusColor(m.status) }}>
                        {m.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {m.corridorCode ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[0.6rem]"
                          onClick={() => setComplianceModal({ corridorCode: m.corridorCode!, ustn: m.ustn })}
                        >
                          <ShieldCheck className="w-3 h-3 mr-1" /> Run Gates
                        </Button>
                      ) : (
                        <span className="text-[0.6rem] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {complianceModal && (
        <ComplianceGateModal
          corridorCode={complianceModal.corridorCode}
          ustn={complianceModal.ustn}
          onClose={() => setComplianceModal(null)}
        />
      )}
    </div>
  );
}

// =================================================================
// 3. RoRoManifestScreen — Manifest management (roll-on / roll-off)
// =================================================================
//
// Operator-facing screen for managing a single RoRo cargo manifest:
//   - Lookup by USTN
//   - Create manifest with one or more items (TRAILER / VEHICLE / REEFER_TRAILER / MACHINERY)
//   - View items, dimensions, weights
//   - Run compliance gates (Part 30.11)
//   - Confirm roll-on (two-phase: ROLLED_ON → SECURED)
//   - Confirm roll-off (two-phase: ROLLED_OFF → RELEASED)

export function RoRoManifestScreen() {
  const tenantGtid = useTenantGtid();
  const [ustn, setUstn] = useState<string>("");
  const [manifest, setManifest] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createModal, setCreateModal] = useState(false);
  const [complianceModal, setComplianceModal] = useState(false);
  const [rollOnModal, setRollOnModal] = useState(false);
  const [rollOffModal, setRollOffModal] = useState(false);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Load manifest when USTN is set
  useEffect(() => {
    if (!ustn) {
      const t = setTimeout(() => setManifest(null), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    setTimeout(() => !cancelled && setLoading(true), 0);
    jfetch(`/api/sgtx/tcn/roro-manifest?ustn=${encodeURIComponent(ustn)}`)
      .then((d) => !cancelled && setManifest(d.manifest))
      .catch(() => !cancelled && setManifest(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ustn, refreshKey]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="RoRo Cargo Manifest"
        subtitle="Part 30.1 · USTN-linked manifest · roll-on/off (two-phase) · compliance gates · reefer set-points"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setCreateModal(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Manifest
          </Button>
        }
      />

      {/* USTN lookup */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label htmlFor="ustn-input" className="text-[0.65rem] text-muted-foreground">
              Lookup by USTN
            </Label>
            <Input
              id="ustn-input"
              placeholder="SGTX-001234-002139-…"
              value={ustn}
              onChange={(e) => setUstn(e.target.value)}
              className="font-mono text-xs h-9"
            />
          </div>
          <Button variant="outline" size="sm" className="mt-5 h-9" onClick={reload} disabled={!ustn}>
            <Search className="w-3.5 h-3.5 mr-1" /> Lookup
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        </Card>
      ) : !ustn ? (
        <Card className="p-8 text-center">
          <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Enter a USTN above to load an existing manifest, or click <strong>New Manifest</strong> to create one.
          </p>
        </Card>
      ) : !manifest ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-muted-foreground">
            No manifest found for <span className="font-mono">{ustn}</span>. Click <strong>New Manifest</strong> to create one.
          </p>
        </Card>
      ) : (
        <ManifestDetails
          manifest={manifest}
          tenantGtid={tenantGtid}
          onReload={reload}
          onCompliance={() => setComplianceModal(true)}
          onRollOn={() => setRollOnModal(true)}
          onRollOff={() => setRollOffModal(true)}
        />
      )}

      {createModal && (
        <CreateManifestModal
          defaultUstn={ustn}
          defaultShipperGtid={tenantGtid || undefined}
          onClose={() => setCreateModal(false)}
          onCreated={(newUstn) => {
            setUstn(newUstn);
            setCreateModal(false);
            reload();
            toast.success("RoRo manifest created");
          }}
        />
      )}

      {complianceModal && manifest && (
        <ComplianceGateModal
          corridorCode={manifest.corridorCode || "EGY-ITA-RORO-001"}
          ustn={manifest.ustn}
          onClose={() => setComplianceModal(false)}
        />
      )}

      {rollOnModal && manifest && (
        <RollModal
          kind="on"
          manifest={manifest}
          onClose={() => setRollOnModal(false)}
          onDone={() => {
            setRollOnModal(false);
            reload();
          }}
        />
      )}

      {rollOffModal && manifest && (
        <RollModal
          kind="off"
          manifest={manifest}
          onClose={() => setRollOffModal(false)}
          onDone={() => {
            setRollOffModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ----------------------- Manifest Details -----------------------

function ManifestDetails({
  manifest,
  tenantGtid,
  onReload,
  onCompliance,
  onRollOn,
  onRollOff,
}: {
  manifest: any;
  tenantGtid: string | null;
  onReload: () => void;
  onCompliance: () => void;
  onRollOn: () => void;
  onRollOff: () => void;
}) {
  const items: any[] = manifest.items || [];
  const canRollOn = manifest.status === "SUBMITTED" || manifest.status === "DRAFT";
  const canRollOff = manifest.status === "ROLLED_ON" || manifest.status === "IN_TRANSIT";

  return (
    <div className="space-y-3">
      <ExecutiveCards
        cards={[
          { label: "Total Items", value: String(manifest.totalItems), icon: Truck, accent: "#1a6fb0" },
          { label: "Total Weight", value: fmtKg(manifest.totalWeightKg), icon: Gauge, accent: "#10b981" },
          { label: "Manifest Status", value: manifest.status.replace(/_/g, " "), icon: Activity, accent: statusColor(manifest.status) },
          {
            label: "Schedule",
            value: manifest.scheduleId ? manifest.scheduleId.slice(0, 14) + "…" : "Not assigned",
            icon: Ship,
            accent: "#0d6efd",
          },
        ]}
      />

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">USTN</p>
            <p className="text-sm font-mono">{manifest.ustn}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {manifest.corridorCode && (
              <Badge variant="outline" className="text-[0.6rem] font-mono">{manifest.corridorCode}</Badge>
            )}
            {manifest.bookingRef && (
              <Badge variant="outline" className="text-[0.6rem] font-mono">{manifest.bookingRef}</Badge>
            )}
            {manifest.shipperGtid && (
              <Badge variant="outline" className="text-[0.6rem]">Shipper: {manifest.shipperGtid.slice(0, 18)}…</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Items table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Cargo Items ({items.length})</h3>
          <p className="text-[0.65rem] text-muted-foreground">Dimensions · weights · reefer set-points · roll-on/off status</p>
        </div>
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-3 py-2.5">Plate</th>
                <th className="text-left font-medium px-3 py-2.5">Driver</th>
                <th className="text-left font-medium px-3 py-2.5">L×W×H (m)</th>
                <th className="text-left font-medium px-3 py-2.5">Weight</th>
                <th className="text-left font-medium px-3 py-2.5">Cargo</th>
                <th className="text-left font-medium px-3 py-2.5">HS</th>
                <th className="text-left font-medium px-3 py-2.5">Temp</th>
                <th className="text-left font-medium px-3 py-2.5">Roll-on</th>
                <th className="text-left font-medium px-3 py-2.5">Roll-off</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-[0.55rem] font-mono">{it.itemType}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[0.7rem] font-mono">{it.licensePlate || "—"}</td>
                  <td className="px-3 py-2.5 text-[0.7rem]">{it.driverName || "—"}</td>
                  <td className="px-3 py-2.5 text-[0.7rem] font-mono">
                    {it.lengthM || 0}×{it.widthM || 0}×{it.heightM || 0}
                  </td>
                  <td className="px-3 py-2.5 text-[0.7rem]">{fmtKg(it.weightKg)}</td>
                  <td className="px-3 py-2.5 text-[0.7rem] max-w-[160px] truncate" title={it.cargoDescription || ""}>
                    {it.cargoDescription || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[0.7rem] font-mono">{it.hsCode || "—"}</td>
                  <td className="px-3 py-2.5 text-[0.7rem]">
                    {it.reeferTempC != null ? `${it.reeferTempC}°C` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[0.55rem]" style={{ color: statusColor(it.rollOnStatus) }}>
                      {it.rollOnStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[0.55rem]" style={{ color: statusColor(it.rollOffStatus) }}>
                      {it.rollOffStatus}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={onCompliance}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Run Compliance Gates
        </Button>
        <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={onRollOn} disabled={!canRollOn}>
          <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" /> Confirm Roll-on
        </Button>
        <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={onRollOff} disabled={!canRollOff}>
          <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" /> Confirm Roll-off
        </Button>
        {!canRollOn && !canRollOff && (
          <span className="text-[0.65rem] text-muted-foreground">
            Manifest status <code>{manifest.status}</code> — roll-on/off not available.
          </span>
        )}
      </div>

      {/* Timestamps */}
      {(manifest.rollOnAt || manifest.rollOffAt) && (
        <Card className="p-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[0.6rem] text-muted-foreground">Roll-on confirmed</p>
              <p className="font-medium">{manifest.rollOnAt ? fmtDateTime(manifest.rollOnAt) : "—"}</p>
              {manifest.rollOnConfirmedBy && (
                <p className="text-[0.6rem] text-muted-foreground">by {manifest.rollOnConfirmedBy}</p>
              )}
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground">Roll-off confirmed</p>
              <p className="font-medium">{manifest.rollOffAt ? fmtDateTime(manifest.rollOffAt) : "—"}</p>
              {manifest.rollOffConfirmedBy && (
                <p className="text-[0.6rem] text-muted-foreground">by {manifest.rollOffConfirmedBy}</p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ----------------------- Create Manifest Modal -----------------------

function CreateManifestModal({
  defaultUstn,
  defaultShipperGtid,
  onClose,
  onCreated,
}: {
  defaultUstn?: string;
  defaultShipperGtid?: string;
  onClose: () => void;
  onCreated: (ustn: string) => void;
}) {
  const [ustn, setUstn] = useState(defaultUstn || "");
  const [corridorCode, setCorridorCode] = useState("EGY-ITA-RORO-001");
  const [scheduleId, setScheduleId] = useState("");
  const [shipperGtid, setShipperGtid] = useState(defaultShipperGtid || "");
  const [items, setItems] = useState<any[]>([
    { itemType: "TRAILER", licensePlate: "", driverName: "", lengthM: 13.6, widthM: 2.5, heightM: 4.0, weightKg: 20000, cargoDescription: "", hsCode: "", reeferTempC: null },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (idx: number, field: string, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { itemType: "TRAILER", licensePlate: "", driverName: "", lengthM: 13.6, widthM: 2.5, heightM: 4.0, weightKg: 20000, cargoDescription: "", hsCode: "", reeferTempC: null },
    ]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!ustn) return toast.error("USTN required");
    if (items.length === 0) return toast.error("At least one cargo item required");
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/tcn/roro-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          corridorCode,
          scheduleId: scheduleId || undefined,
          shipperGtid: shipperGtid || undefined,
          items: items.map((it) => ({
            itemType: it.itemType,
            licensePlate: it.licensePlate || undefined,
            driverName: it.driverName || undefined,
            lengthM: Number(it.lengthM) || 0,
            widthM: Number(it.widthM) || 0,
            heightM: Number(it.heightM) || 0,
            weightKg: Number(it.weightKg) || 0,
            cargoDescription: it.cargoDescription || undefined,
            hsCode: it.hsCode || undefined,
            reeferTempC: it.reeferTempC === "" || it.reeferTempC == null ? null : Number(it.reeferTempC),
          })),
        }),
      });
      onCreated(ustn);
    } catch (e: any) {
      toast.error(e.message || "Failed to create manifest");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New RoRo Cargo Manifest</DialogTitle>
          <DialogDescription>
            Create a manifest linked to a USTN. Add one or more cargo items (trailers / vehicles / reefers / machinery).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">USTN *</Label>
              <Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="SGTX-…" className="font-mono text-xs h-9" />
            </div>
            <div>
              <Label className="text-xs">Corridor</Label>
              <Select value={corridorCode} onValueChange={setCorridorCode}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RORO_CORRIDORS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Schedule ID (optional)</Label>
              <Input value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} placeholder="VS-EGY-ITA-…" className="font-mono text-xs h-9" />
            </div>
            <div>
              <Label className="text-xs">Shipper GTID (optional)</Label>
              <Input value={shipperGtid} onChange={(e) => setShipperGtid(e.target.value)} placeholder="SGTX-EG-TRD-…" className="font-mono text-xs h-9" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Cargo Items ({items.length})</p>
            <Button size="sm" variant="outline" onClick={addItem}>
              <Plus className="w-3 h-3 mr-1" /> Add Item
            </Button>
          </div>

          {items.map((it, idx) => (
            <Card key={idx} className="p-3">
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[0.6rem]">Item Type</Label>
                  <Select value={it.itemType} onValueChange={(v) => updateItem(idx, "itemType", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRAILER">Trailer</SelectItem>
                      <SelectItem value="TRUCK">Truck</SelectItem>
                      <SelectItem value="VEHICLE">Vehicle</SelectItem>
                      <SelectItem value="REEFER_TRAILER">Reefer Trailer</SelectItem>
                      <SelectItem value="MACHINERY">Machinery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.6rem]">License Plate</Label>
                  <Input value={it.licensePlate} onChange={(e) => updateItem(idx, "licensePlate", e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Driver Name</Label>
                  <Input value={it.driverName} onChange={(e) => updateItem(idx, "driverName", e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">HS Code</Label>
                  <Input value={it.hsCode} onChange={(e) => updateItem(idx, "hsCode", e.target.value)} className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Length (m)</Label>
                  <Input type="number" value={it.lengthM} onChange={(e) => updateItem(idx, "lengthM", e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Width (m)</Label>
                  <Input type="number" value={it.widthM} onChange={(e) => updateItem(idx, "widthM", e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Height (m)</Label>
                  <Input type="number" value={it.heightM} onChange={(e) => updateItem(idx, "heightM", e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Weight (kg)</Label>
                  <Input type="number" value={it.weightKg} onChange={(e) => updateItem(idx, "weightKg", e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-[0.6rem]">Cargo Description</Label>
                  <Input value={it.cargoDescription} onChange={(e) => updateItem(idx, "cargoDescription", e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Reefer Temp °C (opt)</Label>
                  <Input
                    type="number"
                    value={it.reeferTempC ?? ""}
                    onChange={(e) => updateItem(idx, "reeferTempC", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="—"
                  />
                </div>
                <div className="flex items-end">
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-red-500" onClick={() => removeItem(idx)}>
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Create Manifest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------- Compliance Gate Modal -----------------------

function ComplianceGateModal({
  corridorCode,
  ustn,
  onClose,
}: {
  corridorCode: string;
  ustn: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTimeout(() => !cancelled && setLoading(true), 0);
    jfetch("/api/sgtx/tcn/compliance/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corridorCode, ustn }),
    })
      .then((d) => !cancelled && setResult(d))
      .catch((e) => !cancelled && setResult({ error: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [corridorCode, ustn]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compliance Gates</DialogTitle>
          <DialogDescription>
            Part 30.11 · 4-gate check for <span className="font-mono">{corridorCode}</span> · USTN{" "}
            <span className="font-mono text-[0.65rem]">{ustn.slice(0, 32)}…</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : result?.error ? (
          <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-600">
            {result.error}
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="p-3 rounded-lg border text-center"
              style={{
                background: `${statusColor(result.overallStatus)}10`,
                borderColor: `${statusColor(result.overallStatus)}40`,
              }}
            >
              <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">Overall Status</p>
              <p className="text-xl font-bold" style={{ color: statusColor(result.overallStatus) }}>
                {result.overallStatus}
              </p>
              <p className="text-[0.65rem] text-muted-foreground mt-1">{result.summary}</p>
            </div>

            <div className="space-y-2">
              {(result.gates || []).map((g: any) => (
                <Card key={g.gate} className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {g.gate === "DOCUMENTS" && <FileCheck className="w-3.5 h-3.5 text-muted-foreground" />}
                      {g.gate === "CUSTOMS" && <LandmarkIcon />}
                      {g.gate === "DIMENSIONS" && <Gauge className="w-3.5 h-3.5 text-muted-foreground" />}
                      {g.gate === "DG" && <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />}
                      <p className="text-sm font-semibold">{g.label}</p>
                    </div>
                    <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(g.status) }}>
                      {g.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{g.detail}</p>
                  {g.missing && g.missing.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      <span className="text-[0.6rem] text-red-500">Missing:</span>
                      {g.missing.map((m: string) => (
                        <Badge key={m} variant="outline" className="text-[0.55rem] text-red-500 border-red-500/30">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {g.verified && g.verified.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      <span className="text-[0.6rem] text-emerald-600">Verified:</span>
                      {g.verified.map((m: string) => (
                        <Badge key={m} variant="outline" className="text-[0.55rem] text-emerald-600 border-emerald-500/30">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {g.violations && g.violations.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-[0.65rem] text-red-500 space-y-0.5">
                      {g.violations.map((v: string, i: number) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  )}
                  {g.restrictedItems && g.restrictedItems.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-[0.65rem] text-red-500 space-y-0.5">
                      {g.restrictedItems.map((v: string, i: number) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LandmarkIcon() {
  return <MapPin className="w-3.5 h-3.5 text-muted-foreground" />;
}

// ----------------------- Roll On/Off Modal -----------------------

function RollModal({
  kind,
  manifest,
  onClose,
  onDone,
}: {
  kind: "on" | "off";
  manifest: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmedBy, setConfirmedBy] = useState("roro-ops");
  const [submitting, setSubmitting] = useState(false);
  const scheduleId = manifest.scheduleId || "";
  const [scheduleInput, setScheduleInput] = useState(scheduleId);

  const handleSubmit = async () => {
    if (!scheduleInput) return toast.error("Schedule ID required");
    setSubmitting(true);
    try {
      const url = kind === "on" ? "/api/sgtx/tcn/roro-manifest/roll-on" : "/api/sgtx/tcn/roro-manifest/roll-off";
      await jfetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: scheduleInput, ustn: manifest.ustn, confirmedBy }),
      });
      toast.success(`Roll-${kind} confirmed for ${manifest.totalItems} item(s)`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || `Failed to confirm roll-${kind}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "on" ? "Confirm Roll-On" : "Confirm Roll-Off"}
          </DialogTitle>
          <DialogDescription>
            {kind === "on"
              ? "Two-phase: items marked ROLLED_ON then SECURED (lashed + chocked per CSS Code)."
              : "Two-phase: items marked ROLLED_OFF then RELEASED to consignee."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">USTN</Label>
            <Input value={manifest.ustn} disabled className="font-mono text-xs h-9" />
          </div>
          <div>
            <Label className="text-xs">Schedule ID *</Label>
            <Input value={scheduleInput} onChange={(e) => setScheduleInput(e.target.value)} placeholder="VS-EGY-ITA-…" className="font-mono text-xs h-9" />
          </div>
          <div>
            <Label className="text-xs">Confirmed By</Label>
            <Input value={confirmedBy} onChange={(e) => setConfirmedBy(e.target.value)} className="text-xs h-9" />
          </div>

          <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
            <p className="text-xs">
              <strong>Items affected:</strong> {manifest.totalItems}
            </p>
            <p className="text-xs">
              <strong>Total weight:</strong> {fmtKg(manifest.totalWeightKg)}
            </p>
            <p className="text-[0.65rem] text-muted-foreground mt-1">
              This will stamp a {kind === "on" ? "rollOnAt" : "rollOffAt"} timestamp on all items and update the manifest status.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Confirm Roll-{kind === "on" ? "On" : "Off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// 4. RoRoSchedulesScreen — Shipping portal (vessel schedule manager)
// =================================================================
//
// Shipping-line view of RoRo vessel schedules. Lists all schedules with
// capacity, status, and the ability to seed demo schedules (idempotent).

export function RoRoSchedulesScreen() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [corridorFilter, setCorridorFilter] = useState<string>("ALL");
  const [capacityModal, setCapacityModal] = useState<any | null>(null);
  const [bookingModal, setBookingModal] = useState<any | null>(null);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setTimeout(() => !cancelled && setLoading(true), 0);
    jfetch("/api/sgtx/tcn/vessel-schedules")
      .then((d) => !cancelled && setSchedules(d.schedules || []))
      .catch(() => !cancelled && setSchedules([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = corridorFilter === "ALL" ? schedules : schedules.filter((s) => s.corridorCode === corridorFilter);

  const handleSeed = async () => {
    try {
      await jfetch("/api/sgtx/tcn/vessel-schedules?seed=true");
      toast.success("Vessel schedules re-seeded (idempotent)");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="RoRo Vessel Schedules"
        subtitle="Part 30.7 · Manage vessel sailings · capacity checks · USTN-linked bookings"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleSeed}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Re-seed Demo
            </Button>
            <Button size="sm" variant="outline" onClick={reload}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        }
      />

      <ExecutiveCards
        cards={[
          { label: "Total Schedules", value: String(schedules.length), icon: Ship, accent: "#0d6efd" },
          {
            label: "Open for Booking",
            value: String(schedules.filter((s) => s.bookingStatus === "OPEN").length),
            icon: Calendar,
            accent: "#10b981",
          },
          {
            label: "Total Available Slots",
            value: String(schedules.reduce((s, x) => s + (x.availableSlots || 0), 0)),
            icon: Container,
            accent: "#fbbf24",
          },
          {
            label: "Avg Transit",
            value: schedules.length ? `${Math.round(schedules.reduce((s, x) => s + (x.transitDays || 0), 0) / schedules.length)}d` : "—",
            icon: Activity,
            accent: "#1a6fb0",
          },
        ]}
      />

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm">Schedules</h3>
            <p className="text-[0.65rem] text-muted-foreground">{filtered.length} sailing(s)</p>
          </div>
          <Select value={corridorFilter} onValueChange={setCorridorFilter}>
            <SelectTrigger className="w-[260px] h-8 text-xs">
              <SelectValue placeholder="Filter by corridor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All corridors</SelectItem>
              {RORO_CORRIDORS.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Vessel</th>
                <th className="text-left font-medium px-3 py-2.5">Corridor</th>
                <th className="text-left font-medium px-3 py-2.5">Route</th>
                <th className="text-left font-medium px-3 py-2.5">ETD / ETA</th>
                <th className="text-left font-medium px-3 py-2.5">Capacity (T/V/R)</th>
                <th className="text-left font-medium px-3 py-2.5">Available</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-left font-medium px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No schedules. Click <strong>Re-seed Demo</strong> to populate.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.scheduleId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Ship className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-[0.75rem]">{s.vesselName}</p>
                          <p className="text-[0.6rem] font-mono text-muted-foreground">{s.vesselImo} · {s.vesselOperator}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-mono">{s.corridorCode}</td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-mono">{s.departurePort} → {s.arrivalPort}</td>
                    <td className="px-3 py-2.5 text-[0.7rem]">
                      <div>{fmtDate(s.etd)}</div>
                      <div className="text-muted-foreground">{fmtDate(s.eta)} ({s.transitDays}d)</div>
                    </td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-mono">{s.trailerCapacity}/{s.vehicleCapacity}/{s.reeferCapacity}</td>
                    <td className="px-3 py-2.5 text-[0.7rem] font-semibold">{s.availableSlots}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[0.55rem]" style={{ color: statusColor(s.bookingStatus) }}>
                        {s.bookingStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[0.6rem]"
                          onClick={() => setCapacityModal(s)}
                        >
                          <Gauge className="w-3 h-3 mr-1" /> Capacity
                        </Button>
                        <Button
                          size="sm"
                          className="bg-gold-gradient text-sovereign h-6 text-[0.6rem]"
                          onClick={() => setBookingModal(s)}
                          disabled={s.bookingStatus !== "OPEN"}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Book
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {capacityModal && (
        <CapacityModal schedule={capacityModal} onClose={() => setCapacityModal(null)} />
      )}

      {bookingModal && (
        <BookingModal schedule={bookingModal} onClose={() => setBookingModal(null)} onBooked={reload} />
      )}
    </div>
  );
}

// ----------------------- Capacity Modal -----------------------

function CapacityModal({ schedule, onClose }: { schedule: any; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [cap, setCap] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTimeout(() => !cancelled && setLoading(true), 0);
    jfetch(`/api/sgtx/tcn/vessel-schedules/${encodeURIComponent(schedule.scheduleId)}`)
      .then((d) => !cancelled && setCap(d.capacity))
      .catch(() => !cancelled && setCap(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [schedule.scheduleId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Capacity — {schedule.vesselName}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-[0.65rem]">{schedule.scheduleId}</span>
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : !cap ? (
          <p className="text-xs text-muted-foreground">Failed to load capacity.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
                <p className="text-[0.6rem] text-muted-foreground">Trailer Slots</p>
                <p className="text-xl font-bold text-blue-600">{cap.trailerSlots}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                <p className="text-[0.6rem] text-muted-foreground">Vehicle Slots</p>
                <p className="text-xl font-bold text-emerald-600">{cap.vehicleSlots}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
                <p className="text-[0.6rem] text-muted-foreground">Reefer Slots</p>
                <p className="text-xl font-bold text-amber-600">{cap.reeferSlots}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted text-xs text-center">
              <p>
                <strong>Available:</strong> {cap.available ? "Yes" : "No"}
              </p>
              {cap.reason && <p className="text-muted-foreground">{cap.reason}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------- Booking Modal -----------------------

function BookingModal({
  schedule,
  onClose,
  onBooked,
}: {
  schedule: any;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [ustn, setUstn] = useState("");
  const [type, setType] = useState("TRAILER");
  const [items, setItems] = useState(1);
  const [shipperGtid, setShipperGtid] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!ustn) return toast.error("USTN required");
    setSubmitting(true);
    try {
      const res = await jfetch("/api/sgtx/tcn/vessel-schedules/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.scheduleId,
          ustn,
          cargoDetails: {
            type,
            items: Number(items),
            shipperGtid: shipperGtid || undefined,
            note: note || undefined,
          },
        }),
      });
      toast.success(`Booking ${res.bookingRef} confirmed`);
      onBooked();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book on {schedule.vesselName}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-[0.65rem]">{schedule.scheduleId}</span> ·{" "}
            {schedule.departurePort} → {schedule.arrivalPort} · ETD {fmtDate(schedule.etd)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">USTN *</Label>
            <Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="SGTX-…" className="font-mono text-xs h-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Cargo Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAILER">Trailer</SelectItem>
                  <SelectItem value="VEHICLE">Vehicle</SelectItem>
                  <SelectItem value="REEFER_TRAILER">Reefer Trailer</SelectItem>
                  <SelectItem value="MACHINERY">Machinery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Items</Label>
              <Input type="number" min={1} value={items} onChange={(e) => setItems(Number(e.target.value))} className="h-9 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Shipper GTID (optional)</Label>
            <Input value={shipperGtid} onChange={(e) => setShipperGtid(e.target.value)} className="font-mono text-xs h-9" />
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Confirm Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
