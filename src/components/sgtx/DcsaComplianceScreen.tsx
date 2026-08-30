"use client";

// DCSA (Digital Container Shipping Association) Compliance Dashboard
// ============================================================================
// Renders the 8 DCSA standards compliance status for the SHIP portal.
// Shows: eBL, Track & Trace, JIT Port Call, Commercial Schedules, IoT,
// Gate Moves, Load List & Bay Plan.
//
// Blueprint §3.15.3.5: "Vessel is tracked via AIS; cold-chain data is
// monitored in real time. Digital twin simulation uses vessel speed,
// weather, port congestion to predict ETA deviations."
// DCSA standardizes this data interchange.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SectionHeader } from "@/components/sgtx/widgets";
import {
  FileText, Ship, PackageCheck, Globe2, Thermometer, Truck, Layers,
  CheckCircle2, AlertCircle, Activity, Zap, Clock, MapPin, TrendingDown,
  Loader2, Upload, Download,
} from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/sgtx/format";
import { toast } from "sonner";
import { useState } from "react";

interface DcsaSummary {
  eBL: { total: number; issued: number; surrendered: number; dcsaVersion: string };
  trackAndTrace: { totalEvents: number; dcsaVersion: string };
  jitPortCall: { active: number; dcsaVersion: string };
  commercialSchedules: { active: number; dcsaVersion: string };
  iot: { totalReadings: number; dcsaVersion: string };
  gateMoves: { total: number; dcsaVersion: string };
  overallCompliance: boolean;
  standardsImplemented: number;
}

const DCSA_STANDARDS = [
  { id: "eBL", name: "Electronic Bill of Lading", version: "3.0.0", icon: FileText, desc: "SI + TD (Shipping Instructions + Transport Document)" },
  { id: "trackTrace", name: "Track & Trace", version: "2.0.0", icon: PackageCheck, desc: "Container tracking events (DEPARTURE, ARRIVAL, GATE_IN, etc.)" },
  { id: "jit", name: "JIT Port Call", version: "1.0.0", icon: Clock, desc: "Just-in-Time vessel arrival optimization" },
  { id: "schedules", name: "Commercial Schedules", version: "1.0.0", icon: Ship, desc: "Carrier-published vessel schedules" },
  { id: "iot", name: "IoT Monitoring", version: "1.0.0", icon: Thermometer, desc: "Remote reefer container telemetry" },
  { id: "gate", name: "Gate Moves", version: "1.0.0", icon: Truck, desc: "Container gate in/out events" },
  { id: "loadList", name: "Load List & Bay Plan", version: "1.0.0", icon: Layers, desc: "Container stowage plan" },
  { id: "ops", name: "Operational Schedules", version: "1.0.0", icon: Activity, desc: "Real-time schedule updates" },
];

