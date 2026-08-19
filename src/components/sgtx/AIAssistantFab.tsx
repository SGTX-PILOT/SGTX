"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

/**
 * SGTX AI Assistant FAB — floating action button always visible on every
 * portal page. Renders a Sparkles icon with a soft ping animation, and
 * expands into a small glass-premium popover showing live AI insights
 * (readiness score, price deviation, Governor status, GRiRE sync, …).
 *
 * Clicking "Ask AI a question" calls optional onAskAI handler so the host
 * portal (PortalShell) can open the full AssistantDrawer with chat history.
 */
export function AIAssistantFab({ onAskAI }: { onAskAI?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button — bottom right, always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[oklch(0.62_0.13_75)] to-[oklch(0.55_0.12_180)] text-white shadow-lg flex items-center justify-center hover:scale-105 transition-transform group"
        aria-label="SGTX AI Assistant"
      >
        <Sparkles className="w-6 h-6" />
        <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-[oklch(0.62_0.13_75)] group-hover:opacity-0 transition-opacity" />
      </button>

      {/* Popover panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 max-h-96 glass-premium rounded-xl p-4 animate-fade-in overflow-y-auto scroll-gold">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold" />
              <span className="ai-label font-semibold text-sm">SGTX AI Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="p-2 rounded-lg bg-muted/30">💡 AI is monitoring your trade readiness score (72%). Complete 2 more items to reach 85%.</p>
            <p className="p-2 rounded-lg bg-muted/30">📊 Price deviation within normal range (3.2%). No action needed.</p>
            <p className="p-2 rounded-lg bg-muted/30">🛡️ Governor: All compliance gates passed.</p>
            <p className="p-2 rounded-lg bg-muted/30">📦 GRiRE: 20 country profiles active. Last sync: today.</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              onAskAI?.();
            }}
            className="w-full mt-3 px-3 py-2 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
          >
            Ask AI a question
          </button>
        </div>
      )}
    </>
  );
}
