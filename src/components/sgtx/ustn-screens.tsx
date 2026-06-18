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
import { fmtDateTime } from "@/lib/sgtx/format";
import { Loader2, FileText, ShieldCheck, Link2, Copy, CheckCircle2, QrCode, GitBranch, Lock } from "lucide-react";

// ============ 3.3/3.5/3.9/3.12 USTN Master Object & Resolution ============
export function UstnMasterScreen() {
  const [ustn, setUstn] = useState("SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4");
  const [role, setRole] = useState("gov");
  const [master, setMaster] = useState<any>(null);
  const [resolved, setResolved] = useState<any>(null);
  const [blockchain, setBlockchain] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<"master" | "resolve" | "blockchain" | "qr" | "lifecycle" | "autocomplete">("master");
  const [copied, setCopied] = useState(false);
  const [autoResults, setAutoResults] = useState<any[]>([]);
  const [autoQuery, setAutoQuery] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);

  // 3.10 Autocomplete
  const onAutoSearch = async (q: string) => {
    setAutoQuery(q);
    if (q.length < 2) { setAutoResults([]); return; }
    setAutoLoading(true);
    try {
      const res = await fetch(`/api/sgtx/ustn/autocomplete?query=${q}&tenant=SGTX-DE-TRD-001234-5B6C`);
      const d = await res.json();
      setAutoResults(d.results || []);
    } catch {} finally { setAutoLoading(false); }
  };

  // 3.11 Lifecycle example
  const lifecycleExample = [
    { step: 1, event: "Buyer creates trade request", status: "INITIATED", notes: "USTN generated at this point" },
    { step: 2, event: "Seller submits quote", status: "STAGE1_PENDING", notes: "—" },
    { step: 3, event: "Buyer accepts quote; contract signed", status: "STAGE1_SETTLED", notes: "After seller's side pays SGTX fee" },
    { step: 4, event: "Lab submits test results", status: "CUSTOMS_SUBMITTED", notes: "Nafeza declaration filed" },
    { step: 5, event: "Broker certifies declaration", status: "CUSTOMS_SUBMITTED", notes: "Declaration resubmitted under broker's licence" },
    { step: 6, event: "Shipping line confirms booking", status: "BOOKED", notes: "—" },
    { step: 7, event: "Trucking company scans pallets", status: "LOADED", notes: "—" },
    { step: 8, event: "Vessel departs", status: "DEPARTED", notes: "—" },
    { step: 9, event: "Vessel arrives", status: "ARRIVED", notes: "—" },
    { step: 10, event: "Buyer confirms delivery", status: "DELIVERED", notes: "—" },
    { step: 11, event: "Buyer pays principal", status: "SETTLED", notes: "—" },
    { step: 12, event: "30 days after settlement", status: "COMPLETED", notes: "System archives" },
  ];

  const loadMaster = async () => {
    setLoading("master");
    try {
      const res = await fetch(`/api/sgtx/ustn/master?ustn=${ustn}`);
      const d = await res.json();
      setMaster(d);
    } catch {}
    finally { setLoading(null); }
  };

  const loadResolved = async () => {
    setLoading("resolve");
    try {
      const res = await fetch(`/api/sgtx/ustn/resolve?ustn=${ustn}&role=${role}`);
      const d = await res.json();
      setResolved(d);
    } catch {}
    finally { setLoading(null); }
  };

  const loadBlockchain = async () => {
    setLoading("blockchain");
    try {
      const res = await fetch(`/api/sgtx/ustn/blockchain-proof?ustn=${ustn}`);
      const d = await res.json();
      setBlockchain(d);
    } catch {}
    finally { setLoading(null); }
  };

  const loadQr = async () => {
    setLoading("qr");
    try {
      const res = await fetch(`/api/sgtx/ustn/qr?ustn=${ustn}`);
      const d = await res.json();
      setQr(d);
    } catch {}
    finally { setLoading(null); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="space-y-4">
      <SectionHeader title="USTN Master Object" subtitle="Part 3 — Universal Shipment Tracking Number · 42-char · company-anchored · blockchain-anchored · QR-coded" />
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="SGTX-XXXXXX-XXXXXX-YYYYMMDDHHMMSS-XXXXXXXX" className="font-mono text-xs flex-1" />
          <Button onClick={() => { if (tab === "master") loadMaster(); else if (tab === "resolve") loadResolved(); else if (tab === "blockchain") loadBlockchain(); else loadQr(); }} disabled={!!loading} className="bg-gold-gradient text-sovereign h-9">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />} Load
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["master", "resolve", "blockchain", "qr", "lifecycle", "autocomplete"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-full text-xs font-medium ${tab === t ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground"}`}>
              {t === "master" ? "3.3 Master Object" : t === "resolve" ? "3.5 Resolution" : t === "blockchain" ? "3.9 Blockchain Proof" : t === "qr" ? "3.12 QR Code" : t === "lifecycle" ? "3.11 Lifecycle" : "3.10 Search"}
            </button>
          ))}
        </div>
        {tab === "resolve" && (
          <div>
            <Label className="text-xs">Requester Role (filters the response)</Label>
            <Select value={role} onValueChange={setRole}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>
              {["buyer", "seller", "lsp", "ship", "financier", "gov"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent></Select>
          </div>
        )}
      </Card>

      {/* 3.3 Master Object */}
      {tab === "master" && master && !master.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">USTN</p>
                <p className="font-mono text-sm text-gold">{master.ustn}</p>
              </div>
              <Badge variant="outline" className="text-sm font-bold">{master.status}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Created</p><p>{fmtDateTime(master.created_at)}</p></div>
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Updated</p><p>{fmtDateTime(master.updated_at)}</p></div>
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Risk Score</p><p className="font-bold" style={{ color: master.risk_assessment.platform_risk_score > 50 ? "#f87171" : "#10b981" }}>{master.risk_assessment.platform_risk_score}/100</p></div>
              <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">GNN Proximity</p><p>{master.risk_assessment.gnn_risk.sanctions_proximity} hops</p></div>
            </div>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2">Parties</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Exporter:</span><span>{master.parties.exporter.legal_name} ({master.parties.exporter.jurisdiction})</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Importer:</span><span>{master.parties.importer.legal_name} ({master.parties.importer.jurisdiction})</span></div>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2">Goods</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">HS:</span><span className="font-mono">{master.goods.hs_code}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Desc:</span><span>{master.goods.description}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Net:</span><span>{master.goods.net_weight_kg} kg</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Value:</span><span>${master.goods.invoice_value.amount.toLocaleString()} {master.goods.invoice_value.currency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Incoterm:</span><span>{master.goods.incoterm}</span></div>
              </div>
            </Card>
          </div>
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><GitBranch className="w-4 h-4 text-gold" /> Blockchain Anchor (3.9)</h3>
            <div className="space-y-1 text-xs">
              <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">TXID:</span> <span className="font-mono">{master.blockchain_anchor.txid}</span></div>
              <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">Merkle Root:</span> <span className="font-mono">{master.blockchain_anchor.merkle_root}</span></div>
              <div className="p-2 rounded-lg bg-muted/20"><span className="text-[0.6rem] text-muted-foreground">Network:</span> <span>{master.blockchain_anchor.network}</span></div>
              <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">PQC Signature:</span> <span className="font-mono">{master.blockchain_anchor.pqc_signature}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-2">Raw JSON (Show)</h3>
            <pre className="p-3 rounded-lg bg-sovereign-deep/50 border border-border text-[0.6rem] font-mono text-foreground/80 overflow-x-auto scroll-gold max-h-64">{JSON.stringify(master, null, 2)}</pre>
          </Card>
        </motion.div>
      )}

      {/* 3.5 Resolution */}
      {tab === "resolve" && resolved && !resolved.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Role-Filtered Resolution (role: {role})</h3>
              <Badge variant="outline" className="text-[0.6rem]">{resolved.status}</Badge>
            </div>
            <pre className="p-3 rounded-lg bg-sovereign-deep/50 border border-border text-[0.6rem] font-mono text-foreground/80 overflow-x-auto scroll-gold max-h-96">{JSON.stringify(resolved, null, 2)}</pre>
          </Card>
        </motion.div>
      )}

      {/* 3.9 Blockchain Proof */}
      {tab === "blockchain" && blockchain && !blockchain.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-emerald-400">Anchored on Ethereum</p>
                <p className="text-xs text-muted-foreground">{blockchain.plain_language}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">TXID:</span> <span className="font-mono">{blockchain.blockchain_anchor.txid}</span></div>
              <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">Merkle Root:</span> <span className="font-mono">{blockchain.blockchain_anchor.merkle_root}</span></div>
              <div className="p-2 rounded-lg bg-muted/20"><span className="text-[0.6rem] text-muted-foreground">Verified:</span> <span className="text-emerald-400">{blockchain.merkle_proof.verified ? "✓ Valid" : "✗ Invalid"}</span></div>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => window.open(blockchain.verification_url, "_blank")}>
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Verify on Etherscan
            </Button>
          </Card>
        </motion.div>
      )}

      {/* 3.12 QR Code */}
      {tab === "qr" && qr && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><QrCode className="w-4 h-4 text-gold" /> USTN QR Code Data</h3>
            <div className="flex flex-col items-center gap-3">
              {/* Visual QR placeholder (SVG pattern) */}
              <div className="w-40 h-40 bg-white rounded-lg flex items-center justify-center p-3">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  {Array.from({ length: 12 }).map((_, i) =>
                    Array.from({ length: 12 }).map((_, j) => (
                      <rect key={`${i}-${j}`} x={i * 8 + 2} y={j * 8 + 2} width={7} height={7} fill={(i + j + ustn.length) % 3 === 0 ? "#000" : "#fff"} />
                    ))
                  )}
                </svg>
              </div>
              <div className="w-full space-y-2 text-xs">
                <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">USTN:</span> <span className="font-mono">{qr.ustn}</span></div>
                <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">URL:</span> <span className="font-mono">{qr.url}</span> <button onClick={() => copy(qr.url)} className="text-gold hover:underline ml-1">{copied ? "copied!" : "copy"}</button></div>
                <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">Signature:</span> <span className="font-mono">{qr.signature}</span></div>
              </div>
              <p className="text-[0.6rem] text-muted-foreground text-center">Scanning the QR opens the Trade Command Center (read-only). Offline verification uses cached SGTX public key to verify signature.</p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* 3.11 Lifecycle Example */}
      {tab === "lifecycle" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">3.11 USTN Lifecycle Example — Strawberry Export</h3>
            <div className="overflow-x-auto scroll-gold">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase"><th className="text-left px-2 py-2">Step</th><th className="text-left px-2 py-2">Event</th><th className="text-left px-2 py-2">USTN Status</th><th className="text-left px-2 py-2 hidden sm:table-cell">Notes</th></tr></thead>
                <tbody>
                  {lifecycleExample.map((s) => {
                    const statusColor: Record<string, string> = { INITIATED: "#60a5fa", STAGE1_PENDING: "#fbbf24", STAGE1_SETTLED: "#34d399", CUSTOMS_SUBMITTED: "#a78bfa", BOOKED: "#60a5fa", LOADED: "#a78bfa", DEPARTED: "#818cf8", ARRIVED: "#34d399", DELIVERED: "#10b981", SETTLED: "#10b981", COMPLETED: "#059669" };
                    const c = statusColor[s.status] || "#94a3b8";
                    return (
                      <tr key={s.step} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-2 py-2"><span className="px-1.5 py-0.5 rounded bg-gold/15 text-gold font-mono text-[0.6rem] font-bold">{s.step}</span></td>
                        <td className="px-2 py-2">{s.event}</td>
                        <td className="px-2 py-2"><span className="px-2 py-0.5 rounded-full text-[0.55rem] font-semibold" style={{ color: c, background: `${c}1a` }}>{s.status}</span></td>
                        <td className="px-2 py-2 hidden sm:table-cell text-muted-foreground">{s.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[0.6rem] text-muted-foreground mt-2">If a dispute occurs at step 8, the status becomes DISPUTED and all further actions are frozen until resolution.</p>
          </Card>
        </motion.div>
      )}

      {/* 3.10 USTN Autocomplete / Search */}
      {tab === "autocomplete" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">3.10 USTN Analytics & Search — Autocomplete</h3>
            <p className="text-[0.65rem] text-muted-foreground">Type to search USTNs by number, counterparty name, or commodity. Results filtered to your accessible trades only — no "popular searches of others".</p>
            <Input value={autoQuery} onChange={(e) => onAutoSearch(e.target.value)} placeholder="Type USTN, company name, or commodity…" className="text-sm" />
            {autoLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</div>}
            {autoResults.length > 0 && (
              <div className="space-y-1">
                {autoResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs hover:bg-muted/30 cursor-pointer" onClick={() => setUstn(r.ustn)}>
                    <FileText className="w-3.5 h-3.5 text-gold flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[0.65rem] truncate">{r.ustn}</p>
                      <p className="text-[0.6rem] text-muted-foreground">{r.counterparty} · {r.commodity}</p>
                    </div>
                    <Badge variant="outline" className="text-[0.5rem]">{r.status}</Badge>
                  </div>
                ))}
              </div>
            )}
            {autoQuery.length >= 2 && !autoLoading && autoResults.length === 0 && <p className="text-xs text-muted-foreground">No matching USTNs found.</p>}
            <p className="text-[0.55rem] text-muted-foreground">Rate limit: 100 requests/minute per tenant · B-tree index for exact lookups · Full-text search for partial matches</p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
