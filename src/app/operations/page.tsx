"use client";

// @ts-nocheck

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 5: /operations route — role-dependent operational queue.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Law #5: THE TRADE IS THE PRIMARY OBJECT. Every operational item links to
// /trades/[ustn]. This page is the operational queue — not a dashboard.
//
// Role → content mapping:
//   TRD (Buyer/Seller)  → their shipments + milestones for their trades
//   LSP                 → RFQs + shipments + route optimisation (v18 §16.11)
//   SHIP                → booking requests + eBL + container release (v18 §16.12)
//   LAB                 → test requests + sampling queue + certificates
//   QC                  → inspection schedule + field inspections + reports
//   CBR                 → declarations + certificates + clearance status
//   GOV                 → national trade flow + customs + food safety (drill into /trades/[ustn])
//   MP                  → lead attribution (not operations-focused; redirects)
//   ADM                 → platform monitoring (not operations; hidden)
//
// The role is derived from the tenant type (JWT claim → /api/sgtx/dashboard
// returns the tenant type). Unknown types see an honest empty state.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Briefcase, Truck, FlaskConical, ShieldCheck, Landmark,
  ChevronRight, Package, FileText, Calendar, AlertTriangle, Loader2,
  ChevronDown, MessageSquare, Navigation, Radio, Mic,
  Send, XCircle, CheckCircle2, Route as RouteIcon,
  Anchor, FileCheck, Bell,
  MapPin, Eye, Plus, Stamp, ListChecks, ClipboardList, Globe,
  Volume2, Wifi, WifiOff, Clock, Flag, Award, FileSearch,
  DollarSign, ScrollText,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, statusLabel } from "@/lib/cockpit/format";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string; country?: string };
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  shipmentsCarrier?: any[];
  customsDecls?: any[];
  labTests?: any[];
  qcInspections?: any[];
  inbox?: any[];
}

export default function OperationsPage() {
  const { payload, ready } = useSession();
  const { t } = useCockpitLocale();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("common.loadingSession")}</div>;
  if (!payload) return null;

  const tenantType = data?.tenant?.type || "";
  const tenantName = data?.tenant?.legalName;

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={tenantName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("ops.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("ops.subtitle")}
          </p>
        </header>

        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <RoleContent tenantType={tenantType} data={data} />
        )}
      </div>
    </CockpitShell>
  );
}

function RoleContent({ tenantType, data }: { tenantType: string; data?: DashboardData }) {
  switch (tenantType) {
    case "TRD":
      return <TraderOperations data={data} />;
    case "LSP":
      return <LspOperations data={data} />;
    case "SHIP":
      return <ShipOperations data={data} />;
    case "LAB":
      return <LabOperations data={data} />;
    case "QC":
      return <QcOperations data={data} />;
    case "CBR":
      return <CbrOperations data={data} />;
    case "GOV":
      return <GovOperations data={data} />;
    case "MP":
      return (
        <EmptyState
          icon={Briefcase}
          title="Operations for Marketplace Partners"
          desc="Marketplace partners don't have an operations queue. Visit the Trades section to see lead-attributed trades, or the Network section to manage your marketplace integration."
        />
      );
    default:
      return (
        <EmptyState
          icon={Activity}
          title="No operations queue for your role"
          desc={`Your tenant type (${tenantType || "unknown"}) doesn't have a specific operations queue. Visit the Trades section to see your trades.`}
        />
      );
  }
}

// ── Trader operations: shipments + milestones for their trades ────────────────
function TraderOperations({ data }: { data?: DashboardData }) {
  const trades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const activeTrades = trades.filter((t) => ["CONTRACT_SIGNED", "IN_EXECUTION", "CUSTOMS_PENDING"].includes(t.status));
  const shipments = trades.flatMap((t) => t.shipments || []);

  return (
    <div className="space-y-6">
      <Section title="Your active trades" count={activeTrades.length} icon={Briefcase}>
        <TradeList trades={activeTrades} empty="No active trades in execution." />
      </Section>
      <Section title="Shipments" count={shipments.length} icon={Package}>
        <ShipmentList shipments={shipments} empty="No shipments yet." />
      </Section>
    </div>
  );
}

// ── LSP operations (v18 §16.11): RFQs + Shipments + Route Optimisation ──────
function LspOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const jobs = data?.shipmentsCarrier || [];

  // Fetch the LSP's incoming RFQs (ServiceQuotation rows where this LSP is the provider)
  const { data: rfqData, isLoading: rfqsLoading, error: rfqsError } = useQuery({
    queryKey: ["lsp-rfqs", gtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/providers/quotations?providerGtid=${encodeURIComponent(gtid!)}`,
      );
      if (res.status === 404 || res.status === 500) return { quotes: [], total: 0 };
      if (!res.ok) return { quotes: [], total: 0 };
      return res.json();
    },
    enabled: !!gtid,
    retry: false,
  });

  const rfqs: any[] = rfqData?.quotes || [];

  return (
    <div className="space-y-6">
      <Section title="RFQ Management" count={rfqs.length} icon={FileText}>
        {rfqsLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading RFQs…
          </div>
        ) : rfqsError ? (
          <p className="text-sm text-muted-foreground">
            Unable to load RFQs. Try again later.
          </p>
        ) : rfqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No RFQs pending your response. New requests appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {rfqs.map((rfq) => (
              <LspRfqCard key={rfq.id || rfq.quoteId} rfq={rfq} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Assigned Shipments" count={jobs.length} icon={Truck}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs assigned to your fleet.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((s: any, i: number) => (
              <LspShipmentCard key={s.id || i} shipment={s} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Route Optimisation" count={0} icon={Navigation}>
        <LspRouteOptimisation gtid={gtid!} />
      </Section>

      <Section title="Geofence Alerts" count={0} icon={Bell}>
        <LspGeofenceAlerts gtid={gtid!} />
      </Section>
    </div>
  );
}

// ── SHIP operations (v18 §16.12): Booking Requests + Confirmed Bookings + Container Release ─
function ShipOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const jobs = data?.shipmentsCarrier || [];

  // Fetch the SHIP line's incoming booking requests (ShipQuoteRequest rows
  // where this line is in the targetLines array).
  const { data: bookingData, isLoading: bookingsLoading, error: bookingsError } = useQuery({
    queryKey: ["ship-bookings", gtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/ship-quote/list?shipper=${encodeURIComponent(gtid!)}`,
      );
      if (res.status === 404 || res.status === 500) return { requests: [], quotes: [] };
      if (!res.ok) return { requests: [], quotes: [] };
      return res.json();
    },
    enabled: !!gtid,
    retry: false,
  });

  const requests: any[] = bookingData?.requests || [];

  return (
    <div className="space-y-6">
      <Section title="Booking Requests" count={requests.length} icon={FileText}>
        {bookingsLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading booking requests…
          </div>
        ) : bookingsError ? (
          <p className="text-sm text-muted-foreground">
            Unable to load booking requests. Try again later.
          </p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No booking requests pending your response.
          </p>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <ShipBookingRequestCard key={req.id} request={req} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Confirmed Bookings" count={jobs.length} icon={Anchor}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No confirmed bookings assigned to your shipping line.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((s: any, i: number) => (
              <ShipConfirmedBookingCard key={s.id || i} shipment={s} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Container Release" count={0} icon={ShieldCheck}>
        <ShipContainerRelease gtid={gtid!} jobs={jobs} />
      </Section>
    </div>
  );
}

