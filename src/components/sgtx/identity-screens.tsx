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

// ============ 2.9 Role Journey Maps (full day-by-day with Portal/Tab, Notifications, Documents, Approvals) ============
const ROLE_JOURNEYS = [
  {
    role: "Trader (Buyer – Importer)",
    days: [
      { day: "Day 1", action: "Register → Complete KYB", portal: "Trader (Buyer) wizard", notif: "Welcome email", docs: "Commercial register, tax ID", approvals: "None", exit: "Account VERIFIED" },
      { day: "Day 2", action: "Create trade request", portal: "New Trade Request", notif: "Smart Inbox: Request sent", docs: "—", approvals: "None", exit: "Trade request INITIATED" },
      { day: "Day 3", action: "Receive quote → Negotiate → Accept", portal: "Quote Review & Negotiation", notif: "Inbox: Quote received", docs: "Quote PDF", approvals: "Internal approval (if >$100k)", exit: "CONTRACT_LOCKED" },
      { day: "Day 4", action: "Sign contract", portal: "Contract Signing", notif: "Inbox: Sign contract", docs: "Contract PDF", approvals: "Passkey signature", exit: "Signatures complete" },
      { day: "Day 5", action: "Pay SGTX fee (if incoterm requires)", portal: "Invoices & Payments", notif: "Inbox: Fee due", docs: "Invoice", approvals: "PSP authentication", exit: "FEE_PAID" },
      { day: "Day 6–20", action: "Track shipment", portal: "Shipments (TCC)", notif: "Milestone updates (BOOKED, LOADED, DEPARTED, ARRIVED)", docs: "—", approvals: "None", exit: "ARRIVED" },
      { day: "Day 21", action: "Confirm delivery", portal: "Shipments (TCC)", notif: "Inbox: Confirm delivery", docs: "Delivery proof", approvals: "One click", exit: "DELIVERED" },
      { day: "Day 22", action: "Approve settlement", portal: "Invoices & Payments", notif: "Inbox: Settlement due", docs: "Settlement instruction", approvals: "Voice or one click", exit: "SETTLED" },
    ],
  },
  {
    role: "Trader (Seller – Exporter)",
    days: [
      { day: "Day 1", action: "Register → Complete KYB", portal: "Trader (Seller) wizard", notif: "Welcome email", docs: "Commercial register, export licence", approvals: "None", exit: "Account VERIFIED" },
      { day: "Day 2", action: "Receive buyer request → Accept", portal: "Pending Requests", notif: "Inbox: New trade request", docs: "—", approvals: "None", exit: "QUOTE_STARTED" },
      { day: "Day 3", action: "Lock EXW price → Design packing → Get logistics quotes", portal: "EXW Price Lock, Packing, Logistics Builder", notif: "—", docs: "Packing plan (draft)", approvals: "None", exit: "Packing plan locked" },
      { day: "Day 4", action: "Submit quote", portal: "Quote Submission", notif: "Inbox: Quote sent", docs: "Quote PDF", approvals: "None", exit: "QUOTED" },
      { day: "Day 5", action: "Receive acceptance → Sign contract → Pay SGTX fee", portal: "Contract Signing, Invoices", notif: "Inbox: Contract to sign, Fee due", docs: "Contract, Invoice", approvals: "Passkey signature", exit: "FEE_PAID, LOCKED" },
      { day: "Day 6", action: "Acknowledge container release", portal: "Shipments (TCC)", notif: "Email with release token", docs: "Release token", approvals: "One click", exit: "RELEASE_ACK" },
      { day: "Day 7", action: "Load container (warehouse)", portal: "Mobile app (LSP driver)", notif: "—", docs: "Barcode scans", approvals: "Biometric (voice)", exit: "LOADED" },
      { day: "Day 8–20", action: "Vessel departure → Transit", portal: "Shipments (TCC)", notif: "Milestone updates", docs: "Bill of lading", approvals: "None", exit: "DEPARTED" },
      { day: "Day 21", action: "Receive settlement", portal: "Invoices & Payments", notif: "Inbox: Payment received", docs: "Bank statement", approvals: "None", exit: "SETTLED" },
    ],
  },
  {
    role: "Logistics Service Provider (LSP)",
    days: [
      { day: "Day 1", action: "Register → KYB", portal: "LSP wizard", notif: "Welcome email", docs: "Business licence, insurance, fleet list", approvals: "None", exit: "VERIFIED" },
      { day: "Day 2", action: "Receive RFQ → Send quote", portal: "RFQ Inbox", notif: "Inbox: New RFQ", docs: "Quote", approvals: "None", exit: "Quote submitted" },
      { day: "Day 3", action: "Quote accepted → Sign addendum", portal: "Active Shipments", notif: "Inbox: Sign addendum", docs: "Logistics addendum", approvals: "Passkey", exit: "Addendum signed" },
      { day: "Day 4", action: "Acknowledge container release", portal: "Active Shipments", notif: "Email with token", docs: "Release token", approvals: "One click", exit: "RELEASE_ACK" },
      { day: "Day 5", action: "Dispatch driver → Load", portal: "Dispatch Planner, Mobile app", notif: "—", docs: "Barcode scans", approvals: "Voice", exit: "LOADED" },
      { day: "Day 6", action: "Deliver → Confirm milestone", portal: "Mobile app", notif: "—", docs: "Proof of delivery", approvals: "Voice", exit: "DELIVERED" },
    ],
  },
  {
    role: "Shipping Line (SHIP)",
    days: [
      { day: "Day 1", action: "Register → KYB", portal: "SHIP wizard", notif: "Welcome email", docs: "IMO number, vessel registry", approvals: "None", exit: "VERIFIED" },
      { day: "Day 2", action: "Receive booking request → Send quote", portal: "Booking Requests", notif: "Inbox: New booking", docs: "Quote", approvals: "None", exit: "Quote submitted" },
      { day: "Day 3", action: "Quote accepted → Confirm booking", portal: "Booking Requests", notif: "—", docs: "Booking confirmation", approvals: "One click", exit: "BOOKED" },
      { day: "Day 4", action: "Issue eBL", portal: "eBL Management", notif: "Inbox: eBL ready to sign", docs: "eBL", approvals: "Passkey", exit: "eBL issued" },
      { day: "Day 5", action: "Update milestones (departure, arrival)", portal: "Vessel Schedule", notif: "Inbox: Update ETD", docs: "—", approvals: "One click", exit: "DEPARTED, ARRIVED" },
      { day: "Day 6", action: "Generate freight invoice", portal: "Freight Invoices", notif: "—", docs: "Invoice", approvals: "None", exit: "Invoice sent" },
    ],
  },
  {
    role: "Customs Broker (CBR)",
    days: [
      { day: "Day 1", action: "Register → KYB", portal: "CBR wizard", notif: "Welcome email", docs: "Broker licence, bond, insurance", approvals: "None", exit: "VERIFIED" },
      { day: "Day 2", action: "Receive certification request → Send quote", portal: "Certification Requests", notif: "Inbox: Certification needed", docs: "Quote", approvals: "None", exit: "Quote submitted" },
      { day: "Day 3", action: "Review AI declaration → Certify", portal: "Certification Requests", notif: "—", docs: "Declaration (readonly)", approvals: "Digital seal (QES)", exit: "CERTIFIED" },
      { day: "Day 4", action: "(If physical handling) Receive courier → Present to customs → Upload stamped copy", portal: "Physical Document Jobs", notif: "Inbox: Package received", docs: "Stamped copy", approvals: "GPS-confirmed receive", exit: "COMPLETED" },
    ],
  },
  {
    role: "Laboratory (LAB)",
    days: [
      { day: "Day 1", action: "Register → KYB (ISO 17025)", portal: "LAB wizard", notif: "Welcome email", docs: "ISO 17025 certificate, accreditation", approvals: "None", exit: "VERIFIED" },
      { day: "Day 2", action: "Receive test request → Send quote", portal: "Test Requests", notif: "Inbox: New test request", docs: "Quote", approvals: "None", exit: "Quote submitted" },
      { day: "Day 3", action: "Quote accepted → Receive sample", portal: "Sampling Queue", notif: "Inbox: Sample received", docs: "Chain of custody", approvals: "None", exit: "SAMPLE_RECEIVED" },
      { day: "Day 4", action: "Perform analysis", portal: "Testing Queue", notif: "—", docs: "Raw data, spectra", approvals: "None", exit: "TESTING_COMPLETE" },
      { day: "Day 5", action: "Issue report", portal: "Reports & Results", notif: "Inbox: Report ready", docs: "Lab report (PDF)", approvals: "Digital seal", exit: "REPORT_ISSUED" },
    ],
  },
  {
    role: "QC Inspector",
    days: [
      { day: "Day 1", action: "Register → KYB (ISO 17020)", portal: "QC wizard", notif: "Welcome email", docs: "ISO 17020 certificate", approvals: "None", exit: "VERIFIED" },
      { day: "Day 2", action: "Receive inspection request → Send quote", portal: "Inspection Schedule", notif: "Inbox: Inspection needed", docs: "Quote", approvals: "None", exit: "Quote submitted" },
      { day: "Day 3", action: "Quote accepted → Schedule inspection", portal: "Inspection Schedule", notif: "—", docs: "Inspection plan", approvals: "None", exit: "SCHEDULED" },
      { day: "Day 4", action: "Perform inspection (field)", portal: "Field Inspections (mobile)", notif: "—", docs: "Photos, defect log", approvals: "None", exit: "INSPECTION_COMPLETE" },
      { day: "Day 5", action: "Issue report (pass/fail/conditional)", portal: "QC Reports", notif: "Inbox: Report ready", docs: "QC report (PDF)", approvals: "Digital seal", exit: "REPORT_ISSUED" },
    ],
  },
  {
    role: "Financier (Bank)",
    days: [
      { day: "Day 1", action: "Register → KYB + reserve proof", portal: "Bank wizard", notif: "Welcome email", docs: "Banking licence, reserve proof", approvals: "None", exit: "VERIFIED" },
      { day: "Day 2", action: "Set risk appetite + financing prefs", portal: "Portfolio Configuration", notif: "—", docs: "—", approvals: "None", exit: "CONFIGURED" },
      { day: "Day 3", action: "View RFQs", portal: "Financing Opportunities", notif: "Inbox: New RFQ", docs: "RFQ details", approvals: "None", exit: "RFQ_VIEWED" },
      { day: "Day 5", action: "Submit bid", portal: "Financing Opportunities", notif: "Inbox: Bid submitted", docs: "Bid terms", approvals: "Internal credit committee", exit: "BID_SUBMITTED" },
      { day: "Day 7", action: "Sign financing agreement", portal: "Portfolio", notif: "Inbox: Agreement to sign", docs: "Financing agreement", approvals: "QES (>$100k)", exit: "AGREEMENT_SIGNED" },
      { day: "Day 8+", action: "Disburse loan → Monitor repayment", portal: "Portfolio", notif: "Milestone: Disbursed", docs: "Disbursement instruction", approvals: "None", exit: "ONGOING_MONITORING" },
    ],
  },
  {
    role: "Government Officer",
    days: [
      { day: "Day 1", action: "Register → Admin access granted", portal: "Government wizard", notif: "Welcome email", docs: "Government credentials", approvals: "Multisig", exit: "VERIFIED" },
      { day: "Day 2", action: "Configure integrations (Nafeza, CBE, ETA)", portal: "Integrations Health", notif: "—", docs: "API credentials", approvals: "None", exit: "INTEGRATIONS_LIVE" },
      { day: "Day 3", action: "Monitor trade flow", portal: "National Trade Flow", notif: "Real-time alerts", docs: "—", approvals: "None", exit: "CONTINUOUS" },
      { day: "Day 5", action: "Assess customs declarations", portal: "Customs Assessment", notif: "Inbox: Declaration pending", docs: "Declaration (SAD)", approvals: "One click", exit: "CLEARED/HELD" },
      { day: "Day 7", action: "Reconcile FX settlement", portal: "FX & Settlement (CBE)", notif: "—", docs: "Settlement reports", approvals: "None", exit: "RECONCILED" },
    ],
  },
];

