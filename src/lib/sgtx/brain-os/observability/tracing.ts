// SGTX Brain OS — Tracing (OpenTelemetry-style)
// =============================================================================
// Lightweight in-process tracer that produces OpenTelemetry-compatible span
// records without pulling the full @opentelemetry/api dependency tree.
//
// Span model:
//   {
//     spanId, traceId, parentSpanId,
//     name, kind, status, attributes, events,
//     startedAt, endedAt, durationMs,
//   }
//
// API:
//   tracing.startSpan(name, opts?) → { spanId, traceId, end(attrs?), setAttribute(), addEvent() }
//   tracing.withSpan(name, fn, opts?) → runs fn, ends span with result/error
//   tracing.exportJson()            → array of completed spans (newest first)
//   tracing.exportOtlpJson()        → OTLP-compatible JSON envelope
//
// Each tracer holds its own ring buffer (default 2000 spans). The tracer is
// process-local — for cross-service tracing, plug an OTLP exporter into the
// `onEnd` hook.
// =============================================================================

import { logger } from "./structured-logging";

export type SpanStatus = "ok" | "error" | "unset";
export type SpanKind = "internal" | "client" | "server" | "producer" | "consumer";

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  statusMessage?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

export interface ActiveSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  setAttribute(key: string, value: unknown): void;
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(attributes?: Record<string, unknown>): Span;
}

interface TracerOptions {
  maxSpans?: number;
  sampler?: (name: string, parent?: ActiveSpan | null) => boolean;
  onEnd?: (span: Span) => void;
}

