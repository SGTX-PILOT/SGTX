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
import { useQuery, useMutation } from "@tanstack/react-query";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ShieldCheck, Hash, Search, Loader2, AlertTriangle, CheckCircle2,
  Globe2, FileText, Eye, Sparkles, Share2, Ban, RefreshCw, Award,
  Calendar, Fingerprint, Scale, Lock,
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

// v18 §4.12 — TRI Breakdown (Trust Passport core metric).
interface TriBreakdown {
  triScore: number;
  confidence: number;
  components: {
    settlementReliability: number;
    complianceHealth: number;
    documentationQuality: number;
    financingPerformance: number;
    disputeResolution: number;
  };
  status: string;
}

// v18 §4.12 — Trust Passport W3C Verifiable Credential metadata.
interface PassportRecord {
  id: string;
  triScore: number;
  triConfidence: number;
  triStatus: string;
  expiresAt?: string;
  issuedAt?: string;
  credentialHash?: string;
  signature?: string;
  loomHash?: string;
  w3cCredential?: any;
  components?: any;
}

interface ShareToken {
  token: string;
  expiresAt: string;
  dimensions: string[];
}

interface ShareRecord {
  id?: string;
  token: string;
  revoked?: boolean;
  expiresAt?: string;
  createdAt?: string;
  sharedWithGtid?: string | null;
  dimensions?: string | null;
}

