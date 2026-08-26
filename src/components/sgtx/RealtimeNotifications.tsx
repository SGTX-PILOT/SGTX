"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX Realtime Notifications — Recommendation #8 (P2)
// ═══════════════════════════════════════════════════════════════════════════════
//
// A hidden side-effect component that opens a Server-Sent Events stream
// against /api/sgtx/realtime/notifications and reacts to two event types:
//
//   1. { type: "inbox", ... }  — fires a sonner toast + invalidates the
//      dashboard query so the inbox bell badge refreshes.
//   2. { type: "trade", ... }  — fires a sonner toast + invalidates the
//      dashboard query so the Command Center auto-refreshes the trade
//      status / phase / lifecycle stepper.
//
// The component renders ONLY a small "Live" indicator (green pulsing dot)
// which PortalShell can mount in its header. The actual side effects live in
// useEffect. EventSource reconnects natively on disconnect.
//
// Critical constraints honored:
//   - SSE (built-in) — NO socket.io dependency.
//   - The component unmounts cleanly: closes the EventSource, removes the
//     state listener.
//   - All state updates are wrapped in `isMountedRef` guards so async
//     callbacks cannot fire after unmount.
//   - The EventSource URL is a relative path so Caddy can route it
//     (no port embedded).
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Radio } from "lucide-react";

interface RealtimeNotificationsProps {
  tenantGtid: string;
  // Optional callback so PortalShell can also render the "Live" dot itself.
  onConnectionStateChange?: (connected: boolean) => void;
}

type InboxEvent = {
  type: "inbox";
  id: string;
  title: string;
  description?: string;
  priority: number;
  category?: string;
  ctaLabel?: string | null;
};

type TradeEvent = {
  type: "trade";
  ustn: string;
  oldStatus: string | null;
  newStatus: string;
  phase: number | null;
};

type ErrorEvent = {
  type: "error";
  message: string;
  ts: string;
};

type StreamEvent = InboxEvent | TradeEvent | ErrorEvent;

function priorityTone(priority: number): "success" | "info" | "warning" | "error" {
  if (priority >= 85) return "error";
  if (priority >= 70) return "warning";
  if (priority >= 50) return "info";
  return "success";
}

