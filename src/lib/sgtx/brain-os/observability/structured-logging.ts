// SGTX Brain OS — Structured Logging
// =============================================================================
// JSON-first logger with level filtering and a ring buffer for ad-hoc export.
//
// Features:
//   * Severity levels: trace < debug < info < warn < error < fatal
//   * Level filter via env var `BRAIN_LOG_LEVEL` (default: "info")
//   * Each entry is a single JSON line: { ts, level, msg, ...fields }
//   * `exportJsonl()` returns the in-memory ring buffer as newline-delimited JSON
//   * Child loggers carry bound context (component, moduleId, requestId, ...)
//   * Side-effect safe: logger never throws — bad serializers fall back to a
//     placeholder string so the calling code always proceeds.
//
// Usage:
//   logger.info("message", { component: "x", userId: 42 });
//   const child = logger.child({ component: "y" });
//   child.warn("warn from y");
// =============================================================================

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

const DEFAULT_MAX_ENTRIES = 5_000;

function resolveLevel(name: string): LogLevel {
  const lower = (name || "").toLowerCase() as LogLevel;
  return LEVEL_ORDER[lower] !== undefined ? lower : "info";
}

function safeStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable]";
    }
  }
}

interface LoggerOptions {
  level?: LogLevel;
  bound?: Record<string, unknown>;
  sink?: (entry: LogEntry) => void;
  maxEntries?: number;
}

class LoggerImpl {
  private level: LogLevel;
  private bound: Record<string, unknown>;
  private readonly ring: LogEntry[] = [];
  private readonly maxEntries: number;
  private readonly sink: (entry: LogEntry) => void;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? resolveLevel(process.env.BRAIN_LOG_LEVEL ?? "info");
    this.bound = opts.bound ?? {};
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.sink = opts.sink ?? defaultSink;
  }

  /** Update the minimum level at runtime. */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  /** Spawn a child logger that inherits bound context. */
  child(extra: Record<string, unknown>): LoggerImpl {
    return new LoggerImpl({
      level: this.level,
      bound: { ...this.bound, ...extra },
      sink: this.sink,
      maxEntries: this.maxEntries,
    });
  }

  // --- level helpers ---------------------------------------------------
  trace(msg: string, fields?: Record<string, unknown>): void { this.log("trace", msg, fields); }
  debug(msg: string, fields?: Record<string, unknown>): void { this.log("debug", msg, fields); }
  info(msg: string, fields?: Record<string, unknown>): void { this.log("info", msg, fields); }
  warn(msg: string, fields?: Record<string, unknown>): void { this.log("warn", msg, fields); }
  error(msg: string, fields?: Record<string, unknown>): void { this.log("error", msg, fields); }
  fatal(msg: string, fields?: Record<string, unknown>): void { this.log("fatal", msg, fields); }

  /** Core log method. Public so adapters can emit dynamic levels. */
  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...this.bound,
      ...(fields ?? {}),
    };
    this.ring.push(entry);
    if (this.ring.length > this.maxEntries) this.ring.shift();
    try {
      this.sink(entry);
    } catch {
      // The sink must never propagate exceptions.
    }
  }

  /** Return the in-memory ring buffer (oldest first). */
  entries(limit?: number): LogEntry[] {
    return limit ? this.ring.slice(-limit) : this.ring.slice();
  }

  /** Export the ring buffer as newline-delimited JSON. */
  exportJsonl(): string {
    return this.ring.map((e) => safeStringify(e)).join("\n") + (this.ring.length ? "\n" : "");
  }

  /** Clear the ring buffer. */
  clear(): void {
    this.ring.length = 0;
  }

  /** Number of entries currently in the ring buffer. */
  size(): number {
    return this.ring.length;
  }
}

function defaultSink(entry: LogEntry): void {
  // In production, prefer stderr so it does not interfere with stdout pipes.
  // Bun / Node both honour process.stderr.write synchronously here.
  const line = safeStringify(entry);
  try {
    console.log(line);
  } catch {
    // Last-resort: swallow.
  }
}

/** Default Brain OS logger. */
export const logger = new LoggerImpl();

export { LoggerImpl as Logger };
