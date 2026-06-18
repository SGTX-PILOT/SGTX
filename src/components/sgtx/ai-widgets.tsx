"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, X, AlertTriangle, CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============ AI Loading Guide (Part 3B.3.4.5) ============
export function LoadingGuideWidget({ commodity, containerCount, coldChain }: { commodity: string; containerCount: number; coldChain: boolean }) {
  const [guide, setGuide] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/loading-guide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity, containerCount, coldChain }),
      });
      const d = await res.json();
      setGuide(d.content);
      setProvider(d.provider);
    } catch { setGuide("Loading guide unavailable."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-gold" /> AI Loading Guide</h3>
        {provider && <span className="text-[0.55rem] text-muted-foreground">via {provider}</span>}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Generating step-by-step guide…</div>
      ) : guide ? (
        <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{guide}</div>
      ) : (
        <Button size="sm" onClick={generate} variant="outline" className="h-7">🧠 Generate loading guide (A1)</Button>
      )}
    </Card>
  );
}

// ============ Governor Decision Panel (Part 12A.3) ============
export function GovernorDecisionPanel({ open, onClose, action, verdict, conditions }: { open: boolean; onClose: () => void; action: string; verdict: "DENY" | "CONDITIONAL" | "REVIEW"; conditions: string[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  const generate = async () => {
    if (loading || message) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/tenant-message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, verdict, conditions }),
      });
      const d = await res.json();
      setMessage(d.content);
      setProvider(d.provider);
    } catch { setMessage("Unable to generate explanation."); }
    finally { setLoading(false); }
  };

  const color = verdict === "DENY" ? "#f87171" : verdict === "CONDITIONAL" ? "#fbbf24" : "#60a5fa";
  const label = verdict === "DENY" ? "Action Blocked" : verdict === "CONDITIONAL" ? "Additional Steps Required" : "Human Review Needed";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/60 z-50" />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[30rem] bg-card border-l border-border z-50 flex flex-col"
          >
            <div className="h-16 flex items-center justify-between px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}>
                  <AlertTriangle className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{label}</h3>
                  <p className="text-[0.6rem] text-muted-foreground">Governor Decision · {action}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="w-4 h-4" /></Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-gold">
              {/* PlainLanguage explanation */}
              <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">PlainLanguage Explanation</p>
                  {!message && !loading && <button onClick={generate} className="text-[0.65rem] text-gold hover:underline">Generate</button>}
                  {provider && <span className="text-[0.55rem] text-muted-foreground">via {provider}</span>}
                </div>
                {loading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Generating explanation…</div>
                ) : message ? (
                  <p className="text-xs text-foreground/90 leading-relaxed">{message}</p>
                ) : (
                  <p className="text-[0.65rem] text-muted-foreground">Generate a plain-language explanation of why this action was blocked (🧠 A1, no OPA/WasmEdge codes exposed).</p>
                )}
              </div>

              {/* Condition checklist */}
              <div>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Condition Checklist</p>
                <div className="space-y-2">
                  {conditions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No specific conditions — manual review required.</p>
                  ) : conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
                      <span className="text-red-400 mt-0.5">❌</span>
                      <div className="flex-1">
                        <p className="text-xs text-foreground">{c}</p>
                        <button className="text-[0.65rem] text-gold hover:underline mt-1 flex items-center gap-1">Resolve now <ArrowRight className="w-2.5 h-2.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next step + escalation */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1">Next Step</p>
                <p className="text-xs text-foreground/80">After resolving all conditions, click "Retry" to resubmit the original action — one click.</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Retry action</Button>
                  <Button size="sm" variant="outline" className="h-7">Request human review (A3)</Button>
                </div>
              </div>

              <p className="text-[0.6rem] text-muted-foreground text-center pt-2">🔐 Non-marketplace: panel never suggests alternative counterparties.</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============ AI Inference Log Screen (Part 1.4 — ai_inference_records) ============
export function InferenceLogScreen() {
  const [records, setRecords] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/inference-log");
      const d = await res.json();
      setRecords(d);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> AI Inference Records</h3>
        <Button size="sm" onClick={load} variant="outline" className="h-7">{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}</Button>
      </div>
      {records === null ? (
        <p className="text-xs text-muted-foreground">Click "Refresh" to load recent AI inference records (Part 1.4 — ai_inference_records table).</p>
      ) : records.length === 0 ? (
        <p className="text-xs text-muted-foreground">No AI calls recorded yet. Use AI features to populate the log.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto scroll-gold">
          {records.map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${r.success ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="font-mono text-[0.6rem] text-muted-foreground w-32 truncate">{r.agent_name}</span>
              <Badge variant="outline" className="text-[0.55rem] h-4 px-1">{r.authority_level}</Badge>
              <span className="text-[0.6rem] text-muted-foreground w-20">{r.provider}</span>
              <span className="text-[0.6rem] text-muted-foreground ml-auto">{r.latency_ms}ms</span>
              {r.fallback_used && <Badge variant="outline" className="text-[0.55rem] h-4 px-1 text-amber-400 border-amber-500/30">fallback</Badge>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