function randomId(len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

class TracerImpl {
  private readonly maxSpans: number;
  private readonly completed: Span[] = [];
  private readonly sampler?: (name: string, parent?: ActiveSpan | null) => boolean;
  private readonly onEnd?: (span: Span) => void;

  // Active spans keyed by spanId, plus a stack per-trace for parent linking.
  private readonly active = new Map<string, { span: Span; active: ActiveSpan }>();
  private readonly traceStacks = new Map<string, string[]>(); // traceId → [spanId...] top-of-stack last

  constructor(opts: TracerOptions = {}) {
    this.maxSpans = opts.maxSpans ?? 2000;
    this.sampler = opts.sampler;
    this.onEnd = opts.onEnd;
  }

  /** Start a new span. If `parent` is given, links it; otherwise uses the
   *  current active span for the same trace as the parent (if any). */
  startSpan(name: string, opts: { parentSpanId?: string; traceId?: string; kind?: SpanKind; attributes?: Record<string, unknown> } = {}): ActiveSpan {
    if (this.sampler && !this.sampler(name, null)) {
      // Sampling: return a no-op span that records nothing when ended.
      return this.noopSpan(name);
    }

    const traceId = opts.traceId ?? randomId(32);
    const parentSpanId = opts.parentSpanId ?? this.peekTraceStack(traceId) ?? null;
    const spanId = randomId(16);
    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind: opts.kind ?? "internal",
      status: "unset",
      attributes: { ...(opts.attributes ?? {}) },
      events: [],
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
    };

    const active: ActiveSpan = {
      spanId,
      traceId,
      parentSpanId,
      name,
      setAttribute: (key, value) => { span.attributes[key] = value; },
      setAttributes: (attrs) => { Object.assign(span.attributes, attrs); },
      addEvent: (evName, attributes) => {
        span.events.push({ name: evName, timestamp: new Date().toISOString(), attributes });
      },
      setStatus: (status, message) => {
        span.status = status;
        if (message) span.statusMessage = message;
      },
      end: (attributes) => {
        if (attributes) Object.assign(span.attributes, attributes);
        this.endSpan(spanId);
        return span;
      },
    };
    this.active.set(spanId, { span, active });
    this.pushTraceStack(traceId, spanId);
    return active;
  }

  /** Run `fn` under a span. Ends the span automatically with status ok/error. */
  async withSpan<T>(name: string, fn: () => Promise<T>, opts: { parentSpanId?: string; traceId?: string; kind?: SpanKind; attributes?: Record<string, unknown> } = {}): Promise<T> {
    const span = this.startSpan(name, opts);
    try {
      const result = await fn();
      span.setStatus("ok");
      return result;
    } catch (err) {
      span.setStatus("error", (err as Error).message);
      span.setAttribute("error.type", (err as Error)?.name ?? "Error");
      throw err;
    } finally {
      span.end();
    }
  }

  /** Look up an active span by id. */
  getActive(spanId: string): ActiveSpan | undefined {
    return this.active.get(spanId)?.active;
  }

  /** Return all completed spans (newest first). */
  list(limit?: number): Span[] {
    const all = this.completed.slice().reverse();
    return limit ? all.slice(0, limit) : all;
  }

  /** Export as a flat JSON array (newest first). */
  exportJson(limit?: number): Span[] {
    return this.list(limit);
  }

  /** Export as an OTLP-style JSON envelope (resourceSpans shape). */
  exportOtlpJson(limit?: number): {
    resourceSpans: Array<{
      resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
      scopeSpans: Array<{
        scope: { name: string };
        spans: Array<Record<string, unknown>>;
      }>;
    }>;
  } {
    const spans = this.list(limit);
    return {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "sgtx-brain-os" } },
          ],
        },
        scopeSpans: [{
          scope: { name: "sgtx.brain-os.tracer" },
          spans: spans.map((s) => ({
            traceId: s.traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId,
            name: s.name,
            kind: spanKindToOtlp(s.kind),
            startTimeUnixNano: isoToUnixNano(s.startedAt),
            endTimeUnixNano: s.endedAt ? isoToUnixNano(s.endedAt) : "0",
            status: { code: statusToOtlpCode(s.status), message: s.statusMessage ?? "" },
            attributes: Object.entries(s.attributes).map(([k, v]) => ({
              key: k,
              value: valueToOtlp(v),
            })),
            events: s.events.map((e) => ({
              name: e.name,
              timeUnixNano: isoToUnixNano(e.timestamp),
              attributes: e.attributes
                ? Object.entries(e.attributes).map(([k, v]) => ({ key: k, value: valueToOtlp(v) }))
                : [],
            })),
          })),
        }],
      }],
    };
  }

  /** Reset all state (used in tests). */
  reset(): void {
    this.completed.length = 0;
    this.active.clear();
    this.traceStacks.clear();
  }

  /** Number of completed spans currently buffered. */
  size(): number { return this.completed.length; }

  // -------------------------------------------------------------------
  private endSpan(spanId: string): void {
    const entry = this.active.get(spanId);
    if (!entry) return;
    const { span } = entry;
    span.endedAt = new Date().toISOString();
    span.durationMs = Date.now() - new Date(span.startedAt).getTime();
    this.active.delete(spanId);
    this.popTraceStack(span.traceId, spanId);
    this.completed.push(span);
    if (this.completed.length > this.maxSpans) this.completed.shift();
    try { this.onEnd?.(span); } catch (err) {
      logger.warn("Tracer onEnd hook threw", { component: "tracing", error: (err as Error).message });
    }
  }

  private pushTraceStack(traceId: string, spanId: string): void {
    const stack = this.traceStacks.get(traceId) ?? [];
    stack.push(spanId);
    this.traceStacks.set(traceId, stack);
  }
  private popTraceStack(traceId: string, spanId: string): void {
    const stack = this.traceStacks.get(traceId);
    if (!stack) return;
    const idx = stack.lastIndexOf(spanId);
    if (idx >= 0) stack.splice(idx, 1);
    if (stack.length === 0) this.traceStacks.delete(traceId);
  }
  private peekTraceStack(traceId: string): string | null {
    const stack = this.traceStacks.get(traceId);
    if (!stack || stack.length === 0) return null;
    return stack[stack.length - 1] ?? null;
  }

  private noopSpan(name: string): ActiveSpan {
    const traceId = randomId(32);
    const spanId = randomId(16);
    return {
      spanId,
      traceId,
      parentSpanId: null,
      name,
      setAttribute: () => {},
      setAttributes: () => {},
      addEvent: () => {},
      setStatus: () => {},
      end: () => ({
        traceId, spanId, parentSpanId: null, name,
        kind: "internal", status: "unset",
        attributes: {}, events: [],
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
      }),
    };
  }
}

function spanKindToOtlp(kind: SpanKind): number {
  switch (kind) {
    case "internal": return 0;
    case "client": return 2;
    case "server": return 1;
    case "producer": return 3;
    case "consumer": return 4;
    default: return 0;
  }
}
function statusToOtlpCode(status: SpanStatus): number {
  switch (status) {
    case "ok": return 1;
    case "error": return 2;
    case "unset":
    default: return 0;
  }
}
function isoToUnixNano(iso: string): string {
  const ms = new Date(iso).getTime();
  return String(ms * 1_000_000);
}
function valueToOtlp(v: unknown): Record<string, unknown> {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: v } : { doubleValue: v };
  if (typeof v === "boolean") return { boolValue: v };
  return { stringValue: String(v) };
}

/** Singleton tracer for the Brain OS. */
export const tracing = new TracerImpl();
export { TracerImpl as Tracer };
