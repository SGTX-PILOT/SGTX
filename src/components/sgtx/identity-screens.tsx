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
import { fmtDateTime, healthColor } from "@/lib/sgtx/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Building2, GitBranch, DollarSign, Users, CheckCircle2, Award, Link2, Copy, Lock, AlertTriangle, TrendingUp, FileText, Clock } from "lucide-react";

// ============ 2.4 Internal Tenant Organization Graph ============
export function OrgGraphScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("businessUnit");
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["org-graph", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/org-graph?tenant=${tenantGtid}`)).json(),
  });

  const create = async () => {
    if (!newName || creating) return;
    setCreating(true);
    try {
      await fetch("/api/sgtx/org-graph", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, tenantGtid, name: newName, action: "contract.sign", threshold: 100000, requiredApprovals: 2 }),
      });
      setNewName("");
      qc.invalidateQueries({ queryKey: ["org-graph", tenantGtid] });
    } catch {}
    finally { setCreating(false); }
  };

  const sections = [
    { key: "businessUnits", label: "Business Units", icon: Building2, items: data?.businessUnits || [], color: "#60a5fa" },
    { key: "departments", label: "Departments", icon: GitBranch, items: data?.departments || [], color: "#a78bfa" },
    { key: "costCenters", label: "Cost Centers", icon: DollarSign, items: data?.costCenters || [], color: "#10b981" },
    { key: "approvalGroups", label: "Approval Groups", icon: Users, items: data?.approvalGroups || [], color: "#fbbf24" },
    { key: "approvalPolicies", label: "Approval Policies", icon: ShieldCheck, items: data?.approvalPolicies || [], color: "#fb923c" },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Internal Organization Graph" subtitle="Part 2.4 — business units · departments · cost centers · approval groups/policies · purely internal" />
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="businessUnit">Business Unit</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="costCenter">Cost Center</SelectItem>
              <SelectItem value="approvalGroup">Approval Group</SelectItem>
              <SelectItem value="approvalPolicy">Approval Policy</SelectItem>
            </SelectContent>
          </Select>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name..." className="flex-1" />
          <Button onClick={create} disabled={creating || !newName} className="bg-gold-gradient text-sovereign">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus />}
            Add
          </Button>
        </div>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}1a` }}>
                  <Icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <h3 className="font-semibold text-sm">{s.label}</h3>
                <Badge variant="outline" className="text-[0.6rem] ml-auto">{s.items.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {s.items.map((item: any) => (
                  <div key={item.id} className="p-2 rounded-lg bg-muted/20 text-xs">
                    <p className="font-medium">{item.name}</p>
                    {item.action && <p className="text-[0.6rem] text-muted-foreground mt-0.5">{item.action} · ≥${item.threshold?.toLocaleString()} · {item.requiredApprovals} approvals</p>}
                    {item.code && <p className="text-[0.6rem] text-muted-foreground mt-0.5">Code: {item.code}</p>}
                  </div>
                ))}
                {s.items.length === 0 && <p className="text-[0.65rem] text-muted-foreground text-center py-2">None yet</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
function Plus(props: any) { return <span className="text-lg leading-none">+</span>; }

// ============ 2.5 Tenant Lifecycle Engine ============
export function LifecycleScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["lifecycle", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/lifecycle/history?tenant=${tenantGtid}`)).json(),
  });

  const transition = async (toState: string) => {
    setTransitioning(toState);
    try {
      await fetch("/api/sgtx/lifecycle/transition", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid, toState, reason: "manual transition" }),
      });
      qc.invalidateQueries({ queryKey: ["lifecycle", tenantGtid] });
    } catch {}
    finally { setTransitioning(null); }
  };

  const currentState = data?.currentState;
  const states = data?.states || [];
  const history = data?.history || [];

  return (
    <div className="space-y-4">
      <SectionHeader title="Tenant Lifecycle Engine" subtitle="Part 2.5 — 8-state machine · Governor-gated transitions · AI Smart Inbox notifications" />
      {/* Current state banner */}
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${states.find((s: any) => s.state === currentState)?.color || "#94a3b8"}22` }}>
            <ShieldCheck className="w-7 h-7" style={{ color: states.find((s: any) => s.state === currentState)?.color || "#94a3b8" }} />
          </div>
          <div>
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Current State</p>
            <p className="font-display text-xl font-bold" style={{ color: states.find((s: any) => s.state === currentState)?.color || "#94a3b8" }}>{currentState}</p>
            <p className="text-xs text-muted-foreground">{states.find((s: any) => s.state === currentState)?.desc}</p>
          </div>
        </div>
      </Card>
      {/* State machine diagram */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">State Machine</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {states.map((s: any) => {
            const isCurrent = s.state === currentState;
            return (
              <div key={s.state} className={`p-2.5 rounded-lg border-2 transition-all ${isCurrent ? "border-gold bg-gold/5" : "border-border bg-muted/20"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-xs font-semibold">{s.label}</span>
                  {isCurrent && <Badge className="text-[0.5rem] bg-gold/15 text-gold ml-auto">CURRENT</Badge>}
                </div>
                <p className="text-[0.6rem] text-muted-foreground mb-2">{s.desc}</p>
                {!isCurrent && (
                  <button onClick={() => transition(s.state)} disabled={transitioning === s.state} className="text-[0.6rem] text-gold hover:underline disabled:opacity-50">
                    {transitioning === s.state ? "…" : "→ transition"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      {/* Transition history */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-gold" /> Transition History</h3>
        <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-gold">
          {history.map((h: any) => (
            <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
              <span className="font-mono text-[0.6rem] px-1.5 py-0.5 rounded" style={{ background: `${states.find((s: any) => s.state === h.fromState)?.color || "#94a3b8"}22`, color: states.find((s: any) => s.state === h.fromState)?.color }}>{h.fromState}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-[0.6rem] px-1.5 py-0.5 rounded" style={{ background: `${states.find((s: any) => s.state === h.toState)?.color || "#94a3b8"}22`, color: states.find((s: any) => s.state === h.toState)?.color }}>{h.toState}</span>
              <span className="text-muted-foreground flex-1 truncate">{h.reason}</span>
              <span className="text-[0.6rem] text-muted-foreground">{fmtDateTime(h.createdAt)}</span>
            </div>
          ))}
          {history.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No transitions yet.</p>}
        </div>
      </Card>
    </div>
  );
}

// ============ 2.9 Role Journey Maps ============
const ROLE_JOURNEYS = [
  { role: "Trader (Buyer)", day1: "Onboard → GTID confirmed", day2: "Complete readiness (banking, incoterm)", day3: "Create first trade request", day5: "Review quotes, negotiate", day7: "Sign contract (QES)", day10: "Track shipment, approve settlement", exit: "Trade settled → trust score updated" },
  { role: "Trader (Seller)", day1: "Onboard → GTID confirmed", day2: "Set EXW pricing, packing plan", day3: "Receive trade request", day5: "Submit quote, negotiate", day7: "Sign contract + logistics addenda", day10: "Confirm milestones, release cargo", exit: "Payment received → trust score updated" },
  { role: "LSP", day1: "Onboard → register fleet", day2: "Set serviceable routes", day3: "Receive assignment", day5: "Pickup container", day7: "Confirm milestones", exit: "Delivery confirmed → invoice paid" },
  { role: "Shipping Line", day1: "Onboard → register vessels", day2: "Set schedules", day3: "Receive booking", day5: "Load container, issue B/L", day7: "Depart, update AIS", exit: "Arrive → authorize release" },
  { role: "Laboratory", day1: "Onboard → ISO 17025 verified", day2: "Set test panels", day3: "Receive sample", day5: "Perform analysis", day7: "Issue report", exit: "Report verified → invoice paid" },
  { role: "QC Inspector", day1: "Onboard → ISO 17020 verified", day2: "Set inspection plans", day3: "Receive schedule", day5: "Perform inspection", day7: "Issue report (pass/fail)", exit: "Report verified → invoice paid" },
  { role: "Customs Broker", day1: "Onboard → license verified", day2: "Set service catalogue", day3: "Receive declaration request", day5: "File via Nafeza", day7: "Issue certificates", exit: "Clearance complete → invoice paid" },
  { role: "Financier (Bank)", day1: "Onboard → reserve proof", day2: "Set risk appetite", day3: "View RFQs", day5: "Submit bid", day7: "Sign financing agreement", exit: "Loan disbursed → repayment monitoring" },
  { role: "Financier (Private)", day1: "Onboard", day2: "Set portfolio prefs", day3: "View RFQs", day5: "Submit bid", day7: "Sign agreement", exit: "Loan disbursed" },
  { role: "Government", day1: "Onboard → admin access", day2: "Configure integrations", day3: "Monitor trade flow", day5: "Assess declarations", day7: "Reconcile FX", exit: "Continuous oversight" },
  { role: "Platform Admin", day1: "Multisig setup", day2: "Configure add-ons", day3: "Hot-reload policies", day5: "Run chaos tests", day7: "Review SARs", exit: "Continuous governance" },
  { role: "Marketplace Partner", day1: "Onboard → API key issued", day2: "Integrate via OpenAPI", day3: "Subscribe to events", day5: "Pull trade data", day7: "Push updates", exit: "Ongoing integration" },
];

export function RoleJourneyScreen() {
  const [selected, setSelected] = useState(0);
  const journey = ROLE_JOURNEYS[selected];
  const days = [
    { label: "Day 1", value: journey.day1 },
    { label: "Day 2", value: journey.day2 },
    { label: "Day 3", value: journey.day3 },
    { label: "Day 5", value: journey.day5 },
    { label: "Day 7", value: journey.day7 },
    { label: "Day 10", value: journey.day10 },
  ];
  return (
    <div className="space-y-4">
      <SectionHeader title="Role Journey Maps" subtitle="Part 2.9 — day-by-day expected journey for all 12 portal roles" />
      <div className="flex flex-wrap gap-2">
        {ROLE_JOURNEYS.map((r, i) => (
          <button key={r.role} onClick={() => setSelected(i)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selected === i ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
            {r.role}
          </button>
        ))}
      </div>
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-display text-lg font-bold">{journey.role}</h3>
          <Badge variant="outline" className="text-[0.6rem]">12 roles</Badge>
        </div>
        <div className="space-y-2">
          {days.map((d, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
              <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[0.6rem] font-bold text-gold">{d.label.replace("Day ", "D")}</span>
              </div>
              <div className="flex-1 pt-1">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">{d.label}</p>
                <p className="text-sm text-foreground">{d.value}</p>
              </div>
              {i < days.length - 1 && <div className="absolute" />}
            </div>
          ))}
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-[0.6rem] tracking-widest text-emerald-400 uppercase font-semibold">Exit Condition</p>
              <p className="text-sm text-foreground">{journey.exit}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============ 2.10 Trade Trust Passport ============
export function TrustPassportScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [passport, setPassport] = useState<any>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/gtid/resolve?gtid=${tenantGtid}`)).json(),
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/sgtx/trust-passport/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid }),
      });
      const d = await res.json();
      setPassport(d);
    } catch {}
    finally { setGenerating(false); }
  };

  const share = async () => {
    try {
      const res = await fetch("/api/sgtx/trust-passport/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid }),
      });
      const d = await res.json();
      setShareLink(d.token);
    } catch {}
  };

  const copyLink = () => { if (shareLink) { navigator.clipboard.writeText(`${window.location.origin}/api/sgtx/trust-passport/verify?token=${shareLink}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  const triColor = (score: number) => score >= 800 ? "#10b981" : score >= 600 ? "#fbbf24" : "#f87171";
  const components = passport ? [
    { label: "Settlement Reliability", value: passport.components.settlementReliability, weight: 25 },
    { label: "Compliance Health", value: passport.components.complianceHealth, weight: 20 },
    { label: "Documentation Quality", value: passport.components.documentationQuality, weight: 15 },
    { label: "Financing Performance", value: passport.components.financingPerformance, weight: 20 },
    { label: "Dispute Resolution", value: passport.components.disputeResolution, weight: 20 },
  ] : [];

  return (
    <div className="space-y-4">
      <SectionHeader title="Trade Trust Passport™" subtitle="Part 2.10 — W3C verifiable credential · TRI (0-1000) · Ed25519 signed · 90-day expiry · one-click sharing" />
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm">{tenant?.legal_name || tenantGtid}</h3>
            <p className="text-[0.65rem] text-muted-foreground font-mono">{tenantGtid}</p>
          </div>
          <Button onClick={generate} disabled={generating} className="bg-gold-gradient text-sovereign">
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Award className="w-3.5 h-3.5 mr-1.5" />}
            {passport ? "Regenerate" : "Generate"} Passport
          </Button>
        </div>
        {!passport && !generating && (
          <p className="text-xs text-muted-foreground text-center py-8">Generate a Trade Trust Passport to create a portable, verifiable institutional trust profile (W3C standard).</p>
        )}
      </Card>

      {passport && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* TRI Score Card */}
          <Card className="p-6" style={{ background: "linear-gradient(135deg, oklch(0.17 0.01 240) 0%, oklch(0.20 0.015 84) 100%)" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Trade Reliability Index</p>
                <p className="font-display text-5xl font-bold" style={{ color: triColor(passport.triScore) }}>{passport.triScore}<span className="text-lg text-muted-foreground">/1000</span></p>
                <p className="text-sm font-semibold" style={{ color: triColor(passport.triScore) }}>{passport.triStatus}</p>
              </div>
              <div className="text-right">
                <p className="text-[0.6rem] text-muted-foreground">Confidence</p>
                <p className="text-2xl font-bold text-gold">{passport.triConfidence}%</p>
                <Badge variant="outline" className="text-[0.6rem] mt-1"><Lock className="w-2.5 h-2.5 mr-1" /> Ed25519 signed</Badge>
              </div>
            </div>
          </Card>

          {/* TRI Components */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gold" /> TRI Components (0-1000)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {components.map((c) => (
                <div key={c.label} className="p-3 rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[0.6rem] text-muted-foreground">{c.label}</span>
                    <span className="text-[0.55rem] text-muted-foreground">{c.weight}%</span>
                  </div>
                  <p className="text-lg font-bold" style={{ color: triColor(c.value) }}>{c.value}</p>
                  <div className="h-1 rounded-full bg-muted overflow-hidden mt-1"><div className="h-full rounded-full" style={{ width: `${(c.value / 10)}%`, background: triColor(c.value) }} /></div>
                </div>
              ))}
            </div>
          </Card>

          {/* Passport details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> Verified Identifiers</h3>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> KYB Tier {tenant?.kyb_tier}</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Commercial Register</div>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Compliance Summary</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Sanctions:</span><span className={tenant?.sanctions_cleared ? "text-emerald-400" : "text-red-400"}>{tenant?.sanctions_cleared ? "✓ Cleared" : "✗ Hit"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PEP:</span><span className="text-emerald-400">Clear</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Jurisdiction:</span><span>{tenant?.jurisdiction}</span></div>
              </div>
            </Card>
          </div>

          {/* Signature + expiry */}
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg bg-muted/20 break-all"><p className="text-[0.6rem] text-muted-foreground mb-1">Signature (Ed25519)</p><p className="font-mono">{passport.signature}</p></div>
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground mb-1">Expiry</p><p className="font-mono">{fmtDateTime(passport.expiresAt)}</p><p className="text-[0.6rem] text-muted-foreground mt-1">90 days from issue</p></div>
            </div>
          </Card>

          {/* Sharing workflow */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-gold" /> Sharing Workflow (One-Click)</h3>
            {!shareLink ? (
              <Button onClick={share} variant="outline" size="sm" className="h-8"><Link2 className="w-3.5 h-3.5 mr-1.5" /> Generate Sharing Link (7-day)</Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gold/5 border border-gold/20">
                  <span className="text-xs font-mono flex-1 truncate">{window.location.origin}/api/sgtx/trust-passport/verify?token={shareLink}</span>
                  <Button size="sm" variant="ghost" onClick={copyLink} className="h-7"><Copy className="w-3.5 h-3.5" />{copied ? "copied!" : ""}</Button>
                </div>
                <p className="text-[0.6rem] text-muted-foreground">Recipient uses GET /v1/trust/verify/{shareLink.slice(0, 8)}… → returns signed passport. <button className="text-red-400 hover:underline">Revoke Access</button></p>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
