"use client";

// =============================================================================
// SGTX — Reefer Telemetry Dashboard
// =============================================================================
// Shipping Line (SHIP) + Trader portal panel that visualises the cold-chain
// telemetry stream for a single shipment.
//
// Features:
//   • Latest reading card: actual temp vs setpoint, humidity, O₂/CO₂,
//     power status, fuel level. Color-coded: green (≤2°C deviation), amber
//     (2-5°C), red (>5°C).
//   • SVG line chart of the temperature time-series (no external charting
//     library). Pulls up to 100 readings via GET ?shipmentId=&limit=100.
//   • Excursion list with severity (peak temp + duration + max deviation).
//   • Aggregate stats: min/max/avg temp, excursion count, total excursion
//     minutes, last reading timestamp, total readings.
//   • Manual reading recorder (POST /api/sgtx/execution/reefer-telemetry).
//
// Theme: gold / amber / emerald / rose. shadcn/ui + lucide-react.
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Snowflake,
  Thermometer,
  TrendingDown,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime } from "@/lib/sgtx/format";

const REQUEST_TIMEOUT_MS = 15_000;

// -----------------------------------------------------------------------------
// Types — mirrors of the reefer-telemetry service response shapes.
// -----------------------------------------------------------------------------

interface TelemetryReading {
  id: string;
  shipmentId: string;
  containerId: string | null;
  ustn: string;
  timestamp: string;
  setpointTempC: number | null;
  actualTempC: number;
  supplyAirTempC: number | null;
  returnAirTempC: number | null;
  humidityPct: number | null;
  o2Pct: number | null;
  co2Pct: number | null;
  n2Pct: number | null;
  powerStatus: string | null;
  fuelLevelPct: number | null;
  batteryVoltage: number | null;
  tempExcursion: boolean;
  doorOpen: boolean;
  powerFailure: boolean;
  defrostCycle: boolean;
  source: string;
  deviceId: string | null;
}

interface TelemetryStats {
  minTemp: number | null;
  maxTemp: number | null;
  avgTemp: number | null;
  excursionCount: number;
  totalExcursionMinutes: number;
  lastReadingAt: string | null;
  readingCount: number;
}

interface ExcursionEvent {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  peakTempC: number;
  setpointTempC: number | null;
  maxDeviationC: number;
  readingCount: number;
}

// -----------------------------------------------------------------------------
// fetchWithTimeout
// -----------------------------------------------------------------------------

async function fetchWithTimeout<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Deviation helpers
// -----------------------------------------------------------------------------

type TempBand = "ok" | "warn" | "danger";

function deviationBand(actual: number, setpoint: number | null): TempBand {
  if (setpoint == null) return "ok";
  const d = Math.abs(actual - setpoint);
  if (d <= 2) return "ok";
  if (d <= 5) return "warn";
  return "danger";
}

function bandColor(band: TempBand): string {
  switch (band) {
    case "ok": return "#10b981";
    case "warn": return "#f59e0b";
    case "danger": return "#f43f5e";
  }
}

function severityBadge(ev: ExcursionEvent): ReactElement {
  if (ev.maxDeviationC > 5) {
    return <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30">CRITICAL</Badge>;
  }
  if (ev.maxDeviationC > 2) {
    return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">HIGH</Badge>;
  }
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">LOW</Badge>;
}

// -----------------------------------------------------------------------------
// SVG line chart (pure SVG, no charting library)
// -----------------------------------------------------------------------------

