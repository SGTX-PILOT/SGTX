"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.121-20.126 — Control Tower Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
//
// Renders all six control towers in a responsive grid. Each tower shows key
// metrics + color-coded status indicators (GREEN / YELLOW / ORANGE / RED).
// Fetches the unified endpoint `/api/sgtx/control-tower` in one round-trip
// (TanStack Query, 30s stale time). For finer-grained refresh, callers can
// instead wire the per-tower endpoints — but the unified endpoint is the
// default for the dashboard view.
//
// The component is read-only: it never mutates. Suitable for embedding into
// the /home or /operations page as a global observability widget.
// ═══════════════════════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe2,
  Ship,
  Plane,
  Truck,
  Container,
  GitBranch,
  Activity,
  AlertTriangle,
  CircleDot,
  Clock,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthBand = "GREEN" | "YELLOW" | "ORANGE" | "RED";

interface GlobalTower {
  active_trades: number;
  total_value_usd: number;
  by_status: Record<string, number>;
  by_corridor: { corridor: string; count: number; valueUsd?: number; value_usd?: number }[];
  by_mode: Record<string, number>;
  health_summary: Record<HealthBand, number>;
  last_updated?: string;
}
interface RoRoTower {
  active_vessels: number;
  vehicles_in_transit: number;
  next_departures: { vessel: string; route: string; etd: string | null; eta: string | null; availableSlots?: number }[];
  port_congestion: { port: string; congestionLevel: HealthBand; avgDwellHours?: number; avg_dwell_hours?: number }[];
  last_updated?: string;
}
interface AirTower {
  active_flights: number;
  cargo_in_transit: number;
  airport_congestion: { airport: string; congestionLevel: HealthBand; openIrregularities?: number; open_irregularities?: number }[];
  next_departures: { flight: string; origin: string; dest: string; etd: string | null; eta: string | null }[];
  last_updated?: string;
}
interface RoadTower {
  active_trips: number;
  trucks_in_transit: number;
  border_crossings: { crossing: string; waitHours?: number; wait_hours?: number; queueLength?: number; queue_length?: number }[];
  corridor_status: { corridor: string; status: HealthBand; avgTransitHours?: number; avg_transit_hours?: number }[];
  last_updated?: string;
}
interface OceanTower {
  active_vessels: number;
  containers_in_transit: number;
  port_congestion: { port: string; congestionLevel: HealthBand; berthWaitHours?: number; berth_wait_hours?: number }[];
  vessel_schedule: { vessel: string; voyage: string; origin: string; dest: string; eta: string | null }[];
  last_updated?: string;
}
interface MultimodalTower {
  active_shipments: number;
  mode_transitions: { shipment: string; from_mode: string; to_mode: string; location: string; timestamp: string | null }[];
  bottlenecks: { location: string; type: string; severity: HealthBand; affected_shipments: number }[];
  last_updated?: string;
}

interface UnifiedResponse {
  global: GlobalTower;
  roro: RoRoTower;
  air: AirTower;
  road: RoadTower;
  ocean: OceanTower;
  multimodal: MultimodalTower;
  last_updated: string;
}

// ── Theme helpers ─────────────────────────────────────────────────────────────

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
const BAND_DOT_BG: Record<HealthBand, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-400",
  ORANGE: "bg-orange-400",
  RED: "bg-red-400",
};
const BAND_BADGE_CLS: Record<HealthBand, string> = {
  GREEN: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-800",
  YELLOW: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/50 dark:border-amber-800",
  ORANGE: "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/50 dark:border-orange-800",
  RED: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/50 dark:border-red-800",
};

// ── Small building-block components ───────────────────────────────────────────