export default function TrustPage() {
  const { payload, ready } = useSession();
  const { t } = useCockpitLocale();
  const [gtidQuery, setGtidQuery] = useState("");
  const [passport, setPassport] = useState<PassportRecord | null>(null);
  const [shareLink, setShareLink] = useState<ShareToken | null>(null);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
    retry: false,
  });

  // v18 §4.12 — TRI breakdown (computed live from real DB metrics via the
  // dispute lib's calculateTri). Powers the 5 weighted Progress bars.
  const triQuery = useQuery<TriBreakdown>({
    queryKey: ["cockpit-tri", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/tri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid: payload!.tenantGtid }),
      });
      if (!res.ok) throw new Error(`TRI compute failed (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
    retry: false,
  });

  // v18 §4.12 — existing Trust Passport sharing tokens (indirect proof of
  // whether a passport has been minted; the share GET endpoint returns
  // { shares: [] } either way, so we also stash the last generate response).
  const passportQuery = useQuery<{ shares: ShareRecord[] }>({
    queryKey: ["cockpit-passport-shares", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/trust-passport/share?tenant=${encodeURIComponent(payload!.tenantGtid!)}`,
      );
      if (!res.ok) return { shares: [] };
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
    retry: false,
  });

  // v18 §4.12 — Generate / re-mint Trust Passport (idempotent POST).
  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/trust-passport/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid: payload!.tenantGtid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Generate failed (${res.status})`);
      }
      return res.json() as Promise<PassportRecord>;
    },
    onSuccess: (data) => {
      setPassport(data);
      toast.success("Trust Passport minted", {
        description: `W3C VC issued • 90-day validity • TRI ${data.triScore}/1000 (${data.triStatus})`,
      });
    },
    onError: (e: any) => {
      toast.error("Passport generation failed", { description: e?.message || "Unknown error" });
    },
  });

  // v18 §4.12 — Share Trust Passport (mint a sharing token, 7-day TTL).
  const shareMut = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/trust-passport/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid: payload!.tenantGtid, dimensions: ["all"] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Share failed (${res.status})`);
      }
      return res.json() as Promise<ShareToken>;
    },
    onSuccess: (data) => {
      setShareLink(data);
      toast.success("Sharing link minted", {
        description: `Valid 7 days • Token: ${data.token.slice(0, 12)}…`,
      });
    },
    onError: (e: any) => {
      toast.error("Share failed", { description: e?.message || "Generate passport first" });
    },
  });

  // v18 §4.12 — Revoke a Trust Passport sharing token (immediate).
  const revokeMut = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetchWithAuth("/api/sgtx/trust-passport/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: "revoked by tenant admin", revokedBy: payload?.tenantGtid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Revoke failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Token revoked", {
        description: "Subsequent verification will return { valid: false }.",
      });
      setShareLink(null);
      passportQuery.refetch();
    },
    onError: (e: any) => {
      toast.error("Revoke failed", { description: e?.message || "Unknown error" });
    },
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
    retry: false,
  });

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("common.loadingSession")}</div>;
  if (!payload) return null;

  const tenant = data?.tenant;
  const tenantType = tenant?.type || "";

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={tenant?.legalName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6 max-w-4xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("trust.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("trust.subtitle")}
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

        {/* v18 §4.12 — Trust Passport (W3C Verifiable Credential) with TRI breakdown */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Trust Passport — TRI Score
            </h2>
            {passport?.expiresAt && (
              <Badge variant="outline" className="text-[0.6rem] text-emerald-600 dark:text-emerald-400 border-emerald-500/40 ml-auto">
                <Calendar className="w-2.5 h-2.5 mr-1" />
                Valid 90 days
              </Badge>
            )}
          </div>
          {triQuery.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Computing TRI from live metrics…
            </div>
          ) : triQuery.isError ? (
            <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
              <div>
                <p>Unable to compute TRI breakdown.</p>
                <p className="text-xs mt-1">Try refreshing the page, or click <strong>Generate Trust Passport</strong> to mint a fresh W3C VC.</p>
              </div>
            </div>
          ) : triQuery.data ? (
            <Card className="p-5">
              {/* Score + status badge */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tight">{triQuery.data.triScore}</span>
                    <span className="text-sm text-muted-foreground">/ 1000</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    TRI confidence: <span className="font-medium text-foreground">{triQuery.data.confidence}%</span>
                  </p>
                </div>
                <TriStatusBadge status={triQuery.data.status} />
              </div>

              {/* 5 weighted dimensions as Progress bars */}
              <div className="space-y-3">
                <TriDimension label="Settlement Reliability" weight="25%" value={triQuery.data.components.settlementReliability} />
                <TriDimension label="Compliance Health" weight="20%" value={triQuery.data.components.complianceHealth} />
                <TriDimension label="Documentation Quality" weight="15%" value={triQuery.data.components.documentationQuality} />
                <TriDimension label="Financing Performance" weight="20%" value={triQuery.data.components.financingPerformance} />
                <TriDimension label="Dispute Resolution" weight="20%" value={triQuery.data.components.disputeResolution} />
              </div>

              {/* 90-day validity + credential hash */}
              {passport?.expiresAt && (
                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Expires <span className="font-mono text-foreground">{new Date(passport.expiresAt).toLocaleDateString()}</span>
                  </span>
                  {passport.credentialHash && (
                    <span className="flex items-center gap-1 truncate">
                      <Fingerprint className="w-3 h-3" />
                      <span className="font-mono text-foreground truncate max-w-[180px]">{passport.credentialHash}</span>
                    </span>
                  )}
                  {passport.loomHash && (
                    <span className="flex items-center gap-1 truncate">
                      <Lock className="w-3 h-3" />
                      <span className="font-mono text-foreground truncate max-w-[180px]">{passport.loomHash}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Generate / Share / Revoke buttons */}
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => generateMut.mutate()}
                  disabled={generateMut.isPending}
                  size="sm"
                >
                  {generateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  {passport ? "Re-mint Passport" : "Generate Trust Passport"}
                </Button>
                <Button
                  onClick={() => shareMut.mutate()}
                  disabled={shareMut.isPending || !passport}
                  size="sm"
                  variant="outline"
                >
                  {shareMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Share2 className="w-3.5 h-3.5 mr-1" />}
                  Share
                </Button>
                {shareLink && (
                  <Button
                    onClick={() => revokeMut.mutate(shareLink.token)}
                    disabled={revokeMut.isPending}
                    size="sm"
                    variant="outline"
                    className="text-red-600 dark:text-red-400 border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    {revokeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Ban className="w-3.5 h-3.5 mr-1" />}
                    Revoke share
                  </Button>
                )}
                {!passport && (
                  <span className="text-xs text-muted-foreground ml-1">
                    No passport minted yet — click <strong>Generate</strong> to issue the W3C Verifiable Credential.
                  </span>
                )}
              </div>

              {/* Active share tokens */}
              {passportQuery.data && passportQuery.data.shares.filter((s) => !s.revoked).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Active share tokens
                  </p>
                  <ul className="space-y-1.5">
                    {passportQuery.data.shares.filter((s) => !s.revoked).map((s) => (
                      <li key={s.token} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-muted-foreground truncate max-w-[200px]">{s.token.slice(0, 24)}…</span>
                        <Button
                          onClick={() => revokeMut.mutate(s.token)}
                          disabled={revokeMut.isPending}
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.65rem] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Ban className="w-3 h-3 mr-1" /> Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ) : null}
        </section>

        {/* v18 §4.12 — KYB + Sanctions + Lifecycle badge strip */}
        {tenant && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Verification status
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={tenant.kybTier >= 2 ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40" : "text-amber-600 dark:text-amber-400 border-amber-500/40"}>
                <ShieldCheck className="w-3 h-3 mr-1" />
                KYB Tier {tenant.kybTier}
              </Badge>
              <Badge variant="outline" className={tenant.sanctionsCleared ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40" : "text-red-600 dark:text-red-400 border-red-500/40"}>
                <Scale className="w-3 h-3 mr-1" />
                {tenant.sanctionsCleared ? "Sanctions Cleared" : "Sanctions Hit"}
              </Badge>
              <Badge variant="outline" className={tenant.lifecycleState === "VERIFIED" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40" : "text-amber-600 dark:text-amber-400 border-amber-500/40"}>
                <Globe2 className="w-3 h-3 mr-1" />
                Lifecycle: {tenant.lifecycleState}
              </Badge>
              <Badge variant="outline">
                <FileText className="w-3 h-3 mr-1" />
                {tenant.type || "—"}
              </Badge>
              {tenant.country && (
                <Badge variant="outline">
                  <Globe2 className="w-3 h-3 mr-1" />
                  {tenant.country}
                </Badge>
              )}
            </div>
          </section>
        )}

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

// v18 §4.12 — TRI status badge (Premier / Advanced / Trusted / Verified / Developing / Limited).
function TriStatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const variant =
    s.includes("premier") ? "text-purple-700 dark:text-purple-300 border-purple-500/40 bg-purple-50 dark:bg-purple-950/20"
    : s.includes("advanced") ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20"
    : s.includes("trusted") ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/10"
    : s.includes("verified") ? "text-sky-600 dark:text-sky-400 border-sky-500/40 bg-sky-50/40 dark:bg-sky-950/10"
    : s.includes("developing") ? "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10"
    : "text-red-600 dark:text-red-400 border-red-500/40 bg-red-50/40 dark:bg-red-950/10";
  return (
    <Badge variant="outline" className={`text-[0.65rem] ${variant}`}>
      <Award className="w-3 h-3 mr-1" />
      {status || "—"}
    </Badge>
  );
}

// v18 §4.12 — One weighted TRI dimension as a Progress bar.
function TriDimension({ label, weight, value }: { label: string; weight: string; value: number }) {
  const v = Math.max(0, Math.min(1000, value || 0));
  const pct = (v / 1000) * 100;
  const tone =
    v >= 800 ? "text-emerald-600 dark:text-emerald-400"
    : v >= 600 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          <span className={`font-mono font-medium mr-2 ${tone}`}>{v}/1000</span>
          weight {weight}
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