export function RoleJourneyScreen() {
  const [selected, setSelected] = useState(0);
  const journey = ROLE_JOURNEYS[selected];
  return (
    <div className="space-y-4">
      <SectionHeader title="Role Journey Maps" subtitle="Part 2.9 — day-by-day journey with Portal/Tab, Notifications, Documents, Approvals, Exit Conditions" />
      <div className="flex flex-wrap gap-2">
        {ROLE_JOURNEYS.map((r, i) => (
          <button key={r.role} onClick={() => setSelected(i)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selected === i ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
            {r.role}
          </button>
        ))}
      </div>
      <Card className="p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-display text-lg font-bold">{journey.role}</h3>
          <Badge variant="outline" className="text-[0.6rem]">{journey.days.length} stages</Badge>
        </div>
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-2 py-2">Day</th>
                <th className="text-left font-medium px-2 py-2">Action</th>
                <th className="text-left font-medium px-2 py-2 hidden sm:table-cell">Portal / Tab</th>
                <th className="text-left font-medium px-2 py-2 hidden md:table-cell">Notifications</th>
                <th className="text-left font-medium px-2 py-2 hidden lg:table-cell">Documents</th>
                <th className="text-left font-medium px-2 py-2 hidden lg:table-cell">Approvals</th>
                <th className="text-left font-medium px-2 py-2">Exit</th>
              </tr>
            </thead>
            <tbody>
              {journey.days.map((d, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-2 py-2.5"><span className="px-1.5 py-0.5 rounded bg-gold/15 text-gold font-mono text-[0.6rem] font-bold">{d.day}</span></td>
                  <td className="px-2 py-2.5 font-medium">{d.action}</td>
                  <td className="px-2 py-2.5 hidden sm:table-cell text-muted-foreground">{d.portal}</td>
                  <td className="px-2 py-2.5 hidden md:table-cell text-muted-foreground">{d.notif}</td>
                  <td className="px-2 py-2.5 hidden lg:table-cell text-muted-foreground">{d.docs}</td>
                  <td className="px-2 py-2.5 hidden lg:table-cell text-muted-foreground">{d.approvals}</td>
                  <td className="px-2 py-2.5"><span className="text-[0.6rem] font-mono text-emerald-400">{d.exit}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============ 2.10 Trade Trust Passport (full 6-section UI) ============
export function TrustPassportScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [passport, setPassport] = useState<any>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareDims, setShareDims] = useState<string[]>(["all"]);
  const [showW3c, setShowW3c] = useState(false);
  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/gtid/resolve?gtid=${tenantGtid}`)).json(),
  });
  const { data: sharesData } = useQuery({
    queryKey: ["passport-shares", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/trust-passport/share?tenant=${tenantGtid}`)).json(),
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
        body: JSON.stringify({ tenantGtid, dimensions: shareDims }),
      });
      const d = await res.json();
      setShareLink(d.token);
      qc.invalidateQueries({ queryKey: ["passport-shares", tenantGtid] });
    } catch {}
  };

  const revoke = async (token: string) => {
    await fetch("/api/sgtx/trust-passport/share", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    qc.invalidateQueries({ queryKey: ["passport-shares", tenantGtid] });
  };

  const copyLink = (token: string) => { navigator.clipboard.writeText(`${window.location.origin}/api/sgtx/trust-passport/verify?token=${token}`); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const triColor = (score: number) => score >= 800 ? "#10b981" : score >= 600 ? "#fbbf24" : "#f87171";
  const components = passport ? [
    { label: "Settlement Reliability", value: passport.components.settlementReliability, weight: 25 },
    { label: "Compliance Health", value: passport.components.complianceHealth, weight: 20 },
    { label: "Documentation Quality", value: passport.components.documentationQuality, weight: 15 },
    { label: "Financing Performance", value: passport.components.financingPerformance, weight: 20 },
    { label: "Dispute Resolution", value: passport.components.disputeResolution, weight: 20 },
  ] : [];
  const optionalDims = passport ? [
    { label: "Customs Performance", value: passport.optionalDimensions.customsPerformance },
    { label: "Logistics Performance", value: passport.optionalDimensions.logisticsPerformance },
    { label: "Trade Volume Consistency", value: passport.optionalDimensions.tradeVolumeConsistency },
  ] : [];

  const dimOptions = [
    { id: "settlement_reliability", label: "Settlement Reliability" },
    { id: "compliance_health", label: "Compliance Health" },
    { id: "documentation_quality", label: "Documentation Quality" },
    { id: "financing_performance", label: "Financing Performance" },
    { id: "dispute_resolution", label: "Dispute Resolution" },
    { id: "financing_summary", label: "Financing Summary" },
    { id: "dispute_summary", label: "Dispute Summary" },
    { id: "customs_performance", label: "Customs Performance" },
    { id: "logistics_performance", label: "Logistics Performance" },
    { id: "trade_volume_consistency", label: "Trade Volume Consistency" },
    { id: "trust_graph", label: "Trust Graph Reference (ZK)" },
  ];

  const toggleDim = (id: string) => {
    if (id === "all") { setShareDims(["all"]); return; }
    setShareDims(d => d.includes("all") ? [id] : d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Trade Trust Passport™" subtitle="Part 2.10 — W3C Verifiable Credential · TRI (0-1000) · Ed25519 signed · Loom-anchored · 90-day expiry · dimension consent" />

      {/* Section 1: Current Passport */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm">{tenant?.legal_name || tenantGtid}</h3>
            <p className="text-[0.65rem] text-muted-foreground font-mono">{tenantGtid}</p>
          </div>
          <div className="flex gap-2">
            {passport && <Button onClick={() => setShowW3c(!showW3c)} variant="outline" size="sm" className="h-8"><FileText className="w-3.5 h-3.5 mr-1.5" /> W3C JSON</Button>}
            <Button onClick={generate} disabled={generating} className="bg-gold-gradient text-sovereign h-8">
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Award className="w-3.5 h-3.5 mr-1.5" />}
              {passport ? "Refresh" : "Generate"} Passport
            </Button>
          </div>
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
                {passport.triConfidence < 50 && <p className="text-[0.6rem] text-amber-400 mt-1">⚠ Limited history – score may not be predictive</p>}
              </div>
              <div className="text-right">
                <p className="text-[0.6rem] text-muted-foreground">Confidence</p>
                <p className="text-2xl font-bold text-gold">{passport.triConfidence}%</p>
                <Badge variant="outline" className="text-[0.6rem] mt-1"><Lock className="w-2.5 h-2.5 mr-1" /> Ed25519 + Loom</Badge>
              </div>
            </div>
          </Card>

          {/* TRI Components (5 mandatory) */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gold" /> TRI Components (0-1000, weighted)</h3>
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

          {/* Optional Dimensions (Part 2.10.6) */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gold" /> Optional Dimensions (consent-gated)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {optionalDims.map((d) => (
                <div key={d.label} className="p-3 rounded-lg bg-muted/20">
                  <span className="text-[0.6rem] text-muted-foreground">{d.label}</span>
                  <p className="text-lg font-bold" style={{ color: triColor(d.value) }}>{d.value}</p>
                  <Badge variant="outline" className="text-[0.5rem] mt-1">optional · 0% weight</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* W3C Credential JSON */}
          {showW3c && (
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> W3C Verifiable Credential (JSON-LD)</h3>
              <pre className="p-3 rounded-lg bg-sovereign-deep/50 border border-border text-[0.6rem] font-mono text-foreground/80 overflow-x-auto scroll-gold max-h-64 leading-relaxed">{JSON.stringify(passport.w3cCredential, null, 2)}</pre>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-muted/20 break-all"><p className="text-[0.6rem] text-muted-foreground">Credential Hash</p><p className="font-mono">{passport.credentialHash.slice(0, 40)}…</p></div>
                <div className="p-2 rounded-lg bg-muted/20 break-all"><p className="text-[0.6rem] text-muted-foreground">Loom Hash</p><p className="font-mono">{passport.loomHash.slice(0, 40)}…</p></div>
                <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Expiry</p><p className="font-mono">{fmtDateTime(passport.expiresAt)}</p></div>
              </div>
            </Card>
          )}

          {/* Verified Identifiers + Compliance Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> Verified Identifiers</h3>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> KYB Tier {tenant?.kyb_tier}</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Commercial Register</div>
                {tenant?.kyb_tier >= 3 && <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> LEI (549300ABC123)</div>}
              </div>
              <Button size="sm" variant="outline" className="h-7 mt-2 text-[0.65rem]">+ Add New Identifier</Button>
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

          {/* Trust Graph Reference (ZK) */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Link2 className="w-4 h-4 text-gold" /> Trust Graph Reference (Zero-Knowledge)</h3>
            <p className="text-xs text-muted-foreground">Anonymised network degree — generated using ZK proofs, no raw graph data revealed.</p>
            <p className="text-sm font-mono text-gold mt-1">{passport.w3cCredential.credentialSubject.trust_graph_reference}</p>
          </Card>

          {/* Section 2: Active Shares */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-gold" /> Active Shares</h3>
            <div className="space-y-2">
              {(sharesData?.shares || []).filter((s: any) => !s.revoked).map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                  <span className="text-xs font-mono flex-1 truncate">{s.token.slice(0, 20)}…</span>
                  <Badge variant="outline" className="text-[0.55rem]">{s.sharedWithGtid || "Anonymous"}</Badge>
                  <span className="text-[0.6rem] text-muted-foreground">{JSON.parse(s.dimensions || '["all"]').join(", ").slice(0, 30)}</span>
                  <Button size="sm" variant="ghost" onClick={() => copyLink(s.token)} className="h-6 px-2"><Copy className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => revoke(s.token)} className="h-6 px-2 text-red-400">Revoke</Button>
                </div>
              ))}
              {(sharesData?.shares || []).filter((s: any) => !s.revoked).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No active shares.</p>}
            </div>
          </Card>

          {/* Section 3: Sharing Workflow with dimension consent */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-gold" /> Share Passport (with dimension consent)</h3>
            <div className="mb-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Select dimensions to share</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => toggleDim("all")} className={`px-2.5 py-1 rounded-full text-[0.65rem] font-medium ${shareDims.includes("all") ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground"}`}>All (mandatory)</button>
                {dimOptions.map(d => (
                  <button key={d.id} onClick={() => toggleDim(d.id)} className={`px-2.5 py-1 rounded-full text-[0.65rem] ${shareDims.includes(d.id) ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/30 text-muted-foreground border border-transparent"}`}>{d.label}</button>
                ))}
              </div>
            </div>
            {!shareLink ? (
              <Button onClick={share} variant="outline" size="sm" className="h-8"><Link2 className="w-3.5 h-3.5 mr-1.5" /> Generate Sharing Link (7-day)</Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gold/5 border border-gold/20">
                  <span className="text-xs font-mono flex-1 truncate">{window.location.origin}/api/sgtx/trust-passport/verify?token={shareLink}</span>
                  <Button size="sm" variant="ghost" onClick={() => copyLink(shareLink)} className="h-7"><Copy className="w-3.5 h-3.5" />{copied ? "copied!" : ""}</Button>
                </div>
                <p className="text-[0.6rem] text-muted-foreground">Recipient opens link → sees only consented dimensions in W3C VC format. <button onClick={() => revoke(shareLink)} className="text-red-400 hover:underline">Revoke</button></p>
              </div>
            )}
          </Card>

          {/* Section 4: Sharing History */}
          {(sharesData?.shares || []).length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Sharing History (1-year retention)</h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto scroll-gold">
                {(sharesData?.shares || []).map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                    <span className="font-mono text-[0.6rem]">{s.token.slice(0, 16)}…</span>
                    <span className="text-muted-foreground">{s.sharedWithGtid || "Anonymous"}</span>
                    <Badge variant="outline" className={`text-[0.55rem] ${s.revoked ? "text-red-400" : "text-emerald-400"}`}>{s.revoked ? "REVOKED" : "ACTIVE"}</Badge>
                    <span className="text-[0.6rem] text-muted-foreground ml-auto">{fmtDateTime(s.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Section 5: Dispute Score */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-gold" /> Dispute Score</h3>
            <p className="text-xs text-muted-foreground mb-2">If you believe your TRI score is incorrect, you can dispute it. This triggers a human review (A3 escalation) and temporarily freezes the passport.</p>
            <Button size="sm" variant="outline" className="h-7 text-[0.65rem]">Dispute Score</Button>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