function TowerHead({
  icon: Icon,
  title,
  subtitle,
  band,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  band: HealthBand | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-md bg-muted/60 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
          <p className="text-[0.7rem] text-muted-foreground leading-tight mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>
      {band && (
        <Badge variant="outline" className={`text-[0.65rem] px-1.5 py-0 flex-shrink-0 ${BAND_BADGE_CLS[band]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[band]} mr-1`} />
          {BAND_LABEL[band]}
        </Badge>
      )}
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <p className="text-[0.7rem] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        {sub && <p className="text-[0.65rem] text-muted-foreground/70 truncate">{sub}</p>}
      </div>
      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

function HealthPill({ band, count }: { band: HealthBand; count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.65rem] font-medium"
      style={{ background: `${BAND_HEX[band]}1a`, color: BAND_HEX[band] }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[band]}`} />
      {count}
    </span>
  );
}

function ListLine({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs border-b border-border/40 last:border-b-0">
      <span className="text-muted-foreground truncate min-w-0">{left}</span>
      <span className="font-medium tabular-nums whitespace-nowrap">{right}</span>
    </div>
  );
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function timeAgo(s: string | null | undefined): string {
  if (!s) return "—";
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Tower cards ────────────────────────────────────────────────────────────────

function GlobalTradeCard({ data }: { data: GlobalTower }) {
  const summary = data.health_summary || {};
  const total = (summary.GREEN ?? 0) + (summary.YELLOW ?? 0) + (summary.ORANGE ?? 0) + (summary.RED ?? 0);
  const band: HealthBand | null =
    total === 0 ? null
      : (summary.RED ?? 0) > 0 ? "RED"
      : (summary.ORANGE ?? 0) > 0 ? "ORANGE"
      : (summary.YELLOW ?? 0) > 0 ? "YELLOW"
      : "GREEN";
  const corridorList = (data.by_corridor || []).slice(0, 5);

  return (
    <Card className="p-4 sm:p-5 gap-0 h-full flex flex-col">
      <TowerHead icon={Globe2} title="Global Trade" subtitle="Top-level trade overview" band={band} />
      <div className="space-y-1">
        <MetricRow label="Active Trades" value={data.active_trades ?? 0} />
        <MetricRow
          label="Total Value"
          value={fmtUsd(data.total_value_usd)}
          sub={`Across ${Object.keys(data.by_status || {}).length} statuses`}
        />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5">Health Summary</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["GREEN", "YELLOW", "ORANGE", "RED"] as HealthBand[]).map((b) => (
            <HealthPill key={b} band={b} count={summary[b] ?? 0} />
          ))}
        </div>
      </div>
      {corridorList.length > 0 && (
        <div className="mt-3 min-w-0">
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1">Top Corridors</p>
          <div className="max-h-28 overflow-y-auto pr-1">
            {corridorList.map((c) => (
              <ListLine
                key={c.corridor}
                left={c.corridor}
                right={`${c.count} • ${fmtUsd(c.valueUsd ?? c.value_usd)}`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function RoRoCard({ data }: { data: RoRoTower }) {
  const congestion = data.port_congestion || [];
  const worst: HealthBand =
    congestion.length === 0 ? "GREEN"
      : congestion.some((p) => p.congestionLevel === "RED") ? "RED"
      : congestion.some((p) => p.congestionLevel === "ORANGE") ? "ORANGE"
      : congestion.some((p) => p.congestionLevel === "YELLOW") ? "YELLOW"
      : "GREEN";
  return (
    <Card className="p-4 sm:p-5 gap-0 h-full flex flex-col">
      <TowerHead icon={Ship} title="RoRo" subtitle="Roll-on / Roll-off vessels" band={worst === "GREEN" ? "GREEN" : worst} />
      <div className="space-y-1">
        <MetricRow label="Active Vessels" value={data.active_vessels ?? 0} />
        <MetricRow label="Vehicles in Transit" value={data.vehicles_in_transit ?? 0} />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Next Departures
        </p>
        <div className="max-h-28 overflow-y-auto pr-1">
          {(data.next_departures || []).slice(0, 5).map((d, i) => (
            <ListLine
              key={i}
              left={<span className="truncate"><span className="font-medium">{d.vessel}</span> · {d.route}</span>}
              right={fmtDateTime(d.etd)}
            />
          ))}
          {(!data.next_departures || data.next_departures.length === 0) && (
            <p className="text-[0.65rem] text-muted-foreground/70 italic">No upcoming departures</p>
          )}
        </div>
      </div>
      {congestion.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Port Congestion
          </p>
          <div className="max-h-28 overflow-y-auto pr-1">
            {congestion.slice(0, 5).map((p) => (
              <ListLine
                key={p.port}
                left={<span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[p.congestionLevel]}`} /> {p.port}</span>}
                right={`${(p.avgDwellHours ?? p.avg_dwell_hours ?? 0).toFixed(1)}h`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function AirCard({ data }: { data: AirTower }) {
  const cong = data.airport_congestion || [];
  const worst: HealthBand =
    cong.length === 0 ? "GREEN"
      : cong.some((p) => p.congestionLevel === "RED") ? "RED"
      : cong.some((p) => p.congestionLevel === "ORANGE") ? "ORANGE"
      : cong.some((p) => p.congestionLevel === "YELLOW") ? "YELLOW"
      : "GREEN";
  return (
    <Card className="p-4 sm:p-5 gap-0 h-full flex flex-col">
      <TowerHead icon={Plane} title="Air Cargo" subtitle="Air freight tracking" band={worst === "GREEN" ? "GREEN" : worst} />
      <div className="space-y-1">
        <MetricRow label="Active Flights" value={data.active_flights ?? 0} />
        <MetricRow label="Cargo in Transit" value={`${data.cargo_in_transit ?? 0} pcs`} />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Next Departures
        </p>
        <div className="max-h-28 overflow-y-auto pr-1">
          {(data.next_departures || []).slice(0, 5).map((d, i) => (
            <ListLine
              key={i}
              left={<span className="truncate"><span className="font-medium">{d.flight}</span> · {d.origin}→{d.dest}</span>}
              right={fmtDateTime(d.etd)}
            />
          ))}
          {(!data.next_departures || data.next_departures.length === 0) && (
            <p className="text-[0.65rem] text-muted-foreground/70 italic">No upcoming flights</p>
          )}
        </div>
      </div>
      {cong.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Airport Congestion
          </p>
          <div className="max-h-28 overflow-y-auto pr-1">
            {cong.slice(0, 5).map((p) => (
              <ListLine
                key={p.airport}
                left={<span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[p.congestionLevel]}`} /> {p.airport}</span>}
                right={`${p.openIrregularities ?? p.open_irregularities ?? 0} open`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function RoadCard({ data }: { data: RoadTower }) {
  const corridors = data.corridor_status || [];
  const worst: HealthBand =
    corridors.length === 0 ? "GREEN"
      : corridors.some((c) => c.status === "RED") ? "RED"
      : corridors.some((c) => c.status === "ORANGE") ? "ORANGE"
      : corridors.some((c) => c.status === "YELLOW") ? "YELLOW"
      : "GREEN";
  return (
    <Card className="p-4 sm:p-5 gap-0 h-full flex flex-col">
      <TowerHead icon={Truck} title="Road Corridors" subtitle="International road tracking" band={worst === "GREEN" ? "GREEN" : worst} />
      <div className="space-y-1">
        <MetricRow label="Active Trips" value={data.active_trips ?? 0} />
        <MetricRow label="Trucks in Transit" value={data.trucks_in_transit ?? 0} />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Border Crossings
        </p>
        <div className="max-h-28 overflow-y-auto pr-1">
          {(data.border_crossings || []).slice(0, 5).map((b, i) => (
            <ListLine
              key={i}
              left={<span className="truncate">{b.crossing}</span>}
              right={`${(b.waitHours ?? b.wait_hours ?? 0).toFixed(1)}h · ${b.queueLength ?? b.queue_length ?? 0}q`}
            />
          ))}
          {(!data.border_crossings || data.border_crossings.length === 0) && (
            <p className="text-[0.65rem] text-muted-foreground/70 italic">No active border queues</p>
          )}
        </div>
      </div>
      {corridors.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5">Corridor Status</p>
          <div className="max-h-28 overflow-y-auto pr-1">
            {corridors.slice(0, 5).map((c) => (
              <ListLine
                key={c.corridor}
                left={<span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[c.status]}`} /> {c.corridor}</span>}
                right={`${c.avgTransitHours ?? c.avg_transit_hours ?? 0}h`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function OceanCard({ data }: { data: OceanTower }) {
  const cong = data.port_congestion || [];
  const worst: HealthBand =
    cong.length === 0 ? "GREEN"
      : cong.some((p) => p.congestionLevel === "RED") ? "RED"
      : cong.some((p) => p.congestionLevel === "ORANGE") ? "ORANGE"
      : cong.some((p) => p.congestionLevel === "YELLOW") ? "YELLOW"
      : "GREEN";
  return (
    <Card className="p-4 sm:p-5 gap-0 h-full flex flex-col">
      <TowerHead icon={Container} title="Ocean Containers" subtitle="Ocean container tracking" band={worst === "GREEN" ? "GREEN" : worst} />
      <div className="space-y-1">
        <MetricRow label="Active Vessels" value={data.active_vessels ?? 0} />
        <MetricRow label="Containers in Transit" value={data.containers_in_transit ?? 0} />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Ship className="w-3 h-3" /> Vessel Schedule
        </p>
        <div className="max-h-28 overflow-y-auto pr-1">
          {(data.vessel_schedule || []).slice(0, 5).map((v, i) => (
            <ListLine
              key={i}
              left={<span className="truncate"><span className="font-medium">{v.vessel}</span> · {v.origin}→{v.dest}</span>}
              right={fmtDateTime(v.eta)}
            />
          ))}
          {(!data.vessel_schedule || data.vessel_schedule.length === 0) && (
            <p className="text-[0.65rem] text-muted-foreground/70 italic">No upcoming arrivals</p>
          )}
        </div>
      </div>
      {cong.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Port Congestion
          </p>
          <div className="max-h-28 overflow-y-auto pr-1">
            {cong.slice(0, 5).map((p) => (
              <ListLine
                key={p.port}
                left={<span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[p.congestionLevel]}`} /> {p.port}</span>}
                right={`${(p.berthWaitHours ?? p.berth_wait_hours ?? 0).toFixed(1)}h`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function MultimodalCard({ data }: { data: MultimodalTower }) {
  const bottlenecks = data.bottlenecks || [];
  const worst: HealthBand =
    bottlenecks.length === 0 ? "GREEN"
      : bottlenecks.some((b) => b.severity === "RED") ? "RED"
      : bottlenecks.some((b) => b.severity === "ORANGE") ? "ORANGE"
      : bottlenecks.some((b) => b.severity === "YELLOW") ? "YELLOW"
      : "GREEN";
  return (
    <Card className="p-4 sm:p-5 gap-0 h-full flex flex-col">
      <TowerHead icon={GitBranch} title="Multimodal" subtitle="Multi-mode shipment tracking" band={worst === "GREEN" ? "GREEN" : worst} />
      <div className="space-y-1">
        <MetricRow
          label="Active Shipments"
          value={data.active_shipments ?? 0}
          sub={`${(data.mode_transitions || []).length} mode transitions`}
        />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <CircleDot className="w-3 h-3" /> Mode Transitions
        </p>
        <div className="max-h-28 overflow-y-auto pr-1">
          {(data.mode_transitions || []).slice(0, 5).map((t, i) => (
            <ListLine
              key={i}
              left={<span className="truncate"><span className="font-mono text-[0.65rem]">{t.shipment}</span> · {t.from_mode}→{t.to_mode}</span>}
              right={t.location}
            />
          ))}
          {(!data.mode_transitions || data.mode_transitions.length === 0) && (
            <p className="text-[0.65rem] text-muted-foreground/70 italic">No active transitions</p>
          )}
        </div>
      </div>
      {bottlenecks.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Bottlenecks
          </p>
          <div className="max-h-28 overflow-y-auto pr-1">
            {bottlenecks.slice(0, 5).map((b, i) => (
              <ListLine
                key={i}
                left={<span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT_BG[b.severity]}`} /> {b.location}</span>}
                right={`${b.affected_shipments} ships`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function TowerSkeleton() {
  return (
    <Card className="p-4 sm:p-5 gap-0 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-md" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-full mb-2" />
      <Skeleton className="h-3.5 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export function ControlTowerDashboard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<UnifiedResponse>({
    queryKey: ["sgtx-control-tower-unified"],
    queryFn: async () => {
      const res = await fetch("/api/sgtx/control-tower");
      if (!res.ok) throw new Error(`Failed to load control tower (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Control Towers</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <TowerSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Control tower data unavailable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The unified control tower endpoint returned an error. Try again in a moment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted/40 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <h2 className="text-base font-semibold truncate">Control Towers</h2>
          <span className="text-[0.7rem] text-muted-foreground whitespace-nowrap">
            v17 §20.121-20.126
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[0.65rem] text-muted-foreground/70 hidden sm:inline">
            Updated {timeAgo(data.last_updated)}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-muted/40 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            aria-label="Refresh control towers"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <GlobalTradeCard data={data.global} />
        <RoRoCard data={data.roro} />
        <AirCard data={data.air} />
        <RoadCard data={data.road} />
        <OceanCard data={data.ocean} />
        <MultimodalCard data={data.multimodal} />
      </div>

      <p className="text-[0.65rem] text-muted-foreground/60 flex items-center gap-1">
        <ChevronRight className="w-3 h-3" />
        Read-only aggregate observability · tenant-unscoped · rate-limited 50 req/min
      </p>
    </motion.div>
  );
}

export default ControlTowerDashboard;