export function RealtimeNotifications({
  tenantGtid,
  onConnectionStateChange,
}: RealtimeNotificationsProps) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Buffer of recent toast IDs so we don't double-toast the same event if
  // the EventSource reconnects right after a poll cycle.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (!tenantGtid) return;

    const url = `/api/sgtx/realtime/notifications?tenantGtid=${encodeURIComponent(tenantGtid)}`;
    let es: EventSource | null = null;

    const handleMessage = (raw: MessageEvent) => {
      if (!isMountedRef.current) return;
      let evt: StreamEvent;
      try {
        evt = JSON.parse(raw.data) as StreamEvent;
      } catch {
        return;
      }
      switch (evt.type) {
        case "inbox": {
          // De-dup by id — EventSource may resend the same id if it reconnects
          // during a poll window.
          if (seenIdsRef.current.has(evt.id)) return;
          seenIdsRef.current.add(evt.id);
          // Cap the de-dup set so memory doesn't grow unbounded.
          if (seenIdsRef.current.size > 500) {
            const arr = Array.from(seenIdsRef.current);
            seenIdsRef.current = new Set(arr.slice(-250));
          }
          const tone = priorityTone(evt.priority);
          toast[tone](`New inbox: ${evt.title}`, {
            id: `inbox-${evt.id}`,
            description: evt.description || evt.category || "Open Smart Inbox to act.",
          });
          // Refresh inbox badge + dashboard cards.
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          break;
        }
        case "trade": {
          const label = evt.oldStatus
            ? `${evt.ustn}: ${evt.oldStatus} → ${evt.newStatus}`
            : `${evt.ustn} → ${evt.newStatus}`;
          toast.info(`Trade updated: ${label}`, {
            description:
              evt.phase != null
                ? `Lifecycle phase ${evt.phase} · dashboard auto-refreshing`
                : "Dashboard auto-refreshing",
          });
          // Force a refresh of the Command Center dashboard (trades, milestones,
          // lifecycle stepper).
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          // Also invalidate any per-USTN caches.
          queryClient.invalidateQueries({ queryKey: ["ustn", evt.ustn] });
          break;
        }
        case "error": {
          // The server uses `type: "error"` for both the initial "connected"
          // hello AND genuine error events — distinguish by `message`.
          if (evt.message === "connected") {
            if (!isMountedRef.current) return;
            setConnected(true);
            onConnectionStateChange?.(true);
          } else if (evt.message === "inbox_poll_failed" || evt.message === "trade_poll_failed") {
            // Transient poll failure — the server keeps the stream open and
            // will retry on the next 10s tick. Do not flip the indicator to
            // red; the connection itself is healthy.
            // Logged for completeness — silent in the UI.
          } else if (evt.message === "poll_fatal") {
            if (!isMountedRef.current) return;
            setConnected(false);
            onConnectionStateChange?.(false);
          }
          break;
        }
      }
    };

    const handleOpen = () => {
      if (!isMountedRef.current) return;
      setConnected(true);
      onConnectionStateChange?.(true);
    };

    const handleError = () => {
      if (!isMountedRef.current) return;
      setConnected(false);
      onConnectionStateChange?.(false);
      // EventSource reconnects natively — no manual retry needed. The
      // browser will reopen the connection after a short backoff.
    };

    // Guard — EventSource is browser-only.
    if (typeof EventSource === "undefined") return;

    es = new EventSource(url);
    es.addEventListener("open", handleOpen);
    es.addEventListener("error", handleError);
    // The default `message` event is fired for unnamed SSE data: frames.
    // Our server uses `data: {...}\n\n` (no `event:` field), so we listen on
    // the unnamed channel.
    es.addEventListener("message", handleMessage);

    return () => {
      isMountedRef.current = false;
      if (es) {
        es.removeEventListener("open", handleOpen);
        es.removeEventListener("error", handleError);
        es.removeEventListener("message", handleMessage);
        es.close();
      }
      setConnected(false);
      onConnectionStateChange?.(false);
    };
  }, [tenantGtid]);

  // Render a small "Live" indicator. PortalShell renders this hidden so it
  // acts purely as a side-effect listener, but the same component is also
  // exported for use in the header bar.
  return (
    <span
      aria-label={connected ? "Real-time stream connected" : "Real-time stream disconnected"}
      title={connected ? "Live — auto-refreshing" : "Reconnecting…"}
      className="inline-flex items-center gap-1 text-[0.55rem] font-medium select-none"
    >
      {connected ? (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      ) : (
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground/50" />
        </span>
      )}
      <span className={connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
        Live
      </span>
      <span className="sr-only">
        {connected ? "Real-time notifications are live" : "Real-time notifications are reconnecting"}
      </span>
    </span>
  );
}

// Convenience export so PortalShell can render the indicator next to the
// tenant identity chip in the header bar without re-mounting the listener.
export function RealtimeIndicator({ connected }: { connected: boolean }) {
  return (
    <span
      aria-label={connected ? "Live stream connected" : "Live stream disconnected"}
      title={connected ? "Real-time notifications live" : "Reconnecting real-time feed…"}
      className="inline-flex items-center gap-1 text-[0.55rem] font-medium px-1.5 py-0.5 rounded-md border border-border/60"
    >
      {connected ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Radio className="w-2.5 h-2.5" /> Live
          </span>
        </>
      ) : (
        <>
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground/50" />
          </span>
          <span className="text-muted-foreground flex items-center gap-1">
            <Bell className="w-2.5 h-2.5" /> Off
          </span>
        </>
      )}
    </span>
  );
}
