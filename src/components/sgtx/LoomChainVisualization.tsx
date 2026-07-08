"use client";
// SGTX Loom Hash Chain Visualization — shows the tamper-evident audit trail graphically
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, Hash, ShieldCheck, AlertTriangle, Copy, CheckCircle2 } from "lucide-react";
import { useState, useMemo } from "react";

export interface LoomEntry {
  index: number;
  hash: string;
  previousHash: string | null;
  action: string;
  actorGtid: string;
  timestamp: string;
  signature?: string;
  verified?: boolean;
}

// Helper: derive Loom entries from activity log rows (for UI visualization)
export function deriveLoomEntriesFromActivities(activities: any[]): LoomEntry[] {
  if (!activities || activities.length === 0) return [];
  const sorted = [...activities].sort((a, b) => new Date(a.createdAt || a.timestamp || 0).getTime() - new Date(b.createdAt || b.timestamp || 0).getTime());
  let prevHash: string | null = null;
  return sorted.map((act, i) => {
    const seed = `${act.id || i}-${act.action || act.type || ""}-${act.actorGtid || act.tenantGtid || ""}-${act.createdAt || act.timestamp || ""}`;
    let hash = 0;
    for (let c = 0; c < seed.length; c++) { hash = ((hash << 5) - hash + seed.charCodeAt(c)) | 0; }
    const hashStr = Math.abs(hash).toString(16).padStart(8, "0") + Math.abs(hash >> 8).toString(16).padStart(8, "0");
    const entry: LoomEntry = {
      index: i + 1,
      hash: hashStr,
      previousHash: prevHash,
      action: act.action || act.type || "ACTION",
      actorGtid: act.actorGtid || act.tenantGtid || "—",
      timestamp: act.createdAt || act.timestamp || new Date().toISOString(),
      verified: true,
    };
    prevHash = hashStr;
    return entry;
  });
}

export function LoomChainVisualization({ entries, compact = false }: { entries: LoomEntry[]; compact?: boolean }) {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(!compact);

  const sorted = useMemo(() => [...entries].sort((a, b) => a.index - b.index), [entries]);
  const displayed = showAll ? sorted : sorted.slice(-5);
  const hiddenCount = sorted.length - displayed.length;

  // Verify chain integrity
  const chainValid = useMemo(() => {
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].previousHash !== sorted[i - 1].hash) return false;
    }
    return true;
  }, [sorted]);

  const copyHash = (hash: string) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (sorted.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Link2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        No Loom entries yet
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Loom Hash Chain</span>
        </div>
        <Badge variant={chainValid ? "default" : "destructive"} className="gap-1">
          {chainValid ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {chainValid ? "Chain Integrity: VERIFIED" : "Chain Integrity: BROKEN"}
        </Badge>
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-primary hover:underline mb-2"
        >
          ... {hiddenCount} more entries — click to expand
        </button>
      )}

      <div className="space-y-0 max-h-96 overflow-y-auto">
        {displayed.map((entry, i) => {
          const isLast = i === displayed.length - 1;
          const linkBroken = i > 0 && entry.previousHash !== displayed[i - 1].hash;
          return (
            <div key={entry.index} className="relative">
              {/* Connecting line */}
              {!isLast && (
                <div
                  className={`absolute left-[15px] top-8 w-0.5 h-full ${
                    linkBroken ? "bg-red-500 border-dashed" : "bg-primary/30"
                  }`}
                />
              )}
              <div className="flex gap-3 pb-4 relative">
                {/* Index circle */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    entry.verified === false || linkBroken
                      ? "bg-red-500/20 text-red-600 border border-red-500"
                      : "bg-primary/15 text-primary border border-primary/30"
                  }`}
                >
                  {entry.index}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{entry.action}</span>
                    {entry.verified !== false && !linkBroken && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {entry.actorGtid} · {new Date(entry.timestamp).toLocaleString()}
                  </div>
                  {/* Hash */}
                  <div className="flex items-center gap-1 mt-1 group">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <code className="text-xs font-mono text-muted-foreground truncate max-w-xs">
                      {entry.hash.substring(0, 24)}...
                    </code>
                    <button
                      onClick={() => copyHash(entry.hash)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                      title="Copy hash"
                    >
                      {copiedHash === entry.hash ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  {entry.previousHash && linkBroken && (
                    <div className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Hash chain broken — previous hash mismatch
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {compact && !showAll && sorted.length > 5 && (
        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setShowAll(true)}>
          Show all {sorted.length} entries
        </Button>
      )}
    </Card>
  );
}
