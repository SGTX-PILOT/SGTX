// @ts-nocheck
"use client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe2, Activity, KeyRound, UserPlus } from "lucide-react";

type Data = any;

function LoadingState() { return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gold" /><span className="ml-2 text-sm text-muted-foreground">Loading…</span></div>; }
function EmptyState({ msg }: { msg: string }) { return <div className="text-center py-12"><p className="text-sm text-muted-foreground">{msg}</p></div>; }

export function CustomsGatewayScreen({ data }: { data: Data }) {
  const brokerGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["cbr-dashboard", brokerGtid],
    queryFn: async () => { try { return await (await fetch(`/api/sgtx/customs-gateway/cbr-dashboard?brokerGtid=${brokerGtid}`)).json(); } catch { return { ok: false, data: {} }; } },
    staleTime: 30_000,
  });
  const d = resp?.data || {};
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><Globe2 className="w-5 h-5 text-gold" /><h2 className="text-lg font-bold">Customs Gateway</h2><Badge variant="secondary">CORE_READY</Badge></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Active Declarations</p><p className="text-2xl font-bold text-gold">{d.activeDeclarations?.length || 0}</p></Card>
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Pending Certifications</p><p className="text-2xl font-bold text-amber-500">{d.pendingCertifications?.length || 0}</p></Card>
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Submission Monitoring</p><p className="text-2xl font-bold text-blue-500">{d.submissionMonitoring?.length || 0}</p></Card>
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Recent Events</p><p className="text-2xl font-bold text-emerald-500">{d.recentEvents?.length || 0}</p></Card>
      </div>
      {isLoading ? <LoadingState /> : (d.activeDeclarations?.length > 0 ? (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Active Declarations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30"><tr><th className="text-left p-2">USTN</th><th className="text-left p-2">Status</th><th className="text-left p-2">Jurisdiction</th><th className="text-left p-2">Created</th></tr></thead>
              <tbody>{d.activeDeclarations.map((decl: any) => <tr key={decl.id} className="border-t"><td className="p-2 font-mono text-[0.65rem]">{decl.ustn || decl.declarationNo || decl.id}</td><td className="p-2"><Badge variant="secondary">{decl.status}</Badge></td><td className="p-2">{decl.country || "—"}</td><td className="p-2 text-[0.65rem]">{decl.createdAt ? new Date(decl.createdAt).toLocaleDateString() : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      ) : <EmptyState msg="No active customs declarations. Create a declaration from a trade." />)}
    </div>
  );
}

export function BrokerCredentialsScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><KeyRound className="w-5 h-5 text-gold" /><h2 className="text-lg font-bold">Broker Credentials (BYOC)</h2></div>
      <Card className="p-4"><EmptyState msg="No credentials registered. Broker credentials are managed via the BYOC (Bring Your Own Credentials) system. Credentials are stored as HSM/secret references — actual secrets are never exposed." /></Card>
    </div>
  );
}

export function SubmissionMonitoringScreen({ data }: { data: Data }) {
  const brokerGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["submission-monitoring", brokerGtid],
    queryFn: async () => { try { return await (await fetch(`/api/sgtx/customs-gateway/cbr-dashboard?brokerGtid=${brokerGtid}`)).json(); } catch { return { ok: false, data: {} }; } },
    staleTime: 30_000,
  });
  const submissions = resp?.data?.submissionMonitoring || [];
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><Activity className="w-5 h-5 text-gold" /><h2 className="text-lg font-bold">Submission Monitoring</h2></div>
      {isLoading ? <LoadingState /> : submissions.length === 0 ? <EmptyState msg="No active submissions being monitored." /> : (
        <Card className="p-4"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/30"><tr><th className="text-left p-2">Declaration</th><th className="text-left p-2">Status</th><th className="text-left p-2">Government Status</th><th className="text-left p-2">Submitted</th></tr></thead><tbody>{submissions.map((s: any) => <tr key={s.id} className="border-t"><td className="p-2 font-mono text-[0.65rem]">{s.declarationNo || s.id}</td><td className="p-2"><Badge variant="secondary">{s.status}</Badge></td><td className="p-2">{s.governmentStatus || "—"}</td><td className="p-2 text-[0.65rem]">{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></Card>
      )}
    </div>
  );
}

export function BrokerOnboardingScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><UserPlus className="w-5 h-5 text-gold" /><h2 className="text-lg font-bold">Broker Onboarding (14 Steps)</h2></div>
      <Card className="p-4">
        <ol className="space-y-2">
          {["Company Identity", "Broker Licensing", "KYB/KYC", "Jurisdiction Selection", "Customs System Selection", "Connection Profile", "Credential Registration", "Certificate Configuration", "Filing Profile", "Connection Test", "Sandbox Test", "Certification Readiness", "Production Approval", "Activation"].map((step, i) => (
            <li key={i} className="flex items-center gap-3 text-sm"><span className="w-6 h-6 rounded-full border-2 border-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{i + 1}</span><span>{step}</span></li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export function CustomsGatewayAdminScreen() {
  const { data: resp, isLoading } = useQuery({
    queryKey: ["customs-admin-overview"],
    queryFn: async () => { try { return await (await fetch("/api/sgtx/customs-gateway/admin-overview")).json(); } catch { return { ok: false }; } },
    staleTime: 60_000,
  });
  const o = resp?.overview || {};
  const adapters = resp?.adapters || [];
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><Globe2 className="w-5 h-5 text-gold" /><h2 className="text-lg font-bold">Customs Gateway Admin</h2></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Total Submissions</p><p className="text-2xl font-bold">{o.submissionsToday || 0}</p></Card>
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Success Rate</p><p className="text-2xl font-bold text-emerald-500">{o.successRate || 0}%</p></Card>
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Holds</p><p className="text-2xl font-bold text-amber-500">{o.holdCount || 0}</p></Card>
        <Card className="p-4"><p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Errors</p><p className="text-2xl font-bold text-red-500">{o.errorCount || 0}</p></Card>
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Adapter Health</h3>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/30"><tr><th className="text-left p-2">Adapter</th><th className="text-left p-2">Jurisdiction</th><th className="text-left p-2">Status</th><th className="text-left p-2">Submissions</th></tr></thead><tbody>{adapters.map((a: any) => <tr key={a.adapterId} className="border-t"><td className="p-2 font-mono text-[0.65rem]">{a.adapterId}</td><td className="p-2">{a.jurisdiction}</td><td className="p-2"><Badge variant={a.status === "PRODUCTION_CONNECTED" ? "default" : "secondary"}>{a.status}</Badge></td><td className="p-2">{a.totalSubmissions}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
