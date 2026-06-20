"use client";

// SGTX Part 9 — Logistics Provider Management: missing portal tabs.
// - ProviderPerformanceScreen (LSP / SHIP / LAB / QC / CBR)
// - DispatchPlannerScreen (LSP only)
// - BookingRequestsScreen (SHIP only)
//
// Mirrors the gold/sovereign theme used elsewhere (gold-gradient buttons,
// Progress bars, SectionHeader) and consumes the existing API routes:
//   GET  /api/sgtx/providers/performance?providerGtid=...
//   GET  /api/sgtx/dashboard?tenant=...
//   POST /api/sgtx/ai/chat  (route optimisation)
//   GET  /api/sgtx/ship-quote/list?shipper=...
//   POST /api/sgtx/ship-quote/select

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, statusColor } from "@/lib/sgtx/format";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  TrendingUp,
  AlertTriangle,
  FileCheck,
  Shield,
  Sparkles,
  Loader2,
  Truck,
  Ship,
  CheckCircle2,
  XCircle,
  Route,
  Package,
  Container,
  Plus,
  PackageCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ============================================================================
// 9.8 — Provider Performance Screen (LSP / SHIP / LAB / QC / CBR)
// ============================================================================
export function ProviderPerformanceScreen({ providerGtid }: { providerGtid: string }) {
  const [windowDays, setWindowDays] = useState<"30" | "60" | "90">("30");

  const { data, isLoading } = useQuery({
    queryKey: ["provider-performance", providerGtid],
    queryFn: async () => {
      const r = await fetch(
        `/api/sgtx/providers/performance?providerGtid=${encodeURIComponent(providerGtid)}`,
      );
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!providerGtid,
  });

  const headerAction = (
    <Select value={windowDays} onValueChange={(v) => setWindowDays(v as "30" | "60" | "90")}>
      <SelectTrigger className="w-32 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="30">30 days</SelectItem>
        <SelectItem value="60">60 days</SelectItem>
        <SelectItem value="90">90 days</SelectItem>
      </SelectContent>
    </Select>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Provider Performance" subtitle={`Rolling ${windowDays}-day metrics · ${providerGtid}`} action={headerAction} />
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-gold" />
          Loading performance metrics…
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Provider Performance" subtitle={`Rolling ${windowDays}-day metrics · ${providerGtid}`} action={headerAction} />
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
          No performance data available for this provider yet.
          <p className="text-[0.65rem] mt-1">
            Metrics are computed after the first completed job and refreshed every 24h by the TRI cron.
          </p>
        </Card>
      </div>
    );
  }

  const quartileLabel =
    data.quartileLabel ||
    (data.benchmarkQuartile === 1
      ? "Top 25%"
      : data.benchmarkQuartile === 2
        ? "Above Average"
        : data.benchmarkQuartile === 3
          ? "Below Average"
          : "Bottom 25%");
  const quartileColor =
    data.benchmarkQuartile === 1
      ? "#10b981"
      : data.benchmarkQuartile === 2
        ? "#0ea5e9"
        : data.benchmarkQuartile === 3
          ? "#fbbf24"
          : "#f87171";

  const metrics: {
    label: string;
    value: number;
    max: number;
    suffix: string;
    icon: LucideIcon;
    accent: string;
    inverted?: boolean;
  }[] = [
    {
      label: "On-time Delivery",
      value: data.onTimeDeliveryPct ?? 0,
      max: 100,
      suffix: "%",
      icon: TrendingUp,
      accent: "#10b981",
    },
    {
      label: "Invoice Accuracy",
      value: data.invoiceAccuracyPct ?? 0,
      max: 100,
      suffix: "%",
      icon: FileCheck,
      accent: "#0ea5e9",
    },
    {
      label: "Dispute Rate",
      value: (data.disputeRate ?? 0) * 100,
      max: 100,
      suffix: "%",
      icon: AlertTriangle,
      accent: "#f87171",
      inverted: true,
    },
    {
      label: "Risk Score",
      value: data.riskScore ?? 0,
      max: 100,
      suffix: "/100",
      icon: Shield,
      accent: "#a78bfa",
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Provider Performance"
        subtitle={`Rolling ${windowDays}-day metrics · ${providerGtid}`}
        action={headerAction}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          const pct = Math.min(100, Math.max(0, (m.value / m.max) * 100));
          const barPct = m.inverted ? 100 - pct : pct;
          const display =
            m.suffix === "%" && !m.inverted
              ? `${(m.value as number).toFixed(1)}%`
              : m.suffix === "%" && m.inverted
                ? `${(m.value as number).toFixed(2)}%`
                : `${Math.round(m.value)}${m.suffix}`;
          return (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 sm:p-5 hover:border-gold/40 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${m.accent}1a` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: m.accent }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                  </div>
                  <span className="text-xl font-bold font-display" style={{ color: m.accent }}>
                    {display}
                  </span>
                </div>
                <Progress value={barPct} className="h-2" />
                <p className="text-[0.6rem] text-muted-foreground mt-1.5">
                  {m.inverted ? "Lower is better" : "Higher is better"} · Benchmark quartile{" "}
                  {data.benchmarkQuartile}
                </p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Benchmark Quartile
            </p>
            <p className="text-2xl font-bold font-display" style={{ color: quartileColor }}>
              {quartileLabel}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((q) => (
              <div
                key={q}
                className="w-10 h-2 rounded-full"
                style={{
                  background: q === data.benchmarkQuartile ? quartileColor : "#94a3b8",
                  opacity: q === data.benchmarkQuartile ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-[0.6rem] text-muted-foreground">Total Jobs</p>
            <p className="font-semibold">{data.totalJobs ?? 0}</p>
          </div>
          <div>
            <p className="text-[0.6rem] text-muted-foreground">Completed</p>
            <p className="font-semibold">{data.completedJobs ?? 0}</p>
          </div>
          <div>
            <p className="text-[0.6rem] text-muted-foreground">Avg Turnaround</p>
            <p className="font-semibold">{(data.avgTurnaroundDays ?? 0).toFixed(1)}d</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5 border-gold/30">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold">AI Performance Summary</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {data.performanceSummary ||
            "AI summary unavailable. Performance metrics are derived from on-chain milestones, dispute filings, invoice reconciliation, and the SGTX risk engine. Provider benchmarking is updated every 24 hours."}
        </p>
      </Card>
    </div>
  );
}

// ============================================================================
// LSP Dispatch Planner Screen
// ============================================================================
const DEMO_DRIVERS = [
  "Driver Ali Hassan",
  "Driver Mahmoud Saeed",
  "Driver Omar Farouk",
  "Driver Youssef Ibrahim",
];

export function DispatchPlannerScreen({
  tenantGtid,
  data: existingData,
}: {
  tenantGtid: string;
  data?: any;
}) {
  const queryClient = useQueryClient();
  const [routeSuggestion, setRouteSuggestion] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [assignedDrivers, setAssignedDrivers] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["dashboard", "dispatch", tenantGtid],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/dashboard?tenant=${encodeURIComponent(tenantGtid)}`);
      if (!r.ok) return {} as any;
      return r.json();
    },
    initialData: existingData,
    enabled: !!tenantGtid && !existingData,
  });

  const assignments: any[] = data?.shipmentsCarrier || [];

  const optimiseRoute = async () => {
    if (assignments.length === 0) {
      toast.error("No assignments to optimise.");
      return;
    }
    setRouteLoading(true);
    setRouteSuggestion(null);
    try {
      const summary = assignments
        .slice(0, 8)
        .map(
          (a: any, i: number) =>
            `Job ${i + 1}: Container ${a.containerNo || "—"}, ${a.originPort || "—"} → ${a.destPort || "—"}, ETA ${a.eta ? new Date(a.eta).toLocaleDateString() : "—"}${a.trade?.coldChain ? ", COLD-CHAIN" : ""}.`,
        )
        .join("\n");
      const r = await fetch("/api/sgtx/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: tenantGtid,
          message: `As an LSP dispatch planner, suggest an optimal pickup & delivery sequence for these ${assignments.length} assignments. Consider ETA windows, port proximity, and cold-chain priority. Keep it to 5 lines max.\n\nAssignments:\n${summary}`,
        }),
      });
      const d = await r.json();
      setRouteSuggestion(
        d.content ||
          "Route optimisation unavailable. Plan manually by ETA priority — earliest ETA first, cold-chain ahead of ambient.",
      );
      toast.success("AI route suggestion generated.");
    } catch {
      setRouteSuggestion(
        "AI route optimisation unavailable. Plan manually by ETA priority — earliest ETA first, cold-chain ahead of ambient.",
      );
      toast.error("AI suggestion failed — using fallback.");
    } finally {
      setRouteLoading(false);
    }
  };

  const assignDriver = (shipmentId: string, driver: string) => {
    setAssignedDrivers((prev) => ({ ...prev, [shipmentId]: driver }));
    toast.success("Driver assigned.", { description: `${driver} → shipment confirmed.` });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "dispatch", tenantGtid] });
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dispatch Planner"
        subtitle="Optimise pickup sequence · assign drivers · track milestones"
        action={
          <Button
            onClick={optimiseRoute}
            disabled={routeLoading || assignments.length === 0}
            className="bg-gold-gradient text-sovereign h-8 text-xs"
          >
            {routeLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Optimising…
              </>
            ) : (
              <>
                <Route className="w-3.5 h-3.5 mr-1.5" /> Optimise Route
              </>
            )}
          </Button>
        }
      />

      {routeSuggestion && (
        <Card className="p-4 border-gold/40">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-gold mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold mb-1">AI Route Suggestion</p>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                {routeSuggestion}
              </p>
            </div>
          </div>
        </Card>
      )}

      {!data ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-gold" />
          Loading assignments…
        </Card>
      ) : assignments.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Truck className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
          No active assignments.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/40 max-h-[640px] overflow-y-auto">
            {assignments.map((s: any, i: number) => {
              const status = s.status || "PLANNED";
              const color = statusColor(status);
              const driver = assignedDrivers[s.id];
              const coldChain = s.trade?.coldChain;
              return (
                <div key={s.id} className="p-4 hover:bg-muted/30">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${coldChain ? "bg-sky-500/15" : "bg-orange-500/15"}`}
                    >
                      {coldChain ? (
                        <Container className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Package className="w-4 h-4 text-orange-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold">
                          #{i + 1} · Container {s.containerNo || "—"}
                        </p>
                        {coldChain && (
                          <Badge
                            variant="outline"
                            className="text-[0.6rem] py-0 px-1.5 border-sky-400/40 text-sky-400"
                          >
                            COLD
                          </Badge>
                        )}
                      </div>
                      <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5">
                        {s.trade?.ustn?.slice(0, 24)}…
                      </p>
                      <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                        {s.trade?.seller?.legalName}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[0.6rem]"
                      style={{ color, borderColor: `${color}55` }}
                    >
                      {status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3 pl-12">
                    <div>
                      <p className="text-[0.55rem] text-muted-foreground">Origin</p>
                      <p className="font-medium">{s.originPort || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[0.55rem] text-muted-foreground">Destination</p>
                      <p className="font-medium">{s.destPort || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[0.55rem] text-muted-foreground">ETD</p>
                      <p className="font-medium">{fmtDate(s.etd)}</p>
                    </div>
                    <div>
                      <p className="text-[0.55rem] text-muted-foreground">ETA</p>
                      <p className="font-medium">{fmtDate(s.eta)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-12 flex-wrap">
                    <Select
                      value={driver || ""}
                      onValueChange={(v) => assignDriver(s.id, v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-44">
                        <SelectValue placeholder="Assign driver…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEMO_DRIVERS.map((d) => (
                          <SelectItem key={d} value={d} className="text-xs">
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {driver && (
                      <Badge
                        variant="outline"
                        className="text-[0.6rem] py-0.5 border-emerald-400/40 text-emerald-400"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Driver confirmed
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// SHIP Booking Requests Screen
// ============================================================================
export function BookingRequestsScreen({ tenantGtid }: { tenantGtid: string }) {
  const queryClient = useQueryClient();
  const [actingOn, setActingOn] = useState<Record<string, "CONFIRM" | "REJECT" | null>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["ship-quote-list", tenantGtid],
    queryFn: async () => {
      const r = await fetch(
        `/api/sgtx/ship-quote/list?shipper=${encodeURIComponent(tenantGtid)}`,
      );
      if (!r.ok) return { requests: [] as any[], quotes: [] as any[] };
      return r.json();
    },
    enabled: !!tenantGtid,
  });

  const requests: any[] = data?.requests || [];
  const quotes: any[] = data?.quotes || [];

  const decide = async (quoteId: string, decision: "CONFIRM" | "REJECT") => {
    setActingOn((prev) => ({ ...prev, [quoteId]: decision }));
    try {
      const r = await fetch("/api/sgtx/ship-quote/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, decision }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      if (decision === "CONFIRM") {
        toast.success("Booking confirmed.", {
          description: "Commitment recorded. Trader will be notified.",
        });
      } else {
        toast.info("Booking rejected.", { description: "Quote withdrawn from selection." });
      }
      queryClient.invalidateQueries({ queryKey: ["ship-quote-list", tenantGtid] });
    } catch (e: any) {
      toast.error("Action failed.", { description: e.message });
    } finally {
      setActingOn((prev) => ({ ...prev, [quoteId]: null }));
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Booking Requests"
        subtitle={`${requests.length} inbound request(s) · ${quotes.length} quote(s) submitted`}
      />

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-gold" />
          Loading booking requests…
        </Card>
      ) : requests.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Ship className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
          No booking requests targeting this shipping line yet.
          <p className="text-[0.65rem] mt-1">
            Requests appear here when traders submit Mode C ship-quote requests targeting your line.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req: any) => {
            const reqQuotes = quotes.filter((q: any) => q.requestId === req.id);
            const containers = (() => {
              try {
                return JSON.parse(req.containerDetails || "{}");
              } catch {
                return {} as any;
              }
            })();
            const addOns: string[] = (() => {
              try {
                return JSON.parse(req.addOnServices || "[]");
              } catch {
                return [];
              }
            })();
            const bestRate =
              reqQuotes.length > 0
                ? fmtUsd(Math.min(...reqQuotes.map((q: any) => q.totalFee)))
                : "—";
            return (
              <Card key={req.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {req.baseServiceType} · {req.originPort} → {req.destinationPort}
                    </p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5">
                      {req.ustn?.slice(0, 24) || "No USTN"}…
                    </p>
                    <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                      Requested by {req.sellerGtid} · {fmtDate(req.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[0.6rem]"
                    style={{
                      color: statusColor(req.status),
                      borderColor: `${statusColor(req.status)}55`,
                    }}
                  >
                    {req.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground">Container</p>
                    <p className="font-medium">
                      {containers.type || "—"} × {containers.count || 1}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground">Add-on services</p>
                    <p className="font-medium">{addOns.length ? addOns.join(", ") : "None"}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground">Quotes submitted</p>
                    <p className="font-medium">{reqQuotes.length}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground">Best rate</p>
                    <p className="font-medium">{bestRate}</p>
                  </div>
                </div>

                {reqQuotes.length > 0 && (
                  <div className="space-y-1.5 mt-3">
                    {reqQuotes.map((q: any) => {
                      const confirmed = q.selected === true;
                      const acting = actingOn[q.id];
                      return (
                        <div
                          key={q.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 text-xs"
                        >
                          <Ship className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              Quote {q.id.slice(-6)} · {fmtUsd(q.totalFee)}
                            </p>
                            <p className="text-[0.6rem] text-muted-foreground">
                              Base {fmtUsd(q.baseFee)} · valid {q.validityHours}h · submitted{" "}
                              {fmtDate(q.submittedAt)}
                            </p>
                          </div>
                          {confirmed ? (
                            <Badge
                              variant="outline"
                              className="text-[0.6rem] py-0.5 border-emerald-400/40 text-emerald-400"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmed
                            </Badge>
                          ) : (
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="bg-gold-gradient text-sovereign h-7 text-xs"
                                disabled={!!acting}
                                onClick={() => decide(q.id, "CONFIRM")}
                              >
                                {acting === "CONFIRM" ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                )}
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={!!acting}
                                onClick={() => decide(q.id, "REJECT")}
                              >
                                {acting === "REJECT" ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <XCircle className="w-3 h-3 mr-1" />
                                )}
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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

// ============ Warehouse Dashboard (LSP — Part 9.1) ============
export function WarehouseDashboardScreen({ data }: { data: any }) {
  const trades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const inbound = trades.filter((t: any) => t.status === "CONTRACT_SIGNED" || t.status === "IN_EXECUTION");
  return (
    <div className="space-y-4">
      <SectionHeader title="Warehouse Dashboard" subtitle="Inbound/outbound · storage utilisation · temperature logs" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-[0.6rem] text-muted-foreground uppercase">Inbound Shipments</p>
          <p className="text-2xl font-bold text-gold">{inbound.length}</p>
          <p className="text-[0.6rem] text-muted-foreground mt-1">Awaiting warehouse receipt</p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.6rem] text-muted-foreground uppercase">Storage Utilisation</p>
          <p className="text-2xl font-bold text-gold">68%</p>
          <div className="h-2 bg-muted rounded-full mt-2 overflow-hidden"><div className="h-full bg-gold-gradient" style={{ width: "68%" }} /></div>
        </Card>
        <Card className="p-4">
          <p className="text-[0.6rem] text-muted-foreground uppercase">Temperature Alerts</p>
          <p className="text-2xl font-bold text-emerald-400">0</p>
          <p className="text-[0.6rem] text-muted-foreground mt-1">All zones within range</p>
        </Card>
      </div>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Inbound Shipments</h3>
        {inbound.length === 0 ? (
          <p className="text-xs text-muted-foreground">No inbound shipments. Warehouse is ready to receive.</p>
        ) : (
          <div className="space-y-2">
            {inbound.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                <div>
                  <p className="text-xs font-medium font-mono">{t.ustn}</p>
                  <p className="text-[0.6rem] text-muted-foreground">{t.commodity} · {t.containerCount} container(s) · {t.grossWeightKg} kg</p>
                </div>
                <Badge variant="outline" className="text-[0.55rem] text-amber-400 border-amber-500/30">AWAITING RECEIPT</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Storage Zones</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { zone: "Zone A — Ambient", temp: "22°C", util: 45, status: "OK" },
            { zone: "Zone B — Chilled", temp: "4°C", util: 72, status: "OK" },
            { zone: "Zone C — Frozen", temp: "-18°C", util: 85, status: "OK" },
            { zone: "Zone D — Deep Freeze", temp: "-25°C", util: 30, status: "OK" },
          ].map(z => (
            <div key={z.zone} className="p-3 rounded-lg bg-muted/20">
              <p className="text-[0.6rem] font-medium">{z.zone}</p>
              <p className="text-sm font-bold text-gold">{z.temp}</p>
              <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden"><div className="h-full bg-gold-gradient" style={{ width: `${z.util}%` }} /></div>
              <p className="text-[0.55rem] text-muted-foreground mt-1">{z.util}% utilised</p>
              <Badge variant="outline" className="text-[0.5rem] text-emerald-400 border-emerald-500/30 mt-1">{z.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ Contract Rate Manager (SHIP — Part 9.2) ============
export function ContractRateManagerScreen({ data }: { data: any }) {
  const [showAdd, setShowAdd] = useState(false);
  const [rates, setRates] = useState([
    { id: 1, seller: "Strawberry Export Co.", route: "EGALX → DEHAM", rate: "$4,200/40ft", validUntil: "2026-12-31", type: "40ft" },
    { id: 2, seller: "Mekong Fresh", route: "VNSGN → DEHAM", rate: "$5,100/40ft", validUntil: "2026-09-30", type: "40ft" },
    { id: 3, seller: "Strawberry Export Co.", route: "EGALX → DEBRV", rate: "$4,050/40ft", validUntil: "2026-12-31", type: "40ft" },
  ]);
  return (
    <div className="space-y-4">
      <SectionHeader title="Contract Rate Manager" subtitle="Private contract rates per seller · negotiated freight rates" />
      <div className="flex justify-end">
        <Button size="sm" className="bg-gold-gradient text-sovereign h-8" onClick={() => setShowAdd(!showAdd)}><Plus className="w-3.5 h-3.5 mr-1" />Add Rate</Button>
      </div>
      {showAdd && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">New Contract Rate</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><Label className="text-[0.6rem]">Seller GTID</Label><Input className="h-8 text-xs" placeholder="SGTX-EG-TRD-..." /></div>
            <div><Label className="text-[0.6rem]">Route</Label><Input className="h-8 text-xs" placeholder="EGALX → DEHAM" /></div>
            <div><Label className="text-[0.6rem]">Rate</Label><Input className="h-8 text-xs" placeholder="$4,200/40ft" /></div>
            <div><Label className="text-[0.6rem]">Valid Until</Label><Input type="date" className="h-8 text-xs" /></div>
          </div>
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => { setShowAdd(false); toast.success("Contract rate added"); }}>Save Rate</Button>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase">
              <th className="text-left px-4 py-2">Seller</th>
              <th className="text-left px-3 py-2">Route</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-left px-3 py-2">Valid Until</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr></thead>
            <tbody>
              {rates.map(r => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs">{r.seller}</td>
                  <td className="px-3 py-3 text-xs font-mono">{r.route}</td>
                  <td className="px-3 py-3"><Badge variant="outline" className="text-[0.55rem] text-gold border-gold/30">{r.type}</Badge></td>
                  <td className="px-3 py-3 text-right text-xs font-semibold text-gold">{r.rate}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{r.validUntil}</td>
                  <td className="px-3 py-3"><Button size="sm" variant="outline" className="h-6 text-[0.6rem]">Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============ Re-inspection Requests (QC — Part 9.4) ============
export function ReInspectionScreen({ data }: { data: any }) {
  const qcInspections = data?.qcInspections || [];
  return (
    <div className="space-y-4">
      <SectionHeader title="Re-inspection Requests" subtitle="Request re-inspection · dispute previous QC verdict · track resolution" />
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Request New Re-inspection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label className="text-[0.6rem]">USTN</Label><Input className="h-8 text-xs font-mono" placeholder="SGTX-..." /></div>
          <div><Label className="text-[0.6rem]">Original Inspection ID</Label><Input className="h-8 text-xs" placeholder="QC-..." /></div>
          <div><Label className="text-[0.6rem]">Reason</Label><Input className="h-8 text-xs" placeholder="Dispute defect classification" /></div>
        </div>
        <Button size="sm" className="bg-gold-gradient text-sovereign h-7 mt-3" onClick={() => toast.success("Re-inspection request submitted")}>Submit Request</Button>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Previous Inspections Eligible for Re-inspection</h3>
        {qcInspections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No QC inspections found. Inspections will appear here when available.</p>
        ) : (
          <div className="space-y-2">
            {qcInspections.map((qc: any) => (
              <div key={qc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                <div>
                  <p className="text-xs font-medium">{qc.ustn || "N/A"}</p>
                  <p className="text-[0.6rem] text-muted-foreground">Result: {qc.result || "N/A"} · Defects: {qc.defectCount || 0}</p>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-[0.6rem]" onClick={() => toast.info("Re-inspection requested")}>Request Re-inspection</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ Physical Document Jobs (CBR — Part 9.5) ============
export function PhysicalJobsScreen({ data }: { data: any }) {
  const [jobs, setJobs] = useState([
    { id: "PJ-001", type: "Document Retrieval", status: "AWAITING_RECEIPT", ustn: "SGTX-1397F3A-...", location: "Alexandria Port", assignee: "Unassigned" },
    { id: "PJ-002", type: "Certificate Presentation", status: "RECEIVED", ustn: "SGTX-1397F3A-...", location: "Customs Office Cairo", assignee: "Ahmed Hassan" },
    { id: "PJ-003", type: "Stamp Collection", status: "PRESENTED", ustn: "SGTX-2345B6C-...", location: "Chamber of Commerce", assignee: "Mohamed Salah" },
  ]);
  const statusColors: Record<string, string> = {
    AWAITING_RECEIPT: "text-amber-400 border-amber-500/30",
    RECEIVED: "text-blue-400 border-blue-500/30",
    PRESENTED: "text-purple-400 border-purple-500/30",
    STAMPED: "text-emerald-400 border-emerald-500/30",
    COMPLETED: "text-emerald-400 border-emerald-500/30",
  };
  return (
    <div className="space-y-4">
      <SectionHeader title="Physical Document Jobs" subtitle="Document handling · courier tracking · QR scan · GPS verification" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {["AWAITING_RECEIPT", "RECEIVED", "PRESENTED", "STAMPED", "COMPLETED"].map(s => {
          const count = jobs.filter(j => j.status === s).length;
          return (
            <Card key={s} className="p-3 text-center">
              <p className="text-2xl font-bold text-gold">{count}</p>
              <p className="text-[0.55rem] text-muted-foreground uppercase">{s.replace(/_/g, " ")}</p>
            </Card>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Active Jobs</h3>
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7"><Plus className="w-3 h-3 mr-1" />New Job</Button>
        </div>
        <div className="divide-y divide-border/40">
          {jobs.map(job => (
            <div key={job.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center"><PackageCheck className="w-4 h-4 text-gold" /></div>
                <div>
                  <p className="text-xs font-medium">{job.id} · {job.type}</p>
                  <p className="text-[0.6rem] text-muted-foreground">{job.ustn} · {job.location} · Assignee: {job.assignee}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[0.55rem] ${statusColors[job.status] || ""}`}>{job.status.replace(/_/g, " ")}</Badge>
                <Button size="sm" variant="outline" className="h-6 text-[0.6rem]" onClick={() => toast.info("QR scan triggered")}>Scan QR</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
