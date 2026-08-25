"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtDate, fmtDateTime, statusColor, healthColor } from "@/lib/sgtx/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, ShieldCheck, Lock, AlertTriangle, CheckCircle2, Globe2, Users, FileText, Gavel, Copy, Hash, Link2, Building2, Banknote, Ship } from "lucide-react";

// ============ Governor Decision Tester (Part 1.1) ============
export function GovernorDecisionScreen() {
  const [action, setAction] = useState("contract.sign");
  const [actorGtid, setActorGtid] = useState("SGTX-EG-TRD-002139-7F3A");
  const [traderMode, setTraderMode] = useState("SELL");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/governor/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actorGtid, traderMode }),
      });
      const d = await res.json();
      setResult(d);
    } catch { setResult({ error: "failed" }); }
    finally { setLoading(false); }
  };

  const copy = (text: string, label: string) => { navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="space-y-4">
      <SectionHeader title="Governor Decision Engine" subtitle="Part 1.1 — OPA + WasmEdge + AI → Decision Merger → Loom chain → Ed25519 signature" />
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["contract.sign", "trade.create", "fee.collect", "financing.request", "settlement.approve", "quote.submit"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Actor GTID</Label>
            <Input value={actorGtid} onChange={(e) => setActorGtid(e.target.value)} className="font-mono text-xs" />
          </div>
          <div>
            <Label className="text-xs">Trader Mode</Label>
            <Select value={traderMode} onValueChange={setTraderMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="BUY">BUY</SelectItem><SelectItem value="SELL">SELL</SelectItem><SelectItem value="DUAL">DUAL</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={run} disabled={loading} className="bg-gold-gradient text-sovereign">
          {loading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Evaluating…</> : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Run Governor Decision</>}
        </Button>
      </Card>

      {result && !result.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Decision ID</p>
                <p className="font-mono text-sm text-foreground">{result.decisionId}</p>
              </div>
              <Badge variant="outline" className="text-sm font-bold" style={{ color: result.verdict === "ALLOW" ? "#10b981" : result.verdict === "CONDITIONAL" ? "#fbbf24" : "#f87171", borderColor: `${result.verdict === "ALLOW" ? "#10b981" : result.verdict === "CONDITIONAL" ? "#fbbf24" : "#f87171"}55` }}>
                {result.verdict}
              </Badge>
            </div>

            {/* Tenant message (AI) */}
            {result.tenantMessage && (
              <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
                <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> AI Tenant Message (A1)</p>
                <p className="text-xs text-foreground/90">{result.tenantMessage}</p>
              </div>
            )}

            {/* Conditions */}
            {result.conditions?.length > 0 && (
              <div>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Conditions</p>
                <div className="space-y-1.5">
                  {result.conditions.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
                      <span className="text-red-400">❌</span>
                      <span className="text-xs text-foreground flex-1">{c.label}</span>
                      {c.action_url && <button className="text-[0.65rem] text-gold hover:underline">Resolve</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loom + Signature */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/20">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase flex items-center gap-1 mb-1"><Hash className="w-3 h-3" /> Loom Hash</p>
                <p className="font-mono text-[0.65rem] text-foreground break-all">{result.loomHash}</p>
                <button onClick={() => copy(result.loomHash, "loom")} className="text-[0.6rem] text-gold hover:underline mt-1 flex items-center gap-1"><Copy className="w-2.5 h-2.5" /> {copied === "loom" ? "copied!" : "copy"}</button>
              </div>
              <div className="p-3 rounded-lg bg-muted/20">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase flex items-center gap-1 mb-1"><Lock className="w-3 h-3" /> Ed25519 Signature</p>
                <p className="font-mono text-[0.65rem] text-foreground break-all">{result.signature}</p>
                <button onClick={() => copy(result.signature, "sig")} className="text-[0.6rem] text-gold hover:underline mt-1 flex items-center gap-1"><Copy className="w-2.5 h-2.5" /> {copied === "sig" ? "copied!" : "copy"}</button>
              </div>
            </div>
            {result.previousHash && (
              <p className="text-[0.6rem] text-muted-foreground">Previous hash: <span className="font-mono">{result.previousHash.slice(0, 40)}…</span></p>
            )}

            {/* Module versions */}
            <div>
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1.5">Constitutional Modules (WasmEdge)</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.moduleVersions || {}).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="text-[0.6rem] font-mono">{k}: {String(v)}</Badge>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ============ Loom Verification (Part 1.11) ============
export function LoomVerificationScreen() {
  const [ustn, setUstn] = useState("SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4");
  const [token, setToken] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const generateToken = async () => {
    setGenLoading(true);
    try {
      const res = await fetch("/api/sgtx/governor/generate-token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn }),
      });
      const d = await res.json();
      setToken(d.token);
    } catch {}
    finally { setGenLoading(false); }
  };

  const verify = async () => {
    if (!token) return;
    setVerifyLoading(true);
    try {
      const res = await fetch(`/api/sgtx/governor/verify-loom?token=${token}`);
      const d = await res.json();
      setVerifyResult(d);
    } catch {}
    finally { setVerifyLoading(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Loom Verification" subtitle="Part 1.6 & 1.11 — Deterministic hash chain · public verification endpoint · 90-day tokens" />
      <Card className="p-5 space-y-4">
        <div>
          <Label className="text-xs">USTN</Label>
          <Input value={ustn} onChange={(e) => setUstn(e.target.value)} className="font-mono text-xs" />
        </div>
        <div className="flex gap-2">
          <Button onClick={generateToken} disabled={genLoading} className="bg-gold-gradient text-sovereign">
            {genLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
            Generate Verification Token
          </Button>
          {token && (
            <Button onClick={verify} disabled={verifyLoading} variant="outline">
              {verifyLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
              Verify Chain
            </Button>
          )}
        </div>
        {token && (
          <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">Verification Token (90-day expiry)</p>
            <p className="font-mono text-xs text-foreground break-all">{token}</p>
          </div>
        )}
      </Card>

      {verifyResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${verifyResult.chainVerified ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                {verifyResult.chainVerified ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-red-400" />}
              </div>
              <div>
                <p className="font-display text-lg font-bold" style={{ color: verifyResult.chainVerified ? "#10b981" : "#f87171" }}>
                  {verifyResult.chainVerified ? "Chain Verified ✓" : "Chain BROKEN — Tampering Detected!"}
                </p>
                <p className="text-xs text-muted-foreground">{verifyResult.chainLength} decisions · USTN {verifyResult.ustn.slice(0, 24)}…</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-muted-foreground text-[0.6rem]">Genesis Hash</p><p className="font-mono break-all">{verifyResult.genesisHash}</p></div>
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-muted-foreground text-[0.6rem]">Latest Hash</p><p className="font-mono break-all">{verifyResult.latestHash || "none"}</p></div>
            </div>
            {verifyResult.decisions?.length > 0 && (
              <div>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Decision Hash Chain</p>
                <div className="space-y-1 max-h-48 overflow-y-auto scroll-gold">
                  {verifyResult.decisions.map((d: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-[0.65rem]">
                      <span className={`w-1.5 h-1.5 rounded-full ${d.verified ? "bg-emerald-400" : "bg-red-400"}`} />
                      <span className="font-mono text-muted-foreground">{d.decisionId}</span>
                      <span className="font-mono text-foreground truncate flex-1">{d.loomHash.slice(0, 30)}…</span>
                      <span className="text-muted-foreground">{fmtDateTime(d.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ============ Jurisdiction Matrix (Part 1.7) ============
// FIX-CRITICAL / Bug 3 — UX defense (audit Finding D + Phase 4).
// Previously the screen destructured `data` from useQuery with no
// `isLoading` / `isError` handling, no `Array.isArray` checks, and a
// bare `(await fetch()).json()` queryFn that would throw unhandled on
// any API failure. The screen silently showed "0 jurisdictions
// tracked" while fetching or after an error, which is the weakest
// pattern in the audit set. Adopted the AirCargoScreen gold standard:
//   - normalizeArray helper (handles bare array, {ok,jurisdictions},
//     {rows}, {data}, and error-object shapes)
//   - ErrorCard (visible red banner with the fetch failure message)
//   - LoadingRow (spinner + "Loading jurisdictions..." while fetching)
//   - EmptyRow ("No jurisdictions configured" when API returns [])
function normalizeJurisdictions(j: any): any[] {
  if (!j) return [];
  if (Array.isArray(j)) return j;
  if (typeof j !== "object") return [];
  if (j.error) return [];
  if (Array.isArray(j.jurisdictions)) return j.jurisdictions;
  if (Array.isArray(j.rows)) return j.rows;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

export function JurisdictionMatrixScreen() {
  // FIX-CRITICAL / Bug 3 — surface isLoading + error + normalised rows
  // instead of destructuring `data` directly. The queryFn never throws
  // (catches fetch + non-2xx + JSON parse failures into a structured
  // `{rows, fetchError}` return value) so useQuery's own `error` is
  // only used as a defensive fallback.
  const { data, isLoading, error } = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/jurisdictions");
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return { rows: [] as any[], fetchError: `${r.status} ${r.statusText} ${body.slice(0, 200)}`.trim() };
        }
        const j = await r.json();
        return { rows: normalizeJurisdictions(j), fetchError: null as string | null };
      } catch (e: any) {
        return { rows: [] as any[], fetchError: e?.message || "fetch failed" };
      }
    },
  });

  // Defensive: even if the API later returns an error object, the rows
  // array is always a real array (never undefined / null / object).
  const jurisdictions = Array.isArray(data?.rows) ? (data as any).rows : [];
  const fetchError = data?.fetchError || (error as any)?.message || "";

  const tierColor = (tier: string) => ({ FULL: "#10b981", STANDARD: "#60a5fa", LIMITED: "#fbbf24", RESTRICTED: "#fb923c", BLOCKED: "#f87171" } as any)[tier] || "#94a3b8";
  const tierRank: Record<string, number> = { FULL: 0, STANDARD: 1, LIMITED: 2, RESTRICTED: 3, BLOCKED: 4 };

  return (
    <div className="space-y-4">
      <SectionHeader title="Jurisdiction Matrix" subtitle="Part 1.7 — RIA-driven · strictest rule applies · tiers updated every 15 min · non-marketplace" />
      {fetchError && (
        <Card className="p-4 border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load jurisdictions: {fetchError}</span>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
            {isLoading
              ? "Loading jurisdictions…"
              : `${jurisdictions.length} jurisdiction${jurisdictions.length === 1 ? "" : "s"} tracked`}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">RIA · 15-min refresh</span>
        </div>
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                <th scope="col" className="text-left font-medium px-4 py-2.5">Country</th>
                <th scope="col" className="text-left font-medium px-3 py-2.5">Code</th>
                <th scope="col" className="text-left font-medium px-3 py-2.5">Tier</th>
                <th scope="col" className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">DeFi</th>
                <th scope="col" className="text-left font-medium px-3 py-2.5 hidden md:table-cell">PSPs</th>
                <th scope="col" className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline-block text-muted-foreground" aria-hidden="true" />
                    <span className="ml-2 text-xs text-muted-foreground">Loading jurisdictions…</span>
                  </td>
                </tr>
              ) : jurisdictions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    {fetchError
                      ? "Could not load jurisdictions — please retry."
                      : "No jurisdictions configured. The RIA sync has not populated any country profiles yet."}
                  </td>
                </tr>
              ) : (
                // Clone before sort so we never mutate the cached query
                // array (sort is in-place). Defensive: rows may include
                // objects with unknown tiers — they sort to the bottom.
                [...jurisdictions]
                  .sort((a: any, b: any) =>
                    ((tierRank as any)[b?.tier] ?? 99) - ((tierRank as any)[a?.tier] ?? 99)
                  )
                  .map((j: any, idx: number) => {
                    const color = tierColor(j?.tier);
                    // Defensive JSON.parse on pspList — the API may
                    // store a JSON string or null. Wrap in try/catch
                    // and verify Array.isArray so a malformed value
                    // never crashes the row render.
                    let pspList: string[] = [];
                    try {
                      const parsed = j?.pspList ? JSON.parse(j.pspList) : [];
                      if (Array.isArray(parsed)) pspList = parsed.filter((p: any) => typeof p === "string");
                    } catch {
                      pspList = [];
                    }
                    return (
                      <tr key={j?.id || j?.countryCode || `j-${idx}`} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs font-medium">{j?.countryName || "—"}</td>
                        <td className="px-3 py-3 text-xs font-mono">{j?.countryCode || "—"}</td>
                        <td className="px-3 py-3">
                          {j?.tier ? (
                            <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold" style={{ color, background: `${color}1a` }}>{j.tier}</span>
                          ) : (
                            <span className="text-[0.6rem] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span className={j?.defiAllowed ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                            {j?.defiAllowed ? "Allowed" : "Prohibited"}
                          </span>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell text-[0.65rem] text-muted-foreground">{pspList.join(", ") || "—"}</td>
                        <td className="px-3 py-3 hidden lg:table-cell text-[0.65rem] text-muted-foreground">{j?.notes || "—"}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============ Network / Saved Contacts (Part 2.6) ============
export function NetworkScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [addGtid, setAddGtid] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/contacts?owner=${tenantGtid}`)).json(),
  });

  const add = async () => {
    if (!addGtid || adding) return;
    setAdding(true);
    try {
      await fetch("/api/sgtx/contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerGtid: tenantGtid, contactGtid: addGtid }),
      });
      setAddGtid("");
      qc.invalidateQueries({ queryKey: ["contacts", tenantGtid] });
    } catch {}
    finally { setAdding(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Network — Saved Contacts" subtitle="Part 2.6 — opt-in directory of existing counterparties · AI Trust Portrait · no marketplace discovery" />
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Input value={addGtid} onChange={(e) => setAddGtid(e.target.value)} placeholder="Enter GTID to add (e.g. SGTX-EG-TRD-002139-7F3A)" className="font-mono text-xs" />
          <Button onClick={add} disabled={adding || !addGtid} className="bg-gold-gradient text-sovereign h-9">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5 mr-1.5" />} Add Contact
          </Button>
        </div>
        <p className="text-[0.6rem] text-muted-foreground mt-2">🔐 You must already know the GTID. SGTX never recommends "people you may know". AI resolves + generates a Trust Portrait.</p>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(contacts || []).map((c: any) => (
          <Card key={c.id} className="p-4 hover:border-gold/40 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center text-sovereign font-bold text-sm">{c.contactName.charAt(0)}</div>
                <div>
                  <p className="text-sm font-semibold">{c.contactName}</p>
                  <p className="text-[0.6rem] text-muted-foreground font-mono">{c.contactGtid}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[0.6rem]">{c.contactType}</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs mb-2">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" style={{ color: healthColor(c.healthScore) }} /> {c.healthScore}</span>
              <span className="text-muted-foreground">{c.totalTrades} trades</span>
              <Badge variant="outline" className="text-[0.55rem]">{c.relationship}</Badge>
              {!c.autoSaved && <Badge className="text-[0.55rem] bg-gold/15 text-gold">Manual</Badge>}
            </div>
            {c.trustPortrait && (
              <div className="p-2 rounded-lg bg-gold/5 border border-gold/20">
                <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1 mb-0.5"><Sparkles className="w-2.5 h-2.5" /> AI Trust Portrait</p>
                <p className="text-[0.7rem] text-foreground/80">{c.trustPortrait}</p>
              </div>
            )}
          </Card>
        ))}
        {isLoading && <Card className="p-8 text-center text-xs text-muted-foreground col-span-2">Loading contacts…</Card>}
        {contacts?.length === 0 && <Card className="p-8 text-center text-xs text-muted-foreground col-span-2">No saved contacts yet. Add a GTID above to start your network.</Card>}
      </div>
    </div>
  );
}

// ============ Trade Readiness Assessment (Part 2.8) ============
export function ReadinessScreen({ tenantGtid }: { tenantGtid: string }) {
  const { data: readiness, isLoading } = useQuery({
    queryKey: ["readiness", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/readiness?tenant=${tenantGtid}`)).json(),
  });

  if (isLoading || !readiness) return <Card className="p-8 text-center text-xs text-muted-foreground">Calculating readiness…</Card>;

  const categories = [
    { label: "Company", score: readiness.companyScore, weight: 35, icon: Building2 },
    { label: "Banking", score: readiness.bankingScore, weight: 25, icon: Banknote },
    { label: "Trade", score: readiness.tradeScore, weight: 20, icon: Ship },
    { label: "Security", score: readiness.securityScore, weight: 15, icon: Lock },
    { label: "Legal", score: readiness.legalScore, weight: 5, icon: FileText },
  ];
  const status = readiness.score >= 85 ? "Fully Ready" : readiness.score >= 70 ? "Mostly Ready" : readiness.score >= 50 ? "Partially Ready" : "Not Ready";

  return (
    <div className="space-y-4">
      <SectionHeader title="Trade Readiness Assessment" subtitle="Part 2.8 — 5-category scorecard · Governor blocks trade.create if score < 70% · one-click remediation" />
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Readiness Score</p>
            <p className="text-4xl font-bold font-display" style={{ color: healthColor(readiness.score) }}>{readiness.score}<span className="text-lg text-muted-foreground">%</span></p>
            <p className="text-xs font-semibold" style={{ color: healthColor(readiness.score) }}>{status}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] text-muted-foreground">Required for trade.create</p>
            <p className="text-sm font-semibold">≥ 70%</p>
            <p className="text-[0.6rem] text-muted-foreground mt-1">Last calculated: {fmtDateTime(readiness.lastCalculated)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-1.5 mb-2"><Icon className="w-3.5 h-3.5" style={{ color: healthColor(c.score) }} /><span className="text-[0.65rem] font-medium">{c.label}</span><span className="text-[0.55rem] text-muted-foreground ml-auto">{c.weight}%</span></div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1"><div className="h-full rounded-full" style={{ width: `${c.score}%`, background: healthColor(c.score) }} /></div>
                <p className="text-xs font-semibold" style={{ color: healthColor(c.score) }}>{c.score}%</p>
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Checklist Items</h3>
        {readiness.checklist && (
          <div className="space-y-1 text-xs">
            {Object.entries(JSON.parse(readiness.checklist)).map(([cat, items]: any) => (
              <div key={cat} className="p-2 rounded-lg bg-muted/20"><span className="font-medium capitalize">{cat}:</span> <span className="text-muted-foreground">{items}</span></div>
            ))}
          </div>
        )}
        {readiness.score < 70 && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <p className="text-xs text-red-400">Governor will BLOCK trade creation until score reaches 70%. Complete the missing items above.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ SAR (Suspicious Activity Reports) (Part 1.12) ============
export function SarScreen() {
  const qc = useQueryClient();
  const [genUstn, setGenUstn] = useState("SGTX-8842A2B-5213D9E-20260418070000-P5Q6R7S8");
  const [genRule, setGenRule] = useState("value_mismatch");
  const [generating, setGenerating] = useState(false);
  const { data: sars } = useQuery({
    queryKey: ["sars"],
    queryFn: async () => (await fetch("/api/sgtx/sar")).json(),
  });

  const generate = async () => {
    setGenerating(true);
    try {
      await fetch("/api/sgtx/sar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeUstn: genUstn, detectionRule: genRule }),
      });
      qc.invalidateQueries({ queryKey: ["sars"] });
    } catch {}
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Suspicious Activity Reports" subtitle="Part 1.12 — A2 detection (Isolation Forest) · A1 narrative (AI) · Loom-chained · 7-year retention" />
      <Card className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">Generate a SAR draft for a trade. The A2 engine detects suspicious patterns; A1 (AI) generates the narrative.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Trade USTN</Label><Input value={genUstn} onChange={(e) => setGenUstn(e.target.value)} className="font-mono text-xs" /></div>
          <div>
            <Label className="text-xs">Detection Rule</Label>
            <Select value={genRule} onValueChange={setGenRule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volume_spike">Volume Spike</SelectItem>
                <SelectItem value="circular_trade">Circular Trade</SelectItem>
                <SelectItem value="value_mismatch">Value Mismatch</SelectItem>
                <SelectItem value="sanctions_proximity">Sanctions Proximity</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={generate} disabled={generating} className="bg-gold-gradient text-sovereign">
          {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5 mr-1.5" />} Generate SAR Draft
        </Button>
      </Card>
      <div className="space-y-3">
        {(sars || []).map((s: any) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.draftStatus), borderColor: `${statusColor(s.draftStatus)}55` }}>{s.draftStatus}</Badge>
              <Badge variant="outline" className="text-[0.6rem]">{s.reportType}</Badge>
              <Badge variant="outline" className="text-[0.6rem] text-amber-400 border-amber-500/30">{s.detectionRule.replace(/_/g, " ")}</Badge>
              <span className="text-[0.6rem] text-muted-foreground ml-auto">{fmtDateTime(s.createdAt)}</span>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed">{s.narrative}</p>
            <div className="flex items-center gap-2 mt-2 text-[0.6rem] text-muted-foreground">
              <span>USTNs: {JSON.parse(s.involvedUstns || "[]").join(", ").slice(0, 40)}…</span>
              {s.loomHash && <span className="flex items-center gap-1"><Hash className="w-2.5 h-2.5" /> Loom-chained</span>}
            </div>
            {s.draftStatus === "DRAFT" && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Submit to FIU</Button>
                <Button size="sm" variant="outline" className="h-7">Download PDF</Button>
                <Button size="sm" variant="outline" className="h-7">Request More Info</Button>
              </div>
            )}
          </Card>
        ))}
        {sars?.length === 0 && <Card className="p-8 text-center text-xs text-muted-foreground">No SARs generated yet.</Card>}
      </div>
    </div>
  );
}