function TempChart({ readings }: { readings: TelemetryReading[] }): ReactElement {
  const W = 720;
  const H = 200;
  const PAD = 28;

  const data = useMemo(() => readings.slice(-100), [readings]);
  if (data.length < 2) {
    return (
      <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
        Need at least 2 readings to render the temperature trend.
      </div>
    );
  }

  const temps = data.map((d) => d.actualTempC);
  const setpoints = data.map((d) => d.setpointTempC).filter((v): v is number => v != null);
  const all = [...temps, ...setpoints];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (max - min < 1) { min -= 1; max += 1; }
  const range = max - min;

  const xFor = (i: number) => PAD + (i / (data.length - 1)) * (W - 2 * PAD);
  const yFor = (t: number) => PAD + (1 - (t - min) / range) * (H - 2 * PAD);

  const tempPath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(d.actualTempC).toFixed(2)}`).join(" ");
  const setpointPath = data
    .map((d, i) => (d.setpointTempC != null ? `${i === 0 || data[i - 1].setpointTempC == null ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(d.setpointTempC).toFixed(2)}` : ""))
    .filter(Boolean)
    .join(" ");

  // Y-axis labels (5 ticks)
  const ticks = Array.from({ length: 5 }, (_, i) => min + (range * i) / 4);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px] min-w-[480px]">
        {/* grid lines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD} x2={W - PAD} y1={yFor(t)} y2={yFor(t)}
              stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 4"
            />
            <text x={4} y={yFor(t) + 3} className="fill-muted-foreground" fontSize="9">
              {t.toFixed(1)}°
            </text>
          </g>
        ))}

        {/* setpoint line (dashed gold) */}
        {setpointPath && (
          <path d={setpointPath} fill="none" stroke="#d4a017" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.8" />
        )}

        {/* actual temp line */}
        <path d={tempPath} fill="none" stroke="#0ea5e9" strokeWidth="1.8" />

        {/* excursion markers */}
        {data.map((d, i) =>
          d.tempExcursion ? (
            <circle
              key={i}
              cx={xFor(i)}
              cy={yFor(d.actualTempC)}
              r="3"
              fill="#f43f5e"
              stroke="white"
              strokeWidth="0.6"
            />
          ) : null,
        )}

        {/* legend */}
        <g transform={`translate(${W - 200}, 8)`}>
          <line x1="0" x2="14" y1="6" y2="6" stroke="#0ea5e9" strokeWidth="1.8" />
          <text x="18" y="9" className="fill-muted-foreground" fontSize="9">Actual</text>
          <line x1="60" x2="74" y1="6" y2="6" stroke="#d4a017" strokeWidth="1.2" strokeDasharray="4 3" />
          <text x="78" y="9" className="fill-muted-foreground" fontSize="9">Setpoint</text>
          <circle cx="130" cy="6" r="3" fill="#f43f5e" />
          <text x="138" y="9" className="fill-muted-foreground" fontSize="9">Excursion</text>
        </g>
      </svg>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Manual reading recorder
// -----------------------------------------------------------------------------

function RecordReadingDialog({
  shipmentId,
  ustn,
  open,
  onOpenChange,
  onRecorded,
}: {
  shipmentId: string;
  ustn: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRecorded: () => void;
}): ReactElement {
  const [actualTemp, setActualTemp] = useState("");
  const [setpoint, setSetpoint] = useState("");
  const [humidity, setHumidity] = useState("");
  const [o2, setO2] = useState("");
  const [co2, setCo2] = useState("");
  const [powerStatus, setPowerStatus] = useState("ON");
  const [fuelLevel, setFuelLevel] = useState("");
  const [source, setSource] = useState("MANUAL");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const t = parseFloat(actualTemp);
    if (!Number.isFinite(t)) {
      toast.error("Actual temperature is required (numeric)");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout("/api/sgtx/execution/reefer-telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId,
          ustn,
          actualTempC: t,
          setpointTempC: setpoint ? parseFloat(setpoint) : undefined,
          humidityPct: humidity ? parseFloat(humidity) : undefined,
          o2Pct: o2 ? parseFloat(o2) : undefined,
          co2Pct: co2 ? parseFloat(co2) : undefined,
          powerStatus,
          fuelLevelPct: fuelLevel ? parseFloat(fuelLevel) : undefined,
          source,
        }),
      });
      toast.success("Reading recorded");
      setActualTemp(""); setSetpoint(""); setHumidity(""); setO2(""); setCo2(""); setFuelLevel("");
      onOpenChange(false);
      onRecorded();
    } catch (e) {
      toast.error("Recording failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-gold" /> Record Telemetry Reading
          </DialogTitle>
          <DialogDescription>Manual entry · Shipment <span className="font-mono">{shipmentId.slice(-12)}</span></DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Actual Temp (°C) *</Label>
            <Input type="number" step="0.1" value={actualTemp} onChange={(e) => setActualTemp(e.target.value)} placeholder="e.g. -18.2" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Setpoint (°C)</Label>
            <Input type="number" step="0.1" value={setpoint} onChange={(e) => setSetpoint(e.target.value)} placeholder="e.g. -18.0" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Humidity (%)</Label>
            <Input type="number" step="0.1" value={humidity} onChange={(e) => setHumidity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Fuel Level (%)</Label>
            <Input type="number" value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">O₂ (%)</Label>
            <Input type="number" step="0.1" value={o2} onChange={(e) => setO2(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">CO₂ (%)</Label>
            <Input type="number" step="0.1" value={co2} onChange={(e) => setCo2(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Power Status</Label>
            <Select value={powerStatus} onValueChange={setPowerStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ON">ON</SelectItem>
                <SelectItem value="OFF">OFF</SelectItem>
                <SelectItem value="DEFROST">DEFROST</SelectItem>
                <SelectItem value="STANDBY">STANDBY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="CARRIER_TRANSICOLD">Carrier Transicold</SelectItem>
                <SelectItem value="THERMO_KING">Thermo King</SelectItem>
                <SelectItem value="ROAMBEE">Roambee</SelectItem>
                <SelectItem value="TIVE">Tive</SelectItem>
                <SelectItem value="SENSITECH">Sensitech</SelectItem>
                <SelectItem value="ELPRO">ELPRO</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Record Reading
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function ReeferTelemetryPanel({ shipmentId, ustn }: { shipmentId: string; ustn?: string }): ReactElement {
  const [latest, setLatest] = useState<TelemetryReading | null>(null);
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [series, setSeries] = useState<TelemetryReading[]>([]);
  const [excursions, setExcursions] = useState<ExcursionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!shipmentId) {
      setError("No shipment selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [summaryResp, seriesResp, excResp] = await Promise.all([
        fetchWithTimeout<{ latest: TelemetryReading | null; stats: TelemetryStats | null }>(
          `/api/sgtx/execution/reefer-telemetry/${encodeURIComponent(shipmentId)}`,
        ).catch(() => ({ latest: null, stats: null })),
        fetchWithTimeout<{ readings: TelemetryReading[] }>(
          `/api/sgtx/execution/reefer-telemetry?shipmentId=${encodeURIComponent(shipmentId)}&limit=100`,
        ).catch(() => ({ readings: [] as TelemetryReading[] })),
        fetchWithTimeout<{ excursions: ExcursionEvent[] }>(
          `/api/sgtx/execution/reefer-telemetry/${encodeURIComponent(shipmentId)}/excursions`,
        ).catch(() => ({ excursions: [] as ExcursionEvent[] })),
      ]);
      setLatest(summaryResp.latest || null);
      setStats(summaryResp.stats || null);
      setSeries(seriesResp.readings || []);
      setExcursions(excResp.excursions || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">Unable to load telemetry</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </Card>
    );
  }

  const band = latest ? deviationBand(latest.actualTempC, latest.setpointTempC) : "ok";
  const bandHex = bandColor(band);
  const deviation = latest && latest.setpointTempC != null
    ? Math.abs(latest.actualTempC - latest.setpointTempC)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-gold" /> Reefer Telemetry
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Shipment {shipmentId.slice(-16)}{ustn ? ` · USTN ${ustn.slice(-12)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setRecordOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Record Reading
          </Button>
        </div>
      </div>

      {/* Latest reading card */}
      {latest ? (
        <Card className="p-4" style={{ borderColor: `${bandHex}55` }}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${bandHex}1a`, border: `1px solid ${bandHex}55` }}>
                <Thermometer className="w-6 h-6" style={{ color: bandHex }} />
              </div>
              <div>
                <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">Latest Reading</p>
                <p className="text-2xl font-bold" style={{ color: bandHex }}>
                  {latest.actualTempC.toFixed(1)}°C
                </p>
                {latest.setpointTempC != null && (
                  <p className="text-xs text-muted-foreground">
                    Setpoint {latest.setpointTempC.toFixed(1)}°C
                    {deviation != null && ` · Δ ${deviation.toFixed(1)}°C`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {band === "ok" && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">WITHIN RANGE</Badge>}
              {band === "warn" && <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><AlertTriangle className="w-3 h-3" /> DEVIATION</Badge>}
              {band === "danger" && <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30"><TrendingDown className="w-3 h-3" /> EXCURSION</Badge>}
              <p className="text-[0.65rem] text-muted-foreground">{fmtDateTime(latest.timestamp)}</p>
              <Badge variant="outline" className="text-[0.6rem]">{latest.source}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Humidity</p>
              <p className="font-semibold">{latest.humidityPct != null ? `${latest.humidityPct.toFixed(1)}%` : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">O₂</p>
              <p className="font-semibold">{latest.o2Pct != null ? `${latest.o2Pct.toFixed(1)}%` : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">CO₂</p>
              <p className="font-semibold">{latest.co2Pct != null ? `${latest.co2Pct.toFixed(1)}%` : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Power</p>
              <p className="font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ color: latest.powerStatus === "ON" ? "#10b981" : "#f43f5e" }} />
                {latest.powerStatus || "—"}
              </p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Fuel</p>
              <p className="font-semibold">{latest.fuelLevelPct != null ? `${latest.fuelLevelPct.toFixed(0)}%` : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Flags</p>
              <div className="flex flex-wrap gap-1">
                {latest.tempExcursion && <Badge className="bg-rose-500/10 text-rose-600 text-[0.6rem]">EXC</Badge>}
                {latest.doorOpen && <Badge className="bg-amber-500/10 text-amber-600 text-[0.6rem]">DOOR</Badge>}
                {latest.powerFailure && <Badge className="bg-rose-500/10 text-rose-600 text-[0.6rem]">PWR</Badge>}
                {latest.defrostCycle && <Badge className="bg-sky-500/10 text-sky-600 text-[0.6rem]">DEF</Badge>}
                {!latest.tempExcursion && !latest.doorOpen && !latest.powerFailure && !latest.defrostCycle && (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <Snowflake className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">No telemetry yet for this shipment</p>
          <p className="text-xs text-muted-foreground mb-4">Record a manual reading or wait for an IoT device bridge to publish.</p>
          <Button size="sm" onClick={() => setRecordOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Record First Reading
          </Button>
        </Card>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Activity className="w-3 h-3" /> Readings</div>
            <p className="text-xl font-bold mt-1">{stats.readingCount}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Thermometer className="w-3 h-3" /> Min / Max</div>
            <p className="text-xl font-bold mt-1">
              <span className="text-sky-600">{stats.minTemp?.toFixed(1) ?? "—"}</span>
              <span className="text-muted-foreground text-sm"> / </span>
              <span className="text-rose-600">{stats.maxTemp?.toFixed(1) ?? "—"}</span>
            </p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><TrendingDown className="w-3 h-3" /> Excursions</div>
            <p className={`text-xl font-bold mt-1 ${stats.excursionCount > 0 ? "text-rose-600" : ""}`}>{stats.excursionCount}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><AlertTriangle className="w-3 h-3" /> Exc. Minutes</div>
            <p className={`text-xl font-bold mt-1 ${stats.totalExcursionMinutes > 0 ? "text-amber-600" : ""}`}>{stats.totalExcursionMinutes}</p>
          </Card>
        </div>
      )}

      {/* Temperature chart */}
      {series.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-gold" /> Temperature Trend
            </p>
            <p className="text-[0.65rem] text-muted-foreground">{series.length} readings</p>
          </div>
          <TempChart readings={series} />
        </Card>
      )}

      {/* Excursions list */}
      {excursions.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-500" /> Detected Excursions ({excursions.length})
          </p>
          <div className="space-y-2">
            {excursions.map((ev, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 p-2 text-xs"
              >
                {severityBadge(ev)}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.7rem]">
                    {fmtDateTime(ev.startTime)} → {fmtDateTime(ev.endTime)}
                  </p>
                  <p className="text-muted-foreground">
                    Peak <span className="text-rose-600 font-semibold">{ev.peakTempC.toFixed(1)}°C</span>
                    {ev.setpointTempC != null && <> · setpoint {ev.setpointTempC.toFixed(1)}°C</>}
                    {" · "}max deviation {ev.maxDeviationC.toFixed(1)}°C
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{ev.durationMinutes} min</p>
                  <p className="text-[0.65rem] text-muted-foreground">{ev.readingCount} samples</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      <RecordReadingDialog
        shipmentId={shipmentId}
        ustn={ustn || ""}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onRecorded={() => void refresh()}
      />
    </div>
  );
}
