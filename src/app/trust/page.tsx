"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 5: /trust route — GTID verification, sanctions, KYB, certificates.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Two sections:
//   1. Your trust passport — your own tenant's KYB tier, sanctions status,
//      trust score, lifecycle state.
//   2. Verify a tenant by GTID — public lookup via the existing
//      /api/sgtx/trust-passport/verify endpoint.
//
// Law #7: NOTHING FABRICATED. Every number is real backend data or an
// honest empty state.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ShieldCheck, Hash, Search, Loader2, AlertTriangle, CheckCircle2,
  Globe2, FileText, Eye,
} from "lucide-react";

interface DashboardData {
  tenant?: {
    gtid: string; legalName: string; type: string; country?: string;
    kybTier: number; kybStatus?: string; pepStatus?: string;
    trustScore: number; trustConfidence?: number;
    sanctionsCleared: boolean; lifecycleState: string;
  };
}

interface PublicProfile {
  found?: boolean;
  gtid: string; legal_name: string; type: string; jurisdiction: string;
  kyb_tier: number; kyb_status: string; sanctions_cleared: boolean;
  trust_score: number; lifecycle_state: string;
}

export default function TrustPage() {
  const { payload, ready } = useSession();
  const [gtidQuery, setGtidQuery] = useState("");

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  // Public GTID verification (no auth required — the endpoint is public).
  const verifyQuery = useQuery<PublicProfile>({
    queryKey: ["public-gtid", gtidQuery],
    queryFn: async () => {
      const res = await fetch(`/api/sgtx/trust-passport/verify?gtid=${encodeURIComponent(gtidQuery)}`);
      if (!res.ok) throw new Error("GTID not found");
      return res.json();
    },
    enabled: false,
  });

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  if (!payload) return null;

  const tenant = data?.tenant;
  const tenantType = tenant?.type || "";

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={tenant?.legalName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6 max-w-3xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Trust</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your trust passport and public GTID verification.
          </p>
        </header>

        {/* Your trust passport */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your trust passport
            </h2>
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : tenant ? (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="font-medium">{tenant.legalName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{tenant.gtid}</p>
                </div>
                <Badge variant="outline" className={tenant.sanctionsCleared ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40" : "text-red-600 dark:text-red-400 border-red-500/40"}>
                  {tenant.sanctionsCleared ? "✓ Sanctions cleared" : "✗ Sanctions hit"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Stat label="KYB tier" value={tenant.kybTier ? `Tier ${tenant.kybTier}` : "—"} />
                <Stat label="Trust score" value={`${tenant.trustScore || 0}/100`} />
                <Stat label="Lifecycle" value={tenant.lifecycleState || "—"} />
                <Stat label="Type" value={tenant.type || "—"} />
                <Stat label="Country" value={tenant.country || "—"} />
                <Stat label="KYB status" value={tenant.kybStatus || "—"} />
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load your trust passport.</p>
          )}
        </section>

        {/* Verify a tenant by GTID */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Verify a tenant by GTID
            </h2>
          </div>
          <Card className="p-5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={gtidQuery}
                  onChange={(e) => setGtidQuery(e.target.value)}
                  placeholder="SGTX-XX-XXX-######-XXXX"
                  className="pl-8 font-mono"
                />
              </div>
              <Button onClick={() => verifyQuery.refetch()} disabled={verifyQuery.isFetching || !gtidQuery}>
                {verifyQuery.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span className="ml-1.5">Verify</span>
              </Button>
            </div>

            {verifyQuery.data && (
              <div className="mt-4 p-3 rounded-md bg-muted/40 border border-border text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{verifyQuery.data.legal_name}</span>
                  <Badge variant="outline" className={verifyQuery.data.sanctions_cleared ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                    {verifyQuery.data.sanctions_cleared ? "✓ Cleared" : "✗ Hit"}
                  </Badge>
                </div>
                <Row label="GTID" value={verifyQuery.data.gtid} mono />
                <Row label="Type" value={verifyQuery.data.type} />
                <Row label="Jurisdiction" value={verifyQuery.data.jurisdiction} />
                <Row label="KYB tier" value={`Tier ${verifyQuery.data.kyb_tier}`} />
                <Row label="KYB status" value={verifyQuery.data.kyb_status} />
                <Row label="Trust score" value={`${verifyQuery.data.trust_score}/100`} />
                <Row label="Lifecycle" value={verifyQuery.data.lifecycle_state} />
              </div>
            )}
            {verifyQuery.isError && (
              <div className="mt-4 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>GTID not found or verification failed. Check the GTID format (SGTX-XX-XXX-######-XXXX).</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <Eye className="w-3 h-3" />
              Public verification — no login required. Every SGTX tenant is verifiable by anyone.
            </p>
          </Card>
        </section>
      </div>
    </CockpitShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className={mono ? "font-mono text-right break-all" : "text-right"}>{value}</span>
    </div>
  );
}