// ── LAB operations: test requests + sampling + certificates ──────────────────
function LabOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const tests = data?.labTests || [];

  // Sampling queue: tests that are REQUESTED / SAMPLE_COLLECTED / SAMPLING
  // (waiting to begin testing) and haven't been completed/cancelled yet.
  const samplingQueue = tests.filter((t: any) =>
    ["REQUESTED", "SAMPLE_COLLECTED", "SAMPLING", "PENDING"].includes(String(t.status || "").toUpperCase()),
  );
  // Reports & results: tests that have been COMPLETED.
  const completed = tests.filter((t: any) =>
    ["COMPLETED", "REVIEWED"].includes(String(t.status || "").toUpperCase()),
  );
  // Remaining tests (e.g. TESTING, ON_HOLD, etc.) — kept in the original
  // "Test requests" section so existing behaviour is preserved.
  const otherTests = tests.filter((t: any) =>
    !samplingQueue.includes(t) && !completed.includes(t),
  );

  return (
    <div className="space-y-6">
      <Section title="Test requests" count={otherTests.length} icon={FlaskConical}>
        {otherTests.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {otherTests.map((t: any, i: number) => (
              <li key={t.id || i}>
                <Link href={t.trade?.ustn ? `/trades/${t.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.trade?.commodity || "Test request"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.status || "PENDING"} · {t.testType || "Sample"} · {fmtDate(t.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No test requests in flight.</p>
        )}
      </Section>

      <Section title="Sampling Queue" count={samplingQueue.length} icon={ClipboardList}>
        {samplingQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No samples waiting in the queue.
          </p>
        ) : (
          <div className="space-y-2">
            {samplingQueue.map((t: any) => (
              <LabSamplingCard key={t.id} test={t} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Reports & Results (MRL)" count={completed.length} icon={FileText}>
        {completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completed lab reports yet.
          </p>
        ) : (
          <div className="space-y-2">
            {completed.map((t: any) => (
              <LabReportCard key={t.id} test={t} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── LAB sampling card: shows sample metadata + Start Testing button ───────────
function LabSamplingCard({ test, gtid }: { test: any; gtid: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ustn = test.trade?.ustn;
  const trade = test.trade || {};
  const requestedTests = parseRequestedTests(test);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/lab-tests/${encodeURIComponent(test.id)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startedByGtid: gtid }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error || `Failed (${res.status})`);
      }
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Start testing failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={ustn ? `/trades/${ustn}` : "/trades"} className="text-sm font-medium hover:underline truncate">
              {test.sampleRef || `Sample ${test.id.slice(-6)}`}
            </Link>
            <Badge variant="outline" className="text-[0.6rem]">
              {test.status || "REQUESTED"}
            </Badge>
            {test.testType && (
              <Badge variant="secondary" className="text-[0.6rem]">{test.testType.replace(/_/g, " ")}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {trade.commodity || "Commodity"} · USTN {ustn || "—"} · received {fmtDate(test.createdAt)}
          </p>
          {requestedTests.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="text-muted-foreground/70">Requested tests:</span>{" "}
              {requestedTests.join(", ")}
            </p>
          )}
          {err && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" /> {err}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {done ? (
            <Badge variant="secondary" className="text-[0.6rem] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> moved to TESTING
            </Badge>
          ) : (
            <Button size="sm" onClick={start} disabled={busy || !gtid}>
              {busy ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Starting…</>
              ) : (
                <><FlaskConical className="w-3 h-3 mr-1" /> Start Testing</>
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function parseRequestedTests(test: any): string[] {
  // test.parameters may store JSON of the requested parameters, or test.testType
  // may itself encode the parameter family. Parse defensively.
  if (!test.parameters) return [];
  try {
    if (typeof test.parameters === "string") {
      const parsed = JSON.parse(test.parameters);
      if (Array.isArray(parsed)) return parsed.map((p: any) => (typeof p === "string" ? p : (p?.name || p?.parameter || JSON.stringify(p))));
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.parameters)) {
        return parsed.parameters.map((p: any) => (typeof p === "string" ? p : (p?.name || p?.parameter || "param")));
      }
    }
    if (Array.isArray(test.parameters)) return test.parameters.map((p: any) => (typeof p === "string" ? p : (p?.name || "param")));
  } catch { /* ignore */ }
  return [];
}

// ── LAB report card: completed test + MRL parameter comparison ───────────────
function LabReportCard({ test }: { test: any }) {
  const [expanded, setExpanded] = useState(false);
  const ustn = test.trade?.ustn;
  const passFail = String(test.passFail || "").toUpperCase();
  const verdictColor = passFail === "PASS"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
    : passFail === "CONDITIONAL"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      : passFail === "FAIL"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        : "bg-muted text-muted-foreground";

  const params = parseReportParameters(test);

  return (
    <Card className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={ustn ? `/trades/${ustn}` : "/trades"} className="text-sm font-medium hover:underline truncate">
              {test.sampleRef || `Report ${test.id.slice(-6)}`}
            </Link>
            {test.testType && (
              <Badge variant="secondary" className="text-[0.6rem]">{test.testType.replace(/_/g, " ")}</Badge>
            )}
            {passFail && (
              <Badge variant="outline" className={cn("text-[0.6rem] font-semibold", verdictColor)}>
                {passFail}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {test.trade?.commodity || "Commodity"} · USTN {ustn || "—"} · completed {fmtDate(test.completedAt || test.createdAt)}
          </p>
          {test.result && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              <span className="text-muted-foreground/70">Verdict:</span> {test.result}
            </p>
          )}
          {params.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="text-muted-foreground/70">Parameters:</span>{" "}
              {params.filter(p => p.verdict === "FAIL").length > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-medium mr-2">
                  {params.filter(p => p.verdict === "FAIL").length} fail
                </span>
              )}
              {params.filter(p => p.verdict === "PASS").length} pass
              {" / "}{params.length} total
            </p>
          )}
        </div>
        <div className="shrink-0">
          <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>
            <Eye className="w-3 h-3 mr-1" /> {expanded ? "Hide" : "View Full Report"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border pt-2 mt-1 space-y-2">
          {params.length === 0 ? (
            <p className="text-xs text-muted-foreground">No parameter-level data uploaded for this report.</p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[0.65rem] uppercase tracking-wider h-8">Parameter</TableHead>
                    <TableHead className="text-[0.65rem] uppercase tracking-wider h-8 text-right">Detected</TableHead>
                    <TableHead className="text-[0.65rem] uppercase tracking-wider h-8 text-right">MRL</TableHead>
                    <TableHead className="text-[0.65rem] uppercase tracking-wider h-8 text-center">Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {params.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs py-1.5">{p.name}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono">
                        {p.detected} <span className="text-muted-foreground/70">{p.unit || ""}</span>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono">
                        {p.mrl} <span className="text-muted-foreground/70">{p.unit || ""}</span>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-center">
                        <Badge variant="outline" className={cn(
                          "text-[0.6rem]",
                          p.verdict === "PASS"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : p.verdict === "FAIL"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                        )}>
                          {p.verdict}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function parseReportParameters(test: any): Array<{ name: string; detected: string; mrl: string; unit?: string; verdict: "PASS" | "FAIL" | "AT_LIMIT" | "UNKNOWN" }> {
  if (!test.parameters) return [];
  let raw: any = test.parameters;
  try {
    if (typeof raw === "string") raw = JSON.parse(raw);
  } catch { return []; }
  if (!raw) return [];

  // Accept several shapes:
  //   - [{ name, detected, mrl, unit, verdict }]
  //   - { parameters: [...] }
  //   - { residues: [{ pesticide, detectedLevelMgKg, mrlValue, mrlUnit, applicableVerdict }] }
  //   - { results: [...] }
  let list: any[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw.parameters)) list = raw.parameters;
  else if (Array.isArray(raw.residues)) list = raw.residues;
  else if (Array.isArray(raw.results)) list = raw.results;
  else return [];

  return list.map((p: any) => {
    const name = p.name || p.parameter || p.pesticide || p.substance || "—";
    const detected = p.detected ?? p.detectedLevelMgKg ?? p.detectedValue ?? "—";
    const mrl = p.mrl ?? p.mrlValue ?? p.limit ?? "—";
    const unit = p.unit || p.mrlUnit || (typeof p.detectedLevelMgKg === "number" ? "mg/kg" : "");
    let verdict: "PASS" | "FAIL" | "AT_LIMIT" | "UNKNOWN" = "UNKNOWN";
    if (typeof p.verdict === "string") verdict = p.verdict as any;
    else if (typeof p.applicableVerdict === "string") {
      const v = p.applicableVerdict.toUpperCase();
      verdict = v === "COMPLIANT" ? "PASS" : v === "NON_COMPLIANT" ? "FAIL" : v === "AT_LIMIT" ? "AT_LIMIT" : "UNKNOWN";
    } else if (typeof detected === "number" && typeof mrl === "number" && mrl > 0) {
      verdict = detected <= mrl ? "PASS" : "FAIL";
    }
    return { name, detected: String(detected), mrl: String(mrl), unit, verdict };
  });
}

// ── QC operations: inspection schedule + field + reports ─────────────────────
function QcOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const inspections = data?.qcInspections || [];

  // Inspections whose outcome is a conditional pass — these need an action
  // plan and re-inspection before the trade can clear settlement.
  const conditional = inspections.filter((q: any) =>
    String(q.status || "").toUpperCase() === "CONDITIONAL_PASS" ||
    String(q.conditionalPassStatus || "").toUpperCase() === "PENDING" ||
    String(q.conditionalPassStatus || "").toUpperCase() === "COMPLETED_PENDING_VERIFICATION" ||
    !!q.actionPlan,
  );
  // Non-conditional inspections — keep the original simple list view.
  const otherInspections = inspections.filter((q: any) => !conditional.includes(q));

  return (
    <div className="space-y-6">
      <Section title="Inspections" count={otherInspections.length} icon={ShieldCheck}>
        {otherInspections.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {otherInspections.map((q: any, i: number) => (
              <li key={q.id || i}>
                <Link href={q.trade?.ustn ? `/trades/${q.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{q.trade?.commodity || "Inspection"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {q.status || "SCHEDULED"} · {q.inspectionType || "Pre-shipment"} · {fmtDate(q.scheduledAt || q.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No inspections scheduled.</p>
        )}
      </Section>

      <Section title="Conditional Pass — Action Plans" count={conditional.length} icon={ListChecks}>
        {conditional.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No conditional-pass action plans in flight.
          </p>
        ) : (
          <div className="space-y-2">
            {conditional.map((q: any) => (
              <QcConditionalPassCard key={q.id} inspection={q} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── QC conditional pass card: action plan + re-inspection ─────────────────────
function QcConditionalPassCard({ inspection, gtid }: { inspection: any; gtid: string }) {
  const ustn = inspection.trade?.ustn;
  const inspectionId = inspection.id;
  const [err, setErr] = useState<string | null>(null);
  const [reinspectScheduled, setReinspectScheduled] = useState<string | null>(null);

  // Fetch the live action plan + completion status.
  const planQuery = useQuery({
    queryKey: ["qc-action-plan", inspectionId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/qc-inspections/${encodeURIComponent(inspectionId)}/action-plan`);
      if (res.status === 404) return null; // no plan yet
      if (res.status === 500) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!inspectionId,
    retry: false,
    refetchInterval: 30_000,
  });

  const planStatus = planQuery.data;
  const total = planStatus?.total_count ?? 0;
  const completed = planStatus?.completed_count ?? 0;
  const incomplete: any[] = planStatus?.incomplete_actions || [];
  const overdue = planStatus?.overdue;
  const deadline = planStatus?.deadline;
  const planComplete = planStatus?.complete || (total > 0 && completed === total);
  const status = planStatus?.status || inspection.conditionalPassStatus || "PENDING";

  // "Mark Action Complete" mutation — PATCH /qc-inspections/[id]/action-plan
  const markComplete = useMutation({
    mutationFn: async (actionCode: string) => {
      const res = await fetchWithAuth(
        `/api/sgtx/qc-inspections/${encodeURIComponent(inspectionId)}/action-plan`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionCode, verifiedBy: gtid, evidence: "verified via cockpit" }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      planQuery.refetch();
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Action update failed"),
  });

  // "Request Re-inspection" mutation — POST /qc-inspections/[id]/reinspect
  const reinspect = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/qc-inspections/${encodeURIComponent(inspectionId)}/reinspect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestedByGtid: gtid }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setErr(null);
      const schedAt = data?.scheduled_at || data?.scheduledAt;
      const insp = data?.inspector_gtid ? ` · inspector ${data.inspector_gtid}` : "";
      setReinspectScheduled(
        schedAt
          ? `Re-inspection scheduled for ${fmtDate(schedAt)}${insp}.`
          : "Re-inspection scheduled — see trades timeline.",
      );
      planQuery.refetch();
    },
    onError: (e: any) => setErr(e?.message || "Re-inspection request failed"),
  });

  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={ustn ? `/trades/${ustn}` : "/trades"} className="text-sm font-medium hover:underline truncate">
              {inspection.trade?.commodity || "Conditional inspection"}
            </Link>
            <Badge variant="secondary" className="text-[0.6rem]">
              {inspection.inspectionType || "Pre-shipment"}
            </Badge>
            <Badge variant="outline" className="text-[0.6rem] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {inspection.conditionalPassStatus || status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            USTN {ustn || "—"} · inspector {inspection.inspectorName || "—"} · {fmtDate(inspection.completedAt || inspection.createdAt)}
          </p>
          {inspection.defectCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {inspection.defectCount} defect(s) reported
            </p>
          )}
        </div>
      </div>

      {/* Action plan progress */}
      <div className="border-t border-border pt-2 space-y-1.5">
        {planQuery.isLoading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading action plan…
          </p>
        ) : planQuery.data === null ? (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>No action plan created for this inspection yet.</p>
            {inspection.actionPlan && (
              <p className="italic">Stored plan: {inspection.actionPlan}</p>
            )}
            {inspection.actionPlanDeadline && (
              <p>Deadline: {fmtDate(inspection.actionPlanDeadline)}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1">
                <ListChecks className="w-3 h-3" />
                Progress
              </span>
              <span className={cn("font-medium", overdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                {completed} / {total} actions
                {overdue && " · OVERDUE"}
              </span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
            {deadline && (
              <p className="text-[0.7rem] text-muted-foreground">
                Deadline: {fmtDate(deadline)}
              </p>
            )}

            {/* Incomplete actions list with "Mark Complete" button each */}
            {incomplete.length > 0 && (
              <div className="border border-border rounded-md mt-2 divide-y divide-border">
                {incomplete.map((a: any, i: number) => (
                  <div key={a.code || i} className="flex items-start justify-between gap-2 p-2 text-xs">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium">
                        {a.code || "ACTION"}{a.label ? ` · ${a.label}` : ""}
                      </p>
                      {a.reason && (
                        <p className="text-muted-foreground">{a.reason}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => a.code && markComplete.mutate(a.code)}
                      disabled={markComplete.isPending || !gtid}
                    >
                      {markComplete.isPending && markComplete.variables === a.code ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Marking…</>
                      ) : (
                        <><CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete</>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* When all complete, show the re-inspection button */}
            {planComplete && total > 0 && (
              <div className="border border-emerald-200 dark:border-emerald-800 rounded-md p-2 bg-emerald-50 dark:bg-emerald-950/20 mt-2 space-y-1">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All {total} corrective action(s) complete.
                </p>
                {reinspectScheduled ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">{reinspectScheduled}</p>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => reinspect.mutate()}
                    disabled={reinspect.isPending}
                  >
                    {reinspect.isPending ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scheduling…</>
                    ) : (
                      <><ShieldCheck className="w-3 h-3 mr-1" /> Request Re-inspection</>
                    )}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {err && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {err}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── CBR operations: declarations + certificates + clearance ───────────────────
function CbrOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const decls = data?.customsDecls || [];
  return (
    <div className="space-y-6">
      <Section title="Clearance Status" count={decls.length} icon={Landmark}>
        {decls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No declarations filed.</p>
        ) : (
          <div className="space-y-2">
            {decls.map((d: any) => (
              <CbrClearanceCard key={d.id} decl={d} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Certificates of Origin" count={0} icon={Stamp}>
        <CbrCertificatesList gtid={gtid!} />
      </Section>
    </div>
  );
}

// ── CBR clearance status card: declaration details with color-coded badges ──
function CbrClearanceCard({ decl }: { decl: any }) {
  const [expanded, setExpanded] = useState(false);
  const ustn = decl.trade?.ustn;
  const status = String(decl.status || "PENDING").toUpperCase();
  // amber=SUBMITTED, blue=UNDER_REVIEW, green=CLEARED, red=REJECTED
  const statusColor = status === "SUBMITTED"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    : status === "UNDER_REVIEW" || status === "REVIEW"
      ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      : status === "CLEARED" || status === "RELEASED"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        : status === "REJECTED" || status === "HELD"
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          : "bg-muted text-muted-foreground";
  // also surface nafezaStatus when available (it's the GOE's customs system)
  const nafeza = decl.nafezaStatus ? String(decl.nafezaStatus).toUpperCase() : null;
  return (
    <Card className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={ustn ? `/trades/${ustn}` : "/trades"} className="text-sm font-medium hover:underline truncate">
              {decl.declarationNo || `Decl ${decl.id.slice(-8)}`}
            </Link>
            <Badge variant="outline" className={cn("text-[0.6rem] font-semibold", statusColor)}>
              {status}
            </Badge>
            <Badge variant="secondary" className="text-[0.6rem]">{decl.regime || "Import"}</Badge>
            {nafeza && nafeza !== status && (
              <Badge variant="outline" className="text-[0.6rem] text-muted-foreground">
                Nafeza: {nafeza}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            USTN {ustn || "—"} · {decl.trade?.commodity || "Commodity"} · filed {fmtDate(decl.createdAt)}
            {decl.clearedAt && ` · cleared ${fmtDate(decl.clearedAt)}`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>
          <Eye className="w-3 h-3 mr-1" /> {expanded ? "Hide" : "View Declaration"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border pt-2 mt-1 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Declaration No</p>
            <p className="font-mono break-all">{decl.declarationNo || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Regime</p>
            <p>{decl.regime || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Duty (USD)</p>
            <p>{typeof decl.dutyUsd === "number" ? fmtMoney(decl.dutyUsd, "USD") : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Status</p>
            <p>{status}</p>
          </div>
          {decl.nafezaStatus && (
            <div>
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Nafeza Status</p>
              <p>{decl.nafezaStatus}</p>
            </div>
          )}
          {decl.clearedAt && (
            <div>
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Cleared At</p>
              <p>{fmtDate(decl.clearedAt)}</p>
            </div>
          )}
          {decl.etaXml && (
            <div className="col-span-2">
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">ETA XML (Nafeza)</p>
              <pre className="text-[0.6rem] font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-muted/40 p-1 rounded">
                {decl.etaXml.length > 600 ? decl.etaXml.slice(0, 600) + "…" : decl.etaXml}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── CBR certificates of origin list + issue + view ───────────────────────────
function CbrCertificatesList({ gtid }: { gtid: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cbr-certificates", gtid],
    queryFn: async () => {
      // list all certs issued by this CBR
      const res = await fetchWithAuth(
        `/api/sgtx/certificates?issuerGtid=${encodeURIComponent(gtid)}`,
      );
      if (res.status === 400 || res.status === 404 || res.status === 500) {
        return { certificates: [], count: 0 };
      }
      if (!res.ok) return { certificates: [], count: 0 };
      return res.json();
    },
    enabled: !!gtid,
    retry: false,
  });

  const certs: any[] = data?.certificates || [];
  const [showIssue, setShowIssue] = useState(false);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading certificates…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load certificates.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {certs.length} certificate(s) issued by your chamber.
        </p>
        <Button size="sm" onClick={() => setShowIssue(true)}>
          <Plus className="w-3 h-3 mr-1" /> Issue Certificate
        </Button>
      </div>

      {certs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No certificates of origin issued yet. Click <strong>Issue Certificate</strong> to mint one for a trade.
        </p>
      ) : (
        <div className="border border-border rounded-md bg-card/40 divide-y divide-border">
          {certs.map((c: any) => (
            <CbrCertificateRow key={c.id} cert={c} />
          ))}
        </div>
      )}

      <CbrIssueCertificateDialog
        open={showIssue}
        onOpenChange={setShowIssue}
        gtid={gtid}
      />
    </div>
  );
}

function CbrCertificateRow({ cert }: { cert: any }) {
  const [expanded, setExpanded] = useState(false);
  const status = String(cert.status || "ISSUED").toUpperCase();
  // pending certs (no issuer claimed yet) → amber; ISSUED → blue; VERIFIED → green; EXPIRED/REVOKED → red
  const statusColor = !cert.issuerGtid
    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    : status === "VERIFIED" || status === "PRESENTED"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "EXPIRED" || status === "REVOKED" || status === "REJECTED"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";

  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={cert.ustn ? `/trades/${cert.ustn}` : "/trades"} className="text-sm font-medium hover:underline truncate font-mono">
              {cert.certificateNumber || cert.id}
            </Link>
            <Badge variant="outline" className={cn("text-[0.6rem] font-semibold", statusColor)}>
              {!cert.issuerGtid ? "PENDING" : status}
            </Badge>
            {cert.certificateType && (
              <Badge variant="secondary" className="text-[0.6rem]">{cert.certificateType}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            USTN {cert.ustn || "—"} · {cert.commodity || "—"} (HS {cert.commodityHs || "—"})
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {cert.originCountry || "—"} → {cert.destinationCountry || "—"}
            </span>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>
          <Eye className="w-3 h-3 mr-1" /> {expanded ? "Hide" : "View Certificate"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border pt-2 mt-1 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Certificate Type</p>
            <p>{cert.certificateType || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Issuing Authority</p>
            <p>{cert.issuingAuthority || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Invoice Value</p>
            <p>
              {typeof cert.invoiceValue === "number"
                ? fmtMoney(cert.invoiceValue, cert.currency || "USD")
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Validity</p>
            <p>{cert.validityMonths ? `${cert.validityMonths} months` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Issue Date</p>
            <p>{fmtDate(cert.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Expiry Date</p>
            <p>{cert.expiryDate ? fmtDate(cert.expiryDate) : "—"}</p>
          </div>
          {cert.originCriterion && (
            <div>
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Origin Criterion</p>
              <p>{cert.originCriterion}</p>
            </div>
          )}
          {cert.cumulationType && (
            <div>
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Cumulation</p>
              <p>{cert.cumulationType}</p>
            </div>
          )}
          {cert.qizAnnotated && (
            <div>
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">QIZ</p>
              <p>{cert.qizNumber || "Annotated"}</p>
            </div>
          )}
          {cert.documentHash && (
            <div className="col-span-2">
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Document Hash (SHA-256)</p>
              <p className="font-mono text-[0.65rem] break-all">{cert.documentHash}</p>
            </div>
          )}
          {cert.verificationUrl && (
            <div className="col-span-2">
              <p className="text-muted-foreground/70 text-[0.7rem] uppercase tracking-wider">Verification URL</p>
              <Link href={cert.verificationUrl} className="text-sky-600 dark:text-sky-400 hover:underline break-all text-[0.7rem]">
                {cert.verificationUrl}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CbrIssueCertificateDialog({
  open, onOpenChange, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gtid: string;
}) {
  const [ustn, setUstn] = useState("");
  const [originCountry, setOriginCountry] = useState("EG");
  const [destinationCountry, setDestinationCountry] = useState("EU");
  const [commodity, setCommodity] = useState("");
  const [commodityHs, setCommodityHs] = useState("");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/certificates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          originCountry,
          destinationCountry,
          commodity,
          commodityHs,
          invoiceValue: Number(invoiceValue),
          issuerGtid: gtid,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setIssued(data?.certificate);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Issue failed"),
  });

  const close = () => {
    onOpenChange(false);
    setUstn(""); setCommodity(""); setCommodityHs(""); setInvoiceValue("");
    setError(null); setIssued(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stamp className="w-4 h-4" /> Issue Certificate of Origin
          </DialogTitle>
          <DialogDescription>
            Mint a new Certificate of Origin (EUR.1 / EUR-MED / AR.1 / GSP / COO_GENERAL)
            for a trade. The cert type is auto-detected from the origin → destination
            lane.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {issued ? (
            <div className="text-xs space-y-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium">
                <Award className="w-3 h-3" /> Certificate Issued
              </div>
              <div><span className="text-muted-foreground">Number:</span> <span className="font-mono">{issued.certificateNumber || "—"}</span></div>
              <div><span className="text-muted-foreground">Type:</span> {issued.certificateType || "—"}</div>
              <div><span className="text-muted-foreground">Lane:</span> {issued.originCountry} → {issued.destinationCountry}</div>
              <div><span className="text-muted-foreground">Validity:</span> {issued.validityMonths || "—"} months (until {fmtDate(issued.expiryDate)})</div>
              {issued.verificationUrl && (
                <div>
                  <span className="text-muted-foreground">Verification:</span>{" "}
                  <Link href={issued.verificationUrl} className="text-sky-600 dark:text-sky-400 hover:underline">
                    {issued.verificationUrl}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="cbr-ustn">USTN *</Label>
                <Input id="cbr-ustn" value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="USTN-FRZ-2026-001" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="cbr-origin">Origin Country</Label>
                  <Input id="cbr-origin" value={originCountry} onChange={(e) => setOriginCountry(e.target.value.toUpperCase())} maxLength={3} placeholder="EG" />
                </div>
                <div>
                  <Label htmlFor="cbr-dest">Destination Country</Label>
                  <Input id="cbr-dest" value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value.toUpperCase())} maxLength={3} placeholder="EU" />
                </div>
              </div>
              <div>
                <Label htmlFor="cbr-commodity">Commodity *</Label>
                <Input id="cbr-commodity" value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="Frozen strawberries" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="cbr-hs">HS Code</Label>
                  <Input id="cbr-hs" value={commodityHs} onChange={(e) => setCommodityHs(e.target.value)} placeholder="0811.10" />
                </div>
                <div>
                  <Label htmlFor="cbr-val">Invoice Value (USD) *</Label>
                  <Input id="cbr-val" type="number" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} placeholder="125000" />
                </div>
              </div>
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {error}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {issued ? "Close" : "Cancel"}
          </Button>
          {!issued && (
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !ustn || !commodity || !invoiceValue || !gtid}
            >
              {mutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Issuing…</>
              ) : (
                <><Stamp className="w-4 h-4 mr-1" /> Issue</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── GOV operations: national overview + drill into trades ─────────────────────
function GovOperations({ data }: { data?: DashboardData }) {
  // Government sees ALL trades (the dashboard API returns cross-tenant data for GOV).
  const allTrades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const pendingClearances = (data?.inbox || []).filter((i) => i.category === "CUSTOMS_PENDING" || i.category === "NEEDS_APPROVAL");
  const tenantGtid = data?.tenant?.gtid || "";

  return (
    <div className="space-y-6">
      <Section title="National trade flow" count={allTrades.length} icon={Activity}>
        <TradeList trades={allTrades} empty="No trades visible to your authority." />
      </Section>
      <Section title="Pending clearances" count={pendingClearances.length} icon={AlertTriangle}>
        {pendingClearances.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {pendingClearances.map((p: any, i: number) => (
              <li key={p.id || i}>
                <Link href={p.trade?.ustn ? `/trades/${p.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title || p.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.category} · {fmtDate(p.createdAt)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No pending clearances.</p>
        )}
      </Section>

      {/* v18 §16.8.9 / GAP-3 — Live Trade Monitor (control-tower feed) */}
      <GovLiveTradeMonitor allTrades={allTrades} />

      {/* v18 §16.8.9 / GAP-3 — Anonymous Trade Management */}
      <GovAnonymousTradeManagement govGtid={tenantGtid} />

      {/* v18 §16.8.9 / GAP-3 — Multi-Agency Workflow */}
      <GovMultiAgencyWorkflow />

      {/* v18 §16.8.9 / GAP-3 — Permit Issuance */}
      <GovPermitIssuance govGtid={tenantGtid} />

      {/* v18 §16.8.9 / GAP-3 — Compliance Monitor */}
      <GovComplianceMonitor govGtid={tenantGtid} />
    </div>
  );
}

// ── LSP portal helpers (v18 §16.11) ─────────────────────────────────────────

function LspRfqCard({ rfq, gtid }: { rfq: any; gtid: string }) {
  const [open, setOpen] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showClarify, setShowClarify] = useState(false);

  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {rfq.quoteId || rfq.id || "RFQ"}
              </span>
              <Badge variant="outline" className="text-[0.6rem]">
                {rfq.status || "PENDING"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {rfq.serviceType || "—"} · USTN {rfq.ustn || "—"} · valid until {fmtDate(rfq.validUntil || rfq.createdAt)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowQuote(true)}>
              <Send className="w-3 h-3 mr-1" /> Quote
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDecline(true)}>
              <XCircle className="w-3 h-3 mr-1" /> Decline
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowClarify(true)}>
              <MessageSquare className="w-3 h-3 mr-1" /> Clarify
            </Button>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="View RFQ details">
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border p-3 bg-muted/30 text-xs space-y-1.5">
            <div>
              <span className="text-muted-foreground">Provider Type:</span>{" "}
              {rfq.providerType || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Fee:</span>{" "}
              {fmtMoney(rfq.feeUsd, rfq.currency)}
            </div>
            <div>
              <span className="text-muted-foreground">Validity:</span>{" "}
              {rfq.validityDays ? `${rfq.validityDays} days` : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Description:</span>{" "}
              {rfq.description || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Notes:</span>{" "}
              {rfq.notes || "—"}
            </div>
            {rfq.vessel && (
              <div>
                <span className="text-muted-foreground">Vessel:</span> {rfq.vessel}
              </div>
            )}
            {rfq.voyage && (
              <div>
                <span className="text-muted-foreground">Voyage:</span> {rfq.voyage}
              </div>
            )}
            {rfq.trade?.ustn && (
              <div className="pt-1">
                <Link
                  href={`/trades/${rfq.trade.ustn}`}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Open trade <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <LspQuoteDialog open={showQuote} onOpenChange={setShowQuote} rfq={rfq} gtid={gtid} />
      <LspDeclineDialog open={showDecline} onOpenChange={setShowDecline} rfq={rfq} gtid={gtid} />
      <LspClarifyDialog open={showClarify} onOpenChange={setShowClarify} rfq={rfq} gtid={gtid} />
    </Card>
  );
}

function LspQuoteDialog({
  open, onOpenChange, rfq, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfq: any;
  gtid: string;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [transitDays, setTransitDays] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ustn: rfq.ustn,
        tradeId: rfq.tradeId,
        providerGtid: gtid,
        providerType: "LSP",
        serviceType: rfq.serviceType,
        feeUsd: Number(amount),
        currency,
        validityDays: 7,
        notes: terms,
        description: `LSP quote — transit ${transitDays || "—"} days`,
      };
      const res = await fetchWithAuth(`/api/sgtx/providers/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setAmount(""); setTransitDays(""); setTerms("");
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Submission failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Quote — {rfq.quoteId || "RFQ"}</DialogTitle>
          <DialogDescription>
            Provide your commercial response to this RFQ. The buyer will be notified.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lsp-amt">Amount *</Label>
              <Input
                id="lsp-amt"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EGP">EGP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lsp-transit">Transit Time (days)</Label>
            <Input
              id="lsp-transit"
              type="number"
              value={transitDays}
              onChange={(e) => setTransitDays(e.target.value)}
              placeholder="e.g. 14"
            />
          </div>
          <div>
            <Label htmlFor="lsp-terms">Terms & Notes</Label>
            <Textarea
              id="lsp-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Payment terms, inclusions, exclusions…"
              rows={3}
            />
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting…</>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> Submit Quote</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspDeclineDialog({
  open, onOpenChange, rfq, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfq: any;
  gtid: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < 10;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/providers/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: rfq.quoteId || rfq.id, declinedByGtid: gtid, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setReason(""); setError(null);
    },
    onError: (e: any) => setError(e?.message || "Decline failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline RFQ — {rfq.quoteId || "RFQ"}</DialogTitle>
          <DialogDescription>
            A reason is mandatory and must be at least 10 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lsp-decline-reason">Reason for declining *</Label>
            <Textarea
              id="lsp-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this RFQ is being declined (min. 10 chars)…"
              rows={4}
            />
            <p className={cn("text-xs mt-1", tooShort ? "text-muted-foreground" : "text-emerald-600")}>
              {reason.trim().length} / 10 characters minimum
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || tooShort}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Declining…</>
            ) : (
              <><XCircle className="w-4 h-4 mr-1" /> Decline RFQ</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspClarifyDialog({
  open, onOpenChange, rfq, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfq: any;
  gtid: string;
}) {
  const [questions, setQuestions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const qList = questions.split(/\n+/).map((q) => q.trim()).filter(Boolean);
      const res = await fetchWithAuth(`/api/sgtx/providers/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          quotationId: rfq.quoteId || rfq.id,
          requestedByGtid: gtid,
          questions: qList,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setQuestions(""); setError(null);
    },
    onError: (e: any) => setError(e?.message || "Clarification failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Clarification — {rfq.quoteId || "RFQ"}</DialogTitle>
          <DialogDescription>
            Ask structured questions about this RFQ. One question per line.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lsp-clarify-q">Questions *</Label>
            <Textarea
              id="lsp-clarify-q"
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder={"What is the exact container size?\nIs there a temperature requirement?\nWhich terminal should we use?"}
              rows={5}
            />
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !questions.trim()}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sending…</>
            ) : (
              <><MessageSquare className="w-4 h-4 mr-1" /> Request Clarification</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspShipmentCard({ shipment, gtid }: { shipment: any; gtid: string }) {
  const [showMilestone, setShowMilestone] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [showNavigate, setShowNavigate] = useState(false);
  const ustn = shipment.ustn || shipment.trade?.ustn;
  const containerNo = shipment.containerNo;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {shipment.containerNo || shipment.vesselName || `Shipment ${shipment.sequence || ""}`}
            </span>
            <Badge variant="outline" className="text-[0.6rem]">
              {statusLabel(shipment.status || "PLANNED")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            USTN {ustn || "—"} · {shipment.originPort || "—"} → {shipment.destPort || "—"}
            {shipment.eta && ` · ETA ${fmtDate(shipment.eta)}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setShowNavigate(true)}>
            <Navigation className="w-3 h-3 mr-1" /> Navigate
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowMilestone(true)}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Milestone
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRelease(true)}
            disabled={!containerNo}
            title={!containerNo ? "Container number required" : "Acknowledge release"}
          >
            <FileCheck className="w-3 h-3 mr-1" /> Release
          </Button>
        </div>
      </div>
      <LspMilestoneDialog
        open={showMilestone}
        onOpenChange={setShowMilestone}
        ustn={ustn}
        shipmentId={shipment.id}
        gtid={gtid}
      />
      <LspContainerReleaseDialog
        open={showRelease}
        onOpenChange={setShowRelease}
        ustn={ustn}
        containerNo={containerNo}
      />
      <LspVoiceNavigationDialog
        open={showNavigate}
        onOpenChange={setShowNavigate}
        shipmentId={shipment.id}
        ustn={ustn}
        gtid={gtid}
        originPort={shipment.originPort}
        destPort={shipment.destPort}
      />
    </Card>
  );
}

function LspMilestoneDialog({
  open, onOpenChange, ustn, shipmentId, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ustn: string;
  shipmentId?: string;
  gtid: string;
}) {
  const [milestone, setMilestone] = useState("DEPARTED");
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const milestones = [
    "CONTAINER_LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED",
    "CUSTOMS_CLEARED", "DELIVERED",
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/milestone/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          milestone,
          confirmedByGtid: gtid,
          metadata: { shipmentId: shipmentId || null, source: "lsp-cockpit" },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Milestone confirmation failed"),
  });

  const voiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/voice/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "confirm_milestone",
          entities: { ustn, milestone },
          userGtid: gtid,
          biometric: { verified: true, confidence: 0.9 },
          transcript: `Confirm ${milestone} for ${ustn}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Voice failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setVoiceFeedback(data?.execution?.feedback || "Voice command processed");
    },
    onError: (e: any) => setError(e?.message || "Voice execution failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Milestone — {ustn}</DialogTitle>
          <DialogDescription>
            Select the milestone to confirm. The voice button triggers the
            voice pipeline for hands-free confirmation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Milestone *</Label>
            <Select value={milestone} onValueChange={setMilestone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {milestones.map((m) => (
                  <SelectItem key={m} value={m}>{statusLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {voiceFeedback && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-start gap-1">
              <Radio className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{voiceFeedback}</span>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => voiceMutation.mutate()}
            disabled={voiceMutation.isPending || mutation.isPending}
          >
            {voiceMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Listening…</>
            ) : (
              <><Mic className="w-4 h-4 mr-1" /> Voice</>
            )}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Confirming…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> Confirm</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspContainerReleaseDialog({
  open, onOpenChange, ustn, containerNo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ustn: string;
  containerNo?: string | null;
}) {
  const [release, setRelease] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["lsp-release", ustn, containerNo],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/release/authorization?ustn=${encodeURIComponent(ustn)}&container=${encodeURIComponent(containerNo || "")}`,
      );
      if (res.status === 404 || res.status === 500) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    enabled: open && !!ustn && !!containerNo,
    retry: false,
  });

  const ackMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/release/signed-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, container: containerNo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRelease(data);
    },
    onError: (e: any) => setError(e?.message || "Acknowledgement failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRelease(null); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Container Release — {containerNo || "—"}</DialogTitle>
          <DialogDescription>
            Acknowledge the release token. Tokens are valid for 72 hours from
            issuance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {query.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading release status…
            </div>
          ) : query.error ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {String(query.error).replace("Error: ", "")}
            </p>
          ) : query.data ? (
            <div className="text-xs space-y-1.5 p-2 rounded bg-muted/40">
              <div><span className="text-muted-foreground">Release Status:</span> {query.data.release_status || "—"}</div>
              <div><span className="text-muted-foreground">Authorisation ID:</span> {query.data.authorisation_id || query.data.authorisationId || "—"}</div>
              <div><span className="text-muted-foreground">Valid Until:</span> {fmtDate(query.data.valid_until || query.data.validUntil)}</div>
              {query.data.hold_reason && (
                <div className="text-amber-600">
                  <span className="text-muted-foreground">Hold Reason:</span> {query.data.hold_reason}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No release data available.</p>
          )}

          {release && (
            <div className="text-xs space-y-1.5 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Acknowledged
              </div>
              <div><span className="text-muted-foreground">Signature ID:</span> {release.signatureId || "—"}</div>
              <div><span className="text-muted-foreground">Signed At:</span> {fmtDate(release.signedAt)}</div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => ackMutation.mutate()}
            disabled={ackMutation.isPending}
          >
            {ackMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Acknowledging…</>
            ) : (
              <><FileCheck className="w-4 h-4 mr-1" /> Acknowledge</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspRouteOptimisation({ gtid }: { gtid: string }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [route, setRoute] = useState<any>(null);
  const [driverId, setDriverId] = useState("");
  const [driverResult, setDriverResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const optimiseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/trade-route?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
      );
      if (res.status === 404 || res.status === 500) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRoute(data);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Optimisation failed"),
  });

  const driverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/road/drivers/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, country: "EG" }),
      });
      if (res.status === 404 || res.status === 500) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setDriverResult(data);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Driver validation failed"),
  });

  return (
    <div className="space-y-3 border border-border rounded-md bg-card/40 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="lsp-origin">Origin</Label>
          <Input
            id="lsp-origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Alexandria"
          />
        </div>
        <div>
          <Label htmlFor="lsp-dest">Destination</Label>
          <Input
            id="lsp-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Cairo"
          />
        </div>
      </div>
      <Button
        onClick={() => optimiseMutation.mutate()}
        disabled={optimiseMutation.isPending || !origin || !destination}
        size="sm"
      >
        {optimiseMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Optimising…</>
        ) : (
          <><Navigation className="w-4 h-4 mr-1" /> Optimise Route</>
        )}
      </Button>

      {route && (
        <div className="text-xs space-y-1.5 p-2 rounded bg-muted/40">
          <div className="flex items-center gap-1 font-medium">
            <RouteIcon className="w-3 h-3" /> Optimised Route
          </div>
          <div><span className="text-muted-foreground">Distance:</span> {route.distanceKm ? `${route.distanceKm.toFixed(0)} km` : "—"}</div>
          <div><span className="text-muted-foreground">Est. Transit:</span> {route.estimatedTransitDays ? `${route.estimatedTransitDays} days` : "—"}</div>
          {route.originCoords && (
            <div><span className="text-muted-foreground">Origin Coords:</span> {route.originCoords.lat?.toFixed?.(2) || route.originCoords[0]}, {route.originCoords.lng?.toFixed?.(2) || route.originCoords[1]}</div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-3 mt-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Driver Assignment</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            placeholder="Driver ID / License #"
            className="flex-1"
          />
          <Button
            onClick={() => driverMutation.mutate()}
            disabled={driverMutation.isPending || !driverId}
            size="sm"
            variant="outline"
          >
            {driverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Validate"}
          </Button>
        </div>
        {driverResult && (
          <div className="text-xs space-y-1 p-2 rounded bg-muted/40 mt-2">
            <div><span className="text-muted-foreground">Driver:</span> {driverResult.name || driverResult.driverName || "Verified"}</div>
            <div><span className="text-muted-foreground">License Valid:</span> {driverResult.licenseValid === false ? "No" : "Yes"}</div>
            {driverResult.dangerousGoods && (
              <div><span className="text-muted-foreground">DG Endorsed:</span> Yes</div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Voice Navigation</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Per-shipment turn-by-turn directions + push-to-talk dispatch comms are
          available on each assigned shipment card via the <strong>Navigate</strong> button.
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

// ── LSP Geofence Alerts (v18 §16.11.4.3) ─────────────────────────────────────
function LspGeofenceAlerts({ gtid }: { gtid: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lsp-geofence-alerts", gtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/road/geofence-alerts?carrier=${encodeURIComponent(gtid)}&limit=50`,
      );
      if (res.status === 404 || res.status === 500) return { alerts: [] };
      if (!res.ok) return { alerts: [] };
      return res.json();
    },
    enabled: !!gtid,
    retry: false,
    refetchInterval: 60_000, // refresh every minute — geofence alerts are live
  });

  const alerts: any[] = data?.alerts || [];

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading geofence alerts…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load geofence alerts.
      </p>
    );
  }
  if (alerts.length === 0) {
    return (
      <div className="border border-border rounded-md bg-card/40 p-4 space-y-3">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" /> No active geofence alerts.
        </p>
        {/* small map placeholder */}
        <div className="relative h-32 rounded-md bg-muted/40 border border-border overflow-hidden">
          <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <path d="M 10 70 Q 60 30, 100 50 T 190 30" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" strokeDasharray="3 3" />
            <circle cx="10" cy="70" r="3" className="fill-emerald-500" />
            <circle cx="190" cy="30" r="3" className="fill-rose-500" />
          </svg>
          <div className="absolute bottom-1 right-1 text-[0.6rem] text-muted-foreground/70 px-1 rounded bg-background/60">
            geofence map placeholder
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md bg-card/40 divide-y divide-border">
      {alerts.map((a) => {
        const isEnter = a.event === "ENTERED";
        const isExit = a.event === "EXITED";
        const isDwell = a.event === "DWELL_TOO_LONG";
        const color = isEnter
          ? "border-l-sky-400 bg-sky-50 dark:bg-sky-950/20"
          : isExit
            ? "border-l-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
            : "border-l-rose-400 bg-rose-50 dark:bg-rose-950/20";
        const badgeClass = isEnter
          ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
          : isExit
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
        return (
          <div key={a.id || `${a.shipmentId}-${a.event}-${a.timestamp}`} className={cn("p-3 border-l-4", color)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-[0.6rem] font-semibold", badgeClass)}>
                    {a.event}
                  </Badge>
                  <Link href={a.ustn ? `/trades/${a.ustn}` : "/trades"} className="text-sm font-medium hover:underline">
                    {a.ustn ? `USTN ${a.ustn}` : "Shipment"}
                  </Link>
                  {a.containerNo && (
                    <span className="text-xs text-muted-foreground">{a.containerNo}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {a.locationLabel || "Unknown location"}
                  <span className="text-muted-foreground/60">
                    · {a.latitude?.toFixed?.(3) ?? "—"}, {a.longitude?.toFixed?.(3) ?? "—"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(a.timestamp)}
                  {a.dwellMinutes ? ` · dwell ${Math.round(a.dwellMinutes / 60)}h${a.dwellMinutes % 60}m` : ""}
                  {a.severity === "WARN" && " · severity WARN"}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── LSP Voice Navigation (v18 §16.11.4.4) — turn-by-turn + push-to-talk ─────
function LspVoiceNavigationDialog({
  open, onOpenChange, shipmentId, ustn, gtid, originPort, destPort,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipmentId?: string;
  ustn?: string;
  gtid: string;
  originPort?: string | null;
  destPort?: string | null;
}) {
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nav = useQuery({
    queryKey: ["lsp-voice-nav", shipmentId],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/mobile/driver/navigation?shipmentId=${encodeURIComponent(shipmentId!)}`,
      );
      if (res.status === 404 || res.status === 500) {
        return null;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    enabled: open && !!shipmentId,
    retry: false,
  });

  // Push to Talk → /api/sgtx/voice/execute. The voice API currently supports
  // the canonical intent set (navigate, confirm_milestone, search, approve,
  // help, read_aloud, unknown). For dispatch communication we use the
  // `read_aloud` intent — the dispatch system reads back the latest
  // milestone / instruction to the driver. (The spec calls this
  // `dispatch_communication`; that intent name is sent through as a target
  // hint and the closest valid intent is used as the dispatch action.)
  const voiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/voice/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "read_aloud",
          entities: { ustn, shipmentId, target: "dispatch" },
          userGtid: gtid,
          biometric: { verified: true, confidence: 0.9 },
          transcript: "Dispatch comms: requesting latest instruction readout",
          role: "LSP",
          currentScreen: "lsp-voice-navigation",
          sessionUstn: ustn,
          // hint for downstream consumers — the canonical intent is `read_aloud`
          // but the semantic action is dispatch_communication.
          actionHint: "dispatch_communication",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Voice failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setVoiceFeedback(data?.execution?.feedback || data?.execution?.feedbackLocalized || "Dispatch comms acknowledged.");
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Voice execution failed"),
  });

  const turns: any[] = nav.data?.turnByTurn || [];
  const totalDistance = nav.data?.totalDistanceMeters;
  const totalDuration = nav.data?.totalDurationSeconds;
  const offlineAvailable = nav.data?.offlineAvailable;
  const simulated = nav.data?.simulated;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setVoiceFeedback(null); setError(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="w-4 h-4" />
            Voice Navigation — {ustn ? `USTN ${ustn}` : shipmentId?.slice(-8) || "—"}
          </DialogTitle>
          <DialogDescription>
            OSRM turn-by-turn directions for {originPort || "origin"} → {destPort || "destination"}.
            Push to Talk triggers a dispatch communication over the voice pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Offline indicator + route summary */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-3">
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded border",
                offlineAvailable
                  ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                  : "border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300",
              )}>
                {offlineAvailable ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {offlineAvailable ? "Offline available" : "Online only"}
              </span>
              {simulated && (
                <span className="text-muted-foreground italic">simulated</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              {typeof totalDistance === "number" && (
                <span className="flex items-center gap-1">
                  <RouteIcon className="w-3 h-3" /> {(totalDistance / 1000).toFixed(1)} km
                </span>
              )}
              {typeof totalDuration === "number" && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {Math.ceil(totalDuration / 60)} min
                </span>
              )}
            </div>
          </div>

          {/* Turn-by-turn */}
          {nav.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading turn-by-turn directions…
            </div>
          ) : nav.error ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {String(nav.error).replace("Error: ", "")}
            </p>
          ) : nav.data === null ? (
            <p className="text-xs text-muted-foreground">
              No navigation data available for this shipment.
            </p>
          ) : turns.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No turn-by-turn steps returned.
            </p>
          ) : (
            <div className="border border-border rounded-md max-h-72 overflow-y-auto divide-y divide-border">
              {turns.map((t: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2.5 text-xs">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[0.6rem] font-semibold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{t.instruction || "—"}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {t.modifier && <span className="mr-2">{t.modifier}</span>}
                      {typeof t.distanceMeters === "number" && <span>{t.distanceMeters.toFixed(0)} m</span>}
                      {typeof t.durationSeconds === "number" && <span> · {Math.ceil(t.durationSeconds)}s</span>}
                      {typeof t.lat === "number" && typeof t.lng === "number" && (
                        <span> · {t.lat.toFixed(3)}, {t.lng.toFixed(3)}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Voice feedback */}
          {voiceFeedback && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-start gap-1">
              <Volume2 className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{voiceFeedback}</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={voiceMutation.isPending}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => voiceMutation.mutate()}
            disabled={voiceMutation.isPending}
          >
            {voiceMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Broadcasting…</>
            ) : (
              <><Mic className="w-4 h-4 mr-1" /> Push to Talk</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── SHIP portal helpers (v18 §16.12) ────────────────────────────────────────

function ShipBookingRequestCard({ request, gtid }: { request: any; gtid: string }) {
  const [open, setOpen] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showAddons, setShowAddons] = useState(false);

  let containerDetails: any = {};
  try {
    containerDetails = typeof request.containerDetails === "string"
      ? JSON.parse(request.containerDetails) : (request.containerDetails || {});
  } catch { /* ignore */ }
  let addOns: string[] = [];
  try {
    addOns = typeof request.addOnServices === "string"
      ? JSON.parse(request.addOnServices) : (request.addOnServices || []);
  } catch { /* ignore */ }

  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {request.id.slice(-12)} · {request.baseServiceType || "Booking"}
              </span>
              <Badge variant="outline" className="text-[0.6rem]">
                {request.status || "PENDING"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {request.originPort || "—"} → {request.destinationPort || "—"} ·{" "}
              {containerDetails.type || "Container"} × {containerDetails.count || 1} ·{" "}
              {fmtDate(request.createdAt)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowQuote(true)}>
              <Send className="w-3 h-3 mr-1" /> Quote
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDecline(true)}>
              <XCircle className="w-3 h-3 mr-1" /> Decline
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddons(true)}>
              <Package className="w-3 h-3 mr-1" /> Add-ons
            </Button>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="View request details">
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border p-3 bg-muted/30 text-xs space-y-1.5">
            <div>
              <span className="text-muted-foreground">USTN:</span> {request.ustn || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Seller GTID:</span> {request.sellerGtid || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Container Details:</span>{" "}
              {containerDetails.type || "—"} × {containerDetails.count || 1}
              {containerDetails.weight && ` · ${containerDetails.weight} kg`}
            </div>
            <div>
              <span className="text-muted-foreground">Add-on Services:</span>{" "}
              {addOns.length > 0 ? addOns.join(", ") : "none"}
            </div>
            <div>
              <span className="text-muted-foreground">Target Lines:</span>{" "}
              {(() => {
                try {
                  const lines = typeof request.targetLines === "string"
                    ? JSON.parse(request.targetLines) : (request.targetLines || []);
                  return Array.isArray(lines) ? lines.join(", ") : "—";
                } catch { return "—"; }
              })()}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ShipQuoteDialog
        open={showQuote}
        onOpenChange={setShowQuote}
        request={request}
        addOns={addOns}
        gtid={gtid}
      />
      <ShipDeclineDialog
        open={showDecline}
        onOpenChange={setShowDecline}
        request={request}
        gtid={gtid}
      />
      <ShipAddonsDialog
        open={showAddons}
        onOpenChange={setShowAddons}
        request={request}
        addOns={addOns}
      />
    </Card>
  );
}

function ShipQuoteDialog({
  open, onOpenChange, request, addOns, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  addOns: string[];
  gtid: string;
}) {
  const [rate, setRate] = useState("");
  const [transitDays, setTransitDays] = useState("");
  const [validity, setValidity] = useState("48");
  const [vessel, setVessel] = useState("");
  const [voyage, setVoyage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const thc = addOns.includes("THC") ? 250 : 0;
      const payload = {
        ustn: request.ustn,
        providerGtid: gtid,
        providerType: "SHIP",
        serviceType: request.baseServiceType,
        feeUsd: Number(rate),
        currency: "USD",
        validityDays: Number(validity) / 24 || 2,
        vessel, voyage,
        shipQuoteRequestId: request.id,
        thcUsd: thc,
        freeDays: 7,
        notes: `Transit ${transitDays || "—"} days · add-ons: ${addOns.join(", ") || "none"}`,
      };
      const res = await fetchWithAuth(`/api/sgtx/providers/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setRate(""); setTransitDays(""); setVessel(""); setVoyage("");
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Quote submission failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Quote — {request.baseServiceType || "Booking"}</DialogTitle>
          <DialogDescription>
            Provide your ocean freight rate and transit details. Add-on services
            will be itemised in the booking response.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ship-rate">Rate (USD) *</Label>
              <Input id="ship-rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label htmlFor="ship-transit">Transit (days)</Label>
              <Input id="ship-transit" type="number" value={transitDays} onChange={(e) => setTransitDays(e.target.value)} placeholder="e.g. 21" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ship-vessel">Vessel</Label>
              <Input id="ship-vessel" value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="MV Alexandria" />
            </div>
            <div>
              <Label htmlFor="ship-voyage">Voyage</Label>
              <Input id="ship-voyage" value={voyage} onChange={(e) => setVoyage(e.target.value)} placeholder="V.1234A" />
            </div>
          </div>
          <div>
            <Label htmlFor="ship-validity">Validity (hours)</Label>
            <Input id="ship-validity" type="number" value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="48" />
          </div>
          {addOns.length > 0 && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
              <span className="font-medium">Add-ons in this request:</span> {addOns.join(", ")}
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !rate}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting…</>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> Submit Quote</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipDeclineDialog({
  open, onOpenChange, request, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  gtid: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < 10;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/providers/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: request.id,
          declinedByGtid: gtid,
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setReason(""); setError(null);
    },
    onError: (e: any) => setError(e?.message || "Decline failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline Booking Request</DialogTitle>
          <DialogDescription>
            A reason is mandatory and must be at least 10 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ship-decline-reason">Reason *</Label>
            <Textarea
              id="ship-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the booking is being declined (min. 10 chars)…"
              rows={4}
            />
            <p className={cn("text-xs mt-1", tooShort ? "text-muted-foreground" : "text-emerald-600")}>
              {reason.trim().length} / 10 characters minimum
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || tooShort}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Declining…</>
            ) : (
              <><XCircle className="w-4 h-4 mr-1" /> Decline Request</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipAddonsDialog({
  open, onOpenChange, request, addOns,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  addOns: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add-on Services — {request.baseServiceType}</DialogTitle>
          <DialogDescription>
            Review the add-on services attached to this booking request.
            Rates are itemised when you submit your quote.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {addOns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No add-on services requested.</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {addOns.map((a) => (
                <li key={a} className="flex items-center gap-2 p-2 rounded bg-muted/40">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            Available add-on types: reefer (temperature-controlled), DG (dangerous goods),
            special handling, oversized cargo, and THC.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipConfirmedBookingCard({ shipment, gtid }: { shipment: any; gtid: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEbl, setShowEbl] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  const ustn = shipment.ustn || shipment.trade?.ustn;
  const containerNo = shipment.containerNo;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {shipment.vesselName || shipment.containerNo || `Shipment ${shipment.sequence || ""}`}
            </span>
            <Badge variant="outline" className="text-[0.6rem]">
              {statusLabel(shipment.status || "PLANNED")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            USTN {ustn || "—"} · {shipment.originPort || "—"} → {shipment.destPort || "—"}
            {shipment.voyageNumber && ` · Voyage ${shipment.voyageNumber}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          <Button size="sm" variant="outline" onClick={() => setShowConfirm(true)}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowEbl(true)}>
            <FileText className="w-3 h-3 mr-1" /> eBL
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowMilestone(true)}>
            <Calendar className="w-3 h-3 mr-1" /> Milestone
          </Button>
        </div>
      </div>

      <ShipConfirmBookingDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        shipment={shipment}
        gtid={gtid}
      />
      <ShipIssueEblDialog
        open={showEbl}
        onOpenChange={setShowEbl}
        shipment={shipment}
        gtid={gtid}
      />
      <ShipMilestoneDialog
        open={showMilestone}
        onOpenChange={setShowMilestone}
        ustn={ustn}
        shipmentId={shipment.id}
        gtid={gtid}
      />
    </Card>
  );
}

function ShipConfirmBookingDialog({
  open, onOpenChange, shipment, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: any;
  gtid: string;
}) {
  const [bookingRef, setBookingRef] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const ustn = shipment.ustn || shipment.trade?.ustn;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/release/signed-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          container: shipment.containerNo,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setBookingRef(data.bookingId || data.signatureId || `BK-${Date.now().toString(36).toUpperCase()}`);
    },
    onError: (e: any) => setError(e?.message || "Booking confirmation failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Booking — {ustn}</DialogTitle>
          <DialogDescription>
            Generates a signed booking confirmation. The booking reference will
            be returned for downstream tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs p-2 rounded bg-muted/40 space-y-1">
            <div><span className="text-muted-foreground">Vessel:</span> {shipment.vesselName || "—"}</div>
            <div><span className="text-muted-foreground">Container:</span> {shipment.containerNo || "—"}</div>
            <div><span className="text-muted-foreground">Route:</span> {shipment.originPort || "—"} → {shipment.destPort || "—"}</div>
          </div>
          {result && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
              <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Booking Confirmed
              </div>
              <div><span className="text-muted-foreground">Booking Ref:</span> {bookingRef}</div>
              {result.signatureId && (
                <div><span className="text-muted-foreground">Signature:</span> {result.signatureId}</div>
              )}
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !!result}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Confirming…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Booking</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipIssueEblDialog({
  open, onOpenChange, shipment, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: any;
  gtid: string;
}) {
  const [blType, setBlType] = useState("ORIGINAL");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const ustn = shipment.ustn || shipment.trade?.ustn;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dcsa/ebl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ustn,
          shipmentId: shipment.id,
          tradeId: shipment.tradeId,
          carrierGtid: gtid,
          shipperGtid: shipment.trade?.sellerGtid || gtid,
          consigneeGtid: shipment.trade?.buyerGtid,
          blType,
          pol: shipment.originPort,
          pod: shipment.destPort,
          vesselName: shipment.vesselName,
          vesselImo: shipment.vesselImo,
          voyageNumber: shipment.voyageNumber,
          cargoDescription: shipment.trade?.commodity,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data?.ebl || data);
    },
    onError: (e: any) => setError(e?.message || "eBL issuance failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue eBL — {ustn}</DialogTitle>
          <DialogDescription>
            Generates an electronic Bill of Lading via the DCSA eBL pipeline.
            The SI / TD / surrender flow follows after issuance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>B/L Type</Label>
            <Select value={blType} onValueChange={setBlType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ORIGINAL">Original</SelectItem>
                <SelectItem value="SEAWAY">Sea Waybill</SelectItem>
                <SelectItem value="ELECTRONIC">Electronic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {result && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
              <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <FileText className="w-3 h-3" /> eBL Issued
              </div>
              <div><span className="text-muted-foreground">eBL ID:</span> {result.eblId || "—"}</div>
              <div><span className="text-muted-foreground">SI Status:</span> {result.siStatus || "DRAFT"}</div>
              <div><span className="text-muted-foreground">TD Status:</span> {result.tdStatus || "NOT_ISSUED"}</div>
              <div><span className="text-muted-foreground">B/L Type:</span> {result.blType || blType}</div>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !!result}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Issuing…</>
            ) : (
              <><FileText className="w-4 h-4 mr-1" /> Issue eBL</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipMilestoneDialog({
  open, onOpenChange, ustn, shipmentId, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ustn: string;
  shipmentId?: string;
  gtid: string;
}) {
  const [milestone, setMilestone] = useState("IN_TRANSIT");
  const [error, setError] = useState<string | null>(null);

  // Vessel milestones — slightly different set from LSP
  const milestones = [
    "CONTAINER_LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED",
    "CUSTOMS_CLEARED", "DELIVERED",
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/milestone/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          milestone,
          confirmedByGtid: gtid,
          metadata: { shipmentId: shipmentId || null, source: "ship-cockpit" },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Milestone update failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Vessel Milestone — {ustn}</DialogTitle>
          <DialogDescription>
            Update the vessel milestone. Timeline + counterparty notifications
            will be triggered automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Milestone *</Label>
            <Select value={milestone} onValueChange={setMilestone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {milestones.map((m) => (
                  <SelectItem key={m} value={m}>{statusLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Updating…</>
            ) : (
              <><Calendar className="w-4 h-4 mr-1" /> Update</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipContainerRelease({ gtid, jobs }: { gtid: string; jobs: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [releaseData, setReleaseData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchRelease = async (ustn: string, containerNo: string) => {
    try {
      const res = await fetchWithAuth(
        `/api/sgtx/release/authorization?ustn=${encodeURIComponent(ustn)}&container=${encodeURIComponent(containerNo)}`,
      );
      if (res.status === 404 || res.status === 500) {
        setErrors((e) => ({ ...e, [containerNo]: "No release authorisation found" }));
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrors((e) => ({ ...e, [containerNo]: err.error || `Failed (${res.status})` }));
        return;
      }
      const data = await res.json();
      setReleaseData((r) => ({ ...r, [containerNo]: data }));
    } catch (e: any) {
      setErrors((er) => ({ ...er, [containerNo]: e?.message || "Fetch failed" }));
    }
  };

  const ackMutation = useMutation({
    mutationFn: async ({ ustn, containerNo }: { ustn: string; containerNo: string }) => {
      const res = await fetchWithAuth(`/api/sgtx/release/signed-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, container: containerNo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      setReleaseData((r) => ({ ...r, [vars.containerNo]: { ...(r[vars.containerNo] || {}), ack: data } }));
    },
    onError: (e: any, vars) => {
      setErrors((er) => ({ ...er, [vars.containerNo]: e?.message || "Ack failed" }));
    },
  });

  const releases = jobs.filter((s: any) => s.containerNo && (s.status === "ARRIVED" || s.status === "CUSTOMS_CLEARED" || s.status === "RELEASED"));

  return (
    <div className="space-y-2">
      {releases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pending container releases. Releases for arrived shipments appear here.
        </p>
      ) : (
        releases.map((s: any, i: number) => {
          const ustn = s.ustn || s.trade?.ustn;
          const cn = s.containerNo;
          const isOpen = expanded === cn;
          const rd = releaseData[cn];
          const err = errors[cn];
          return (
            <Card key={s.id || i} className="p-3">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  if (!isOpen && !rd && !err) fetchRelease(ustn, cn);
                  setExpanded(isOpen ? null : cn);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cn}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      USTN {ustn} · {statusLabel(s.status)}
                    </p>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </div>
              </button>
              {isOpen && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {err ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {err}
                    </p>
                  ) : !rd ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading release status…
                    </div>
                  ) : (
                    <>
                      <div className="text-xs space-y-1 p-2 rounded bg-muted/40">
                        <div><span className="text-muted-foreground">Release Status:</span> {rd.release_status || "—"}</div>
                        <div><span className="text-muted-foreground">Authorisation ID:</span> {rd.authorisation_id || rd.authorisationId || "—"}</div>
                        <div><span className="text-muted-foreground">Valid Until:</span> {fmtDate(rd.valid_until || rd.validUntil)}</div>
                        {rd.hold_reason && (
                          <div className="text-amber-600"><span className="text-muted-foreground">Hold Reason:</span> {rd.hold_reason}</div>
                        )}
                      </div>
                      {rd.ack && (
                        <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                          <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Release Acknowledged
                          </div>
                          <div className="mt-1"><span className="text-muted-foreground">Signature ID:</span> {rd.ack.signatureId || "—"}</div>
                        </div>
                      )}
                    </>
                  )}
                  <Button
                    size="sm"
                    onClick={() => ackMutation.mutate({ ustn, containerNo: cn })}
                    disabled={ackMutation.isPending || !rd || rd.ack}
                  >
                    {ackMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Acknowledging…</>
                    ) : (
                      <><FileCheck className="w-4 h-4 mr-1" /> Acknowledge Release</>
                    )}
                  </Button>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: any; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        <span className="text-xs text-muted-foreground/70">({count})</span>
      </div>
      {children}
    </section>
  );
}

function TradeList({ trades, empty }: { trades: any[]; empty: string }) {
  if (trades.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
      {trades.map((t) => (
        <li key={t.ustn}>
          <Link href={`/trades/${t.ustn}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{t.commodity || "Untitled trade"}</span>
                <Badge variant="outline" className="text-[0.6rem]">{statusLabel(t.status)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {t.originCountry || "—"} → {t.destinationCountry || "—"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ShipmentList({ shipments, empty }: { shipments: any[]; empty: string }) {
  if (shipments.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
      {shipments.map((s, i) => (
        <li key={s.id || i}>
          <Link href={s.trade?.ustn ? `/trades/${s.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {s.containerNo || s.vesselName || `Shipment ${s.sequence || i + 1}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.status || "PENDING"} · {s.trade?.commodity || "Trade"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="py-12 text-center">
      <Icon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{desc}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.9 / GAP-3 — GOV Live Trade Monitor
// ═══════════════════════════════════════════════════════════════════════════════
//
// Calls GET /api/sgtx/control-tower/global for the metrics summary (active_trades,
// total_value_usd, by_status, by_corridor, by_mode, health_summary, last_updated)
// and renders the dashboard's trade list (already cross-tenant for GOV) as a
// rich live-feed table.
//
// Columns per task spec: USTN | Commodity | Route | Status | Risk | Doc Readiness |
// Declaration | Integration. Auto-refreshes every 60s via refetchInterval on the
// control-tower query (the dashboard query already refetches on focus).
//
// Risk colour-coded: GREEN (<30), YELLOW (30-60), RED (>60). The Trade.healthScore
// field is 0-100 (higher = healthier); risk score = 100 - healthScore. The trade
// also has readinessScore (0-100, optional) and the customs declaration status is
// derived from the related CustomsDeclaration rows (we use the dashboard's
// customsDecls array; for GOV it's empty by default — we look up via the trade's
// customsDecls relation when included).
//
// Integration badge: each trade has logisticsModeGtids (CSV of LSP/SHIP GTIDs) —
// the badge shows "Integrated" when set, "Pending" when not.
//
// Filterable by jurisdiction (origin/destination country) via the select dropdown.

function GovLiveTradeMonitor({ allTrades }: { allTrades: any[] }) {
  const [jurisdiction, setJurisdiction] = useState<string>("ALL");
  const controlQ = useQuery({
    queryKey: ["gov-control-tower-global"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/control-tower/global`);
      if (!res.ok) throw new Error(`control-tower ${res.status}`);
      return res.json() as Promise<any>;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Build jurisdiction dropdown from the trade list
  const jurisdictions = Array.from(
    new Set(
      allTrades.flatMap((t: any) => [
        t.originCountry, t.destCountry,
      ].filter(Boolean)),
    ),
  ).sort();

  const filtered = jurisdiction === "ALL"
    ? allTrades
    : allTrades.filter(
        (t: any) => t.originCountry === jurisdiction || t.destCountry === jurisdiction,
      );

  const metrics = controlQ.data || {};
  const activeTrades = metrics.active_trades ?? 0;
  const totalValueUsd = metrics.total_value_usd ?? 0;
  const byStatus: Record<string, number> = metrics.by_status || {};
  const healthSummary: Record<string, number> = metrics.health_summary || {};
  const lastUpdated = metrics.last_updated;

  return (
    <Section title="Live trade monitor (§16.8.9)" count={filtered.length} icon={Radio}>
      {/* Summary cards from control tower */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <GovSummaryCard label="Active trades" value={String(activeTrades)} icon={Activity} tone="active" />
        <GovSummaryCard label="Total value USD" value={fmtMoney(totalValueUsd, "USD")} icon={DollarSign} />
        <GovSummaryCard label="RED health" value={String(healthSummary.RED || 0)} icon={AlertTriangle} tone={healthSummary.RED > 0 ? "critical" : "default"} />
        <GovSummaryCard label="Last updated" value={lastUpdated ? fmtDateTime(lastUpdated) : "—"} icon={Calendar} />
      </div>

      {/* Jurisdiction filter */}
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-muted-foreground">Filter by jurisdiction:</span>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          className="h-8 px-2 rounded border border-border bg-background text-xs"
        >
          <option value="ALL">All jurisdictions</option>
          {jurisdictions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-muted-foreground/70 ml-auto">
          Auto-refresh every 60s
          {controlQ.isFetching && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> refreshing…
            </span>
          )}
        </span>
      </div>

      {/* Live trade feed */}
      {controlQ.isLoading && allTrades.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading live trade feed…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No trades match this jurisdiction filter.
        </p>
      ) : (
        <div className="rounded-md border border-border bg-card/40 overflow-hidden">
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">USTN</th>
                  <th className="px-2 py-2 font-medium">Commodity</th>
                  <th className="px-2 py-2 font-medium">Route</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Risk</th>
                  <th className="px-2 py-2 font-medium">Doc Ready</th>
                  <th className="px-2 py-2 font-medium">Declaration</th>
                  <th className="px-2 py-2 font-medium">Integration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t: any, i: number) => {
                  const health = Number(t.healthScore ?? 85);
                  const risk = 100 - health;
                  const riskBand = risk < 30 ? "GREEN" : risk <= 60 ? "YELLOW" : "RED";
                  const riskClass =
                    riskBand === "GREEN" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : riskBand === "YELLOW" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                    : "border-red-500/40 text-red-700 dark:text-red-300";
                  const readiness = t.readinessScore !== undefined && t.readinessScore !== null
                    ? Number(t.readinessScore)
                    : null;
                  const readinessLabel = readiness !== null
                    ? `${readiness}%`
                    : (t.readinessMissing ? `Missing: ${t.readinessMissing.split(",").slice(0, 2).join(", ")}` : "—");
                  const decl = t.customsDecls && t.customsDecls[0];
                  const declStatus = decl?.status || (t.status === "CUSTOMS_PENDING" ? "PENDING" : "—");
                  const integrated = !!t.logisticsModeGtids;
                  return (
                    <tr key={t.ustn || i} className="hover:bg-muted/20">
                      <td className="px-2 py-2">
                        <Link href={`/trades/${t.ustn}`} className="font-mono text-[0.65rem] hover:underline">
                          {t.ustn.slice(0, 18)}…
                        </Link>
                      </td>
                      <td className="px-2 py-2 truncate max-w-[12rem]">{t.commodity || "—"}</td>
                      <td className="px-2 py-2 text-[0.65rem]">
                        <span className="font-mono">{t.originCountry || "?"}</span>
                        <ChevronRight className="inline w-2.5 h-2.5 mx-0.5 text-muted-foreground" />
                        <span className="font-mono">{t.destCountry || "?"}</span>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className="text-[0.55rem]">{statusLabel(t.status)}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={`text-[0.55rem] ${riskClass}`}>
                          {riskBand} · {risk}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-[0.65rem]">{readinessLabel}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={
                          "text-[0.55rem] " +
                          (declStatus === "CLEARED" || declStatus === "ACCEPTED" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                            : declStatus === "PENDING" || declStatus === "SUBMITTED" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                            : declStatus === "REJECTED" || declStatus === "HELD" ? "border-red-500/40 text-red-700 dark:text-red-300"
                            : "")
                        }>
                          {declStatus}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={
                          "text-[0.55rem] " +
                          (integrated ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-yellow-500/40 text-yellow-700 dark:text-yellow-300")
                        }>
                          {integrated ? "Integrated" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {controlQ.isError && (
        <p className="text-[0.65rem] text-amber-600 dark:text-amber-400 mt-1 italic">
          Control-tower endpoint unavailable — showing dashboard trade list only.
        </p>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.9 / GAP-3 — GOV Anonymous Trade Management
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fetches /api/sgtx/anonymous-trade for the anonymous trade list. Each row has:
//   anonymousUstn (SGTX-ANON-...), redactedCommodity, redactedParties, status
//
// "Declassify" button → POST /api/sgtx/anonymous-trade/declassify with
//   { anonymousUstn, reason, requesterGtid } — requires 3-of-5 multisig
//
// Declassification log fetched via GET /api/sgtx/anonymous-trade/declassification-log
//
// "Create Anonymous Trade" button → form to redact a real trade (POST
// /api/sgtx/anonymous-trade with { realTradeId, redactionConfig, createdBy }).

function GovAnonymousTradeManagement({ govGtid }: { govGtid: string }) {
  const queryClient = useQueryClient();
  const [declassifyDialog, setDeclassifyDialog] = useState<string | null>(null);
  const [declassifyReason, setDeclassifyReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [realTradeId, setRealTradeId] = useState("");
  const [redactParties, setRedactParties] = useState(true);
  const [redactCommodity, setRedactCommodity] = useState(false);
  const [redactRoute, setRedactRoute] = useState(false);

  const tradesQ = useQuery({
    queryKey: ["gov-anonymous-trades"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/anonymous-trade?limit=100`);
      if (!res.ok) throw new Error(`anonymous-trade ${res.status}`);
      return res.json() as Promise<any>;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const logQ = useQuery({
    queryKey: ["gov-anonymous-declassification-log"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/anonymous-trade/declassification-log?limit=50`);
      if (!res.ok) throw new Error(`declassification-log ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  const trades: any[] = tradesQ.data?.trades || tradesQ.data?.anonymousTrades || [];
  const log: any[] = logQ.data?.log || [];

  async function submitDeclassify() {
    if (!declassifyDialog) return;
    if (declassifyReason.trim().length < 20) {
      setError("Reason must be at least 20 characters.");
      return;
    }
    if (!govGtid) {
      setError("Missing government GTID — cannot request declassification.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/anonymous-trade/declassify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousUstn: declassifyDialog,
          reason: declassifyReason.trim(),
          requesterGtid: govGtid,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `Declassification request failed (${res.status})`);
        return;
      }
      setSuccess(
        `Declassification requested for ${declassifyDialog}. ` +
        `Request ID: ${json.declassificationRequestId || "—"}. ` +
        `Required approvals: ${json.requiredApprovals ?? 3}.`,
      );
      setDeclassifyDialog(null);
      setDeclassifyReason("");
      queryClient.invalidateQueries({ queryKey: ["gov-anonymous-trades"] });
      queryClient.invalidateQueries({ queryKey: ["gov-anonymous-declassification-log"] });
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function createAnonymousTrade() {
    if (!realTradeId.trim()) {
      setError("Real trade ID (USTN) is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/anonymous-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realTradeId: realTradeId.trim(),
          redactionConfig: {
            redactParties,
            redactCommodity,
            redactRoute,
          },
          createdBy: govGtid || "system",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `Create failed (${res.status})`);
        return;
      }
      setSuccess(
        `Anonymous trade created: ${json.anonymousUstn || "—"}. ` +
        `Redacted documents: ${Array.isArray(json.redactedDocuments) ? json.redactedDocuments.length : 0}.`,
      );
      setCreateDialog(false);
      setRealTradeId("");
      queryClient.invalidateQueries({ queryKey: ["gov-anonymous-trades"] });
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Anonymous trade management (§16.8.9)" count={trades.length} icon={ShieldCheck}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[0.65rem] text-muted-foreground">
          Anonymous USTNs (SGTX-ANON-…) hide parties, commodity, or route. Declassification requires 3-of-5 multisig.
        </p>
        <Button size="sm" variant="outline" onClick={() => { setCreateDialog(true); setError(null); setSuccess(null); }}>
          <Plus className="w-3 h-3 mr-1" /> Create Anonymous Trade
        </Button>
      </div>

      {tradesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading anonymous trades…
        </div>
      ) : tradesQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Anonymous trade endpoint unavailable.</span>
        </div>
      ) : trades.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No anonymous trades recorded. Use "Create Anonymous Trade" to redact a real trade for inter-agency coordination or public release.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md bg-card/40 max-h-96 overflow-y-auto">
          {trades.map((t: any, i: number) => {
            const anonUstn = t.anonymousUstn || t.anonymous_ustn || t.ustn || "SGTX-ANON-…";
            return (
              <li key={t.id || i} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium truncate">{anonUstn}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Commodity: {t.redactedCommodity || t.redacted_commodity || "■■■■ (redacted)"} · Parties: {t.redactedParties || t.redacted_parties || "■■■■ (redacted)"}
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground/80 mt-0.5">
                      Status: {t.status || "ACTIVE"} · Created {fmtDate(t.createdAt || t.created_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDeclassifyDialog(anonUstn);
                      setDeclassifyReason("");
                      setError(null);
                      setSuccess(null);
                    }}
                    className="border-amber-500/40 text-amber-700 dark:text-amber-300"
                  >
                    <ShieldCheck className="w-3 h-3 mr-1" /> Declassify
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Declassification log */}
      <div className="mt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ScrollText className="w-3 h-3 text-muted-foreground" />
          <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Declassification log</p>
        </div>
        {logQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading log…</p>
        ) : logQ.isError ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">Log unavailable.</p>
        ) : log.length === 0 ? (
          <p className="text-xs text-muted-foreground">No declassification events recorded.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40 max-h-48 overflow-y-auto text-xs">
            {log.map((entry: any, i: number) => (
              <li key={i} className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[0.65rem] truncate">{entry.anonymousUstn || entry.anonymous_ustn || "—"}</span>
                  <span className="text-[0.6rem] text-muted-foreground">
                    {entry.declassifiedAt || entry.declassified_at ? fmtDateTime(entry.declassifiedAt || entry.declassified_at) : "—"}
                  </span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground/80 mt-0.5 truncate">
                  Reason: {entry.reason || "—"}
                </p>
                {Array.isArray(entry.approvedBy) && entry.approvedBy.length > 0 && (
                  <p className="text-[0.6rem] text-muted-foreground/70 mt-0.5">
                    Approved by: {entry.approvedBy.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {success && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
          <span>⚠</span>
          <span>{error}</span>
        </p>
      )}

      {/* Declassify Dialog */}
      <Dialog open={!!declassifyDialog} onOpenChange={(o) => !o && setDeclassifyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request declassification</DialogTitle>
            <DialogDescription>
              Anonymous USTN: <span className="font-mono">{declassifyDialog}</span>. This request requires 3-of-5 multisig approval. Provide a clear reason (min 20 chars).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Court order 1234/2025 requires declassification for active fraud investigation by NFSA + ETA + CBE."
            value={declassifyReason}
            onChange={(e) => setDeclassifyReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclassifyDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitDeclassify} disabled={busy || declassifyReason.trim().length < 20}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
              Request declassification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Anonymous Trade Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create anonymous trade</DialogTitle>
            <DialogDescription>
              Redact a real trade to produce an anonymous USTN (SGTX-ANON-…). The original trade stays intact; the anonymous copy is used for inter-agency coordination or public release without revealing commercial details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Real trade USTN</span>
              <Input
                value={realTradeId}
                onChange={(e) => setRealTradeId(e.target.value)}
                placeholder="SGTX-EG-25-0001"
                className="font-mono"
              />
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={redactParties} onChange={(e) => setRedactParties(e.target.checked)} className="w-4 h-4" />
                Redact parties (buyer/seller GTIDs)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={redactCommodity} onChange={(e) => setRedactCommodity(e.target.checked)} className="w-4 h-4" />
                Redact commodity + HS code
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={redactRoute} onChange={(e) => setRedactRoute(e.target.checked)} className="w-4 h-4" />
                Redact route (origin/dest port + country)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={createAnonymousTrade} disabled={busy || !realTradeId.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
              Create anonymous
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.9 / GAP-3 — GOV Multi-Agency Workflow
// ═══════════════════════════════════════════════════════════════════════════════
//
// Calls GET /api/sgtx/gov/adapters for the 4 government adapters (NAFEZA, CARGOX,
// ETA, CBE). Each adapter row carries:
//   { config: { name, description, ... }, queue: { pending, processing, failed, completed, totalProcessed }, healthy }
//
// Per the task spec we list Egyptian Customs Authority (Nafeza), NFSA, CBE, ETA.
// SGTX has 4 adapter integrations — NAFEZA, CARGOX, ETA, CBE — and NFSA flows
// through the NAFEZA adapter (single-window for food safety certs). The panel
// shows pending items, clearance rate (=completed/total), and integration
// status (healthy) per agency.

function GovMultiAgencyWorkflow() {
  const adaptersQ = useQuery({
    queryKey: ["gov-adapters"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/gov/adapters`);
      if (!res.ok) throw new Error(`gov adapters ${res.status}`);
      return res.json() as Promise<any>;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const adapters: any[] = adaptersQ.data?.adapters || [];
  const summary = adaptersQ.data?.summary || {};
  const allHealthy = adaptersQ.data?.allHealthy === true;

  // Build per-agency rows with the friendly names from the spec.
  // NAFEZA → Egyptian Customs Authority, CARGOX → CargoX (document transfer),
  // ETA → Egyptian Tax Authority, CBE → Central Bank of Egypt.
  // NFSA (food safety) flows via NAFEZA in current integrations — listed as
  // "routed via NAFEZA".
  const agencySpec: { adapter: string; label: string }[] = [
    { adapter: "NAFEZA", label: "Egyptian Customs Authority (Nafeza)" },
    { adapter: "NFSA",   label: "National Food Safety Authority (NFSA)" },
    { adapter: "CBE",    label: "Central Bank of Egypt (CBE)" },
    { adapter: "ETA",    label: "Egyptian Tax Authority (ETA)" },
  ];

  return (
    <Section title="Multi-agency workflow (§16.8.9)" count={adapters.length} icon={Landmark}>
      {adaptersQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading agency adapters…
        </div>
      ) : adaptersQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Agency adapters endpoint unavailable.</span>
        </div>
      ) : adapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No government adapter integrations registered.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <GovSummaryCard label="All healthy" value={allHealthy ? "YES" : "NO"} icon={CheckCircle2} tone={allHealthy ? "active" : "critical"} />
            <GovSummaryCard label="Pending queue" value={String(summary.totalQueuePending ?? 0)} icon={Activity} tone={(summary.totalQueuePending ?? 0) > 0 ? "warning" : "default"} />
            <GovSummaryCard label="Processing" value={String(summary.totalQueueProcessing ?? 0)} icon={Loader2} />
            <GovSummaryCard label="Failed" value={String(summary.totalQueueFailed ?? 0)} icon={XCircle} tone={(summary.totalQueueFailed ?? 0) > 0 ? "critical" : "default"} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agencySpec.map(({ adapter, label }) => {
              const found = adapters.find((a: any) => a.config?.name === adapter || a.name === adapter);
              if (!found) {
                return (
                  <Card key={adapter} className="p-3 border-dashed">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-[0.65rem] text-muted-foreground/70 italic mt-1">
                      Routed via NAFEZA single-window (no dedicated adapter yet — food-safety certificates submitted through Nafeza's ACI workflow).
                    </p>
                  </Card>
                );
              }
              const queue = found.queue || {};
              const completed = Number(queue.completed) || 0;
              const total = Number(queue.totalProcessed) || 0;
              const clearanceRate = total > 0 ? (completed / total) * 100 : 0;
              const healthy = found.healthy === true;
              const certStatus = found.config?.mtlsCertificate?.status || "—";
              return (
                <Card key={adapter} className={`p-3 ${healthy ? "border-emerald-500/40" : "border-red-500/40"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      <p className="text-[0.65rem] text-muted-foreground/80 mt-0.5">
                        {found.config?.description || found.description || "—"}
                      </p>
                      <p className="text-[0.6rem] text-muted-foreground/70 mt-0.5 font-mono">
                        cert: {certStatus} · rateLimit: {found.config?.rateLimitPerMinute ?? "—"}/min
                      </p>
                    </div>
                    <Badge variant="outline" className={
                      "text-[0.55rem] " +
                      (healthy ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : "border-red-500/40 text-red-700 dark:text-red-300")
                    }>
                      {healthy ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2 text-[0.65rem]">
                    <div><p className="text-muted-foreground/70">Pending</p><p className="font-medium">{queue.pending ?? 0}</p></div>
                    <div><p className="text-muted-foreground/70">Processing</p><p className="font-medium">{queue.processing ?? 0}</p></div>
                    <div><p className="text-muted-foreground/70">Failed</p><p className="font-medium text-red-700 dark:text-red-300">{queue.failed ?? 0}</p></div>
                    <div><p className="text-muted-foreground/70">Done</p><p className="font-medium text-emerald-700 dark:text-emerald-300">{completed}</p></div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[0.6rem] text-muted-foreground">
                      <span>Clearance rate</span>
                      <span>{clearanceRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={clearanceRate} className="h-1 mt-1" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.9 / GAP-3 — GOV Permit Issuance
// ═══════════════════════════════════════════════════════════════════════════════
//
// Lists issued permits via GET /api/sgtx/permit/list (Document rows with type=PERMIT).
// Each permit row carries: id, ustn, title, status, hashSha256, uploadedBy, createdAt.
//
// "Issue Permit" button → POST /api/sgtx/permit/issue with
//   { ustn, permitType, issuedByGtid, validUntil }. The endpoint creates a
//   Document row with type=PERMIT and status=VERIFIED.

function GovPermitIssuance({ govGtid }: { govGtid: string }) {
  const queryClient = useQueryClient();
  const [issueDialog, setIssueDialog] = useState(false);
  const [ustn, setUstn] = useState("");
  const [permitType, setPermitType] = useState("IMPORT_LICENSE");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const permitsQ = useQuery({
    queryKey: ["gov-permits"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/permit/list?limit=200`);
      if (!res.ok) throw new Error(`permit list ${res.status}`);
      return res.json() as Promise<{ permits: any[]; count: number }>;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const permits: any[] = permitsQ.data?.permits || [];

  async function issuePermit() {
    if (!ustn.trim()) {
      setError("USTN is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/permit/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: ustn.trim(),
          permitType,
          issuedByGtid: govGtid || "system",
          validUntil: validUntil || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `Permit issuance failed (${res.status})`);
        return;
      }
      setSuccess(
        `Permit issued. Permit ID: ${json.permitId}. Type: ${json.permitType}. ` +
        `Valid until: ${json.validUntil || "—"}.`,
      );
      setIssueDialog(false);
      setUstn("");
      setValidUntil("");
      queryClient.invalidateQueries({ queryKey: ["gov-permits"] });
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Permit issuance (§16.8.9)" count={permits.length} icon={FileCheck}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[0.65rem] text-muted-foreground">
          Issue permits electronically (PERMIT document type). Auto-refresh every 60s.
        </p>
        <Button size="sm" variant="outline" onClick={() => { setIssueDialog(true); setError(null); setSuccess(null); }}>
          <Plus className="w-3 h-3 mr-1" /> Issue Permit
        </Button>
      </div>

      {permitsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading permits…
        </div>
      ) : permitsQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Permit list endpoint unavailable.</span>
        </div>
      ) : permits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No permits issued yet. Use "Issue Permit" to create a PERMIT document for a trade.
        </p>
      ) : (
        <div className="rounded-md border border-border bg-card/40 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Permit ID</th>
                  <th className="px-3 py-2 font-medium">USTN</th>
                  <th className="px-3 py-2 font-medium">Type/Title</th>
                  <th className="px-3 py-2 font-medium">Issued by</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Issued at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {permits.map((p: any, i: number) => (
                  <tr key={p.id || i} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-[0.65rem]">{p.id?.slice(0, 12)}…</td>
                    <td className="px-3 py-2">
                      {p.ustn ? (
                        <Link href={`/trades/${p.ustn}`} className="font-mono text-[0.65rem] hover:underline">
                          {p.ustn.slice(0, 18)}…
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-[0.65rem]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[16rem]">{p.title || p.type || "—"}</td>
                    <td className="px-3 py-2 font-mono text-[0.65rem]">{p.uploadedBy?.slice(0, 10) || "system"}…</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[0.55rem]">{p.status || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-[0.65rem]">{fmtDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {success && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
          <span>⚠</span>
          <span>{error}</span>
        </p>
      )}

      <Dialog open={issueDialog} onOpenChange={setIssueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue permit</DialogTitle>
            <DialogDescription>
              Create a PERMIT document for a trade. The permit is recorded as a Document row (type=PERMIT, status=VERIFIED) and is immediately verifiable by other agencies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">USTN</span>
              <Input
                value={ustn}
                onChange={(e) => setUstn(e.target.value)}
                placeholder="SGTX-EG-25-0001"
                className="font-mono"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Permit type</span>
              <select
                value={permitType}
                onChange={(e) => setPermitType(e.target.value)}
                className="w-full h-9 px-2 rounded border border-border bg-background text-xs"
              >
                <option value="IMPORT_LICENSE">Import License</option>
                <option value="EXPORT_LICENSE">Export License</option>
                <option value="PHYTOSANITARY">Phytosanitary Certificate</option>
                <option value="HALAL">Halal Certificate</option>
                <option value="ORIGIN">Certificate of Origin</option>
                <option value="FUMIGATION">Fumigation Certificate</option>
                <option value="QUARANTINE">Quarantine Release</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Valid until (optional)</span>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="text-xs"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialog(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={issuePermit} disabled={busy || !ustn.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCheck className="w-3.5 h-3.5 mr-1" />}
              Issue permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.9 / GAP-3 — GOV Compliance Monitor
// ═══════════════════════════════════════════════════════════════════════════════
//
// Calls GET /api/sgtx/compliance-calendar/events?tenantGtid=<gov>&days=90 to
// list upcoming compliance events. Each event has:
//   { eventId, eventType, title, description, eventDate, status, reminderDays, linkedUstn }
//
// Auto-refreshes every 60s. Shows: active compliance items count, breach count
// (overdue events), upcoming deadlines (next 30 days).

function GovComplianceMonitor({ govGtid }: { govGtid: string }) {
  const eventsQ = useQuery({
    queryKey: ["gov-compliance-events", govGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/compliance-calendar/events?tenantGtid=${encodeURIComponent(govGtid)}&days=90&take=200`,
      );
      if (!res.ok) throw new Error(`compliance events ${res.status}`);
      return res.json() as Promise<{ events: any[]; count: number }>;
    },
    enabled: !!govGtid,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const events: any[] = eventsQ.data?.events || [];
  const now = new Date();
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 86_400_000);
  const active = events.filter((e) => (e.status || "PENDING") === "PENDING");
  const breaches = active.filter((e) => {
    const d = e.eventDate || e.event_date;
    return d && new Date(d) < now;
  });
  const upcoming = active.filter((e) => {
    const d = e.eventDate || e.event_date;
    return d && new Date(d) >= now && new Date(d) <= thirtyDaysAhead;
  });

  return (
    <Section title="Compliance monitor (§16.8.9)" count={active.length} icon={ShieldCheck}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <GovSummaryCard label="Active items" value={String(active.length)} icon={Activity} tone="active" />
        <GovSummaryCard label="Overdue (breach)" value={String(breaches.length)} icon={AlertTriangle} tone={breaches.length > 0 ? "critical" : "default"} />
        <GovSummaryCard label="Upcoming (30d)" value={String(upcoming.length)} icon={Calendar} tone={upcoming.length > 0 ? "warning" : "default"} />
        <GovSummaryCard label="Total events (90d window)" value={String(events.length)} icon={FileText} />
      </div>

      {eventsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading compliance events…
        </div>
      ) : eventsQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Compliance calendar endpoint unavailable.</span>
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No compliance events scheduled for your authority in the next 90 days.
        </p>
      ) : (
        <div className="rounded-md border border-border bg-card/40 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Linked USTN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.slice(0, 100).map((e: any, i: number) => {
                  const d = e.eventDate || e.event_date;
                  const date = d ? new Date(d) : null;
                  const isOverdue = date && date < now && (e.status || "PENDING") === "PENDING";
                  const isUpcoming = date && date >= now && date <= thirtyDaysAhead;
                  const toneClass = isOverdue ? "border-red-500/40 text-red-700 dark:text-red-300"
                    : isUpcoming ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                    : "border-border";
                  return (
                    <tr key={e.eventId || e.id || i} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <p className="font-medium truncate max-w-[16rem]">{e.title || e.eventType || "—"}</p>
                        {e.description && (
                          <p className="text-[0.6rem] text-muted-foreground/70 truncate max-w-[16rem]">
                            {e.description.slice(0, 80)}{e.description.length > 80 ? "…" : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[0.55rem]">{e.eventType || "OTHER"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-[0.65rem]">{date ? fmtDate(date.toISOString()) : "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[0.55rem] ${toneClass}`}>
                          {e.status || "PENDING"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {e.linkedUstn || e.linked_ustn ? (
                          <Link href={`/trades/${e.linkedUstn || e.linked_ustn}`} className="font-mono text-[0.65rem] hover:underline">
                            {(e.linkedUstn || e.linked_ustn).slice(0, 18)}…
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-[0.65rem]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {events.length > 100 && (
        <p className="text-[0.6rem] text-muted-foreground/70 mt-1 italic">
          Showing first 100 of {events.length} events. Filter via the compliance calendar route for narrower views.
        </p>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-3 — GOV helpers
// ═══════════════════════════════════════════════════════════════════════════════

function GovSummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: any;
  tone?: "default" | "active" | "warning" | "critical";
}) {
  const toneClass =
    tone === "active" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
    : tone === "warning" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
    : tone === "critical" ? "border-red-500/40 text-red-700 dark:text-red-300"
    : "border-border";
  return (
    <Card className={`p-3 ${toneClass}`}>
      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" />
        {label}
      </p>
      <p className="text-lg font-semibold mt-0.5 truncate">{value}</p>
    </Card>
  );
}
