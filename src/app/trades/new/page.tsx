"use client";

// COCKPIT-Phase 0: /trades/new route — the trade request wizard entry point.
//
// Phase 3 will build the full 6-step wizard (Trade Need → Commercial Terms
// → Logistics → Compliance → Finance → Review). For Phase 0, this route
// exists as a real, shareable, refresh-survivable URL so deep linking
// works. The page renders a clear placeholder that explains what's coming
// and provides a link to the legacy 11-step wizard (still available via the
// legacy / route's "view: portal" state) so the app remains demo-able.
//
// This is incremental migration: the new route exists, but the heavy wizard
// UI is the Phase 3 deliverable.

import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession } from "@/lib/cockpit/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Package, FileText, Truck, ShieldCheck, DollarSign, CheckCircle2,
  ChevronRight, ArrowRight, Wrench,
} from "lucide-react";

const STEPS = [
  { n: 1, title: "Trade need", desc: "Product, grade/spec, quantity, origin, destination, required delivery date.", icon: Package },
  { n: 2, title: "Commercial terms", desc: "Counterparty (GTID lookup), currency, target price, Incoterm, payment terms.", icon: FileText },
  { n: 3, title: "Logistics", desc: "Mode (sea/air/road/rail/multimodal), temperature control, packaging, container requirements.", icon: Truck },
  { n: 4, title: "Compliance", desc: "Auto-generated from jurisdiction rules — destination country determines required documents.", icon: ShieldCheck },
  { n: 5, title: "Finance", desc: "Optional financing — 'Do you need financing?' [No → skip] [Yes → reveal options].", icon: DollarSign },
  { n: 6, title: "Review & submit", desc: "Human-readable summary exactly as the audit mock → Create Trade Request.", icon: CheckCircle2 },
];

export default function NewTradePage() {
  const { payload, ready } = useSession();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  if (!payload) return null;

  return (
    <CockpitShell roleLabel={payload.role} showAdmin={shouldShowAdmin()}>
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <Link href="/trades" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
            ← Back to trades
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">New trade request</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Six guided stages. Save-draft at every step. Resumable from{" "}
            <Link href="/trades?filter=drafts" className="text-primary hover:underline">drafts</Link>.
          </p>
        </header>

        {/* Wizard preview */}
        <ol className="space-y-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Card className="p-4 flex items-start gap-3 hover:bg-muted/30 transition border-dashed">
                <div className="flex-shrink-0 w-8 h-8 rounded-full border border-border bg-muted/40 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  {s.n}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <s.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{s.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>

        {/* Phase 3 delivery notice */}
        <Card className="p-4 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
          <div className="flex items-start gap-3">
            <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                The 6-step wizard is being built (Phase 3 of the cockpit rebuild).
              </p>
              <p className="text-muted-foreground mt-1">
                For now, the legacy 11-step wizard is still available via the original
                SPA. It will be replaced by this 6-step flow once Phase 3 lands.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Link href="/trades">
            <Button variant="outline" size="sm">Cancel</Button>
          </Link>
          <Button size="sm" disabled>
            Start wizard <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    </CockpitShell>
  );
}