export function DcsaComplianceScreen({ carrierGtid }: { carrierGtid: string }) {
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery<DcsaSummary>({
    queryKey: ["dcsa-compliance", carrierGtid],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/dcsa/compliance?carrierGtid=${carrierGtid}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d.summary;
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="DCSA Compliance Dashboard"
        subtitle="Digital Container Shipping Association · 8 standards implemented · https://dcsa.org/standards"
      />

      {/* Overall compliance banner */}
      <Card className={`p-4 ${summary?.overallCompliance ? "bg-emerald-500/5 border-emerald-500/30" : "bg-amber-500/5 border-amber-500/30"}`}>
        <div className="flex items-center gap-3">
          {summary?.overallCompliance ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <AlertCircle className="w-6 h-6 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              DCSA Compliance: {summary?.overallCompliance ? "COMPLIANT" : "PARTIAL"}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary?.standardsImplemented || 8} of 8 DCSA standards implemented
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[0.6rem] border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
              eBL v3.0
            </Badge>
            <Badge variant="outline" className="text-[0.6rem] border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
              IoT v1.0
            </Badge>
            <Badge variant="outline" className="text-[0.6rem] border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
              JIT v1.0
            </Badge>
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-1">
          <TabsTrigger value="overview" className="text-[0.65rem]">Overview</TabsTrigger>
          <TabsTrigger value="ebl" className="text-[0.65rem]">eBL</TabsTrigger>
          <TabsTrigger value="tracking" className="text-[0.65rem]">Track & Trace</TabsTrigger>
          <TabsTrigger value="jit" className="text-[0.65rem]">JIT Port Call</TabsTrigger>
          <TabsTrigger value="schedules" className="text-[0.65rem]">Schedules</TabsTrigger>
          <TabsTrigger value="iot" className="text-[0.65rem]">IoT</TabsTrigger>
          <TabsTrigger value="gate" className="text-[0.65rem]">Gate Moves</TabsTrigger>
          <TabsTrigger value="loadlist" className="text-[0.65rem]">Load List</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab summary={summary} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="ebl">
          <EBLTab carrierGtid={carrierGtid} />
        </TabsContent>
        <TabsContent value="tracking">
          <TrackingTab />
        </TabsContent>
        <TabsContent value="jit">
          <JitTab />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesTab carrierGtid={carrierGtid} />
        </TabsContent>
        <TabsContent value="iot">
          <IoTTab />
        </TabsContent>
        <TabsContent value="gate">
          <GateTab />
        </TabsContent>
        <TabsContent value="loadlist">
          <LoadListTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────
function OverviewTab({ summary, isLoading }: { summary: DcsaSummary | null | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {DCSA_STANDARDS.map((std) => {
        const Icon = std.icon;
        const count = (() => {
          if (!summary) return 0;
          switch (std.id) {
            case "eBL": return summary.eBL.total;
            case "trackTrace": return summary.trackAndTrace.totalEvents;
            case "jit": return summary.jitPortCall.active;
            case "schedules": return summary.commercialSchedules.active;
            case "iot": return summary.iot.totalReadings;
            case "gate": return summary.gateMoves.total;
            default: return 0;
          }
        })();
        return (
          <Card key={std.id} className="p-4 hover:border-gold/40 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gold/10 border border-gold/20">
                <Icon className="w-5 h-5 text-gold" />
              </div>
              <Badge variant="outline" className="text-[0.55rem] border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                v{std.version}
              </Badge>
            </div>
            <p className="text-xs font-semibold text-foreground">{std.name}</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5 line-clamp-2">{std.desc}</p>
            <div className="mt-3 pt-2 border-t border-border/40">
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Records</p>
              <p className="text-lg font-bold text-foreground">{count}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── eBL Tab ────────────────────────────────────────────────────────────────
function EBLTab({ carrierGtid }: { carrierGtid: string }) {
  const [ustn, setUstn] = useState("");
  const { data: ebls, isLoading } = useQuery({
    queryKey: ["dcsa-ebl", ustn],
    queryFn: async () => {
      if (!ustn) return [];
      const r = await fetch(`/api/sgtx/dcsa/ebl?ustn=${ustn}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.ebls || [];
    },
    enabled: !!ustn,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA eBL v3.0 — Electronic Bill of Lading</p>
        <p className="text-[0.7rem] text-muted-foreground mb-3">
          Implements DCSA SI (Shipping Instructions) + TD (Transport Document) standard. The eBL becomes a legally
          valid transport document when the carrier issues the TD.
        </p>
        <div className="flex gap-2">
          <Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="Enter USTN to search eBLs…" className="flex-1 h-8 text-sm" />
        </div>
      </Card>

      {isLoading && (
        <Card className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </Card>
      )}

      {ebls && ebls.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">eBL ID</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">B/L No</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">SI Status</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">TD Status</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">POL → POD</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Vessel</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">DCSA</th>
                </tr>
              </thead>
              <tbody>
                {ebls.map((ebl: any) => (
                  <tr key={ebl.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3 font-mono text-[0.7rem] text-gold">{ebl.eblId}</td>
                    <td className="p-3 text-foreground">{ebl.blNumber || "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1">{ebl.siStatus}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1"
                        style={{
                          color: ebl.tdStatus === "ISSUED" ? "#10b981" : ebl.tdStatus === "SURRENDERED" ? "#3b82f6" : "#6b7280",
                          borderColor: "currentColor",
                        }}
                      >
                        {ebl.tdStatus}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{ebl.pol || "—"} → {ebl.pod || "—"}</td>
                    <td className="p-3 text-muted-foreground">{ebl.vesselName || "—"}</td>
                    <td className="p-3 text-center">
                      {ebl.isDCSACompliant ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 inline" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {ebls && ebls.length === 0 && ustn && !isLoading && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No eBLs found for USTN {ustn}
        </Card>
      )}
    </div>
  );
}

// ── Tracking Tab ───────────────────────────────────────────────────────────
function TrackingTab() {
  const [ustn, setUstn] = useState("");
  const { data: events, isLoading } = useQuery({
    queryKey: ["dcsa-tracking", ustn],
    queryFn: async () => {
      if (!ustn) return [];
      const r = await fetch(`/api/sgtx/dcsa/tracking?ustn=${ustn}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.events || [];
    },
    enabled: !!ustn,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA Track & Trace v2.0</p>
        <p className="text-[0.7rem] text-muted-foreground mb-3">
          Event-based container tracking per DCSA standard. Event types: DEPARTURE, ARRIVAL, GATE_IN, GATE_OUT,
          LOADED, DISCHARGED, RECEIVED, DELIVERED, CUSTOMS_RELEASE, AVAILABLE_FOR_PICKUP.
        </p>
        <Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="Enter USTN to search tracking events…" className="h-8 text-sm" />
      </Card>

      {events && events.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Event Type</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Location</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Date/Time</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Classifier</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Container</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Vessel</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">DCSA</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev: any) => (
                  <tr key={ev.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1">{ev.eventType}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{ev.eventLocation || "—"} {ev.eventLocationName ? `(${ev.eventLocationName})` : ""}</td>
                    <td className="p-3 text-muted-foreground">{fmtDateTime(ev.eventDateTime)}</td>
                    <td className="p-3 text-muted-foreground">{ev.eventClassifier}</td>
                    <td className="p-3 font-mono text-[0.65rem] text-muted-foreground">{ev.containerId || "—"}</td>
                    <td className="p-3 text-muted-foreground">{ev.vesselName || "—"}</td>
                    <td className="p-3 text-center">
                      {ev.isDCSACompliant ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" /> : <AlertCircle className="w-4 h-4 text-amber-500 inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── JIT Port Call Tab ──────────────────────────────────────────────────────
function JitTab() {
  const { data: calls, isLoading } = useQuery({
    queryKey: ["dcsa-jit"],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/dcsa/jit`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.calls || [];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA JIT Port Call v1.0</p>
        <p className="text-[0.7rem] text-muted-foreground">
          Just-in-Time vessel arrival optimization. Reduces idle time, fuel consumption, and CO2 emissions by
          aligning vessel arrival with berth availability.
        </p>
      </Card>

      {calls && calls.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Vessel</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Port</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">ETA</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Berth</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Fuel Save</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">CO2 Reduce</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3 text-foreground">
                      <p className="font-medium">{c.vesselName}</p>
                      <p className="text-[0.6rem] text-muted-foreground">IMO: {c.vesselImo} · Voyage: {c.voyageNumber}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.portUnlocode}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1">{c.jitStatus}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.estimatedArrival ? fmtDateTime(c.estimatedArrival) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.berthId || "—"}</td>
                    <td className="p-3 text-right text-emerald-600 font-medium">{c.fuelSavingKg ? `${c.fuelSavingKg}kg` : "—"}</td>
                    <td className="p-3 text-right text-emerald-600 font-medium">{c.co2ReductionKg ? `${c.co2ReductionKg}kg` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Schedules Tab ──────────────────────────────────────────────────────────
function SchedulesTab({ carrierGtid }: { carrierGtid: string }) {
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["dcsa-schedules", carrierGtid],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/dcsa/schedules?carrierGtid=${carrierGtid}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.schedules || [];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA Commercial Schedules v1.0</p>
        <p className="text-[0.7rem] text-muted-foreground">
          Carrier-published vessel schedules per DCSA CS standard. Enables schedule comparison and booking planning.
        </p>
      </Card>

      {schedules && schedules.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Vessel</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Voyage</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Service</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">POL → POD</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">ETD</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">ETA</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3 text-foreground">{s.vesselName}</td>
                    <td className="p-3 text-muted-foreground">{s.voyageNumber}</td>
                    <td className="p-3 text-muted-foreground">{s.serviceCode || "—"}</td>
                    <td className="p-3 text-muted-foreground">{s.polUnlocode || "—"} → {s.podUnlocode || "—"}</td>
                    <td className="p-3 text-muted-foreground">{s.departureTime ? fmtDate(s.departureTime) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{s.arrivalTime ? fmtDate(s.arrivalTime) : "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1"
                        style={{
                          color: s.scheduleStatus === "SCHEDULED" ? "#3b82f6" : s.scheduleStatus === "DEPARTED" ? "#10b981" : s.scheduleStatus === "DELAYED" ? "#f59e0b" : "#6b7280",
                          borderColor: "currentColor",
                        }}
                      >
                        {s.scheduleStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── IoT Tab ────────────────────────────────────────────────────────────────
function IoTTab() {
  const [containerId, setContainerId] = useState("");
  const { data: readings, isLoading } = useQuery({
    queryKey: ["dcsa-iot", containerId],
    queryFn: async () => {
      if (!containerId) return [];
      const r = await fetch(`/api/sgtx/dcsa/iot?containerId=${containerId}&limit=20`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.readings || [];
    },
    enabled: !!containerId,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA IoT v1.0 — Container Telemetry</p>
        <p className="text-[0.7rem] text-muted-foreground mb-3">
          Remote reefer container monitoring per DCSA IoT standard. Sources: Carrier, Roambee, Tive, Sensitech, Elpro.
        </p>
        <Input value={containerId} onChange={(e) => setContainerId(e.target.value)} placeholder="Enter container ID (ISO 6346)…" className="h-8 text-sm" />
      </Card>

      {readings && readings.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Timestamp</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Temp (°C)</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Humidity</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Power</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Door</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Shock</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Source</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{fmtDateTime(r.timestamp)}</td>
                    <td className="p-3 text-right">
                      {r.actualTempC !== null && (
                        <span style={{ color: Math.abs(r.actualTempC - (r.setpointTempC || r.actualTempC)) > 2 ? "#ef4444" : "#10b981" }}>
                          {r.actualTempC}°C
                        </span>
                      )}
                      {r.setpointTempC && <span className="text-[0.6rem] text-muted-foreground ml-1">(set {r.setpointTempC})</span>}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{r.humidityPct ? `${r.humidityPct}%` : "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1"
                        style={{
                          color: r.powerStatus === "ON" ? "#10b981" : r.powerStatus === "OFF" ? "#ef4444" : "#f59e0b",
                          borderColor: "currentColor",
                        }}
                      >
                        {r.powerStatus || "—"}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      {r.doorOpen ? <AlertCircle className="w-4 h-4 text-red-500 inline" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{r.shockGForce ? `${r.shockGForce}G` : "—"}</td>
                    <td className="p-3 text-muted-foreground">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Gate Moves Tab ─────────────────────────────────────────────────────────
function GateTab() {
  const [ustn, setUstn] = useState("");
  const { data: moves, isLoading } = useQuery({
    queryKey: ["dcsa-gate", ustn],
    queryFn: async () => {
      if (!ustn) return [];
      const r = await fetch(`/api/sgtx/dcsa/gate?ustn=${ustn}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.moves || [];
    },
    enabled: !!ustn,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA Gate Moves v1.0</p>
        <p className="text-[0.7rem] text-muted-foreground mb-3">
          Container gate in/out events per DCSA standard. Move types: GATE_IN_FULL, GATE_IN_EMPTY, GATE_OUT_FULL, GATE_OUT_EMPTY.
        </p>
        <Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="Enter USTN to search gate moves…" className="h-8 text-sm" />
      </Card>

      {moves && moves.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Move Type</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Direction</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Container</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Terminal</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Port</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Date/Time</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Truck</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m: any) => (
                  <tr key={m.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3">
                      <Badge variant="outline" className="text-[0.55rem] h-4 px-1">{m.moveType}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{m.direction}</td>
                    <td className="p-3 font-mono text-[0.65rem] text-muted-foreground">{m.containerId}</td>
                    <td className="p-3 text-muted-foreground">{m.terminalCode}</td>
                    <td className="p-3 text-muted-foreground">{m.portUnlocode}</td>
                    <td className="p-3 text-muted-foreground">{fmtDateTime(m.moveDateTime)}</td>
                    <td className="p-3 text-muted-foreground">{m.truckId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Load List Tab ──────────────────────────────────────────────────────────
function LoadListTab() {
  const [vesselImo, setVesselImo] = useState("");
  const { data: plans, isLoading } = useQuery({
    queryKey: ["dcsa-loadlist", vesselImo],
    queryFn: async () => {
      if (!vesselImo) return [];
      const r = await fetch(`/api/sgtx/dcsa/loadlist?vesselImo=${vesselImo}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.plans || [];
    },
    enabled: !!vesselImo,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-2">DCSA Load List & Bay Plan v1.0</p>
        <p className="text-[0.7rem] text-muted-foreground mb-3">
          Container stowage plan per DCSA standard. Plan types: LOAD_LIST, BAY_PLAN, DISCHARGE_LIST.
        </p>
        <Input value={vesselImo} onChange={(e) => setVesselImo(e.target.value)} placeholder="Enter vessel IMO number…" className="h-8 text-sm" />
      </Card>

      {plans && plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((p: any) => {
            const containers = p.containers ? JSON.parse(p.containers) : [];
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.vesselName} — {p.planType}</p>
                    <p className="text-[0.65rem] text-muted-foreground">IMO: {p.vesselImo} · Voyage: {p.voyageNumber} · Port: {p.portUnlocode}</p>
                  </div>
                  <Badge variant="outline" className="text-[0.55rem]">{containers.length} containers</Badge>
                </div>
                {containers.length > 0 && (
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-[0.65rem]">
                      <thead className="bg-muted/20">
                        <tr>
                          <th className="text-left p-2">Container</th>
                          <th className="text-left p-2">Position</th>
                          <th className="text-right p-2">Weight</th>
                          <th className="text-center p-2">Reefer</th>
                          <th className="text-center p-2">DG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {containers.slice(0, 10).map((c: any, i: number) => (
                          <tr key={i} className="border-b border-border/20">
                            <td className="p-2 font-mono">{c.containerId}</td>
                            <td className="p-2">{c.position || `${c.bay}-${c.row}-${c.tier}`}</td>
                            <td className="p-2 text-right">{c.weight ? `${c.weight}kg` : "—"}</td>
                            <td className="p-2 text-center">{c.reefer ? "❄️" : "—"}</td>
                            <td className="p-2 text-center">{c.dangerous ? "⚠️" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
